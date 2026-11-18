/**
 * lib/bili/reply.js —— 评论：回复我的、视频评论区。
 *
 * · 回复我的：/x/msgfeed/reply（跟着账号走，不用关键词）
 * · 视频评论：/x/v2/reply/wbi/main（需要 WBI 签名与 aid）
 *
 * 只读，不发表评论。
 */
import { getJson } from './http.js'

const MFEED = 'https://api.bilibili.com/x/msgfeed/reply?platform=web&build=0&mobi_app=web'

/** 别人回复我的评论。返回 [{ id, text, uid, name, ts, source }] */
export async function fetchRepliesToMe(cred, options = {}) {
  const data = await getJson(MFEED, {
    cred,
    referer: 'https://www.bilibili.com/',
    signal: options.signal,
  })
  const items = Array.isArray(data.items) ? data.items : []
  return items.map((item) => {
    const content = item?.reply?.content?.message
      || item?.item?.content
      || ''
    return {
      id: String(item?.reply?.rpid || item?.id || ''),
      text: String(content).slice(0, 500),
      uid: Number(item?.user?.mid) || 0,
      name: String(item?.user?.nickname || ''),
      ts: Number(item?.reply?.ctime || item?.item?.timestamp || 0),
      source: 'reply',
      bvid: String(item?.item?.uri || '').match(/BV[0-9A-Za-z]{10}/)?.[0] || '',
    }
  }).filter((item) => item.text !== '')
}

/**
 * 视频评论区（按热度取一页）。
 *
 * 2026-11 实测：`/x/v2/reply/wbi/main` 一律 -403「访问权限不足」，
 * 但旧接口 `/x/v2/reply` 正常返回 20 条。所以这里不用 WBI。
 *
 * @param {string} aid 视频 aid（数字）
 */
export async function fetchVideoComments(cred, aid, options = {}) {
  const page = Math.max(1, Number(options.page) || 1)
  const url = 'https://api.bilibili.com/x/v2/reply'
    + `?oid=${Number(aid)}&type=1&pn=${page}&ps=20&sort=2`
  const data = await getJson(url, {
    cred,
    referer: 'https://www.bilibili.com/',
    signal: options.signal,
  })
  const replies = Array.isArray(data.replies) ? data.replies : []
  return replies.map((reply) => {
    const pictures = Array.isArray(reply?.content?.pictures)
      ? reply.content.pictures.map((picture) => String(picture?.img_src || '')).filter(Boolean).slice(0, 2)
      : []
    return {
      id: String(reply?.rpid || ''),
      text: String(reply?.content?.message || '').slice(0, 500),
      uid: Number(reply?.member?.mid) || 0,
      name: String(reply?.member?.uname || ''),
      ts: Number(reply?.ctime || 0),
      source: 'comment',
      like: Number(reply?.like) || 0,
      pictures,
    }
  }).filter((reply) => reply.text !== '' || reply.pictures.length > 0)
}
