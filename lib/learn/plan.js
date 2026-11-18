/**
 * lib/learn/plan.js —— 一次学习到底抓多少、从哪抓。
 *
 * 纯函数：输入学习区配置 + 账号，输出各源的条数配额。
 * 注意：浏览推荐不是学习源，它是「去哪找视频」的渠道，不占配额。
 */

const SOURCE_KEYS = ['comment', 'video', 'danmaku']

/** 把总条数按比例分给各源，返回 { comment, video, danmaku }。 */
export function allocateQuota(zone) {
  const sources = zone.sources || {}
  const ratio = zone.quota?.ratio || {}
  const total = Number(zone.quota?.total) || 0
  const enabled = {}
  let weightSum = 0
  for (const key of SOURCE_KEYS) {
    const on = sources[key] === true
    const weight = Math.max(0, Number(ratio[key]) || 0)
    enabled[key] = on && weight > 0
    if (enabled[key]) weightSum += weight
  }
  if (weightSum <= 0) return { comment: 0, video: 0, danmaku: 0 }

  const out = {}
  for (const key of SOURCE_KEYS) {
    out[key] = enabled[key] ? Math.floor((total * (Number(ratio[key]) || 0)) / weightSum) : 0
  }

  // 总数为 0 但配额有值：至少给每个启用的源 1 条，避免「开了却什么都没抓」
  const sum = Object.values(out).reduce((a, b) => a + b, 0)
  if (sum === 0) {
    for (const key of Object.keys(out)) if (enabled[key]) out[key] = 1
  }
  return out
}

/** 本次运行是否被时间窗允许；未开时间窗视为允许（手动触发）。 */
export function canRunNow(zone, now = new Date()) {
  if (zone.schedule?.enabled !== true) return true
  return inWindow(zone.schedule.start, zone.schedule.end, now)
}

function inWindow(start, end, now) {
  const toMin = (clock) => {
    const [h, m] = String(clock || '00:00').split(':').map(Number)
    return (h || 0) * 60 + (m || 0)
  }
  const minutes = now.getHours() * 60 + now.getMinutes()
  const a = toMin(start)
  const b = toMin(end)
  if (a === b) return true
  return a < b ? minutes >= a && minutes < b : minutes >= a || minutes < b
}

/** 估算这次运行可能花多久（秒），用于「单次上限」的提示。 */
export function estimateSeconds(quota) {
  // 每个请求按 1.2 秒 + 每 10 条样本一次翻页估
  const requests = Math.ceil((quota.dm || 0) / 20) + Math.ceil((quota.reply || 0) / 20)
    + Math.ceil((quota.comment || 0) / 20) + Math.ceil((quota.danmaku || 0) / 200)
  return Math.max(3, requests * 2)
}
