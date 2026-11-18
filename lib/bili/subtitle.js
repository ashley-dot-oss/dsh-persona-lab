/**
 * lib/bili/subtitle.js —— 视频字幕：UP 主说的话。
 *
 * 接口（2026-11 实测通）：
 *   /x/player/v2?aid=&cid= → data.subtitle.subtitles[]，每项有 lan / subtitle_url
 *   subtitle_url 是协议相对的（//aisubtitle.hdslb.com/...），要补 https:
 *   下载后是 JSON：{ body: [{ from, to, content }] }
 *
 * 优先中文轨；没有字幕返回 []，由上层用简介兜底。
 */
import { getJson, UA } from './http.js'

/** 取一条视频的字幕文本（按时间顺序）。失败返回 []。 */
export async function fetchVideoSubtitles(info, cred, options = {}) {
  if (!info?.aid || !info?.cid) return []
  let data
  try {
    data = await getJson(
      `https://api.bilibili.com/x/player/v2?aid=${Number(info.aid)}&cid=${Number(info.cid)}`,
      { cred, referer: 'https://www.bilibili.com/', signal: options.signal },
    )
  } catch {
    return []
  }
  const list = Array.isArray(data?.subtitle?.subtitles) ? data.subtitle.subtitles : []
  if (list.length === 0) return []
  const pick = list.find((item) => String(item?.lan || '').toLowerCase().includes('zh')) || list[0]
  const rawUrl = String(pick?.subtitle_url || '')
  if (rawUrl === '') return []
  const url = rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl

  let body
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': UA, Referer: 'https://www.bilibili.com/' },
      signal: options.signal,
    })
    if (!response.ok) return []
    body = await response.json()
  } catch {
    return []
  }
  const lines = Array.isArray(body?.body) ? body.body : []
  return lines
    .map((item) => String(item?.content || '').trim())
    .filter((line) => line !== '')
}
