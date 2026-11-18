/**
 * lib/zone.js —— 学习区的落盘结构。
 *
 * zones/<id>/
 *   zone.json          配置
 *   learned.json       已学过的 id（去重）
 *   history/<runId>.json   一次学习的日志（删除键 = 直接删）
 *   samples/<runId>.jsonl  每次的样本（按条删除 = 写隔离文本再删）
 *   persona/v<n>.json  人设 IR 版本（写前快照）
 *   isolate.txt        隔离文本（一行一条）
 *   chat/<runId>.json  聊天测试记录
 */
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeZone, zoneDefaults } from './config.js'
import { ensureDir, listFiles, readJson, readText, snapshot, writeJson, writeText } from './store.js'
import { zonesDir } from './paths.js'

export function listZones(root) {
  const dir = zonesDir(root)
  if (!existsSync(dir)) return []
  const zones = []
  let entries = []
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const value = readJson(join(dir, entry.name, 'zone.json'), null)
    if (!value) continue
    const { value: normalized } = normalizeZone({ ...value, id: entry.name }, 0)
    zones.push(normalized)
  }
  return zones.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
}

export function loadZone(root, zoneId) {
  const file = join(zonesDir(root), zoneId, 'zone.json')
  const value = readJson(file, null)
  if (!value) return null
  const { value: normalized } = normalizeZone({ ...value, id: zoneId }, 0)
  return normalized
}

export function saveZone(root, zone) {
  const dir = ensureDir(join(zonesDir(root), zone.id))
  writeJson(join(dir, 'zone.json'), zone)
  return zone
}

export function createZone(root, input) {
  const existing = listZones(root)
  const id = String(input?.id || '').trim()
  if (id !== '' && existing.some((zone) => zone.id === id)) {
    throw new Error(`学习区 ${id} 已存在`)
  }
  const index = existing.length
  const { value } = normalizeZone({ ...(input || {}), id: id || zoneDefaults(index).id }, index)
  ensureDir(join(zonesDir(root), value.id))
  saveZone(root, value)
  return value
}

export function deleteZone(root, zoneId) {
  const dir = join(zonesDir(root), zoneId)
  if (!existsSync(dir)) return false
  rmSync(dir, { recursive: true, force: true })
  return true
}

/**
 * 清空学习记录，但保留账号、学习区配置、隔离文本。
 * 删的是：history / samples / persona / chat / learned / last-run。
 * 这样「换一批素材重学」不用重新扫码。
 */
export function resetZoneLearning(root, zoneId) {
  const dir = join(zonesDir(root), zoneId)
  if (!existsSync(dir)) return null
  const removed = []
  for (const name of ['history', 'samples', 'persona', 'chat']) {
    const target = join(dir, name)
    if (existsSync(target)) {
      rmSync(target, { recursive: true, force: true })
      removed.push(name)
    }
  }
  for (const name of ['learned.json', '.last-run.json']) {
    const target = join(dir, name)
    if (existsSync(target)) {
      rmSync(target, { force: true })
      removed.push(name)
    }
  }
  return { removed, kept: ['zone.json', 'credential.json', 'isolate.txt'] }
}

/* ---------- 学习内容去重集合 ---------- */

export function loadLearned(root, zoneId) {
  const file = join(zonesDir(root), zoneId, 'learned.json')
  const value = readJson(file, [])
  return new Set(Array.isArray(value) ? value : [])
}

export function saveLearned(root, zoneId, set) {
  const dir = ensureDir(join(zonesDir(root), zoneId))
  writeJson(join(dir, 'learned.json'), [...set].slice(-20000))
}

/* ---------- 隔离文本 ---------- */

export function loadIsolation(root, zoneId) {
  const text = readText(join(zonesDir(root), zoneId, 'isolate.txt'), '')
  return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '')
}

export function appendIsolation(root, zoneId, words) {
  const current = loadIsolation(root, zoneId)
  const merged = [...current]
  for (const word of words || []) {
    const text = String(word || '').trim()
    if (text !== '' && !merged.includes(text)) merged.push(text)
  }
  const dir = ensureDir(join(zonesDir(root), zoneId))
  writeText(join(dir, 'isolate.txt'), merged.join('\n'))
  return merged
}

/* ---------- 样本与历史 ---------- */

export function saveRun(root, zoneId, run) {
  const dir = ensureDir(join(zonesDir(root), zoneId))
  const samplesDir = ensureDir(join(dir, 'samples'))
  const historyDir = ensureDir(join(dir, 'history'))

  // 样本：一行一条，方便按条删除
  const lines = run.samples.map((sample) => JSON.stringify(sample)).join('\n')
  writeText(join(samplesDir, `${run.id}.jsonl`), lines)

  // 日志：不含原文，只含统计与错误
  writeJson(join(historyDir, `${run.id}.json`), {
    id: run.id,
    zoneId,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    sampleCount: run.samples.length,
    stats: run.stats,
    errors: run.errors,
    elapsedMs: run.elapsedMs,
    version: run.version || null,
  })
  return run.id
}

export function listRuns(root, zoneId) {
  const dir = join(zonesDir(root), zoneId, 'history')
  const files = listFiles(dir).filter((file) => file.endsWith('.json'))
  const runs = []
  for (const file of files) {
    const value = readJson(file, null)
    if (value) runs.push(value)
  }
  return runs.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
}

export function deleteRun(root, zoneId, runId) {
  const dir = join(zonesDir(root), zoneId)
  const history = join(dir, 'history', `${runId}.json`)
  const samples = join(dir, 'samples', `${runId}.jsonl`)
  let removed = false
  if (existsSync(history)) { rmSync(history, { force: true }); removed = true }
  if (existsSync(samples)) { rmSync(samples, { force: true }); removed = true }
  return removed
}

export function readSamples(root, zoneId, runId) {
  const file = join(zonesDir(root), zoneId, 'samples', `${runId}.jsonl`)
  const text = readText(file, '')
  return text.split(/\r?\n/).filter((line) => line.trim() !== '').map((line) => {
    try { return JSON.parse(line) } catch { return null }
  }).filter(Boolean)
}

/** 按条删除：写隔离文本，再从样本文件里去掉这一条。返回 { removed, isolation } */
export function deleteSample(root, zoneId, runId, sampleId) {
  const file = join(zonesDir(root), zoneId, 'samples', `${runId}.jsonl`)
  const samples = readSamples(root, zoneId, runId)
  const target = samples.find((sample) => sample.id === sampleId)
  if (!target) return { removed: false, isolation: loadIsolation(root, zoneId) }

  const rest = samples.filter((sample) => sample.id !== sampleId)
  writeText(file, rest.map((sample) => JSON.stringify(sample)).join('\n'))
  const isolation = appendIsolation(root, zoneId, [target.text])
  return { removed: true, isolation, sample: target }
}

/* ---------- 人设版本 ---------- */

export function personaDir(root, zoneId) {
  return join(zonesDir(root), zoneId, 'persona')
}

export function savePersona(root, zoneId, ir) {
  const dir = ensureDir(personaDir(root, zoneId))
  const versions = listPersonaVersions(root, zoneId)
  const next = (versions[0]?.version || 0) + 1
  const record = { ...ir, version: next }
  // 写前快照上一版：任何一版都能退回去
  const latest = versions[0]
  if (latest) snapshot(join(dir, `v${latest.version}.json`), join(dir, 'backups'), `v${latest.version}`)
  writeJson(join(dir, `v${next}.json`), record)
  return record
}

export function listPersonaVersions(root, zoneId) {
  const dir = personaDir(root, zoneId)
  const files = listFiles(dir).filter((file) => /^v\d+\.json$/.test(file.split(/[\\/]/).pop() || ''))
  const out = []
  for (const file of files) {
    const value = readJson(file, null)
    if (value && typeof value.version === 'number') out.push(value)
  }
  return out.sort((a, b) => b.version - a.version)
}

export function loadPersona(root, zoneId, version) {
  const versions = listPersonaVersions(root, zoneId)
  if (versions.length === 0) return null
  if (typeof version === 'number') return versions.find((item) => item.version === version) || null
  return versions[0]
}

/* ---------- 聊天测试记录 ---------- */

export function saveChatRun(root, zoneId, run) {
  const dir = ensureDir(join(zonesDir(root), zoneId, 'chat'))
  writeJson(join(dir, `${run.id}.json`), run)
  return run.id
}

export function listChatRuns(root, zoneId) {
  const dir = join(zonesDir(root), zoneId, 'chat')
  return listFiles(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => readJson(file, null))
    .filter(Boolean)
    .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
}
