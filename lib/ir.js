/**
 * lib/ir.js —— 人设 IR：一份能编译成各家目标格式的中间文档。
 *
 * 三段场景 + 一组字段。纯文本、SillyTavern 卡、聊天测试区都从它渲染，
 * 所以「人设词」只有一个源头。
 */

export const BLOCK_ORDER = [
  { key: 'chat', label: '私聊' },
  { key: 'comment', label: '公开评论' },
  { key: 'danmaku', label: '弹幕' },
  { key: 'media', label: '表情与表达' },
]

/** 把提炼结果包成带元信息的 IR。 */
export function makeIr({ zoneId, samples, model, distilled }) {
  const sources = {}
  for (const sample of samples || []) sources[sample.source] = (sources[sample.source] || 0) + 1
  return {
    irVersion: 1,
    zoneId,
    createdAt: new Date().toISOString(),
    meta: {
      sampleCount: (samples || []).length,
      sources,
      primary: 'chat',
      model: String(model || ''),
    },
    examples: Array.isArray(distilled.examples) ? distilled.examples : [],
    blocks: {
      chat: distilled.chat,
      comment: distilled.comment,
      danmaku: distilled.danmaku,
      media: distilled.media,
    },
    fields: distilled.fields,
    profile: distilled.profile || null,
  }
}

/** 渲染成可直接粘进任意 bot 的纯文本人设词。 */
export function renderText(ir, options = {}) {
  const lines = []
  const meta = ir.meta || {}
  lines.push(`【人设词】${options.title || ''}`.trim())
  lines.push('')
  lines.push(`样本 ${meta.sampleCount || 0} 条 · 来源 ${formatSources(meta.sources)}`)
  lines.push('')

  // 人物：她是什么样的人，放在说话方式前面
  const profile = ir.profile || {}
  const profileLines = []
  if (profile.summary) profileLines.push(`概括：${profile.summary}`)
  if (profile.traits?.length) profileLines.push(`性格：${profile.traits.join('；')}`)
  if (profile.likes?.length) profileLines.push(`在意：${profile.likes.join('；')}`)
  if (profile.dislikes?.length) profileLines.push(`讨厌：${profile.dislikes.join('；')}`)
  if (profile.reactions?.length) profileLines.push(`反应：${profile.reactions.join('；')}`)
  if (profile.boundaries?.length) profileLines.push(`底线：${profile.boundaries.join('；')}`)
  if (profileLines.length > 0) {
    lines.push('—— 人物 ——')
    lines.push(...profileLines)
    lines.push('')
  }

  for (const { key, label } of BLOCK_ORDER) {
    const block = ir.blocks?.[key]
    if (!block || isEmptyBlock(block)) continue
    lines.push(`—— ${label} ——`)
    if (block.summary) lines.push(`概括：${block.summary}`)
    if (block.rhythm) lines.push(`节奏：${block.rhythm}`)
    if (block.tone) lines.push(`语气：${block.tone}`)
    if (block.usage) lines.push(`用法：${block.usage}`)
    if (block.habits?.length) lines.push(`口头禅：${block.habits.join('；')}`)
    if (block.avoid?.length) lines.push(`不说：${block.avoid.join('；')}`)
    lines.push('')
  }

  const fields = ir.fields || {}
  const fieldLines = []
  if (fields.identity) fieldLines.push(`身份：${fields.identity}`)
  if (fields.tone) fieldLines.push(`语气：${fields.tone}`)
  if (fields.rhythm) fieldLines.push(`节奏：${fields.rhythm}`)
  if (fields.vocabulary) fieldLines.push(`词汇：${fields.vocabulary}`)
  if (fields.quirks?.length) fieldLines.push(`小习惯：${fields.quirks.join('；')}`)
  if (fields.boundaries?.length) fieldLines.push(`边界：${fields.boundaries.join('；')}`)
  if (fieldLines.length > 0) {
    lines.push('—— 字段 ——')
    lines.push(...fieldLines)
  }
  return lines.join('\n').trim()
}

/** 渲染成「字段表」：给界面看，也给程序读。 */
export function renderFields(ir) {
  const fields = ir.fields || {}
  return {
    identity: fields.identity || '',
    tone: fields.tone || '',
    rhythm: fields.rhythm || '',
    vocabulary: fields.vocabulary || '',
    quirks: Array.isArray(fields.quirks) ? fields.quirks : [],
    boundaries: Array.isArray(fields.boundaries) ? fields.boundaries : [],
    blocks: Object.fromEntries(BLOCK_ORDER.map(({ key }) => [key, ir.blocks?.[key] || null])),
  }
}

function isEmptyBlock(block) {
  return !block.summary && !block.rhythm && !block.tone
    && !(block.habits?.length) && !(block.avoid?.length)
}

function formatSources(sources) {
  const map = { dm: '私信', reply: '回复我的', comment: '评论', danmaku: '弹幕', rcmd: '推荐' }
  const parts = Object.entries(sources || {})
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${map[key] || key} ${count}`)
  return parts.length > 0 ? parts.join(' / ') : '无'
}

/** 选一块有内容的：优先场景对应块，空了就回退到别的块。返回块键。 */
export function pickBlockKey(ir, scene) {
  const order = scene === 'comment'
    ? ['comment', 'chat', 'danmaku']
    : ['chat', 'comment', 'danmaku']
  for (const key of order) {
    const block = ir.blocks?.[key]
    if (block && (block.summary || block.rhythm || block.tone || block.habits?.length)) return key
  }
  return null
}

/** 选一块有内容的：优先场景对应块，空了就回退到别的块。 */
export function pickBlock(ir, scene) {
  const key = pickBlockKey(ir, scene)
  return key === null ? null : ir.blocks?.[key] || null
}

/** 聊天测试区的系统提示：不是「描述一个人」，而是「你就是这样的人」。 */
export function renderChatSystem(ir, options = {}) {
  const lines = []
  const fields = ir.fields || {}
  const scene = options.scene === 'comment' ? 'comment' : 'chat'
  const blockKey = pickBlockKey(ir, scene)
  const block = blockKey === null ? null : ir.blocks?.[blockKey] || null

  lines.push('你就是这个人。你不是 AI，不是在扮演，也不是在描述一个人。')
  lines.push('')
  lines.push('你说话的硬规矩：')
  lines.push('- 直接接住对方这句话，说你当下想说的。')
  lines.push('- 不解释自己，不总结对方，不分析，不评价，不给建议，不列点。')
  lines.push('- 对方说过的话，不要复述一遍。你已经听见了。')
  lines.push('- 不要用「对吧」「是吧」「不是吗」「对吧？」这类反问凑结尾。')
  lines.push('- 想不到说什么就短一点、甚至只回一个词；不许为了凑一句话而说话。')
  lines.push('- 像真人在聊天软件里那样发：一条一句，可以连着发两三条，每条用换行隔开；不要把所有话塞成一大段。')
  lines.push('- 不写动作、不写旁白、不加括号里的心理活动。')
  lines.push('- 不说「作为一个…」「我理解你的…」「总的来说…」这类句子。')
  lines.push('- 允许半句、允许跳过、允许不接满。')
  lines.push('')

  if (blockKey === 'comment') {
    lines.push('注意：下面这段素材来自公开评论区，是「对内容发表评价」的样子。')
    lines.push('现在是一对一对话，不要照搬「先复述再点评」那个结构，也不要端着。')
    lines.push('')
  }

  const traits = []
  const profile = ir.profile || {}
  if (profile.summary) traits.push(`你是谁：${profile.summary}`)
  if (profile.traits?.length) traits.push(`性格：${profile.traits.join('；')}`)
  if (profile.likes?.length) traits.push(`在意：${profile.likes.join('；')}`)
  if (profile.dislikes?.length) traits.push(`讨厌：${profile.dislikes.join('；')}`)
  if (profile.reactions?.length) traits.push(`反应：${profile.reactions.join('；')}`)
  if (profile.boundaries?.length) traits.push(`底线：${profile.boundaries.join('；')}`)
  if (fields.identity) traits.push(`身份：${fields.identity}`)
  if (fields.tone) traits.push(`语气：${fields.tone}`)
  if (fields.rhythm) traits.push(`节奏：${fields.rhythm}`)
  if (fields.vocabulary) traits.push(`用词：${fields.vocabulary}`)
  if (fields.quirks?.length) traits.push(`习惯：${fields.quirks.join('；')}`)
  if (fields.boundaries?.length) traits.push(`不做的：${fields.boundaries.join('；')}`)
  if (traits.length > 0) {
    lines.push('你平时的样子（照着说，不要复述这些描述）：')
    lines.push(...traits)
    lines.push('')
  }

  if (Array.isArray(ir.examples) && ir.examples.length > 0) {
    lines.push('你说过的话（照着这个感觉说，不要复述这些句子）：')
    for (const example of ir.examples) lines.push(`- ${example}`)
    lines.push('')
  }

  if (block) {
    if (block.summary) lines.push(`整体：${block.summary}`)
    if (block.rhythm) lines.push(`节奏：${block.rhythm}`)
    if (block.tone) lines.push(`语气：${block.tone}`)
    if (block.usage) lines.push(`用法：${block.usage}`)
    if (block.habits?.length) lines.push(`口头禅：${block.habits.join('；')}`)
    if (block.avoid?.length) lines.push(`绝不这样说：${block.avoid.join('；')}`)
  }

  lines.push('')
  lines.push('现在开始。对方说什么，你就照着你的样子回什么。不要解释这条规则。')
  return lines.join('\n')
}
