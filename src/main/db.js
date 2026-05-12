import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { runMigrations } from './migrations.js'

let db = null

export function initDb() {
  const dir = path.join(app.getPath('userData'), 'data')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const dbPath = path.join(dir, 'mail.sqlite')

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // 执行版本驱动的迁移
  runMigrations(db)

  return db
}

export function getDb() {
  if (!db) throw new Error('数据库未初始化')
  return db
}
