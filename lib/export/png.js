/**
 * lib/export/png.js —— 一个只干一件事的 PNG 编码器。
 *
 * 为什么自己写：SillyTavern 的「角色卡 PNG」就是一张普通 PNG，里面多一个
 * `tEXt` 块，key = `chara`，value = base64(JSON)。为了不引第三方依赖，
 * 这里只实现 8-bit RGB、无滤波、zlib 压缩这一条路径。
 */
import { deflateSync } from 'node:zlib'

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuffer, data])
  const out = Buffer.alloc(body.length + 8)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body), body.length + 4)
  return out
}

/** 生成一张竖向渐变图（深蓝 → 白），作为角色卡的底图。 */
export function makeBackground(width = 400, height = 600) {
  const raw = Buffer.alloc((width * 3 + 1) * height)
  let offset = 0
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0 // filter: none
    offset += 1
    const t = y / Math.max(1, height - 1)
    const r = Math.round(11 + (247 - 11) * t)
    const g = Math.round(27 + (250 - 27) * t)
    const b = Math.round(58 + (252 - 58) * t)
    for (let x = 0; x < width; x += 1) {
      raw[offset] = r; raw[offset + 1] = g; raw[offset + 2] = b
      offset += 3
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // color type: truecolour
  header[10] = 0; header[11] = 0; header[12] = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** 在 PNG 末尾（IEND 之前）插入一个 tEXt 块。 */
export function embedTextChunk(png, keyword, text) {
  const payload = Buffer.concat([
    Buffer.from(String(keyword), 'latin1'),
    Buffer.from([0]),
    Buffer.from(String(text), 'latin1'),
  ])
  const textChunk = chunk('tEXt', payload)
  // 找到 IEND 起点：最后 12 字节就是 IEND 块
  const iendAt = png.length - 12
  return Buffer.concat([png.subarray(0, iendAt), textChunk, png.subarray(iendAt)])
}

/** 生成带 `chara` 块的角色卡 PNG。 */
export function makeCardPng(card, options = {}) {
  const json = JSON.stringify(card)
  const base64 = Buffer.from(json, 'utf8').toString('base64')
  const background = makeBackground(options.width, options.height)
  return embedTextChunk(background, 'chara', base64)
}

/** 把 QR 矩阵渲染成黑底白块的 PNG（带静默区）。 */
export function makeQrPng(matrix, options = {}) {
  const scale = Math.max(2, Number(options.scale) || 6)
  const quiet = Math.max(0, Number(options.quiet ?? 4))
  const modules = matrix.size + quiet * 2
  const size = modules * scale
  const raw = Buffer.alloc((size * 3 + 1) * size)

  let offset = 0
  for (let y = 0; y < size; y += 1) {
    raw[offset] = 0
    offset += 1
    const my = Math.floor(y / scale) - quiet
    for (let x = 0; x < size; x += 1) {
      const mx = Math.floor(x / scale) - quiet
      const dark = mx >= 0 && my >= 0 && mx < matrix.size && my < matrix.size
        && matrix.modules[my][mx]
      const value = dark ? 0 : 255
      raw[offset] = value; raw[offset + 1] = value; raw[offset + 2] = value
      offset += 3
    }
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 2
  header[10] = 0; header[11] = 0; header[12] = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
