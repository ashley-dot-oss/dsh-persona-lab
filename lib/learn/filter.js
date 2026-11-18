/**
 * lib/learn/filter.js —— 三道闸：隔离文本、合规词表、PII 剥离。
 *
 * 位置很关键：这三道都在「样本进入学习」之前跑，不是生成之后再补救。
 * 违禁内容根本不进视野，跟 fish 的「她没有看见，不是被劝住」是同一个思路。
 */

/** 本地硬词表：先挡一轮，不依赖模型。命中即丢弃整条样本。 */
export const HARD_BLOCK = [
  // 违法 / 犯罪
  '赌博', '赌场', '博彩', '六合彩', '毒品', '冰毒', '大麻', '枪支', '弹药', '炸药',
  '诈骗', '洗钱', '黑钱', '代开发票', '虚开发票', '刷单', '刷流水', '办证', '假证',
  '黑客', '木马', '钓鱼网站', '撞库', '盗号', '外挂', '私服', '破解版', '激活工具',
  // 色情 / 引流
  '约炮', '上门服务', '裸聊', '福利姬', '看片', '黄片', '成人视频', '色情', '黄文',
  // 越狱 / 绕过安全限制（这类内容不能进人设词）
  '破甲', '软破', '绕闸', '绕上游', '绕模型', '越狱', '拒答复写', '不软化',
  // 广告 / 引流
  '加微信', '加VX', '加vx', 'V信', '私聊我领', '点击领取', '限时优惠', '优惠券',
  '返利', '代理加盟', '推广返佣', '扫码进群', '进群领', '兼职日结',
  // 政治敏感（只列泛化标签，不做具体列举；真正的判定交给模型兜底）
  '政治立场', '煽动', '颠覆', '游行示威', '邪教',
]

/** 软信号：命中不直接丢，但降低权重或交给模型判定。 */
export const SOFT_SIGNALS = [
  '转发抽奖', '抽奖', '广告', '推广', '带货', '链接在评论区',
]

/** 一条样本是否该被硬拦。 */
export function hardBlocked(text, isolation = []) {
  const haystack = String(text || '').toLowerCase()
  if (haystack === '') return true
  for (const word of HARD_BLOCK) {
    if (haystack.includes(word.toLowerCase())) return { blocked: true, reason: `词表：${word}` }
  }
  for (const word of isolation) {
    const needle = String(word || '').trim().toLowerCase()
    if (needle !== '' && haystack.includes(needle)) {
      return { blocked: true, reason: `隔离文本：${word}` }
    }
  }
  return { blocked: false, reason: '' }
}

/** 剥掉可能指向具体人的东西：只留「怎么说话」，不留「谁在说话」。 */
export function stripPii(text) {
  let out = String(text || '')
  // 链接
  out = out.replace(/https?:\/\/\S+/g, '[链接]')
  // 邮箱
  out = out.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[邮箱]')
  // 手机号
  out = out.replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, '[手机号]')
  // 身份证
  out = out.replace(/(?<!\d)\d{17}[\dXx](?!\d)/g, '[证件号]')
  // @某人
  out = out.replace(/@[\w\u4e00-\u9fa5-]{1,20}/g, '@某人')
  // BV 号
  out = out.replace(/BV[0-9A-Za-z]{10}/g, '[视频]')
  // 连续 6 位以上数字（UID / QQ / 订单号）
  out = out.replace(/(?<!\d)\d{6,}(?!\d)/g, '[数字]')
  return out.trim()
}

/** B站 系统通知的句式——它们不是「谁在说话」，学不到任何表达方式。 */
const SYSTEM_PATTERNS = [
  /你的账号在(新设备|其他设备|另一设备)/,
  /如非本人操作/,
  /密码修改成功/,
  /全平台清空登录态/,
  /\[.*?\]\s*你已成功登录/,
  /安全提醒/,
]

/** 整条只有表情码（如 `[26mygo的dlc表情包_快看]` 重复三次）。 */
function onlyStickers(text) {
  return /^(\s*\[[^\]]{1,40}\]\s*)+$/.test(text)
}

/** 去掉纯表情 / 纯标点 / 系统通知 / 无信息量的样本。 */
export function isNoise(text) {
  const raw = String(text || '').trim()
  if (raw.length < 2) return true
  if (onlyStickers(raw)) return true
  if (SYSTEM_PATTERNS.some((pattern) => pattern.test(raw))) return true
  // 去掉表情、@占位、标点后还剩几个字（纯 @ 列表不算话）
  const meaningful = raw
    .replace(/\[[^\]]{1,40}\]/g, '')
    .replace(/@某人/g, '')
    .replace(/[\s\p{P}\p{S}]/gu, '')
  if (meaningful.length < 2) return true
  // 纯重复（哈哈哈 / 666 / aaaaa）
  if (/^(.)\1{2,}$/u.test(meaningful)) return true
  if (/^(哈|啊|哦|嗯|呃|额|诶|哎){2,}$/u.test(meaningful)) return true
  return false
}

/** 一条样本的「可用性」判定：先硬拦，再剥 PII，再去噪。 */
export function admitSample(text, isolation = []) {
  const raw = String(text || '').trim()
  const blocked = hardBlocked(raw, isolation)
  if (blocked.blocked) return { ok: false, reason: blocked.reason, text: '' }
  const cleaned = stripPii(raw)
  if (isNoise(cleaned)) return { ok: false, reason: '无信息量', text: '' }
  return { ok: true, reason: '', text: cleaned.slice(0, 300) }
}

/**
 * 生成人设词前的最后一道：模型输出里如果出现具体人名 / UID / 链接，一律清掉。
 * 人设词只描述「她怎么说话」，不描述「谁说了什么」。
 */
export function sanitizePersonaOutput(text) {
  return stripPii(String(text || ''))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
