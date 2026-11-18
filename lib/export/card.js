/**
 * lib/export/card.js —— 导出成 SillyTavern 角色卡（JSON + PNG）。
 *
 * 同时给两代格式：
 *  · v2（spec: chara_card_v2）—— 新版本认这个；
 *  · v1 扁平字段 —— 老 bot 直接读 data 里的同名键。
 * PNG 用 tEXt 的 `chara` 块，和 SillyTavern 自己的写法一致。
 */
import { makeCardPng } from './png.js'
import { renderText } from '../ir.js'

export function buildCard(ir, options = {}) {
  const name = options.name || '未命名人设'
  const text = renderText(ir, { title: name })
  const fields = ir.fields || {}
  const blocks = ir.blocks || {}

  const description = [
    fields.identity ? `身份：${fields.identity}` : '',
    fields.tone ? `语气：${fields.tone}` : '',
    fields.rhythm ? `节奏：${fields.rhythm}` : '',
    fields.vocabulary ? `词汇：${fields.vocabulary}` : '',
    fields.quirks?.length ? `小习惯：${fields.quirks.join('；')}` : '',
    fields.boundaries?.length ? `边界：${fields.boundaries.join('；')}` : '',
  ].filter(Boolean).join('\n')

  const personality = [
    blocks.chat?.summary ? `私聊：${blocks.chat.summary}` : '',
    blocks.chat?.tone ? `私聊语气：${blocks.chat.tone}` : '',
    blocks.chat?.rhythm ? `私聊节奏：${blocks.chat.rhythm}` : '',
    blocks.comment?.summary ? `评论：${blocks.comment.summary}` : '',
  ].filter(Boolean).join('\n')

  const example = [
    blocks.chat?.habits?.length ? `口头禅：${blocks.chat.habits.join('、')}` : '',
    blocks.chat?.avoid?.length ? `不说：${blocks.chat.avoid.join('、')}` : '',
  ].filter(Boolean).join('\n')

  const data = {
    name,
    description,
    personality,
    scenario: '日常对话。只演对话，不写动作描写，不解释设定。',
    first_mes: '',
    mes_example: example,
    creator_notes: `由 DSH 人设工坊生成 · 样本 ${ir.meta?.sampleCount || 0} 条\n\n${text}`,
    system_prompt: fields.rhythm || '',
    post_history_instructions: '',
    alternate_greetings: [],
    character_book: null,
    tags: ['dsh-persona-lab'],
    creator: 'DSH Persona Lab',
    character_version: String(options.version || ''),

    // v1 兼容字段：与 data 同值
    spec: 'chara_card_v2',
    spec_version: '2.0',
  }

  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data,
    ...data,
  }
}

export function toCardJson(ir, options) {
  return JSON.stringify(buildCard(ir, options), null, 2)
}

export function toCardPng(ir, options) {
  const card = buildCard(ir, options)
  const png = makeCardPng(card, {
    width: options?.width || 400,
    height: options?.height || 600,
  })
  return png
}
