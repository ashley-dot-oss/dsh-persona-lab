/**
 * lib/chat.js —— 聊天测试区：拿人设词在 DSH 里演一段，看像不像。
 *
 * 不写正式记忆、不进事件流、不碰目标插件。只产出两样：
 *  1. 对话记录（存 zones/<id>/chat/）
 *  2. 回写：修正建议 / 学习偏好 / 评分
 *
 * 回写怎么用：
 *  · 修正建议 → 进 zone.focus.avoid 或下一次提炼的补充提示
 *  · 学习偏好 → 调 zone.quota.ratio 的倾向（只记录，不自动改）
 *  · 评分 → 存档，给「人性化趋势」用
 */
import { loadPersona, saveChatRun } from './zone.js'
import { renderChatSystem } from './ir.js'
import { complete } from './llm.js'
import { stamp } from './store.js'

export async function chatTurn(input) {
  const { ctx, root, zoneId, config } = input
  const zone = input.zone
  const version = input.version
  const ir = loadPersona(root, zoneId, version)
  if (!ir) return { ok: false, reason: 'no-persona', message: '这个区还没有人设词，先学一次。' }

  const scene = input.scene === 'comment' ? 'comment' : 'chat'
  const history = Array.isArray(input.messages) ? input.messages.slice(-20) : []
  // 用户可以替换系统提示词；没传就用 IR 生成的默认版
  const system = typeof input.system === 'string' && input.system.trim() !== ''
    ? input.system.slice(0, 4000)
    : renderChatSystem(ir, { scene })

  // 真正的多轮对话：交给模型 user / assistant 交替的消息，
  // 而不是把整段历史拼成一条指令——那会让它转去「分析对话」。
  const messages = history
    .filter((message) => message && typeof message.content === 'string' && message.content.trim() !== '')
    .map((message) => ({
      role: message.role === 'user' ? 'user' : 'assistant',
      content: message.content.slice(0, 800),
    }))
  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    return { ok: false, reason: 'no-input', message: '先发一句话再让她回。' }
  }

  const reply = await complete({
    ctx,
    config,
    system,
    messages,
    temperature: 0.9,
    // 模型卡住时别无限等，90 秒没出来就当失败
    signal: AbortSignal.timeout ? AbortSignal.timeout(90_000) : undefined,
  })

  const run = {
    id: `${stamp()}-chat`,
    zoneId,
    version: ir.version,
    scene,
    startedAt: new Date().toISOString(),
    messages: [...history, { role: 'assistant', content: reply }],
  }
  saveChatRun(root, zoneId, run)
  return { ok: true, reply, runId: run.id, version: ir.version }
}

/**
 * 回写一条反馈。
 * @param {'correction'|'preference'|'rating'} type
 */
export function feedback(input) {
  const { root, zoneId, type, text, score } = input
  const zone = input.zone
  if (!zone) return { ok: false, reason: 'no-zone', message: '找不到学习区' }

  if (type === 'correction') {
    const note = String(text || '').trim()
    if (note === '') return { ok: false, reason: 'empty', message: '修正建议不能为空' }
    // 修正建议存进 focus.avoid（下次提炼会带上）；不直接改人设词
    const avoid = Array.isArray(zone.focus?.avoid) ? [...zone.focus.avoid] : []
    if (!avoid.includes(note)) avoid.push(note.slice(0, 200))
    return { ok: true, patch: { focus: { ...zone.focus, avoid } }, note: '已记进这个区的「不要」清单，下一次学习会带上。' }
  }

  if (type === 'preference') {
    const note = String(text || '').trim()
    if (note === '') return { ok: false, reason: 'empty', message: '偏好不能为空' }
    const traits = Array.isArray(zone.focus?.traits) ? [...zone.focus.traits] : []
    if (!traits.includes(note)) traits.push(note.slice(0, 100))
    return { ok: true, patch: { focus: { ...zone.focus, traits } }, note: '已记进这个区的「学习重点」。' }
  }

  if (type === 'rating') {
    const value = Math.max(0, Math.min(100, Number(score) || 0))
    return {
      ok: true,
      patch: {},
      rating: {
        at: new Date().toISOString(),
        score: value,
        note: String(text || '').slice(0, 200),
      },
      note: '评分已存档。',
    }
  }

  return { ok: false, reason: 'bad-type', message: `未知反馈类型：${type}` }
}
