/**
 * lib/media.js —— 表情包 / 图片 / 语音的识别层。
 *
 * 通道由用户填：填了才启用。默认全关。
 *  · 图片：OpenAI 兼容的 vision 接口（chat/completions + image_url）
 *  · 语音：OpenAI 兼容的 STT 接口（/audio/transcriptions，multipart）
 *
 * 只产出「描述」与「文字」，不保存原始文件。
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

export class MediaUnavailable extends Error {
  constructor(message) {
    super(message)
    this.name = 'MediaUnavailable'
  }
}

export function visionReady(config) {
  return Boolean(config?.vision?.enabled && config?.vision?.baseUrl)
}

export function speechReady(config) {
  return Boolean(config?.speech?.enabled && config?.speech?.baseUrl)
}

async function download(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Referer: options.referer || 'https://www.bilibili.com/',
    },
    signal: options.signal,
  })
  if (!response.ok) throw new MediaUnavailable(`下载失败 HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length > 8 * 1024 * 1024) throw new MediaUnavailable('文件超过 8MB，跳过')
  const type = String(response.headers.get('content-type') || options.fallbackType || 'image/jpeg')
  return { bytes, type }
}

/**
 * 描述一张图或表情包。
 * @returns {Promise<{ description: string, emotion: string }>}
 */
export async function describeImage(imageUrl, config, options = {}) {
  if (!visionReady(config)) throw new MediaUnavailable('没有配置图片通道')
  const { bytes, type } = await download(imageUrl, { signal: options.signal })
  const mediaType = normalizeImageType(type)
  const dataUrl = `data:${mediaType};base64,${bytes.toString('base64')}`
  const base = String(config.vision.baseUrl).replace(/\/+$/, '')
  const model = String(config.vision.model || 'gpt-4o-mini')

  let response
  try {
    response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.vision.apiKey || ''}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 160,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: '用一句话描述这张图或表情包：画面是什么 + 传达什么情绪。不要判断是谁、不要猜身份。只输出这一句。',
            },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        }],
      }),
      signal: options.signal,
    })
  } catch (error) {
    throw new MediaUnavailable(`图片通道请求失败：${error?.message || error}`)
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new MediaUnavailable(`图片通道 HTTP ${response.status}：${body.slice(0, 160)}`)
  }
  const body = await response.json().catch(() => null)
  const text = String(body?.choices?.[0]?.message?.content || '').trim()
  if (text === '') throw new MediaUnavailable('图片通道返回空')
  return splitDescription(text)
}

/** 把「画面 + 情绪」拆开；拆不开就整句当描述。 */
function splitDescription(text) {
  const cleaned = text.replace(/\s+/g, ' ').trim().slice(0, 200)
  const emotion = /(?:情绪|感觉|氛围|语气)[：:]\s*([^。；;]+)/.exec(cleaned)?.[1]?.trim() || ''
  const description = cleaned.replace(/(?:情绪|感觉|氛围|语气)[：:][^。；;]*[。；;]?/g, '').trim() || cleaned
  return { description, emotion }
}

function normalizeImageType(type) {
  const value = String(type).toLowerCase()
  if (value.includes('png')) return 'image/png'
  if (value.includes('webp')) return 'image/webp'
  if (value.includes('gif')) return 'image/gif'
  return 'image/jpeg'
}

/**
 * 把一段语音转成文字。
 * @returns {Promise<{ text: string }>}
 */
export async function transcribeAudio(audioUrl, config, options = {}) {
  if (!speechReady(config)) throw new MediaUnavailable('没有配置语音通道')
  const { bytes, type } = await download(audioUrl, { signal: options.signal, fallbackType: 'audio/mpeg' })
  const base = String(config.speech.baseUrl).replace(/\/+$/, '')
  const model = String(config.speech.model || 'whisper-1')

  const form = new FormData()
  form.append('file', new Blob([bytes], { type }), `voice.${extOf(type)}`)
  form.append('model', model)
  form.append('language', 'zh')

  let response
  try {
    response = await fetch(`${base}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.speech.apiKey || ''}` },
      body: form,
      signal: options.signal,
    })
  } catch (error) {
    throw new MediaUnavailable(`语音通道请求失败：${error?.message || error}`)
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new MediaUnavailable(`语音通道 HTTP ${response.status}：${body.slice(0, 160)}`)
  }
  const body = await response.json().catch(() => null)
  const text = String(body?.text || '').trim()
  if (text === '') throw new MediaUnavailable('语音通道返回空')
  return { text: text.slice(0, 500) }
}

function extOf(type) {
  const value = String(type).toLowerCase()
  if (value.includes('wav')) return 'wav'
  if (value.includes('ogg')) return 'ogg'
  if (value.includes('amr')) return 'amr'
  return 'mp3'
}
