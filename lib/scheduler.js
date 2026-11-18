/**
 * lib/scheduler.js —— 定时学习。
 *
 * 每 60 秒看一次：哪个区在自己的时间窗里、今天还没跑过，就跑一次。
 * 只在自己被加载时启动；卸载时定时器跟着 ctx.effect 一起清掉。
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { zoneDir } from './paths.js'
import { inScheduleWindow } from './config.js'
import { listZones, loadZone } from './zone.js'
import { readJson, writeJson } from './store.js'
import { runZone, isRunning } from './run.js'

const LAST_RUN = '.last-run.json'

export function startScheduler(ctx, options) {
  const { root, getConfig } = options
  return ctx.effect(() => {
    const tick = async () => {
      if (isRunning()) return
      const config = getConfig()
      if (!config?.consentAccepted) return
      const now = new Date()
      for (const summary of listZones(root)) {
        const zone = loadZone(root, summary.id)
        if (!zone || zone.enabled !== true) continue
        if (!inScheduleWindow(zone.schedule, now)) continue
        if (ranToday(root, zone.id, now)) continue
        try {
          await runZone({ ctx, root, zoneId: zone.id, config })
          markRan(root, zone.id, now)
        } catch {
          // 单个区失败不影响其他区；下次窗口再试
        }
      }
    }
    const timer = setInterval(() => { void tick() }, 60_000)
    // 启动 20 秒后先看一眼（不用等满一分钟）
    const kick = setTimeout(() => { void tick() }, 20_000)
    return () => {
      clearInterval(timer)
      clearTimeout(kick)
    }
  })
}

function today(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function ranToday(root, zoneId, now) {
  const file = join(zoneDir(root, zoneId), LAST_RUN)
  if (!existsSync(file)) return false
  const value = readJson(file, null)
  return value?.date === today(now)
}

function markRan(root, zoneId, now) {
  const file = join(zoneDir(root, zoneId), LAST_RUN)
  writeJson(file, { date: today(now), at: now.toISOString() })
}
