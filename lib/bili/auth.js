/**
 * lib/bili/auth.js —— 扫码登录与凭据存取。
 *
 * 流程（本机实测过的 passport 接口）：
 *  1. GET  /x/passport-login/web/qrcode/generate?source=main-fe-header → data.url + data.qrcode_key
 *  2. 手机扫码 → 轮询 /x/passport-login/web/qrcode/poll?qrcode_key=…
 *     86038 过期 / 86101 未扫 / 86090 已扫待确认 / 0 成功
 *  3. 凭据在轮询响应的 Set-Cookie 里（不是 data.url 里）
 *  4. 缺 buvid3 时补一次 /x/frontend/finger/spi
 *
 * 凭据只写本机 credential.json，并收紧权限。
 */
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { credentialPath } from '../paths.js'
import { ensureDir, hardenPerms, readJson, writeJson } from '../store.js'
import { BiliError, UA, pickCredential } from './http.js'

const GEN = 'https://passport.bilibili.com/x/passport-login/web/qrcode/generate?source=main-fe-header'
const POLL = (key) => 'https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key='
  + encodeURIComponent(key) + '&source=main-fe-header'
const SPI = 'https://api.bilibili.com/x/frontend/finger/spi'

export async function loginStart(options = {}) {
  const response = await fetch(GEN, { headers: { 'User-Agent': UA }, signal: options.signal })
  const body = await response.json().catch(() => null)
  const data = body?.data
  if (!data?.qrcode_key || !data?.url) {
    throw new BiliError('qrcode', `生成二维码失败：${body?.message || '返回里没有 qrcode_key'}`)
  }
  return { key: data.qrcode_key, url: data.url }
}

/** 轮询一次。state: waiting / scanned / ok / expired / unknown */
export async function loginPoll(key, options = {}) {
  const response = await fetch(POLL(key), {
    headers: { 'User-Agent': UA },
    redirect: 'manual',
    signal: options.signal,
  })
  const setCookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : splitSetCookie(response.headers.get('set-cookie'))

  const body = await response.json().catch(() => null)
  const code = body?.data?.code
  if (code === 0) {
    const jar = await ensureBuvid3(pickCredential(setCookies))
    if (!jar.sessdata) {
      return { state: 'unknown', code, message: '登录成功，但响应里没有 SESSDATA；再试一次，或改用粘贴 Cookie。' }
    }
    return { state: 'ok', code, credential: jar }
  }
  const map = { 86101: 'waiting', 86090: 'scanned', 86038: 'expired' }
  return { state: map[code] ?? 'unknown', code, message: body?.message || '' }
}

async function ensureBuvid3(jar) {
  if (jar.buvid3) return jar
  try {
    const response = await fetch(SPI, { headers: { 'User-Agent': UA } })
    const body = await response.json()
    const b3 = body?.data?.b_3
    if (b3) jar.buvid3 = b3
  } catch { /* 拿不到 buvid3 也能读部分接口，非致命 */ }
  return jar
}

function splitSetCookie(header) {
  if (typeof header !== 'string' || header === '') return []
  return header.split(/,(?=[^;]+=)/g)
}

/** 读凭据；不存在或坏了返回 null。zoneId 为空时读全局（迁移用）。 */
export function loadCredential(root, zoneId) {
  const file = credentialPath(root, zoneId)
  if (!existsSync(file)) return null
  const value = readJson(file, null)
  if (!value || typeof value.sessdata !== 'string' || value.sessdata === '') return null
  return value
}

/** 写凭据（0600）。每个学习区一份。 */
export function saveCredential(root, zoneId, credential) {
  const file = credentialPath(root, zoneId)
  ensureDir(join(file, '..'))
  writeJson(file, {
    sessdata: credential.sessdata || '',
    bili_jct: credential.bili_jct || '',
    buvid3: credential.buvid3 || '',
    dedeuserid: credential.dedeuserid || '',
    nickname: credential.nickname || '',
    savedAt: new Date().toISOString(),
  })
  hardenPerms(file)
  return file
}

export function clearCredential(root, zoneId) {
  const file = credentialPath(root, zoneId)
  try { rmSync(file, { force: true }) } catch { /* 不在就算了 */ }
  return true
}

/** 本机是否还有旧的全局凭据（迁移一次用）。 */
export function hasLegacyCredential(root) {
  return existsSync(credentialPath(root))
}

/** 把全局凭据复制到指定区（迁移）。 */
export function copyLegacyCredential(root, zoneId) {
  const legacy = loadCredential(root)
  if (!legacy) return false
  saveCredential(root, zoneId, legacy)
  return true
}

/** 校验登录态并返回昵称 / uid；失败抛错。 */
export async function whoami(cred) {
  const headers = { 'User-Agent': UA, Referer: 'https://www.bilibili.com/' }
  if (cred?.sessdata) headers.Cookie = `SESSDATA=${cred.sessdata}; bili_jct=${cred.bili_jct || ''}; buvid3=${cred.buvid3 || ''}`
  const response = await fetch('https://api.bilibili.com/x/web-interface/nav', { headers })
  const body = await response.json().catch(() => null)
  if (body?.code !== 0 || body?.data?.isLogin !== true) {
    throw new BiliError('not-logged-in', body?.message || '未登录或登录已失效')
  }
  return {
    uid: Number(body.data.mid) || 0,
    name: String(body.data.uname || ''),
    face: String(body.data.face || ''),
  }
}
