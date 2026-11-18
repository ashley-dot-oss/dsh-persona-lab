/**
 * lib/bili/danmaku.js —— 弹幕。
 *
 * B站 弹幕有两套接口：老的 XML（comment.bilibili.com/<cid>.xml）与分段 protobuf。
 * 这里用 XML：不需要 protobuf 依赖，解析简单；拿不到就返回空，由上层降级。
 *
 * 注意：弹幕默认关。这里是「能做」，不代表「该开」。
 */
import { getJson, UA } from './http.js'

/** 视频基础信息（含 cid / aid / 标题 / 播放量）。 */
export async function fetchVideoInfo(bvid, options = {}) {
  const url = `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`
  const data = await getJson(url, {
    cred: options.cred,
    referer: 'https://www.bilibili.com/',
    signal: options.signal,
  })
  return {
    aid: Number(data.aid) || 0,
    bvid: String(data.bvid || bvid),
    cid: Number(data.cid) || 0,
    title: String(data.title || ''),
    owner: String(data.owner?.name || ''),
    ownerMid: Number(data.owner?.mid) || 0,
    play: Number(data.stat?.view) || 0,
    duration: Number(data.duration) || 0,
    pubdate: Number(data.pubdate) || 0,
    desc: String(data.desc || '').slice(0, 300),
  }
}

/** 取一集弹幕文本（最多 limit 条）。失败返回 []。 */
export async function fetchDanmaku(cid, limit = 200, options = {}) {
  if (!cid) return []
  const url = `https://comment.bilibili.com/${Number(cid)}.xml`
  let text = ''
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': UA, Referer: 'https://www.bilibili.com/' },
      signal: options.signal,
    })
    if (!response.ok) return []
    text = await response.text()
  } catch {
    return []
  }
  const out = []
  const pattern = /<d p="([^"]*)">([\s\S]*?)<\/d>/g
  let match
  while ((match = pattern.exec(text)) !== null && out.length < limit) {
    const raw = decodeEntities(match[2]).trim()
    if (raw === '') continue
    out.push(raw.slice(0, 120))
  }
  return out
}

function decodeEntities(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}
