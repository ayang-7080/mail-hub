import { getDb } from '../db.js'

/** 列出所有已注册服务。 */
export function listServices() {
  const db = getDb()
  return db.prepare('SELECT * FROM services ORDER BY sort_order ASC, id ASC').all()
}

/** 新增服务。 */
export function createService(name) {
  const db = getDb()
  const n = String(name || '').trim()
  if (!n) throw new Error('服务名称不能为空')
  const maxSort = db.prepare('SELECT MAX(sort_order) AS m FROM services').get().m || 0
  const info = db.prepare('INSERT INTO services (name, sort_order, created_at) VALUES (?, ?, ?)')
    .run(n, maxSort + 1, Date.now())
  return info.lastInsertRowid
}

/** 删除服务(关联表 CASCADE 自动清理)。 */
export function deleteService(id) {
  const db = getDb()
  db.prepare('DELETE FROM services WHERE id = ?').run(id)
}

/** 重命名服务。 */
export function renameService(id, newName) {
  const db = getDb()
  const n = String(newName || '').trim()
  if (!n) throw new Error('服务名称不能为空')
  db.prepare('UPDATE services SET name = ? WHERE id = ?').run(n, id)
}

/** 获取某个账号已勾选的服务 ID 列表。 */
export function getAccountServices(accountId) {
  const db = getDb()
  return db.prepare('SELECT service_id FROM account_services WHERE account_id = ?')
    .all(accountId)
    .map((r) => r.service_id)
}

/** 设置某个账号的已注册服务(全量覆盖)。 */
export function setAccountServices(accountId, serviceIds) {
  const db = getDb()
  const ids = Array.isArray(serviceIds) ? serviceIds.filter((x) => typeof x === 'number') : []
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM account_services WHERE account_id = ?').run(accountId)
    const ins = db.prepare('INSERT OR IGNORE INTO account_services (account_id, service_id) VALUES (?, ?)')
    for (const sid of ids) {
      ins.run(accountId, sid)
    }
  })
  tx()
}

/** 批量获取多个账号的服务映射: { accountId: [serviceId, ...] } */
export function batchGetAccountServices(accountIds) {
  const db = getDb()
  if (!accountIds || !accountIds.length) return {}
  const placeholders = accountIds.map(() => '?').join(',')
  const rows = db.prepare(`SELECT account_id, service_id FROM account_services WHERE account_id IN (${placeholders})`)
    .all(...accountIds)
  const map = {}
  for (const r of rows) {
    if (!map[r.account_id]) map[r.account_id] = []
    map[r.account_id].push(r.service_id)
  }
  return map
}
