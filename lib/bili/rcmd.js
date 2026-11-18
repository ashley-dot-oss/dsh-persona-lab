/**
 * lib/bili/rcmd.js —— 推荐流与关键词搜索。
 *
 * 两个都走 WBI。推荐流是最不可控的源：拿到的视频标题/简介会作为「浏览推荐」样本，
 * 由上层决定要不要学、学多少（默认单独封顶 20%）。
 */
import { getJson, signWbi } from './http.js'

const RCMD = 'https://api.bilibili.com/x/web-interface/wbi/index/top/feed/rcmd'

/** 推荐流一页。返回 [{ aid, bvid, title, desc, owner, play, duration }] */
export async function fetchRecommendations(cred, options = {}) {
  const params = {
    web_location: '1430650',
    y_num: String(options.count ?? 5),
    fresh_type: '4',
    feed_version: 'V8',
    fresh_idx: String(options.page ?? 1),
    fresh_idx_1h: '1',
    brush: String(options.page ?? 1),
    homepage_ver: '1',
    ps: String(options.ps ?? 10),
  }
  const query = await signWbi(params, { cred, keys: options.wbiKeys, signal: options.signal })
  const data = await getJson(`${RCMD}?${query}`, {
    cred,
    referer: 'https://www.bilibili.com/',
    signal: options.signal,
  })
  const items = Array.isArray(data.item) ? data.item : []
  return items.map((item) => ({
    aid: Number(item?.id) || 0,
    bvid: String(item?.bvid || ''),
    title: String(item?.title || '').slice(0, 120),
    desc: String(item?.desc || '').slice(0, 200),
    owner: String(item?.owner?.name || ''),
    play: Number(item?.stat?.view) || 0,
    duration: Number(item?.duration) || 0,
    pubdate: Number(item?.pubdate) || 0,
    source: 'rcmd',
  })).filter((item) => item.bvid !== '')
}

/** 关键词搜视频。返回与推荐流同形状。 */
export async function searchVideos(cred, keyword, options = {}) {
  const params = {
    search_type: 'video',
    keyword: String(keyword),
    page: String(options.page ?? 1),
    page_size: String(options.pageSize ?? 20),
  }
  const query = await signWbi(params, { cred, keys: options.wbiKeys, signal: options.signal })
  const data = await getJson(`https://api.bilibili.com/x/web-interface/wbi/search/type?${query}`, {
    cred,
    referer: 'https://search.bilibili.com/',
    signal: options.signal,
  })
  const items = Array.isArray(data.result) ? data.result : []
  return items.map((item) => ({
    aid: Number(item?.aid) || 0,
    bvid: String(item?.bvid || ''),
    title: String(item?.title || '').replace(/<[^>]+>/g, '').slice(0, 120),
    desc: String(item?.description || '').slice(0, 200),
    owner: String(item?.author || ''),
    play: Number(item?.play) || 0,
    duration: parseDuration(item?.duration),
    pubdate: Number(item?.pubdate) || 0,
    source: 'search',
  })).filter((item) => item.bvid !== '')
}

function parseDuration(value) {
  if (typeof value === 'number') return value
  const text = String(value || '')
  const parts = text.split(':').map(Number)
  if (parts.every((n) => Number.isFinite(n))) {
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
    if (parts.length === 2) return parts[0] * 60 + parts[1]
  }
  return 0
}
