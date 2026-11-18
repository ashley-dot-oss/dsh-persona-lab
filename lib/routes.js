/**
 * lib/routes.js —— 插件自己的 HTTP 面。
 *
 * 一个前缀 `/persona-lab/api`，后面按 pathname 分派。
 * 所有返回都是 JSON；文件导出走单独的响应头。
 */
import { loadCredential, clearCredential, loginPoll, loginStart, saveCredential, whoami } from './bili/auth.js'
import {
  appendIsolation, createZone, deleteRun, deleteSample, deleteZone, listChatRuns,
  listPersonaVersions, listRuns, listZones, loadIsolation, loadPersona, loadZone,
  readSamples, resetZoneLearning, saveZone,
} from './zone.js'
import { runZone, retryDistill, isRunning } from './run.js'
import { chatTurn, feedback } from './chat.js'
import { scanTargets, TARGET_KIND } from './scan.js'
import { renderText } from './ir.js'
import { toCardJson, toCardPng } from './export/card.js'

export const PREFIX = '/persona-lab/api'
const MAX_BODY = 2 * 1024 * 1024

export function registerRoutes(ctx, options) {
  const { root, getConfig, setConfig } = options

  return ctx.effect(() => {
    const dispose = ctx.webServer.register({
      kind: 'prefix',
      path: PREFIX,
      handler: async (request, response) => {
        try {
          await dispatch(request, response, { ctx, root, getConfig, setConfig })
        } catch (error) {
          sendJson(response, {
            ok: false,
            error: 'internal',
            message: String(error?.message || error),
          }, 500)
        }
      },
    })
    return () => {
      if (typeof dispose === 'function') dispose()
    }
  })
}

async function dispatch(request, response, env) {
  const url = new URL(request.url || '/', 'http://local')
  const path = url.pathname.startsWith(PREFIX) ? url.pathname.slice(PREFIX.length) : url.pathname
  const parts = path.split('/').filter(Boolean)
  const method = (request.method || 'GET').toUpperCase()
  const { ctx, root, getConfig, setConfig } = env
  const config = getConfig()

  // GET /state
  if (method === 'GET' && parts.length === 1 && parts[0] === 'state') {
    const zones = listZones(root)
    return sendJson(response, {
      ok: true,
      consentAccepted: Boolean(config.consentAccepted),
      zones: zones.map((zone) => summarizeZone(root, zone)),
      duplicates: findDuplicateAccounts(root, zones),
      running: isRunning(),
      limits: { maxZones: config.maxZones },
      hasOwnApi: Boolean(config.apiKey && config.apiBaseUrl),
    })
  }

  // POST /consent
  if (method === 'POST' && parts.length === 1 && parts[0] === 'consent') {
    const body = await readBody(request)
    const accepted = body?.accepted === true
    setConfig({ ...config, consentAccepted: accepted })
    return sendJson(response, { ok: true, consentAccepted: accepted })
  }

  // POST /config
  if (method === 'POST' && parts.length === 1 && parts[0] === 'config') {
    const body = await readBody(request)
    const next = { ...config }
    for (const key of ['apiKey', 'apiBaseUrl', 'apiModel', 'root']) {
      if (typeof body?.[key] === 'string') next[key] = body[key].trim()
    }
    for (const key of ['vision', 'speech']) {
      if (body?.[key] && typeof body[key] === 'object') {
        next[key] = {
          enabled: body[key].enabled === true,
          baseUrl: String(body[key].baseUrl || '').trim(),
          apiKey: String(body[key].apiKey || '').trim(),
          model: String(body[key].model || '').trim(),
        }
      }
    }
    if (Number.isInteger(body?.maxZones)) next.maxZones = Math.max(1, Math.min(10, body.maxZones))
    setConfig(next)
    return sendJson(response, { ok: true })
  }

  // 二维码图（纯渲染，不需要知道是哪个区）
  if (method === 'GET' && parts[0] === 'login' && parts[1] === 'qr') {
    const text = url.searchParams.get('text') || ''
    if (text === '') return sendJson(response, { ok: false, error: 'missing-text' }, 400)
    try {
      const { encode } = await import('./qr.js')
      const { makeQrPng } = await import('./export/png.js')
      const matrix = encode(text)
      const png = makeQrPng(matrix, { scale: 6, quiet: 4 })
      response.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' })
      response.end(png)
    } catch (error) {
      return sendJson(response, { ok: false, error: 'qr', message: String(error?.message || error) }, 500)
    }
    return
  }

  // 扫描可写人设的插件
  if (method === 'GET' && parts.length === 1 && parts[0] === 'targets') {
    const result = await scanTargets(ctx)
    return sendJson(response, { ok: true, ...result, legend: TARGET_KIND })
  }

  // 学习区
  if (method === 'GET' && parts.length === 1 && parts[0] === 'zones') {
    return sendJson(response, { ok: true, zones: listZones(root).map((zone) => summarizeZone(root, zone)) })
  }

  if (method === 'POST' && parts.length === 1 && parts[0] === 'zones') {
    const body = await readBody(request)
    const zones = listZones(root)
    if (zones.length >= config.maxZones) {
      return sendJson(response, {
        ok: false, error: 'zone-limit', message: `最多 ${config.maxZones} 个学习区。`,
      }, 400)
    }
    const zone = createZone(root, body || {})
    return sendJson(response, { ok: true, zone: summarizeZone(root, zone) })
  }

  if (parts[0] === 'zones' && parts.length >= 2) {
    const zoneId = parts[1]
    const zone = loadZone(root, zoneId)
    if (!zone) return sendJson(response, { ok: false, error: 'no-zone', message: `找不到 ${zoneId}` }, 404)

    // 账号：每个学习区各自一份
    if (parts[2] === 'login') {
      const action = parts[3] || ''
      if (method === 'POST' && action === 'start') {
        const { key, url: qrUrl } = await loginStart()
        return sendJson(response, { ok: true, key, url: qrUrl })
      }
      if (method === 'GET' && action === 'poll') {
        const key = url.searchParams.get('key') || ''
        if (key === '') return sendJson(response, { ok: false, error: 'missing-key' }, 400)
        const result = await loginPoll(key)
        if (result.state === 'ok') {
          let account = null
          try { account = await whoami(result.credential) } catch { /* 刚登录可能还没缓存 */ }
          saveCredential(root, zoneId, { ...result.credential, nickname: account?.name || '' })
          return sendJson(response, { ok: true, state: 'ok', account })
        }
        return sendJson(response, { ok: true, state: result.state, message: result.message || '' })
      }
      if (method === 'POST' && action === 'manual') {
        const body = await readBody(request)
        const parsed = parseCookieString(String(body?.cookie || ''))
        if (!parsed.sessdata) {
          return sendJson(response, { ok: false, error: 'bad-cookie', message: '没找到 SESSDATA；至少要有它。' }, 400)
        }
        let account = null
        try { account = await whoami(parsed) } catch (error) {
          return sendJson(response, {
            ok: false, error: 'not-logged-in', message: `Cookie 存下了，但验证失败：${error?.message || error}`,
          }, 400)
        }
        saveCredential(root, zoneId, { ...parsed, nickname: account?.name || '' })
        return sendJson(response, { ok: true, account })
      }
      if (method === 'POST' && action === 'logout') {
        clearCredential(root, zoneId)
        return sendJson(response, { ok: true })
      }
      if (method === 'POST' && action === 'copy') {
        const body = await readBody(request)
        const from = String(body?.from || '')
        const source = from !== '' ? loadCredential(root, from) : loadCredential(root)
        if (!source) {
          return sendJson(response, { ok: false, error: 'no-source', message: '没有可复用的账号：先扫码或粘贴 Cookie。' }, 400)
        }
        saveCredential(root, zoneId, source)
        return sendJson(response, {
          ok: true,
          account: { uid: Number(source.dedeuserid) || 0, name: source.nickname || '' },
        })
      }
      return sendJson(response, { ok: false, error: 'bad-login-action' }, 400)
    }

    // POST /zones/:id —— 改配置
    if (method === 'POST' && parts.length === 2) {
      const body = await readBody(request)
      const next = { ...zone, ...(body || {}), id: zoneId }
      if (body?.isolation) {
        next.isolation = Array.isArray(body.isolation) ? body.isolation : []
      }
      const saved = saveZone(root, normalizeForSave(root, next))
      return sendJson(response, { ok: true, zone: summarizeZone(root, saved) })
    }

    // DELETE /zones/:id
    if (method === 'DELETE' && parts.length === 2) {
      deleteZone(root, zoneId)
      return sendJson(response, { ok: true })
    }

    // POST /zones/:id/reset-learning —— 清空学习记录，保留账号与隔离文本
    if (method === 'POST' && parts.length === 3 && parts[2] === 'reset-learning') {
      const result = resetZoneLearning(root, zoneId)
      if (result === null) return sendJson(response, { ok: false, error: 'no-zone' }, 404)
      return sendJson(response, { ok: true, ...result })
    }

    // POST /zones/:id/run
    if (method === 'POST' && parts.length === 3 && parts[2] === 'run') {
      const body = await readBody(request).catch(() => ({}))
      const result = await runZone({ ctx, root, zoneId, config, force: body?.force === true })
      if (result.ok) return sendJson(response, { ok: true, ...result })
      return sendJson(response, result, result.reason === 'busy' ? 409 : 400)
    }

    // POST /zones/:id/distill —— 用已有样本重试
    if (method === 'POST' && parts.length === 3 && parts[2] === 'distill') {
      const body = await readBody(request)
      const result = await retryDistill({ ctx, root, zoneId, runId: body?.runId, config })
      return sendJson(response, result, result.ok ? 200 : 400)
    }

    // GET /zones/:id/history
    if (method === 'GET' && parts.length === 3 && parts[2] === 'history') {
      return sendJson(response, {
        ok: true,
        runs: listRuns(root, zoneId).map((run) => ({
          ...run,
          byDay: String(run.startedAt || '').slice(0, 10),
        })),
      })
    }

    // GET /zones/:id/history/:runId/samples
    if (method === 'GET' && parts.length === 5 && parts[4] === 'samples') {
      return sendJson(response, { ok: true, samples: readSamples(root, zoneId, parts[3]) })
    }

    // DELETE /zones/:id/history/:runId —— 直接删，不留痕
    if (method === 'DELETE' && parts.length === 4) {
      const removed = deleteRun(root, zoneId, parts[3])
      return sendJson(response, { ok: true, removed })
    }

    // DELETE /zones/:id/samples/:runId/:sampleId —— 删内容 + 写隔离文本
    if (method === 'DELETE' && parts.length === 6) {
      const result = deleteSample(root, zoneId, parts[3], decodeURIComponent(parts[5]))
      return sendJson(response, { ok: true, ...result })
    }

    // GET /zones/:id/persona
    if (method === 'GET' && parts.length === 3 && parts[2] === 'persona') {
      const versions = listPersonaVersions(root, zoneId)
      return sendJson(response, {
        ok: true,
        current: versions[0] || null,
        versions: versions.map((item) => ({
          version: item.version,
          createdAt: item.createdAt,
          sampleCount: item.meta?.sampleCount || 0,
        })),
      })
    }

    // GET /zones/:id/persona/:version/export?format=text|json|png
    if (method === 'GET' && parts.length === 5 && parts[4] === 'export') {
      const version = Number(parts[3]) || undefined
      const ir = loadPersona(root, zoneId, version)
      if (!ir) return sendJson(response, { ok: false, error: 'no-persona' }, 404)
      const format = (url.searchParams.get('format') || 'text').toLowerCase()
      if (format === 'png') {
        const png = toCardPng(ir, { name: zone.name, version: ir.version })
        response.writeHead(200, {
          'Content-Type': 'image/png',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(zone.name)}-v${ir.version}.png"`,
        })
        response.end(png)
        return
      }
      if (format === 'json') {
        const json = toCardJson(ir, { name: zone.name, version: ir.version })
        return sendText(response, json, 'application/json; charset=utf-8')
      }
      return sendText(response, renderText(ir, { title: zone.name }), 'text/plain; charset=utf-8')
    }

    // POST /zones/:id/chat
    if (method === 'POST' && parts.length === 3 && parts[2] === 'chat') {
      const body = await readBody(request)
      const result = await chatTurn({
        ctx, root, zoneId, config, zone,
        scene: body?.scene,
        messages: body?.messages,
        system: body?.system,
      })
      return sendJson(response, result, result.ok ? 200 : 400)
    }

    // POST /zones/:id/feedback
    if (method === 'POST' && parts.length === 3 && parts[2] === 'feedback') {
      const body = await readBody(request)
      const result = feedback({ root, zoneId, zone, type: body?.type, text: body?.text, score: body?.score })
      if (result.ok && result.patch) {
        saveZone(root, normalizeForSave(root, { ...zone, ...result.patch }))
      }
      return sendJson(response, result, result.ok ? 200 : 400)
    }
  }

  return sendJson(response, { ok: false, error: 'not-found', path }, 404)
}

/** 同一个 B站 账号被多个学习区使用时找出来——数据是分开存的，但会学到相似内容。 */
function findDuplicateAccounts(root, zones) {
  const byUid = new Map()
  for (const zone of zones) {
    const cred = loadCredential(root, zone.id)
    const uid = Number(cred?.dedeuserid) || 0
    if (uid <= 0) continue
    if (!byUid.has(uid)) byUid.set(uid, [])
    byUid.get(uid).push({ id: zone.id, name: zone.name })
  }
  return [...byUid.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([uid, list]) => ({ uid, zones: list }))
}

function summarizeZone(root, zone) {
  const versions = listPersonaVersions(root, zone.id)
  const cred = loadCredential(root, zone.id)
  return {
    ...zone,
    isolation: loadIsolation(root, zone.id),
    isolationCount: loadIsolation(root, zone.id).length,
    account: cred
      ? { uid: Number(cred.dedeuserid) || 0, name: cred.nickname || '' }
      : null,
    runs: listRuns(root, zone.id).length,
    chatRuns: listChatRuns(root, zone.id).length,
    currentVersion: versions[0]?.version || null,
    versionCount: versions.length,
  }
}

/** 保存前把 isolation 数组转成文本，并丢掉只读的汇总字段。 */
function normalizeForSave(root, zone) {
  const next = { ...zone }
  if (Array.isArray(next.isolation) && next.isolation.length > 0) {
    appendIsolation(root, zone.id, next.isolation)
  }
  delete next.isolation
  for (const key of ['isolationCount', 'runs', 'chatRuns', 'currentVersion', 'versionCount', 'account']) {
    delete next[key]
  }
  if (next.quota && typeof next.quota === 'object') {
    const quota = { ...next.quota }
    delete quota.rcmdCap
    next.quota = quota
  }
  return next
}

function parseCookieString(raw) {
  const out = {}
  for (const part of String(raw || '').split(/;\s*/)) {
    const eq = part.indexOf('=')
    if (eq <= 0) continue
    const name = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    const map = { SESSDATA: 'sessdata', bili_jct: 'bili_jct', buvid3: 'buvid3', DedeUserID: 'dedeuserid' }
    if (map[name]) out[map[name]] = value
  }
  return out
}

async function readBody(request) {
  if (typeof request.json === 'function') {
    try { return await request.json() } catch { return {} }
  }
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_BODY) throw new Error('请求体过大')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return {}
  }
}

function sendJson(response, payload, status = 200) {
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(body)
}

function sendText(response, text, contentType) {
  response.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' })
  response.end(text)
}
