/**
 * dsh-persona-lab —— Host 入口。
 *
 * 只做四件事：
 *  1. 读全局配置（路径、API Key、同意状态）；
 *  2. 挂 HTTP 前缀 /persona-lab/api；
 *  3. 起定时器（按学习区的时间窗）；
 *  4. 把所有东西交给 lib/，自己不写业务。
 *
 * 不注册工具、不注入系统提示词、不碰别的插件的数据——
 * 这个插件的边界就是「只读 B站、只写自己的目录」。
 */
import { ensureDir, readJson, writeJson } from './lib/store.js'
import { configPath, dataDir } from './lib/paths.js'
import { GLOBAL_DEFAULTS } from './lib/config.js'
import { registerRoutes } from './lib/routes.js'
import { startScheduler } from './lib/scheduler.js'
import { createZone, listZones } from './lib/zone.js'
import { copyLegacyCredential, hasLegacyCredential, loadCredential } from './lib/bili/auth.js'

export const name = 'dsh-persona-lab'

/** 只依赖 webServer：没有它就不活跃，而不是半启动。 */
export const inject = ['webServer']

export function apply(ctx, config = {}) {
  const root = dataDir(config.root)
  ensureDir(root)

  let current = loadConfig(root, config)
  const getConfig = () => current
  const setConfig = (next) => {
    current = { ...GLOBAL_DEFAULTS, ...next }
    writeJson(configPath(root), current)
  }

  // 首次写入默认配置，让用户能看到文件在哪
  if (!readJson(configPath(root), null)) writeJson(configPath(root), current)

  // 第一次进来先建好 3 个学习区（第 1 个是默认区，带 dsh 关键词与过滤）
  if (listZones(root).length === 0) {
    for (let index = 0; index < 3; index += 1) {
      try {
        createZone(root, { name: `学习区 ${index + 1}` })
      } catch (error) {
        ctx.logger?.warn?.(`[persona-lab] 初始化学习区 ${index + 1} 失败：${error?.message || error}`)
      }
    }
  }

  // 迁移：旧版把凭据存在全局，现在每个区一份；有的区还没账号就复制过去
  if (hasLegacyCredential(root)) {
    for (const zone of listZones(root)) {
      if (!loadCredential(root, zone.id)) {
        try { copyLegacyCredential(root, zone.id) } catch { /* 复制失败不影响启动 */ }
      }
    }
  }

  ctx.inject(['webServer'], (hostCtx) => {
    registerRoutes(hostCtx, { root, getConfig, setConfig })
  })

  startScheduler(ctx, { root, getConfig })

  ctx.logger?.info?.(`[persona-lab] 数据目录：${root}`)
}

function loadConfig(root, config) {
  const stored = readJson(configPath(root), null)
  const merged = { ...GLOBAL_DEFAULTS, ...(config || {}), ...(stored || {}) }
  // 只认已知键，避免旧文件里的脏字段传下去
  const out = {}
  for (const key of Object.keys(GLOBAL_DEFAULTS)) out[key] = merged[key]
  return out
}
