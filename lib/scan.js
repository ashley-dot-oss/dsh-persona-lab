/**
 * lib/scan.js —— 只读扫描：哪些已装插件「有人设入口」。
 *
 * 两条来源合并：
 *  1. 内置已知清单（准，但会过时）；
 *  2. ctx.pluginManager.listPlugins() 的实时结果（能反映「装没装」）。
 *
 * 只读，不写。输出里明确标「内置清单 / 实时扫描」，不假装是权威。
 */
import { readFileSync } from 'node:fs'

let cachedKnown = null

export function loadKnownTargets() {
  if (cachedKnown) return cachedKnown
  try {
    const url = new URL('../data/known-targets.json', import.meta.url)
    const raw = JSON.parse(readFileSync(url, 'utf8'))
    cachedKnown = Array.isArray(raw.targets) ? raw.targets : []
  } catch {
    cachedKnown = []
  }
  return cachedKnown
}

/**
 * @param {object} ctx 插件上下文
 * @returns {Promise<{ known: object[], installed: object[], notes: string[] }>}
 */
export async function scanTargets(ctx) {
  const known = loadKnownTargets()
  const installed = []
  const notes = []

  let plugins = []
  try {
    const manager = typeof ctx.get === 'function' ? ctx.get('pluginManager') : undefined
    if (manager && typeof manager.listPlugins === 'function') {
      plugins = await manager.listPlugins()
    } else {
      notes.push('读不到 pluginManager，本次只有内置清单可用。')
    }
  } catch (error) {
    notes.push(`扫描插件失败：${error?.message || error}；只有内置清单可用。`)
  }

  const rows = []
  for (const plugin of plugins) {
    const moduleName = String(plugin?.moduleName || '')
    const title = plugin?.meta?.title?.zh || plugin?.meta?.title?.en || plugin?.meta?.title || ''
    const matched = known.find((entry) =>
      (entry.match || []).some((needle) => moduleName.includes(needle) || String(title).includes(needle)))
    rows.push({
      moduleName,
      title: String(title),
      enabled: plugin?.enabled !== false,
      entryId: String(plugin?.entryId || ''),
      known: matched || null,
      /** 只对识别出来的目标标 kind；未知插件不猜 */
      kind: matched?.kind || 'unknown',
    })
  }

  // 内置清单里、但实时扫描没看到的：标成「未安装」
  const seenModules = new Set(rows.map((row) => row.moduleName))
  for (const entry of known) {
    const installedHere = entry.match.some((needle) =>
      [...seenModules].some((moduleName) => moduleName.includes(needle)))
    if (!installedHere) {
      rows.push({
        moduleName: entry.match[0],
        title: entry.title,
        enabled: false,
        entryId: '',
        known: entry,
        kind: 'missing',
      })
    }
  }

  return {
    known,
    installed: rows,
    notes,
    scannedAt: new Date().toISOString(),
  }
}

/** kind 的展示含义。 */
export const TARGET_KIND = {
  A: '接受外部人设：可以手动粘贴人设词',
  B: '人格只能长：不建议粘人设词，可自行判断',
  none: '无人设入口',
  missing: '未安装（内置清单里有）',
  unknown: '未收录：自己判断它有没有人设入口',
}
