/**
 * lib/store.js —— 所有落盘动作只走这里。
 *
 * 三条硬规矩：
 *  1. 写文件先写 `.tmp-*` 再 rename：半截文件不算数。
 *  2. 凭据文件权限收紧到「只有自己可读」（Windows 用 icacls，类 Unix 用 chmod）。
 *  3. 删除学习日志是「直接删」；删除学习内容要「先写隔离文本，再删」——由调用方决定，store 只执行。
 */
import { execFileSync } from 'node:child_process'
import {
  chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync,
  rmSync, statSync, writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true })
  return dir
}

export function readJson(file, fallback = null) {
  try {
    const raw = readFileSync(file, 'utf8')
    if (raw.trim() === '') return fallback
    const value = JSON.parse(raw)
    return value === null ? fallback : value
  } catch {
    return fallback
  }
}

export function readText(file, fallback = '') {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return fallback
  }
}

/** 原子写：同目录临时文件 → rename。 */
export function writeText(file, content) {
  const dir = file.slice(0, Math.max(file.lastIndexOf('\\'), file.lastIndexOf('/')))
  if (dir) ensureDir(dir)
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, content, 'utf8')
  try {
    renameSync(tmp, file)
  } catch (error) {
    // Windows 上目标被占用时 rename 会失败：退化成覆盖写，至少内容是对的。
    try {
      writeFileSync(file, content, 'utf8')
    } finally {
      try { rmSync(tmp, { force: true }) } catch { /* 清不掉就算了 */ }
    }
  }
  return file
}

export function writeJson(file, value) {
  return writeText(file, JSON.stringify(value, null, 2))
}

/** 收紧权限；失败不抛，返回是否成功（有的文件系统不支持）。 */
export function hardenPerms(file) {
  try {
    if (process.platform === 'win32') {
      const user = process.env.USERNAME || process.env.USER || ''
      if (user === '') return false
      execFileSync('icacls', [file, '/inheritance:r', '/grant:r', `${user}:F`], {
        stdio: 'ignore', windowsHide: true,
      })
    } else {
      chmodSync(file, 0o600)
    }
    return true
  } catch {
    return false
  }
}

export function fileSize(file) {
  try {
    return statSync(file).size
  } catch {
    return 0
  }
}

/** 列目录下的文件（缺省空目录返回 []）。 */
export function listFiles(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => join(dir, entry.name))
  } catch {
    return []
  }
}

/** 带时间戳的文件名片段：20261104-123456。 */
export function stamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

/** 快照一份文件到 backups/<name>.<stamp>，返回快照路径；源不存在返回 null。 */
export function snapshot(file, backupsDir, tag) {
  if (!existsSync(file)) return null
  ensureDir(backupsDir)
  const name = `${tag}.${stamp()}.json`
  const target = join(backupsDir, name)
  writeText(target, readFileSync(file, 'utf8'))
  return target
}

/** 只留最近 keep 份备份（按文件名里的时间戳排序）。 */
export function pruneBackups(backupsDir, keep = 20) {
  const files = listFiles(backupsDir).sort()
  const extra = files.slice(0, Math.max(0, files.length - keep))
  for (const file of extra) {
    try { rmSync(file, { force: true }) } catch { /* 删不掉不影响使用 */ }
  }
  return extra.length
}
