/**
 * lib/learn/collect.js —— 采集评论、视频内容与弹幕，过闸，变成样本。
 *
 * 只读公开内容：视频评论 + 视频本身（字幕/简介）+ 弹幕。**不读私信，不读「回复我的」。**
 * 同一条文本（去掉表情码与标点后）在本次与最近几次里只算一次，
 * 所以评论区里刷屏的同一句话、跨视频重复的弹幕不会重复学习。
 *
 * 不做提炼，只负责「拿到干净的话」。每条样本都带来源、时间、归属，
 * 因为后面删除键要按来源分辨，学习历史也要按时间分页。
 */
import { fetchVideoComments } from '../bili/reply.js'
import { fetchDanmaku, fetchVideoInfo } from '../bili/danmaku.js'
import { fetchVideoSubtitles } from '../bili/subtitle.js'
import { fetchRecommendations, searchVideos } from '../bili/rcmd.js'
import { admitSample } from './filter.js'
import { describeImage, visionReady } from '../media.js'

const SOURCE_LABEL = {
  comment: '视频评论', video: '视频内容', danmaku: '弹幕', media: '图片',
}

/** 归一化文本：去表情码、去标点空白、小写。只用于判重，不替换原文。 */
export function normalizeText(text) {
  return String(text || '')
    .replace(/\[[^\]]{1,40}\]/g, '')
    .replace(/[\s\p{P}\p{S}]/gu, '')
    .toLowerCase()
}

/** 打乱数组（Fisher–Yates），用于「随机挑视频」。 */
function shuffle(list) {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

/**
 * 采集一次。
 * @param {object} input
 * @param {object} input.cred B站 凭据
 * @param {object} input.zone 学习区配置
 * @param {object} [input.config] 全局配置（多模态通道）
 * @param {(keysOptions:object)=>Promise<object>} [input.wbiKeys] WBI 密钥缓存函数
 * @param {Set<string>} [input.learned] 已学过的 id 集合（会被就地更新）
 * @param {Set<string>} [input.seenText] 已出现过的归一化文本（会被就地更新）
 * @param {number} [input.budgetMs] 本次时间预算
 * @param {AbortSignal} [input.signal]
 */
export async function collect(input) {
  const { cred, zone } = input
  const learned = input.learned || new Set()
  const seenText = input.seenText || new Set()
  const started = Date.now()
  const budgetMs = Math.max(10_000, Number(input.budgetMs) || 10 * 60 * 1000)
  const quota = input.quota || {}
  const isolation = Array.isArray(zone.isolation) ? zone.isolation : []
  const samples = []
  const errors = []
  const stats = { comment: 0, video: 0, danmaku: 0, media: 0 }

  const overBudget = () => Date.now() - started > budgetMs
  const expired = () => input.signal?.aborted === true

  function countOf(source) {
    return samples.reduce((sum, sample) => sum + (sample.source === source ? 1 : 0), 0)
  }

  function push(source, item) {
    const verdict = admitSample(item.text, isolation)
    if (!verdict.ok) return false
    const key = normalizeText(verdict.text)
    if (key.length < 3) return false
    // 跨来源、跨轮次的文本去重：评论与弹幕说同一句话只算一次
    if (seenText.has(key)) return false
    const id = `${source}:${item.id || verdict.text.slice(0, 24)}`
    if (learned.has(id)) return false
    learned.add(id)
    seenText.add(key)
    samples.push({
      id,
      source,
      sourceLabel: SOURCE_LABEL[source],
      text: verdict.text,
      ts: Number(item.ts) || Date.now(),
      fromMe: item.fromMe === true,
      /** 归属（视频标题），只给界面看，不进人设词 */
      where: item.where || '',
    })
    stats[source] += 1
    return true
  }

  const needVideo = (quota.comment || 0) > 0 || (quota.video || 0) > 0 || (quota.danmaku || 0) > 0
  if (!needVideo || overBudget()) {
    return { samples, stats, errors, elapsedMs: Date.now() - started, learnedCount: learned.size }
  }

  // 想学多少评论，就找多少视频（每个视频约 20 条）；最少 6 个，最多 24 个
  const videoTarget = Math.max(6, Math.min(24, Math.ceil((quota.comment || 0) / 20)))
  const videos = await discoverVideos(cred, zone, { ...input, learned }, videoTarget)

  for (const video of videos) {
    if (overBudget() || expired()) break
    if (learned.has(`video:${video.bvid}`)) continue
    learned.add(`video:${video.bvid}`)

    // 视频信息：字幕与弹幕都要用，只取一次
    let info = null
    const wantVideo = (quota.video || 0) > 0 && countOf('video') < quota.video
    const wantDanmaku = (quota.danmaku || 0) > 0 && countOf('danmaku') < quota.danmaku
    if (wantVideo || wantDanmaku) {
      try {
        info = await fetchVideoInfo(video.bvid, { signal: input.signal })
      } catch (error) {
        errors.push({ source: 'video', where: video.bvid, message: String(error?.message || error) })
      }
    }

    // 视频本身：字幕优先，没字幕用简介兜底
    if (info && wantVideo) {
      try {
        const subs = await fetchVideoSubtitles(info, cred, { signal: input.signal })
        if (subs.length > 0) {
          for (let i = 0; i < subs.length; i += 1) {
            if (countOf('video') >= quota.video) break
            push('video', {
              id: `sub:${video.bvid}:${i}`, text: subs[i], ts: Date.now(), where: info.title,
            })
          }
        } else if (info.desc) {
          push('video', { id: `desc:${video.bvid}`, text: info.desc, ts: Date.now(), where: info.title })
        }
      } catch (error) {
        errors.push({ source: 'video', where: video.bvid, message: String(error?.message || error) })
      }
    }

    // 评论
    if ((quota.comment || 0) > 0 && countOf('comment') < quota.comment) {
      try {
        const comments = await fetchVideoComments(cred, video.aid, { signal: input.signal })
        for (const comment of comments) {
          if (countOf('comment') >= quota.comment) break
          // 评论带图：识别图，不把图片当文本
          if (comment.pictures?.length) {
            if (zone.media?.recognize !== false && zone.media?.learn !== false) {
              const described = await recognizeMedia(
                { url: comment.pictures[0], type: 'image' }, input.config, { signal: input.signal },
              )
              if (described) {
                push('media', {
                  id: `media:${comment.id}`, text: described, ts: comment.ts, where: video.title,
                })
              }
            }
            if (!comment.text) continue
          }
          push('comment', { ...comment, where: video.title })
        }
      } catch (error) {
        errors.push({ source: 'comment', where: video.bvid, message: String(error?.message || error) })
      }
    }

    // 弹幕
    if (info && wantDanmaku) {
      try {
        const lines = await fetchDanmaku(info.cid, quota.danmaku, { signal: input.signal })
        for (const line of lines) {
          if (countOf('danmaku') >= quota.danmaku) break
          push('danmaku', { id: `${info.cid}:${line}`, text: line, ts: Date.now(), where: video.title })
        }
      } catch (error) {
        errors.push({ source: 'danmaku', where: video.bvid, message: String(error?.message || error) })
      }
    }
  }

  return {
    samples,
    stats,
    errors,
    elapsedMs: Date.now() - started,
    learnedCount: learned.size,
  }
}

/** 把评论里的图片识别成一句可以学的描述；没通道就返回空。 */
async function recognizeMedia(media, config, options = {}) {
  if (!media?.url) return ''
  if (!visionReady(config)) return ''
  try {
    const { description, emotion } = await describeImage(media.url, config, options)
    return `[图片] ${description}${emotion ? `（${emotion}）` : ''}`
  } catch {
    return ''
  }
}

/** 找候选视频：学习重点（focus.traits）当搜索词；没设就随机看。 */
async function discoverVideos(cred, zone, input, target = 6) {
  const learned = input.learned || new Set()
  const seen = new Set()
  const out = []
  const want = Math.max(1, Number(target) || 6)
  const filters = zone.filters || {}
  const minPlay = Number(filters.minPlay) || 0
  const minDuration = Number(filters.minDuration) || 0
  const recentDays = Number(filters.recentDays) || 0
  const cutoff = recentDays > 0 ? Date.now() - recentDays * 86400_000 : 0
  const excludes = Array.isArray(zone.excludeKeywords) ? zone.excludeKeywords : []

  const accept = (video) => {
    if (!video?.bvid || seen.has(video.bvid)) return
    seen.add(video.bvid)
    // 学过的视频直接跳过，但继续往后找新的
    if (learned.has(`video:${video.bvid}`)) return
    if (minPlay > 0 && video.play < minPlay) return
    if (minDuration > 0 && video.duration < minDuration) return
    if (cutoff > 0 && video.pubdate > 0 && video.pubdate * 1000 < cutoff) return
    if (excludes.some((word) => video.title.includes(word))) return
    out.push(video)
  }

  // 搜索词就是「学习重点」；一个都没有就随机看
  const traits = Array.isArray(zone.focus?.traits) ? zone.focus.traits : []
  const terms = traits
    .map((term) => String(term || '').trim())
    .filter((term) => term !== '')
    .slice(0, 12)

  // 1) 有搜索词：按词搜，每个词翻 3 页，跳过学过的
  for (const keyword of terms) {
    if (input.signal?.aborted || out.length >= want) break
    for (let page = 1; page <= 3; page += 1) {
      if (input.signal?.aborted || out.length >= want) break
      try {
        const found = await searchVideos(cred, keyword, {
          page, pageSize: 20, signal: input.signal, wbiKeys: input.wbiKeys,
        })
        if (found.length === 0) break
        for (const video of found) {
          accept(video)
          if (out.length >= want) break
        }
      } catch {
        break // 搜不到就换下一个关键词；错误由上层汇总
      }
    }
  }

  // 2) 没设重点也没填关键词，或搜到的还不够：随机挑视频
  if (out.length < want && !input.signal?.aborted && zone.content?.recommend !== false) {
    const pages = shuffle([1, 2, 3, 4, 5, 6])
    for (const page of pages) {
      if (out.length >= want || input.signal?.aborted) break
      try {
        const items = await fetchRecommendations(cred, {
          count: 20, page, signal: input.signal, wbiKeys: input.wbiKeys,
        })
        for (const video of shuffle(items)) {
          accept(video)
          if (out.length >= want) break
        }
      } catch {
        // 这一页拿不到就换下一页
      }
    }
  }

  return out
}

export { SOURCE_LABEL }
