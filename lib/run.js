/**
 * lib/run.js —— 一次学习的完整编排。
 *
 * 顺序是刻意的：先采集落盘，再提炼。提炼失败时样本与日志仍然在，
 * 用户看得到「学到了什么、为什么这次没出人设词」，不会白跑一趟。
 */
import { loadCredential } from './bili/auth.js'
import { createWbiCache } from './bili/http.js'
import { allocateQuota, canRunNow } from './learn/plan.js'
import { collect, normalizeText } from './learn/collect.js'
import { distill } from './learn/distill.js'
import { makeIr } from './ir.js'
import { appendIsolation, listRuns, loadIsolation, loadLearned, loadZone, readSamples, saveLearned, savePersona, saveRun } from './zone.js'
import { complete } from './llm.js'
import { stamp } from './store.js'

let running = null

export function isRunning() {
  return running !== null
}

/**
 * 跑一次学习。同一时间只允许一个（不同区也不行，避免把 B站 打成风控）。
 * @returns {Promise<object>}
 */
export async function runZone(input) {
  if (running !== null) {
    return { ok: false, reason: 'busy', message: `已经有一次学习在跑（${running}），等它结束。` }
  }
  running = input.zoneId
  try {
    return await runInner(input)
  } finally {
    running = null
  }
}

async function runInner(input) {
  const { ctx, root, zoneId, config } = input
  const zone = loadZone(root, zoneId)
  if (!zone) return { ok: false, reason: 'no-zone', message: `找不到学习区 ${zoneId}` }
  if (!config?.consentAccepted) {
    return { ok: false, reason: 'no-consent', message: '还没同意权限与风险说明；先在设置页第一屏点同意。' }
  }
  if (!canRunNow(zone, new Date()) && input.force !== true) {
    return { ok: false, reason: 'outside-window', message: '不在这个区设定的时间窗内。' }
  }

  const cred = loadCredential(root, zoneId)
  if (!cred) return { ok: false, reason: 'no-account', message: '这个学习区还没登录 B站 账号；在它的设置里扫码或粘贴 Cookie。' }

  const quota = input.quota || allocateQuota(zone)
  const learned = loadLearned(root, zoneId)
  const wbiKeys = createWbiCache()
  const isolation = loadIsolation(root, zoneId)
  const zoneWithIsolation = { ...zone, isolation }
  // 已出现过的文本（最近几次），用于跨轮次去重
  const seenText = loadRecentTexts(root, zoneId, 3)

  const startedAt = new Date().toISOString()
  const collected = await collect({
    cred,
    zone: zoneWithIsolation,
    quota,
    learned,
    seenText,
    wbiKeys,
    config,
    budgetMs: Math.max(60_000, (zone.maxRunMinutes || 10) * 60_000),
    signal: input.signal,
  })

  // 先把这次「学到了什么」落盘
  const runId = `${stamp()}-${zoneId}`
  const run = {
    id: runId,
    zoneId,
    startedAt,
    finishedAt: new Date().toISOString(),
    samples: collected.samples,
    stats: collected.stats,
    errors: collected.errors,
    elapsedMs: collected.elapsedMs,
    version: null,
    /** 这次学习时的人设要求快照；只有要求相同的历史才参与蒸馏 */
    focusSig: focusSignature(zone.focus),
  }
  saveRun(root, zoneId, run)
  saveLearned(root, zoneId, learned)

  if (collected.samples.length === 0) {
    const hint = collected.errors.length > 0
      ? '看日志里的 errors，多半是接口或登录态的问题。'
      : '这次没有新内容：搜到的视频基本都学过了，或者关键词太窄。换几个关键词，或把「一次学习总条数」调大，也可以等到有新的视频。'
    return {
      ok: false,
      reason: 'no-samples',
      message: `这次一条可用样本都没抓到。${hint}`,
      runId,
      stats: collected.stats,
      errors: collected.errors,
    }
  }

  // 再提炼：把最近几次的学习内容一起带上（蒸馏），不是只看这一次
  try {
    const merged = mergeHistorySamples(
      root, zoneId, runId, collected.samples, focusSignature(zone.focus),
    )
    const distilled = await distill({
      samples: merged,
      zone,
      complete: (args) => complete({ ctx, config, ...args }),
    })
    const ir = makeIr({
      zoneId,
      samples: merged,
      model: config.apiModel || 'host-model',
      distilled,
    })
    const saved = savePersona(root, zoneId, ir)
    // 日志里补上版本号
    saveRun(root, zoneId, { ...run, version: saved.version })
    return {
      ok: true,
      runId,
      version: saved.version,
      sampleCount: collected.samples.length,
      mergedCount: merged.length,
      stats: collected.stats,
      errors: collected.errors,
      elapsedMs: collected.elapsedMs,
      ir: saved,
    }
  } catch (error) {
    const message = String(error?.message || error)
    // 提炼失败也要落盘：不然事后查不到为什么没出人设词
    saveRun(root, zoneId, { ...run, version: null, distillError: message })
    // 提炼失败也可以把命中的内容写进隔离文本？不——那是用户的决定，不替用户做。
    return {
      ok: false,
      reason: 'distill-failed',
      message: `样本已存下（${collected.samples.length} 条），但提炼失败：${message}`,
      runId,
      stats: collected.stats,
      errors: collected.errors,
    }
  }
}

/**
 * 合并规则：同一个学习区 + 人设要求相同，才把历史样本并进来。
 * 人设要求变了，就从新的算起——不然旧方向会把新重点带偏。
 */
/** 读最近几次样本的归一化文本，作为跨轮次去重的基线。 */
function loadRecentTexts(root, zoneId, runs = 3) {
  const set = new Set()
  for (const run of listRuns(root, zoneId).slice(0, runs)) {
    for (const sample of readSamples(root, zoneId, run.id)) {
      const key = normalizeText(sample.text)
      if (key !== '') set.add(key)
    }
  }
  return set
}

function mergeHistorySamples(root, zoneId, currentRunId, current, currentSig) {
  const historyRuns = listRuns(root, zoneId)
    .filter((run) => run.id !== currentRunId)
    // 同一个人设要求才并（空签名与空签名算同一组：都没设重点）
    .filter((run) => (run.focusSig || '') === (currentSig || ''))
    .slice(0, 3)
  if (historyRuns.length === 0) return current
  const seen = new Set(current.map((sample) => sample.id))
  const out = [...current]
  for (const run of historyRuns) {
    for (const sample of readSamples(root, zoneId, run.id)) {
      if (seen.has(sample.id)) continue
      seen.add(sample.id)
      out.push(sample)
    }
  }
  return out
}

/** 人设要求的规范化签名：以哪块为主 + 学习重点 + 明确不要。 */
export function focusSignature(focus) {
  if (!focus) return ''
  const normalized = {
    primary: String(focus.primary || 'chat'),
    traits: [...(Array.isArray(focus.traits) ? focus.traits : [])].sort(),
    avoid: [...(Array.isArray(focus.avoid) ? focus.avoid : [])].sort(),
  }
  return JSON.stringify(normalized)
}

/** 只重试提炼（用已存的样本），不重新采集。 */
export async function retryDistill(input) {
  const { ctx, root, zoneId, runId, config } = input
  const zone = loadZone(root, zoneId)
  if (!zone) return { ok: false, reason: 'no-zone', message: '找不到学习区' }
  const { readSamples } = await import('./zone.js')
  const samples = readSamples(root, zoneId, runId)
  if (samples.length === 0) return { ok: false, reason: 'no-samples', message: '这次没有样本可重试' }
  try {
    const distilled = await distill({
      samples,
      zone,
      complete: (args) => complete({ ctx, config, ...args }),
    })
    const ir = makeIr({ zoneId, samples, model: config.apiModel || 'host-model', distilled })
    const saved = savePersona(root, zoneId, ir)
    return { ok: true, version: saved.version, ir: saved }
  } catch (error) {
    return { ok: false, reason: 'distill-failed', message: String(error?.message || error) }
  }
}
