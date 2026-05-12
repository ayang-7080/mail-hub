import { getDb } from '../db.js'
import { getAccount, updateAccountStatus } from './accountService.js'
import { getProvider } from '../providers/index.js'

/**
 * 从远端拉取指定文件夹并 upsert 到本地数据库。
 * folder: 'inbox' | 'junk',默认 inbox
 */
export async function syncInbox(accountId, { limit = 50, folder = 'inbox' } = {}) {
  const db = getDb()
  const acc = getAccount(accountId, { withSecrets: true })
  if (!acc) throw new Error('账号不存在')

  const provider = getProvider(acc.auth_mode)
  const secret = acc.auth_mode === 'cookie' ? acc.cookie : acc.password
  if (!secret) throw new Error('该账号缺少密码/授权码/refresh_token 或 cookie,无法拉取')

  let mails
  try {
    mails = await provider.fetchInbox(acc, secret, { limit, folder })
  } catch (e) {
    updateAccountStatus(accountId, 'error', e.message || String(e), null)
    throw e
  }

  const now = Date.now()
  const insert = db.prepare(`
    INSERT INTO mails
      (account_id, folder, uid, message_id, subject, from_addr, to_addr, date, is_read, has_attachment, snippet, fetched_at)
    VALUES (@account_id, @folder, @uid, @message_id, @subject, @from_addr, @to_addr, @date, @is_read, @has_attachment, @snippet, @fetched_at)
    ON CONFLICT(account_id, folder, uid) DO UPDATE SET
      is_read = excluded.is_read,
      has_attachment = excluded.has_attachment,
      subject = excluded.subject,
      from_addr = excluded.from_addr,
      to_addr = excluded.to_addr,
      date = excluded.date
  `)
  const tx = db.transaction((items) => {
    for (const m of items) {
      insert.run({
        account_id: accountId,
        folder,
        uid: m.uid,
        message_id: m.message_id || null,
        subject: m.subject || '',
        from_addr: m.from_addr || '',
        to_addr: m.to_addr || '',
        date: m.date || now,
        is_read: m.is_read ? 1 : 0,
        has_attachment: m.has_attachment ? 1 : 0,
        snippet: m.snippet || '',
        fetched_at: now
      })
    }
  })
  tx(mails)

  updateAccountStatus(accountId, 'ok', null, now)
  return { count: mails.length, folder }
}

/** 本地查询指定文件夹邮件。 */
export function listMails(accountId, { limit = 100, offset = 0, folder = 'inbox' } = {}) {
  const db = getDb()
  return db.prepare(`
    SELECT id, uid, folder, subject, from_addr, to_addr, date, is_read, has_attachment
    FROM mails WHERE account_id = ? AND folder = ?
    ORDER BY date DESC
    LIMIT ? OFFSET ?
  `).all(accountId, folder, limit, offset)
}

/** 获取邮件正文(本地没有时实时拉取并缓存)。 */
export async function getMailContent(mailId) {
  const db = getDb()
  const mail = db.prepare('SELECT * FROM mails WHERE id = ?').get(mailId)
  if (!mail) throw new Error('邮件不存在')

  const cached = db.prepare('SELECT * FROM mail_contents WHERE mail_id = ?').get(mailId)
  if (cached) return { mail, content: cached }

  const acc = getAccount(mail.account_id, { withSecrets: true })
  if (!acc) throw new Error('账号不存在')
  const provider = getProvider(acc.auth_mode)
  const secret = acc.auth_mode === 'cookie' ? acc.cookie : acc.password

  const content = await provider.fetchMailContent(acc, secret, mail.uid, { folder: mail.folder || 'inbox' })
  db.prepare(`
    INSERT INTO mail_contents (mail_id, html, text, headers)
    VALUES (?, ?, ?, ?)
  `).run(mailId, content.html, content.text, content.headers)

  return { mail, content }
}
