/**
 * lib/learn/distill.js —— 从样本里提炼人设 IR。
 *
 * 两条铁律：
 *  1. 只提炼「怎么说话」，不提炼「说了什么」——不写人物、不写事件、不写观点。
 *  2. 模型输出先过 sanitizePersonaOutput，再去解析；宁可可解析失败，也不把带 PII 的原文塞进人设词。
 */
import { sanitizePersonaOutput, hardBlocked } from './filter.js'

const SYSTEM = `你是一个「人物观察者」，不是角色扮演者。你要做两件事：看这个人怎么说话，也看她是什么样的人。

第一部分：说话方式（chat / comment / danmaku / media / fields）
只提炼句子长短、断句习惯、语气词、标点偏好、什么时候停顿、什么时候反问、什么时候闭嘴。

第二部分：人物画像（profile）
从「视频内容」这类语料里，看她是个什么样的人：在意什么、讨厌什么、什么脾气、怎么对待别人、遇到事的第一反应是什么。
这里允许写性格与偏好，但必须落成「可用的判断」，不写剧情。

硬性要求：
1. 不写任何具体人名、昵称、ID、链接、地点、时间、作品名。
2. 不写具体发生过什么、不写剧情、不写台词原文（examples 除外）。
3. 不写「她很温柔」这种空话；要写成「别人求她帮忙时，她嘴上嫌麻烦、手上已经动了」这种可执行的样子。
4. 视频内容不是「她本人说的话」：可能包含她的台词、别人对她的描述、旁白。分析 profile 时可以用；分析说话方式（chat）时，别把旁白当成她的对话。
5. 如果语料里出现广告、违法、政治、色情内容，直接忽略，不要在输出里提。
6. examples 必须从语料里原样摘录，一字不改；不要自己造句、不要改写、不要拼接。
7. 输出必须是严格 JSON，不要加解释、不要用 markdown 代码块包起来。`

const SCHEMA = `{
  "examples": ["从语料里挑 3-5 句「像在跟人说话」的短句（每条不超过 30 字）：口语、有情绪、能独立成一句话。不要操作步骤、不要技术说明、不要列表、不要回答问题的干货。原样摘，一字不改。"],
  "chat": { "summary": "一句话概括私聊里的说话方式（<=60字）", "rhythm": "句子长短与断句", "tone": "语气与情绪表达", "habits": ["口头禅或习惯，最多5条"], "avoid": ["这种场合下她会怎么不说，最多4条"] },
  "comment": { "summary": "一句话概括公开评论里的说话方式", "rhythm": "", "tone": "", "habits": [], "avoid": [] },
  "danmaku": { "summary": "一句话概括弹幕/短反应", "rhythm": "", "tone": "", "habits": [], "avoid": [] },
  "media": { "summary": "一句话概括她怎么用表情包/图片/语音表达（<=60字）", "usage": "什么情绪配什么表达，比如「高兴了发什么、懒得说话时发什么」", "habits": ["常用表情或表达习惯，最多5条"], "avoid": ["明确不用的表达，最多4条"] },
  "profile": {
    "summary": "一句话说清她是什么样的人（<=50字，不写剧情）",
    "traits": ["性格特点，每条写成「什么情况下会怎样」，最多6条"],
    "likes": ["在意或喜欢的东西，最多5条"],
    "dislikes": ["讨厌或受不了的东西，最多5条"],
    "reactions": ["遇到事情的第一反应，最多5条"],
    "boundaries": ["绝对不会做的事，最多4条"]
  },
  "fields": {
    "identity": "第三人称的一句话身份描述（不写名字、不写作品）",
    "tone": "整体语气，<=40字",
    "rhythm": "整体节奏，<=40字",
    "vocabulary": "词汇偏好，<=40字",
    "quirks": ["小习惯，最多5条"],
    "boundaries": ["明确不做的表达，最多5条"]
  }
}`

/**
 * 技术讨论类词：examples 要的是「像在跟人说话」的句子，
 * 装插件、报错、版本、命令这类全排除——不然她开口就像在答疑。
 */
const TECH_WORDS = [
  '安装', '插件', '报错', '版本', '配置', '命令', 'npx', 'npm', 'github', 'git',
  '模型', '提示词', 'token', '接口', '代码', '部署', '服务器', '脚本', '路径',
  '文件夹', '下载', '教程', '端口', '密钥', 'api', 'json', 'cmd', '终端', '仓库',
  '框架', '编程', '开发', '调试', '编译', '运行', '启动', '功能', '软件', '项目',
]

/** 只留短、口语、非技术、不违规的句子；不够 2 条就整体不要。 */
function pickExamples(list) {
  const out = []
  const seen = new Set()
  for (const raw of list) {
    const text = String(raw || '').trim()
    if (text.length < 2 || text.length > 36) continue
    if (text.includes('@某人')) continue
    const lower = text.toLowerCase()
    if (TECH_WORDS.some((word) => lower.includes(word.toLowerCase()))) continue
    if (hardBlocked(text, []).blocked) continue
    if (seen.has(text)) continue
    seen.add(text)
    out.push(text)
    if (out.length >= 4) break
  }
  return out.length >= 2 ? out : []
}

/**
 * @returns {Promise<object>} IR 对象（未带版本号，由调用方补）
 */
export async function distill(input) {
  const { samples, zone, complete } = input
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error('没有可提炼的样本')
  }

  const bySource = { chat: [], comment: [], video: [], danmaku: [], media: [] }
  // 按时间倒序：多次学习合并时，最近的样本优先占桶
  const ordered = [...samples].sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0))
  for (const sample of ordered) {
    const bucket = sample.source === 'dm' || sample.source === 'reply'
      ? 'chat'
      : sample.source === 'video' ? 'video'
        : sample.source === 'danmaku' ? 'danmaku'
          : sample.source === 'media' ? 'media' : 'comment'
    // 每桶上限压到 80、单条截到 150 字：样本越多，提示词越长，模型越容易把 JSON 写断
    if (bySource[bucket].length < 80) {
      bySource[bucket].push(`${sample.fromMe ? '我：' : '对方：'}${String(sample.text || '').slice(0, 150)}`)
    }
  }

  const focus = zone.focus || {}
  const focusLines = []
  if (focus.primary) {
    const map = { chat: '私聊', comment: '公开评论', danmaku: '弹幕' }
    focusLines.push(`以「${map[focus.primary] || focus.primary}」这块为主。`)
  }
  if (Array.isArray(focus.traits) && focus.traits.length > 0) {
    focusLines.push(`学习重点：${focus.traits.join('、')}。`)
  }
  if (Array.isArray(focus.avoid) && focus.avoid.length > 0) {
    focusLines.push(`明确不要：${focus.avoid.join('、')}。`)
  }
  const reference = typeof focus.reference === 'string' ? focus.reference.trim().slice(0, 4000) : ''
  if (reference !== '') {
    focusLines.push('')
    focusLines.push('【参考人设（目标骨架，不是语料）】')
    focusLines.push(reference)
    focusLines.push('')
    focusLines.push('有参考人设时按这个规矩办：')
    focusLines.push('- 参考人设是骨架，语料只是血肉。')
    focusLines.push('- 只提取与骨架一致的部分；语料里跟骨架冲突的，直接丢掉，不要写进来。')
    focusLines.push('- 骨架里写了、但语料里找不到证据的，宁可留空，不要编。')
  }

  const user = [
    focusLines.join('\n'),
    '',
    '【私聊 / 回复我的】',
    bySource.chat.join('\n') || '（无）',
    '',
    '【视频内容：旁白 / 台词 / 讲述——这是「关于某个人的材料」，不一定她本人在说话】',
    bySource.video.join('\n') || '（无）',
    '',
    '【公开评论】',
    bySource.comment.join('\n') || '（无）',
    '',
    '【弹幕 / 短反应】',
    bySource.danmaku.join('\n') || '（无）',
    '',
    '【表情 / 图片 / 语音的识别描述】',
    bySource.media.join('\n') || '（无）',
    '',
    '按下面这个 JSON 结构输出，只输出 JSON：',
    SCHEMA,
  ].join('\n')

  const raw = await complete({ system: SYSTEM, user, maxTokens: 4000 })
  const cleaned = sanitizePersonaOutput(raw)
  const parsed = parseJson(cleaned)
  if (parsed === null) {
    // 把模型原话留一段下来，不然下次还是只能猜
    const preview = String(cleaned).replace(/\s+/g, ' ').slice(0, 300)
    throw new Error(
      `模型没有返回可解析的 JSON（输出 ${String(raw || '').length} 字）。这次不产出人设词。开头是：${preview}`,
    )
  }
  return normalizeIr(parsed)
}

function parseJson(text) {
  const raw = String(text || '').trim()
  // 去掉可能的 ```json 包裹
  const fenced = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(raw)
  const candidate = fenced ? fenced[1].trim() : raw
  try {
    return JSON.parse(candidate)
  } catch {
    // 退一步：截取第一个 { 到最后一个 }
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try { return JSON.parse(candidate.slice(start, end + 1)) } catch { return null }
    }
    return null
  }
}

function normalizeIr(value) {
  const block = (input) => ({
    summary: str(input?.summary),
    rhythm: str(input?.rhythm),
    tone: str(input?.tone),
    usage: str(input?.usage),
    habits: strList(input?.habits, 5),
    avoid: strList(input?.avoid, 4),
  })
  return {
    // examples 是原样摘录，必须再过一次合规闸——语料里有的东西不等于能进人设词
    examples: pickExamples(strList(value?.examples, 8)),
    chat: block(value?.chat),
    comment: block(value?.comment),
    danmaku: block(value?.danmaku),
    media: block(value?.media),
    profile: {
      summary: str(value?.profile?.summary),
      traits: strList(value?.profile?.traits, 6),
      likes: strList(value?.profile?.likes, 5),
      dislikes: strList(value?.profile?.dislikes, 5),
      reactions: strList(value?.profile?.reactions, 5),
      boundaries: strList(value?.profile?.boundaries, 4),
    },
    fields: {
      identity: str(value?.fields?.identity),
      tone: str(value?.fields?.tone),
      rhythm: str(value?.fields?.rhythm),
      vocabulary: str(value?.fields?.vocabulary),
      quirks: strList(value?.fields?.quirks, 5),
      boundaries: strList(value?.fields?.boundaries, 5),
    },
  }
}

function str(value) {
  return typeof value === 'string' ? value.trim().slice(0, 300) : ''
}

function strList(value, max) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item !== '')
    .slice(0, max)
    .map((item) => item.slice(0, 120))
}

export { parseJson, pickExamples }
