/**
 * lib/config.js —— 全局配置与学习区默认值。
 *
 * 这里只定义「默认长什么样」，不负责路径与落盘（那是 store 的事）。
 * 学习区的字段就是设置页要画的东西，顺序也照这个来。
 */

/** 学习源键与显示名。顺序即界面顺序。
 *  只读公开内容：视频评论 + 视频本身（字幕/简介）+ 弹幕。私信与「回复我的」已移除。
 *  「浏览推荐」不是源：它是「去哪找视频」的渠道（见 content.recommend）。 */
export const SOURCES = [
  { key: 'comment', label: '视频评论', hint: '按关键词或推荐流找视频，学评论区' },
  { key: 'video', label: '视频内容', hint: 'UP 主说的话：字幕优先，没字幕用简介' },
  { key: 'danmaku', label: '弹幕', hint: '默认关；开了要自己配过滤词' },
]

/** 默认配额比例（总和 100）。 */
export const DEFAULT_RATIO = { comment: 60, video: 40, danmaku: 0 }

/** 插件级默认配置。 */
export const GLOBAL_DEFAULTS = {
  /** 是否已经读过并同意权限与风险说明 */
  consentAccepted: false,
  /** 用户自填的 OpenAI 兼容 API；留空则用宿主模型 */
  apiKey: '',
  apiBaseUrl: '',
  apiModel: '',
  /** 数据目录覆盖；空 = $DSH_HOME/persona-lab */
  root: '',
  /** 学习区上限（预留 5，先做 3） */
  maxZones: 5,
  /** 多模态通道：用户填了才启用 */
  vision: { enabled: false, baseUrl: '', apiKey: '', model: '' },
  speech: { enabled: false, baseUrl: '', apiKey: '', model: '' },
}

/** 新学习区的默认参数；冷启动与增量分开。 */
export function zoneDefaults(index) {
  return {
    id: `zone-${index + 1}`,
    name: `学习区 ${index + 1}`,
    createdAt: new Date().toISOString(),
    /** default = 插件自带区（带默认过滤）；custom = 用户新建（不筛） */
    kind: index === 0 ? 'default' : 'custom',
    enabled: true,
    sources: { comment: true, video: true, danmaku: false },
    /** 内容来源：视频从哪来。推荐流不是学习源，只是发现渠道。 */
    content: { recommend: true },
    quota: {
      /** 一次学习的总条数 */
      total: 1000,
      /** 冷启动还是增量：决定默认值提示 */
      mode: 'cold',
      ratio: { ...DEFAULT_RATIO },
    },
    /** 视频搜索与提炼方向合并成一个：focus.traits（见下），不再单独维护关键词 */
    /** 排除词 */
    excludeKeywords: [],
    /** 默认区带的过滤；新建区为 0 = 不筛 */
    filters: index === 0
      ? { minPlay: 1000, minDuration: 60, recentDays: 30 }
      : { minPlay: 0, minDuration: 0, recentDays: 0 },
    /** 不能学的内容（文本片段，命中即丢弃） */
    isolation: [],
    /** 多模态三层开关：识别 → 学习 → 使用 */
    media: { recognize: true, learn: true, use: true },
    /** 每次学习的时间窗（本地时间，HH:mm） */
    schedule: { enabled: false, start: '02:00', end: '04:00' },
    /** 单次运行上限（分钟） */
    maxRunMinutes: 10,
    /** 学习重点：搜索词 + 提炼方向 + 参考人设，三者都算在 focus 里 */
    focus: {
      /** 三块 IR 里以哪块为主：chat / comment / danmaku */
      primary: 'chat',
      /** 想强调的特质；同时是视频搜索词 */
      traits: [],
      /** 明确不要的（会进提炼提示词的禁区） */
      avoid: [],
      /** 参考人设：贴一段目标人设，提炼时以它为骨架 */
      reference: '',
    },
    /** 已产出的最新人设词版本号 */
    currentVersion: null,
  }
}

/** 校验一份学习区配置，返回 { ok, value, errors }。 */
export function normalizeZone(input, index = 0) {
  const base = zoneDefaults(index)
  const value = { ...base, ...(input || {}) }
  const errors = []

  if (typeof value.name !== 'string' || value.name.trim() === '') {
    value.name = base.name
  }
  // 源：只认已知键，缺的补默认
  const sources = { ...base.sources }
  for (const { key } of SOURCES) {
    if (input?.sources && typeof input.sources[key] === 'boolean') sources[key] = input.sources[key]
  }
  value.sources = sources

  // 内容来源：只认 recommend 一个开关
  value.content = { recommend: input?.content?.recommend !== false }

  // 配额：数字收敛到合理范围
  const quota = { ...base.quota, ...(input?.quota || {}) }
  quota.total = clampInt(quota.total, 50, 20000, base.quota.total)
  quota.mode = quota.mode === 'incremental' ? 'incremental' : 'cold'
  const ratio = { ...base.quota.ratio }
  let sum = 0
  for (const { key } of SOURCES) {
    ratio[key] = clampInt(quota.ratio?.[key], 0, 100, ratio[key])
    sum += ratio[key]
  }
  // 比例不归一化到 100 也行（采集时按权重分），但全 0 要退回默认
  if (sum <= 0) Object.assign(ratio, DEFAULT_RATIO)
  quota.ratio = ratio
  value.quota = quota

  // 私信已移除：清掉旧配置里残留的白名单
  delete value.dmUids
  // 关键词已合并进 focus.traits（见下），旧字段直接丢掉
  delete value.keywords
  value.excludeKeywords = toStrList(value.excludeKeywords)
  value.isolation = toStrList(value.isolation)

  const filters = { ...base.filters, ...(input?.filters || {}) }
  filters.minPlay = clampInt(filters.minPlay, 0, 100000000, base.filters.minPlay)
  filters.minDuration = clampInt(filters.minDuration, 0, 3600, base.filters.minDuration)
  filters.recentDays = clampInt(filters.recentDays, 0, 3650, base.filters.recentDays)
  value.filters = filters

  const schedule = { ...base.schedule, ...(input?.schedule || {}) }
  schedule.enabled = Boolean(schedule.enabled)
  schedule.start = clampClock(schedule.start, base.schedule.start)
  schedule.end = clampClock(schedule.end, base.schedule.end)
  value.schedule = schedule

  value.maxRunMinutes = clampInt(value.maxRunMinutes, 1, 180, base.maxRunMinutes)

  // 多模态三层开关
  const media = { ...base.media, ...(input?.media || {}) }
  media.recognize = media.recognize !== false
  media.learn = media.learn !== false
  media.use = media.use !== false
  value.media = media

  const focus = { ...base.focus, ...(input?.focus || {}) }
  focus.primary = ['chat', 'comment', 'danmaku'].includes(focus.primary) ? focus.primary : 'chat'
  // 关键词与学习重点已合并：旧的 keywords 并进 traits，然后丢掉
  const legacyKeywords = toStrList(input?.keywords)
  focus.traits = toStrList([...toStrList(focus.traits), ...legacyKeywords])
  focus.avoid = toStrList(focus.avoid)
  // 参考人设：一段文本，最长 4000 字
  focus.reference = typeof focus.reference === 'string' ? focus.reference.trim().slice(0, 4000) : ''
  value.focus = focus

  value.kind = value.kind === 'default' ? 'default' : 'custom'
  value.enabled = value.enabled !== false
  if (typeof value.id !== 'string' || !/^[a-z0-9-]{1,40}$/i.test(value.id)) {
    value.id = base.id + (index > 0 ? `-${index}` : '')
  }

  return { ok: errors.length === 0, value, errors }
}

export function clampInt(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

export function clampClock(value, fallback) {
  if (typeof value !== 'string') return fallback
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim())
  return m ? value.trim() : fallback
}

function toIntList(value) {
  const list = Array.isArray(value) ? value : []
  const out = []
  for (const item of list) {
    const n = Number(item)
    if (Number.isInteger(n) && n > 0 && !out.includes(n)) out.push(n)
  }
  return out.slice(0, 100)
}

function toStrList(value) {
  const list = Array.isArray(value) ? value : []
  const out = []
  for (const item of list) {
    if (typeof item !== 'string') continue
    const text = item.trim()
    if (text !== '' && !out.includes(text)) out.push(text)
    if (out.length >= 200) break
  }
  return out
}

/** 判断「现在」是否落在学习区的时间窗内（本地时间）。 */
export function inScheduleWindow(schedule, now = new Date()) {
  if (!schedule || schedule.enabled !== true) return false
  const minutes = now.getHours() * 60 + now.getMinutes()
  const start = clockToMinutes(schedule.start)
  const end = clockToMinutes(schedule.end)
  if (start === end) return true
  if (start < end) return minutes >= start && minutes < end
  // 跨午夜
  return minutes >= start || minutes < end
}

export function clockToMinutes(clock) {
  const [h, m] = String(clock || '00:00').split(':').map(Number)
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
}
