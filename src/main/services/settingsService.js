import { getDb } from '../db.js'
import crypto from 'crypto'

function getSetting(key) {
  const db = getDb()
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
  return row ? row.value : null
}

function setSetting(key, value) {
  const db = getDb()
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
}

function deleteSetting(key) {
  const db = getDb()
  db.prepare('DELETE FROM settings WHERE key = ?').run(key)
}

function hashPassword(password, salt) {
  return crypto.createHash('sha256').update(salt + password).digest('hex')
}

/**
 * 检查是否已设置管理员密码。
 */
export function hasPassword() {
  return !!getSetting('admin_password_hash')
}

/** 获取工作台刷新间隔(秒),默认 30,最低 3。 */
export function getSyncInterval() {
  const v = getSetting('workspace_sync_interval')
  const n = Number(v)
  return (n && n >= 3) ? n : 30
}

/** 设置工作台刷新间隔。 */
export function setSyncInterval(seconds) {
  const n = Math.max(3, Math.floor(Number(seconds) || 30))
  setSetting('workspace_sync_interval', String(n))
  return n
}

/**
 * 验证密码。
 */
export function verifyPassword(password) {
  const stored = getSetting('admin_password_hash')
  if (!stored) return true // 没设密码,直接通过
  const salt = getSetting('admin_password_salt') || ''
  const hash = hashPassword(password, salt)
  return hash === stored
}

/**
 * 设置/修改密码。
 * oldPassword: 当前密码(首次设置时传空)
 * newPassword: 新密码(传空则清除密码)
 */
export function setPassword(oldPassword, newPassword) {
  // 验证旧密码
  if (hasPassword()) {
    if (!verifyPassword(oldPassword)) {
      throw new Error('当前密码错误')
    }
  }

  if (!newPassword) {
    // 清除密码
    deleteSetting('admin_password_hash')
    deleteSetting('admin_password_salt')
    return
  }

  const salt = crypto.randomBytes(16).toString('hex')
  const hash = hashPassword(newPassword, salt)
  setSetting('admin_password_salt', salt)
  setSetting('admin_password_hash', hash)
}
