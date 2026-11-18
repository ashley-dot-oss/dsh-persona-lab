/**
 * lib/llm.js —— 提炼用的模型调用。
 *
 * 两条路，优先第一条：
 *  1. 宿主 `ctx.llm.stream()`：不额外要 key，用用户当前配置的模型。
 *  2. 用户自填的 OpenAI 兼容 API：`apiBaseUrl` + `apiKey` + `apiModel`。
 *
 * 只做「一次补全」，不接工具、不写会话。
 */
import { BiliError } from './bili/http.js'

export class LlmUnavailable extends Error {
  constructor(message) {
    super(message)
    this.name = 'LlmUnavailable'
  }
}

/**
 * 一次补全。支持两种调用方式：
 *  · `messages: [{ role, content }]` —— 多轮对话（测试区用这个，模型才会「接话」）
 *  · `user: string` —— 单条输入（提炼用这个）
 *
 * @param {object} input
 * @param {object} [input.ctx] 插件上下文（取 ctx.llm）
 * @param {object} input.config 全局配置
 * @param {string} input.system 系统提示
 * @param {Array<{role:string, content:string}>} [input.messages] 对话历史
 * @param {string} [input.user] 单条内容
 * @param {AbortSignal} [input.signal]
 */
export async function complete(input) {
  const { ctx, config } = input
  const system = String(input.system || '')
  const messages = normalizeMessages(input)
  if (messages.length === 0) throw new LlmUnavailable('没有可提炼的内容')

  const host = tryHostLlm(ctx)
  const temperature = Number.isFinite(Number(input.temperature)) ? Number(input.temperature) : 0.4
  const maxTokens = Number.isFinite(Number(input.maxTokens)) && Number(input.maxTokens) > 0
    ? Number(input.maxTokens) : 2000
  if (host) {
    try {
      return await callHost(ctx, host, { system, messages, temperature, maxTokens, signal: input.signal })
    } catch (error) {
      if (!hasOwnApi(config)) throw error
      // 宿主这条路失败，退回自填 API
    }
  }
  if (!hasOwnApi(config)) {
    throw new LlmUnavailable('没有可用的模型：宿主模型不可用，且没有填写 API Key。')
  }
  return callOpenAiCompatible(config, { system, messages, temperature, maxTokens, signal: input.signal })
}

/** 归一化消息列表；`user` 形式包成一条。 */
function normalizeMessages(input) {
  if (Array.isArray(input.messages) && input.messages.length > 0) {
    return input.messages
      .filter((message) => message && typeof message.content === 'string')
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .map((message) => ({ role: message.role, content: message.content }))
  }
  const user = String(input.user || '')
  return user.trim() === '' ? [] : [{ role: 'user', content: user }]
}

/** 可选服务取法：插件上下文里用 ctx.get(name)，没有就用属性。 */
function service(ctx, name) {
  try {
    if (typeof ctx?.get === 'function') {
      const value = ctx.get(name)
      if (value !== undefined) return value
    }
  } catch { /* 未声明或不可用 */ }
  try {
    return ctx?.[name]
  } catch {
    return undefined
  }
}

function tryHostLlm(ctx) {
  try {
    const llm = service(ctx, 'llm')
    return llm && typeof llm.stream === 'function' ? llm : null
  } catch {
    return null
  }
}

/** 宿主默认模型：provider + model。取不到就试 deepseek。 */
async function pickHostRoute(ctx) {
  try {
    const selection = service(ctx, 'agentDefaultModel')?.currentSelection?.()
    const provider = selection?.provider || selection?.route?.provider
    const model = selection?.model || selection?.id
    if (provider && model) return { provider, model }
  } catch { /* 取不到就用兜底 */ }
  try {
    const llm = service(ctx, 'llm')
    const providers = (await llm?.listProviders?.()) || []
    const deepseek = providers.find((item) => String(item.id || '').includes('deepseek'))
    if (deepseek) {
      const models = await llm.listModels(deepseek.id)
      const first = models?.[0]?.id
      if (first) return { provider: deepseek.id, model: first }
    }
  } catch { /* 忽略 */ }
  throw new LlmUnavailable('宿主没有可用的模型路由')
}

async function callHost(ctx, llm, { system, messages, temperature, maxTokens, signal }) {
  const route = await pickHostRoute(ctx)
  let text = ''
  const stream = llm.stream({
    provider: route.provider,
    model: route.model,
    system,
    // assistant 消息必须带 source（DSH 会读 source.replayState）；
    // user 消息反过来不能带 source，否则被拒。
    messages: messages.map((message) => {
      const base = {
        role: message.role,
        content: [{ type: 'text', text: message.content }],
      }
      if (message.role !== 'assistant') return base
      return {
        ...base,
        source: { kind: 'model', provider: route.provider, model: route.model },
      }
    }),
    temperature,
    maxTokens,
    signal,
  })
  for await (const chunk of stream) {
    if (chunk?.type === 'text-delta') text += chunk.text
    if (chunk?.type === 'finish' && chunk.reason?.kind === 'error') {
      throw new LlmUnavailable(chunk.reason.failure?.message || '宿主模型调用失败')
    }
  }
  if (text.trim() === '') throw new LlmUnavailable('宿主模型返回空内容')
  return text.trim()
}

function hasOwnApi(config) {
  return Boolean(config?.apiKey && config?.apiBaseUrl)
}

async function callOpenAiCompatible(config, { system, messages, temperature, maxTokens, signal }) {
  const base = String(config.apiBaseUrl || '').replace(/\/+$/, '')
  const url = `${base}/chat/completions`
  const model = String(config.apiModel || 'deepseek-chat')
  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: maxTokens,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          ...messages,
        ],
      }),
      signal,
    })
  } catch (error) {
    throw new BiliError('llm-network', `模型请求失败：${error?.message || error}`)
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new BiliError('llm-http', `模型返回 HTTP ${response.status}：${body.slice(0, 200)}`)
  }
  const body = await response.json().catch(() => null)
  const text = body?.choices?.[0]?.message?.content
  if (typeof text !== 'string' || text.trim() === '') {
    throw new LlmUnavailable('模型返回空内容')
  }
  return text.trim()
}
