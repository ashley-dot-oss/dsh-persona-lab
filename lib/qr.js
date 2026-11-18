/**
 * lib/qr.js —— 零依赖二维码编码器（字节模式，纠错 L，版本 1–10）。
 *
 * 只做登录二维码这一种用途，所以砍掉了用不到的分支：
 *  · 只支持 byte 模式（URL 是 ASCII）
 *  · 只支持纠错等级 L
 *  · 掩码固定 0（省掉评分；URL 短，图案不会坏）
 *
 * 算法遵循 ISO/IEC 18004 的标准步骤：编码 → RS 纠错 → 交织 → 功能图案 → 数据放置 → 掩码 → 格式信息。
 */

/** 纠错 L：每块纠错码字数 / 块数（版本 1–10）。 */
const ECC_PER_BLOCK = [7, 10, 15, 20, 26, 18, 20, 24, 30, 18]
const NUM_BLOCKS = [1, 1, 1, 1, 1, 2, 2, 2, 2, 4]

/** 每版本总码字数（含纠错）。 */
const TOTAL_CODEWORDS = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346]

/** 对齐图案中心位置（版本 1–10）。 */
const ALIGN_POSITIONS = [
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
]

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x, y) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
]

/** GF(256) 乘法，模多项式 0x11D。 */
function gfMul(a, b) {
  let z = 0
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((b >>> i) & 1) * a
  }
  return z & 0xff
}

/** 生成 RS 生成多项式。 */
function rsDivisor(degree) {
  const result = new Uint8Array(degree)
  result[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) {
      result[j] = gfMul(result[j], root)
      if (j + 1 < degree) result[j] ^= result[j + 1]
    }
    root = gfMul(root, 0x02)
  }
  return result
}

function rsRemainder(data, divisor) {
  const result = new Uint8Array(divisor.length)
  for (const byte of data) {
    const factor = byte ^ result[0]
    result.copyWithin(0, 1)
    result[result.length - 1] = 0
    for (let i = 0; i < divisor.length; i += 1) {
      result[i] ^= gfMul(divisor[i], factor)
    }
  }
  return result
}

function getBit(value, index) {
  return ((value >>> index) & 1) !== 0
}

/** 选择能装下 len 字节的最小版本（1–10）；装不下抛错。 */
export function pickVersion(byteLength) {
  for (let version = 1; version <= 10; version += 1) {
    const capacity = capacityFor(version)
    if (byteLength <= capacity) return version
  }
  throw new Error(`内容太长：${byteLength} 字节，超过版本 10 的容量`)
}

function capacityFor(version) {
  const dataCodewords = TOTAL_CODEWORDS[version - 1] - ECC_PER_BLOCK[version - 1] * NUM_BLOCKS[version - 1]
  const lengthBits = version < 10 ? 8 : 16
  return dataCodewords - Math.ceil((4 + lengthBits) / 8)
}

/**
 * 编码成二维布尔矩阵。
 * @param {string} text ASCII 文本
 * @param {number} [mask] 0–7，默认 0
 */
export function encode(text, mask = 0) {
  const bytes = new TextEncoder().encode(String(text))
  const version = pickVersion(bytes.length)
  const size = version * 4 + 17
  const modules = Array.from({ length: size }, () => new Array(size).fill(false))
  const isFunction = Array.from({ length: size }, () => new Array(size).fill(false))

  drawFunctionPatterns(modules, isFunction, version)
  drawCodewords(modules, isFunction, version, buildCodewords(bytes, version))
  applyMask(modules, isFunction, mask)
  drawFormatBits(modules, isFunction, mask)
  return { size, modules, version }
}

function buildCodewords(bytes, version) {
  const versionIndex = version - 1
  const dataCodewords = TOTAL_CODEWORDS[versionIndex] - ECC_PER_BLOCK[versionIndex] * NUM_BLOCKS[versionIndex]
  const bits = []
  const push = (value, length) => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1)
  }
  push(0b0100, 4) // byte mode
  push(bytes.length, version < 10 ? 8 : 16)
  for (const byte of bytes) push(byte, 8)

  const capacityBits = dataCodewords * 8
  push(0, Math.min(4, capacityBits - bits.length))
  while (bits.length % 8 !== 0) bits.push(0)
  const data = new Uint8Array(dataCodewords)
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j]
    data[i / 8] = byte
  }
  for (let i = bits.length / 8, pad = 0xec; i < dataCodewords; i += 1, pad ^= 0xec ^ 0x11) {
    data[i] = pad
  }

  const numBlocks = NUM_BLOCKS[versionIndex]
  const eccLen = ECC_PER_BLOCK[versionIndex]
  const rawCodewords = TOTAL_CODEWORDS[versionIndex]
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks)
  const shortBlockLen = Math.floor(rawCodewords / numBlocks)

  const blocks = []
  const divisor = rsDivisor(eccLen)
  for (let i = 0, k = 0; i < numBlocks; i += 1) {
    const dat = data.slice(k, k + shortBlockLen - eccLen + (i < numShortBlocks ? 0 : 1))
    k += dat.length
    const ecc = rsRemainder(dat, divisor)
    blocks.push({ dat: Array.from(dat), ecc: Array.from(ecc) })
  }

  const result = []
  const maxData = Math.max(...blocks.map((block) => block.dat.length))
  for (let i = 0; i < maxData; i += 1) {
    for (const block of blocks) if (i < block.dat.length) result.push(block.dat[i])
  }
  for (let i = 0; i < eccLen; i += 1) {
    for (const block of blocks) result.push(block.ecc[i])
  }
  return Uint8Array.from(result)
}

function drawFunctionPatterns(modules, isFunction, version) {
  const size = modules.length

  // 定位图案
  for (let i = 0; i < size; i += 1) {
    setFunction(modules, isFunction, 6, i, i % 2 === 0)
    setFunction(modules, isFunction, i, 6, i % 2 === 0)
  }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const x = cx + dx
        const y = cy + dy
        if (x < 0 || x >= size || y < 0 || y >= size) continue
        const dist = Math.max(Math.abs(dx), Math.abs(dy))
        setFunction(modules, isFunction, x, y, dist !== 2 && dist !== 4)
      }
    }
  }

  // 对齐图案
  const positions = ALIGN_POSITIONS[version - 1]
  const count = positions.length
  for (let i = 0; i < count; i += 1) {
    for (let j = 0; j < count; j += 1) {
      if ((i === 0 && j === 0) || (i === 0 && j === count - 1) || (i === count - 1 && j === 0)) continue
      const cx = positions[i]
      const cy = positions[j]
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          setFunction(modules, isFunction, cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
        }
      }
    }
  }

  // 格式信息预留
  for (let i = 0; i <= 8; i += 1) {
    if (i !== 6) {
      setFunction(modules, isFunction, 8, i, false)
      setFunction(modules, isFunction, i, 8, false)
    }
  }
  setFunction(modules, isFunction, 8, 8, false)
  setFunction(modules, isFunction, 8, size - 8, false)
  for (let i = 0; i < 8; i += 1) {
    setFunction(modules, isFunction, size - 1 - i, 8, false)
    setFunction(modules, isFunction, 8, size - 1 - i, false)
  }

  // 版本信息（>= 7）
  if (version >= 7) {
    let rem = version
    for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    const bits = (version << 12) | rem
    for (let i = 0; i < 18; i += 1) {
      const bit = getBit(bits, i)
      const a = size - 11 + (i % 3)
      const b = Math.floor(i / 3)
      setFunction(modules, isFunction, a, b, bit)
      setFunction(modules, isFunction, b, a, bit)
    }
  }
}

function setFunction(modules, isFunction, x, y, value) {
  if (y < 0 || y >= modules.length || x < 0 || x >= modules.length) return
  modules[y][x] = value
  isFunction[y][x] = true
}

function drawFormatBits(modules, isFunction, mask) {
  const size = modules.length
  const data = (1 << 3) | mask // 纠错等级 L = 01，左移 3 位
  let rem = data
  for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
  const bits = ((data << 10) | rem) ^ 0x5412

  for (let i = 0; i <= 5; i += 1) setFunction(modules, isFunction, 8, i, getBit(bits, i))
  setFunction(modules, isFunction, 8, 7, getBit(bits, 6))
  setFunction(modules, isFunction, 8, 8, getBit(bits, 7))
  setFunction(modules, isFunction, 7, 8, getBit(bits, 8))
  for (let i = 9; i < 15; i += 1) setFunction(modules, isFunction, 14 - i, 8, getBit(bits, i))

  for (let i = 0; i < 8; i += 1) setFunction(modules, isFunction, size - 1 - i, 8, getBit(bits, i))
  for (let i = 8; i < 15; i += 1) setFunction(modules, isFunction, 8, size - 15 + i, getBit(bits, i))
  setFunction(modules, isFunction, 8, size - 8, true)
}

function drawCodewords(modules, isFunction, version, codewords) {
  const size = modules.length
  let i = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < size; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j
        const upward = ((right + 1) & 2) === 0
        const y = upward ? size - 1 - vert : vert
        if (!isFunction[y][x] && i < codewords.length * 8) {
          modules[y][x] = getBit(codewords[i >>> 3], 7 - (i & 7))
          i += 1
        }
      }
    }
  }
}

function applyMask(modules, isFunction, mask) {
  const fn = MASKS[mask % 8]
  for (let y = 0; y < modules.length; y += 1) {
    for (let x = 0; x < modules.length; x += 1) {
      if (!isFunction[y][x] && fn(x, y)) modules[y][x] = !modules[y][x]
    }
  }
}

/**
 * 渲染成 SVG 路径（客户端直接 <svg> 用）。
 * @returns {{ size: number, path: string }}
 */
export function toSvgPath(matrix) {
  let path = ''
  for (let y = 0; y < matrix.size; y += 1) {
    for (let x = 0; x < matrix.size; x += 1) {
      if (matrix.modules[y][x]) path += `M${x},${y}h1v1h-1z`
    }
  }
  return { size: matrix.size, path }
}
