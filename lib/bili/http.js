/**
 * lib/bili/http.js —— B站 接口的最小 HTTP 层：UA、Cookie、JSON 与 WBI 签名。
 *
 * 只做三件事：拼请求头、解 JSON、签 WBI。业务在 dm/reply/danmaku/rcmd/search 里。
 */
import { createHash } from 'node:crypto'

export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

/** WBI 的固定置换表（B站 前端公开实现）。 */
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
]

export class BiliError extends Error {
  constructor(code, message, status) {
    super(message)
    this.name = 'BiliError'
    this.code = code
    this.status = status
  }
}

export function cookieHeader(cred) {
  if (!cred || !cred.sessdata) return ''
  const parts = [`SESSDATA=${cred.sessdata}`]
  if (cred.bili_jct) parts.push(`bili_jct=${cred.bili_jct}`)
  if (cred.buvid3) parts.push(`buvid3=${cred.buvid3}`)
  if (cred.dedeuserid) parts.push(`DedeUserID=${cred.dedeuserid}`)
  return parts.join('; ')
}

/** 从 Set-Cookie 头里挑出我们要的字段。 */
export function pickCredential(setCookies) {
  const jar = {}
  const want = { SESSDATA: 'sessdata', bili_jct: 'bili_jct', DedeUserID: 'dedeuserid', buvid3: 'buvid3' }
  for (const raw of setCookies ?? []) {
    const first = String(raw).split(';')[0] || ''
    const eq = first.indexOf('=')
    if (eq <= 0) continue
    const name = first.slice(0, eq).trim()
    const value = first.slice(eq + 1).trim()
    if (want[name]) jar[want[name]] = value
  }
  return jar
}

export function hasCredential(cred) {
  return Boolean(cred && typeof cred.sessdata === 'string' && cred.sessdata !== '')
}

/** 带 Cookie 的 GET，返回 data 字段；code !== 0 抛 BiliError。 */
/** 合并外部 signal 与超时；不支持 AbortSignal.any 时退回原 signal（保住兼容）。 */
export function withTimeout(signal, ms = 20_000) {
  let timeout
  try {
    timeout = AbortSignal.timeout(ms)
  } catch {
    return signal
  }
  if (!signal) return timeout
  try {
    return typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : signal
  } catch {
    return signal
  }
}

export async function getJson(url, options = {}) {
  const headers = {
    'User-Agent': UA,
    Referer: options.referer || 'https://www.bilibili.com/',
    ...(options.headers || {}),
  }
  if (options.cred && options.cred.sessdata) headers.Cookie = cookieHeader(options.cred)

  let response
  try {
    response = await fetch(url, {
      headers,
      signal: withTimeout(options.signal, Number(options.timeoutMs) || 20_000),
    })
  } catch (error) {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      throw new BiliError('timeout', `请求超时（${Number(options.timeoutMs) || 20_000} ms）`, 0)
    }
    throw new BiliError('network', `请求失败：${error?.message || error}`, 0)
  }

  const text = await response.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new BiliError('non-json', `返回不是 JSON（HTTP ${response.status}）：${text.slice(0, 120)}`, response.status)
  }

  if (body?.code !== 0) {
    throw new BiliError(
      body?.code ?? 'unknown',
      body?.message || `接口返回 code=${body?.code}`,
      response.status,
    )
  }
  return body.data ?? {}
}

/**
 * WBI 签名。返回带 `w_rid` / `wts` 的查询串。
 * 取不到 nav 的 wbi_img 时抛错，由调用方决定降级。
 *
 * 注意：这里不能用 URLSearchParams —— 它按 form 编码（空格变 +），
 * B站 校验用的是 encodeURIComponent，编码不一致会直接 -403。
 */
export async function signWbi(params, options = {}) {
  const keys = options.keys || await fetchWbiKeys(options)
  const merged = { ...params, wts: String(Math.round(Date.now() / 1000)) }
  const parts = []
  for (const key of Object.keys(merged).sort()) {
    const value = merged[key]
    if (value === undefined || value === null) continue
    const text = String(value).replace(/[!'()*]/g, '')
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(text)}`)
  }
  const raw = parts.join('&')
  const mixinKey = buildMixinKey(keys)
  const wRid = md5(raw + mixinKey)
  return `${raw}&w_rid=${wRid}`
}

export async function fetchWbiKeys(options = {}) {
  const headers = { 'User-Agent': UA, Referer: 'https://www.bilibili.com/' }
  if (options.cred?.sessdata) headers.Cookie = cookieHeader(options.cred)
  let body
  try {
    const response = await fetch('https://api.bilibili.com/x/web-interface/nav', { headers, signal: options.signal })
    body = await response.json()
  } catch (error) {
    throw new BiliError('wbi-keys', `取 WBI 密钥失败：${error?.message || error}`, 0)
  }
  const img = body?.data?.wbi_img?.img_url || ''
  const sub = body?.data?.wbi_img?.sub_url || ''
  const imgKey = fileStem(img)
  const subKey = fileStem(sub)
  if (!imgKey || !subKey) throw new BiliError('wbi-keys', 'nav 返回里没有 wbi_img')
  return { imgKey, subKey }
}

function fileStem(url) {
  const name = String(url).split('/').pop() || ''
  return name.replace(/\.[a-z0-9]+$/i, '')
}

function buildMixinKey({ imgKey, subKey }) {
  const raw = imgKey + subKey
  let out = ''
  for (const index of MIXIN_KEY_ENC_TAB) out += raw[index] ?? ''
  return out.slice(0, 32)
}

export function md5(text) {
  return createHash('md5').update(text).digest('hex')
}

/** 每 10 分钟刷新一次 WBI 密钥，避免每次请求都打 nav。 */
export function createWbiCache(ttlMs = 10 * 60 * 1000) {
  let cached = null
  let at = 0
  return async function keys(options = {}) {
    const now = Date.now()
    if (cached && now - at < ttlMs) return cached
    cached = await fetchWbiKeys(options)
    at = now
    return cached
  }
}
