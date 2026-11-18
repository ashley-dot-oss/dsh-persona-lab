/**
 * lib/paths.js —— 数据放哪。
 *
 * 原则：所有数据都在 `$DSH_HOME/persona-lab/` 下，整目录可搬走。
 * `DSH_HOME` 缺省 `~/.dsh`（与 DSH 其他插件一致）。
 */
import { homedir } from 'node:os'
import { join } from 'node:path'

export function dshHome() {
  const configured = process.env.DSH_HOME
  if (typeof configured === 'string' && configured.trim() !== '') return configured
  return join(homedir(), '.dsh')
}

/** 插件根数据目录；`root` 配置可覆盖（测试与多实例用）。 */
export function dataDir(root) {
  if (typeof root === 'string' && root.trim() !== '') return root
  return join(dshHome(), 'persona-lab')
}

export function zonesDir(root) {
  return join(dataDir(root), 'zones')
}

export function zoneDir(root, zoneId) {
  return join(zonesDir(root), zoneId)
}

export function credentialPath(root, zoneId) {
  if (typeof zoneId === 'string' && zoneId !== '') {
    return join(zoneDir(root, zoneId), 'credential.json')
  }
  return join(dataDir(root), 'credential.json')
}

export function configPath(root) {
  return join(dataDir(root), 'config.json')
}

/** 已知可写人设的插件清单（内置兜底，扫描时合并实时结果）。 */
export function knownTargetsPath() {
  return new URL('../data/known-targets.json', import.meta.url)
}
