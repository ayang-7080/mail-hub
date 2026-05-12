import { getDb } from '../db.js'
import { encryptString, decryptString } from '../crypto.js'
import { MAIL_TYPES, detectTypeByEmail } from '../providers/index.js'
import { getProvider } from '../providers/index.js'
import { DEFAULT_CLIENT_ID, DEFAULT_TENANT } from '../providers/msOAuth.js'

function now() { return Date.now() }

function rowToAccount(row, { withSecrets = false } = {}) {
  if (!row) return null
  const out = {
    id: row.id,
    name: row.name,
    email: row.email,
    type: row.type,
    auth_mode: row.auth_mode,
    oauth_client_id: row.oauth_client_id,
    oauth_tenant: row.oauth_tenant,
    group_name: row.group_name || '',
    tags: parseTags(row.tags),
    status: row.status,
    last_error: row.last_error,
    last_sync_at: row.last_sync_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    has_password: !!row.password_enc,
    has_cookie: !!row.cookie_enc,
    has_login_password: !!row.login_password_enc
  }
  if (withSecrets) {
    out.password = decryptString(row.password_enc)
    out.cookie = decryptString(row.cookie_enc)
    out.login_password = decryptString(row.login_password_enc)
  }
  return out
}

function parseTags(s) {
  if (!s) return []
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : []
  } catch { return [] }
}

function normalizeTags(tags) {
  if (!tags) return null
  if (typeof tags === 'string') {
    // 允许前端传以逗号/空格分隔的字符串
    const arr = tags.split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean)
    return arr.length ? JSON.stringify(arr) : null
  }
  if (Array.isArray(tags)) {
    const arr = tags.map((t) => String(t).trim()).filter(Boolean)
    return arr.length ? JSON.stringify(arr) : null
  }
  return null
}

export function listAccounts(filter = {}) {
  const db = getDb()
  const { keyword, group, tag, type, auth_mode, sort = 'id_desc', page = 1, pageSize = 50 } = filter
  const where = []
  const params = []

  if (type) { where.push('type = ?'); params.push(type) }
  if (auth_mode) { where.push('auth_mode = ?'); params.push(auth_mode) }
  if (group) {
    if (group === '__none__') {
      where.push(`(group_name IS NULL OR group_name = '')`)
    } else {
      where.push('group_name = ?')
      params.push(group)
    }
  }
  if (tag) {
    where.push(`tags LIKE ?`)
    params.push(`%"${tag}"%`)
  }
  if (keyword && keyword.trim()) {
    const k = `%${keyword.trim()}%`
    where.push(`(email LIKE ? OR name LIKE ? OR group_name LIKE ? OR tags LIKE ?)`)
    params.push(k, k, k, k)
  }

  let order = 'id DESC'
  if (sort === 'id_desc') order = 'id DESC'
  else if (sort === 'id_asc') order = 'id ASC'
  else if (sort === 'created_asc') order = 'created_at ASC'
  else if (sort === 'created_desc') order = 'created_at DESC'
  else if (sort === 'email_asc') order = 'email ASC'
  else if (sort === 'sync_desc') order = `COALESCE(last_sync_at, 0) DESC`

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : ''
  const total = db.prepare(`SELECT COUNT(*) AS c FROM accounts ${whereClause}`).get(...params).c

  const limit = Math.max(1, Math.min(pageSize, 500))
  const offset = Math.max(0, (page - 1) * limit)
  const sql = `SELECT * FROM accounts ${whereClause} ORDER BY ${order} LIMIT ? OFFSET ?`
  const rows = db.prepare(sql).all(...params, limit, offset)
  return { items: rows.map((r) => rowToAccount(r)), total, page, pageSize: limit }
}

/** 列出所有已使用过的分组名(去重,按用量排序)。 */
export function listGroups() {
  const db = getDb()
  return db.prepare(`
    SELECT group_name AS name, COUNT(*) AS count
    FROM accounts
    WHERE group_name IS NOT NULL AND group_name <> ''
    GROUP BY group_name
    ORDER BY count DESC, group_name ASC
  `).all()
}

/** 列出所有标签(去重,按出现次数倒序)。 */
export function listTags() {
  const db = getDb()
  const rows = db.prepare(`SELECT tags FROM accounts WHERE tags IS NOT NULL AND tags <> ''`).all()
  const counter = new Map()
  for (const r of rows) {
    for (const t of parseTags(r.tags)) {
      counter.set(t, (counter.get(t) || 0) + 1)
    }
  }
  return [...counter.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

export function getAccount(id, opts) {
  const db = getDb()
  const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id)
  return rowToAccount(row, opts)
}

/**
 * 创建或更新账号。
 * payload: { id?, name?, email, type?, auth_mode, password?, cookie?, oauth_client_id?, oauth_tenant? }
 * 返回账号 id。
 */
export function upsertAccount(payload) {
  const db = getDb()

  // 更新时允许只传部分字段
  if (payload.id) {
    const existing = db.prepare('SELECT * FROM accounts WHERE id = ?').get(payload.id)
    if (!existing) throw new Error('账号不存在')

    const email = String(payload.email || existing.email).trim()
    if (!email) throw new Error('邮箱地址必填')
    const authMode = payload.auth_mode || existing.auth_mode || 'imap'
    if (!['imap', 'cookie', 'oauth'].includes(authMode)) throw new Error(`非法 auth_mode: ${authMode}`)

    let type = payload.type || existing.type
    if (!type) type = detectTypeByEmail(email)
    if (!type) throw new Error(`无法识别邮箱类型(${email}),请手动指定`)
    if (authMode === 'oauth' && type !== 'ms') throw new Error('OAuth 模式目前仅支持微软邮箱')

    const name = payload.name !== undefined ? (payload.name || email) : (existing.name || email)
    const ts = now()

    const oauthClientId = authMode === 'oauth'
      ? (payload.oauth_client_id || existing.oauth_client_id || DEFAULT_CLIENT_ID)
      : null
    const oauthTenant = authMode === 'oauth'
      ? (payload.oauth_tenant || existing.oauth_tenant || DEFAULT_TENANT)
      : null

    const groupName = payload.group_name !== undefined ? (String(payload.group_name || '').trim() || null) : existing.group_name
    const tagsJson = payload.tags !== undefined ? normalizeTags(payload.tags) : existing.tags

    const password_enc = payload.password != null
      ? (payload.password === '' ? null : encryptString(payload.password))
      : existing.password_enc
    const cookie_enc = payload.cookie != null
      ? (payload.cookie === '' ? null : encryptString(payload.cookie))
      : existing.cookie_enc
    const login_password_enc = payload.login_password != null
      ? (payload.login_password === '' ? null : encryptString(payload.login_password))
      : existing.login_password_enc

    db.prepare(`
      UPDATE accounts SET
        name = ?, email = ?, type = ?, auth_mode = ?,
        password_enc = ?, cookie_enc = ?, login_password_enc = ?,
        oauth_client_id = ?, oauth_tenant = ?,
        group_name = ?, tags = ?,
        updated_at = ?
      WHERE id = ?
    `).run(name, email, type, authMode, password_enc, cookie_enc, login_password_enc,
           oauthClientId, oauthTenant, groupName, tagsJson, ts, payload.id)
    return payload.id
  }

  // 新建
  const email = String(payload.email || '').trim()
  if (!email) throw new Error('邮箱地址必填')
  const authMode = payload.auth_mode || 'imap'
  if (!['imap', 'cookie', 'oauth'].includes(authMode)) throw new Error(`非法 auth_mode: ${authMode}`)

  let type = payload.type
  if (!type) type = detectTypeByEmail(email)
  if (!type) throw new Error(`无法识别邮箱类型(${email}),请手动指定`)
  if (!MAIL_TYPES.includes(type)) throw new Error(`暂不支持的类型: ${type}`)
  if (authMode === 'oauth' && type !== 'ms') throw new Error('OAuth 模式目前仅支持微软邮箱')

  const name = payload.name || email
  const ts = now()

  const oauthClientId = authMode === 'oauth'
    ? (payload.oauth_client_id || DEFAULT_CLIENT_ID)
    : null
  const oauthTenant = authMode === 'oauth'
    ? (payload.oauth_tenant || DEFAULT_TENANT)
    : null

  const groupName = payload.group_name != null ? String(payload.group_name).trim() || null : null
  const tagsJson = normalizeTags(payload.tags)

  const password_enc = payload.password ? encryptString(payload.password) : null
  const cookie_enc = payload.cookie ? encryptString(payload.cookie) : null
  const login_password_enc = payload.login_password ? encryptString(payload.login_password) : null

  const info = db.prepare(`
    INSERT INTO accounts
      (name, email, type, auth_mode, password_enc, cookie_enc, login_password_enc,
       oauth_client_id, oauth_tenant,
       group_name, tags,
       status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unknown', ?, ?)
  `).run(name, email, type, authMode, password_enc, cookie_enc, login_password_enc,
         oauthClientId, oauthTenant,
         groupName, tagsJson,
         ts, ts)
  return info.lastInsertRowid
}

export function deleteAccount(id) {
  const db = getDb()
  db.prepare('DELETE FROM accounts WHERE id = ?').run(id)
}

/**
 * 删除分组。
 * deleteAccounts=false: 将该分组下所有账号的 group_name 置空(移到未分组)。
 * deleteAccounts=true: 同时删除该分组下所有账号。
 */
export function deleteGroup(groupName, deleteAccounts = false) {
  const db = getDb()
  if (deleteAccounts) {
    db.prepare(`DELETE FROM accounts WHERE group_name = ?`).run(groupName)
  } else {
    db.prepare(`UPDATE accounts SET group_name = NULL, updated_at = ? WHERE group_name = ?`)
      .run(now(), groupName)
  }
}

/**
 * 重命名分组。
 */
export function renameGroup(oldName, newName) {
  const db = getDb()
  const n = String(newName || '').trim()
  if (!n) throw new Error('分组名不能为空')
  db.prepare(`UPDATE accounts SET group_name = ?, updated_at = ? WHERE group_name = ?`)
    .run(n, now(), oldName)
}

/**
 * 批量设置分组。
 * ids: 账号 ID 数组
 * groupName: 目标分组名(空字符串表示移到未分组)
 */
export function batchSetGroup(ids, groupName) {
  const db = getDb()
  if (!Array.isArray(ids) || !ids.length) return
  const g = String(groupName || '').trim() || null
  const ts = now()
  const placeholders = ids.map(() => '?').join(',')
  db.prepare(`UPDATE accounts SET group_name = ?, updated_at = ? WHERE id IN (${placeholders})`)
    .run(g, ts, ...ids)
}

/**
 * 删除标签:从所有账号的 tags JSON 数组中移除该标签。
 */
export function deleteTag(tagName) {
  const db = getDb()
  const rows = db.prepare(`SELECT id, tags FROM accounts WHERE tags LIKE ?`)
    .all(`%"${tagName}"%`)
  const upd = db.prepare('UPDATE accounts SET tags = ?, updated_at = ? WHERE id = ?')
  const ts = now()
  for (const r of rows) {
    const arr = parseTags(r.tags).filter((t) => t !== tagName)
    upd.run(arr.length ? JSON.stringify(arr) : null, ts, r.id)
  }
}

/**
 * 重命名标签。
 */
export function renameTag(oldName, newName) {
  const db = getDb()
  const n = String(newName || '').trim()
  if (!n) throw new Error('标签名不能为空')
  const rows = db.prepare(`SELECT id, tags FROM accounts WHERE tags LIKE ?`)
    .all(`%"${oldName}"%`)
  const upd = db.prepare('UPDATE accounts SET tags = ?, updated_at = ? WHERE id = ?')
  const ts = now()
  for (const r of rows) {
    const arr = parseTags(r.tags).map((t) => t === oldName ? n : t)
    upd.run(JSON.stringify(arr), ts, r.id)
  }
}

export function updateAccountStatus(id, status, lastError, lastSyncAt) {
  const db = getDb()
  db.prepare(`
    UPDATE accounts SET status = ?, last_error = ?, last_sync_at = COALESCE(?, last_sync_at), updated_at = ?
    WHERE id = ?
  `).run(status, lastError || null, lastSyncAt || null, now(), id)
}

/**
 * 测试账号连通性。
 */
export async function testAccount(id) {
  const acc = getAccount(id, { withSecrets: true })
  if (!acc) throw new Error('账号不存在')
  const provider = getProvider(acc.auth_mode)
  // imap 和 oauth 的秘密都存在 password_enc:前者是授权码,后者是 refresh_token
  const secret = acc.auth_mode === 'cookie' ? acc.cookie : acc.password
  const result = await provider.testConnection(acc, secret)
  updateAccountStatus(id, result.ok ? 'ok' : 'error', result.error || null, null)
  return result
}

/**
/**
 * 导出账号为文本(和导入格式兼容)。
 * filter: 同 listAccounts 的 filter,不传则导出全部。
 * 返回纯文本字符串,每行一条。
 */
export function exportAccounts(filter = {}) {
  const db = getDb()
  const { keyword, group, tag, type, auth_mode, exportLimit = 0, exportFormat = 'standard' } = filter
  const where = []
  const params = []
  if (type) { where.push('type = ?'); params.push(type) }
  if (auth_mode) { where.push('auth_mode = ?'); params.push(auth_mode) }
  if (group) {
    if (group === '__none__') where.push(`(group_name IS NULL OR group_name = '')`)
    else { where.push('group_name = ?'); params.push(group) }
  }
  if (tag) { where.push(`tags LIKE ?`); params.push(`%"${tag}"%`) }
  if (keyword && keyword.trim()) {
    const k = `%${keyword.trim()}%`
    where.push(`(email LIKE ? OR name LIKE ? OR group_name LIKE ? OR tags LIKE ?)`)
    params.push(k, k, k, k)
  }
  let sql = `SELECT * FROM accounts ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id ASC`
  if (exportLimit > 0) sql += ` LIMIT ${Math.floor(exportLimit)}`
  const rows = db.prepare(sql).all(...params)

  const lines = []
  for (const row of rows) {
    const password = decryptString(row.password_enc) || ''
    const cookie = decryptString(row.cookie_enc) || ''
    const loginPw = decryptString(row.login_password_enc) || ''

    if (exportFormat === 'email_only') {
      lines.push(row.email)
    } else if (exportFormat === 'email_password') {
      lines.push(`${row.email}----${password || loginPw}`)
    } else if (exportFormat === 'oauth_full') {
      const clientId = row.oauth_client_id || ''
      lines.push(`${row.email}----${loginPw || password}----${clientId}----${password}`)
    } else {
      // standard
      if (row.auth_mode === 'oauth') {
        const clientId = row.oauth_client_id || ''
        if (loginPw || clientId) {
          lines.push(`${row.email}----${loginPw}----${clientId}----${password}`)
        } else {
          lines.push(`ms_oauth----${row.email}----${password}`)
        }
      } else {
        const parts = [row.type, row.email, password]
        if (cookie) parts.push(cookie)
        lines.push(parts.join('----'))
      }
    }
  }
  return lines.join('\n')
}

/**
 * 批量导入。
 * extraMeta: { group_name?, tags? } 会统一应用到本次导入的所有账号。
 */
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function importBatch(text, extraMeta = {}) {
  const results = []
  const lines = String(text || '').split(/\r?\n/)
  const typeCandidates = new Set(['qq', '163', 'ms', 'ms_oauth'])

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim()
    if (!raw) continue
    try {
      const parts = raw.split('----').map((s) => s.trim())
      let typeToken = null
      let email, password = '', cookie = '', clientId = '', tenant = '', loginPassword = ''

      const head = (parts[0] || '').toLowerCase()

      if (parts[0] && typeCandidates.has(head) && parts.length >= 2) {
        typeToken = head
        email = parts[1] || ''
        if (typeToken === 'ms_oauth') {
          password = parts[2] || ''
          clientId = parts[3] || ''
          tenant = parts[4] || ''
        } else {
          password = parts[2] || ''
          cookie = parts[3] || ''
        }
      } else if (parts.length >= 4 && GUID_RE.test(parts[2] || '')) {
        email = parts[0] || ''
        loginPassword = parts[1] || ''
        clientId = parts[2] || ''
        password = parts[3] || ''
        typeToken = 'ms_oauth'
      } else {
        email = parts[0] || ''
        password = parts[1] || ''
        cookie = parts[2] || ''
      }

      if (!email) throw new Error('缺少邮箱地址')

      let finalType, authMode
      if (typeToken === 'ms_oauth') {
        finalType = 'ms'
        authMode = 'oauth'
        if (!password) throw new Error('OAuth 格式必须提供 refresh_token')
      } else {
        finalType = typeToken || detectTypeByEmail(email)
        if (!finalType) throw new Error(`无法识别类型: ${email}`)
        if (!password && !cookie) throw new Error('密码与 cookie 至少提供一个')
        authMode = (!password && cookie) ? 'cookie' : 'imap'
      }

      const id = upsertAccount({
        email,
        type: finalType,
        auth_mode: authMode,
        password: password || null,
        cookie: cookie || null,
        oauth_client_id: clientId || undefined,
        oauth_tenant: tenant || undefined,
        login_password: loginPassword || null,
        group_name: extraMeta.group_name,
        tags: extraMeta.tags
      })
      results.push({ line: i + 1, ok: true, id, email, mode: authMode })
    } catch (e) {
      results.push({ line: i + 1, ok: false, error: e.message || String(e), raw })
    }
  }
  return results
}
