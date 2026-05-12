import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { IMAP_CONFIG } from './types.js'
import { getAccessToken, clearToken } from './msOAuth.js'

/**
 * IMAP 方案统一 provider。
 * 支持两种认证:
 *   - 普通密码/授权码(account.auth_mode === 'imap')
 *   - OAuth2 XOAUTH2(account.auth_mode === 'oauth',仅 ms)
 * 每次操作建立短连接,适合低频手动刷新;后续定时同步可改连接池。
 */

async function buildClient(account, secret) {
  const cfg = IMAP_CONFIG[account.type]
  if (!cfg) throw new Error(`不支持的邮箱类型: ${account.type}`)

  const extra = {}
  if (account.type === '163') {
    extra.clientInfo = {
      name: 'MailManager',
      version: '0.1.0',
      vendor: 'local',
      'support-email': account.email
    }
  }

  let auth
  if (account.auth_mode === 'oauth') {
    if (account.type !== 'ms') throw new Error('OAuth 仅支持微软邮箱')
    const accessToken = await getAccessToken(account, secret)
    auth = { user: account.email, accessToken }
  } else {
    auth = { user: account.email, pass: secret }
  }

  return new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth,
    logger: false,
    ...extra
  })
}

async function withClient(account, secret, fn) {
  let client
  try {
    client = await buildClient(account, secret)
    await client.connect()
    return await fn(client)
  } catch (e) {
    // OAuth token 可能失效,清掉缓存下次强制刷新
    if (account.auth_mode === 'oauth') clearToken(account.id)
    throw e
  } finally {
    if (client) await client.logout().catch(() => {})
  }
}

/**
 * 把 folder 抽象名(inbox/junk)解析为 IMAP 真实路径。
 * 优先用 IMAP SPECIAL-USE 标记,找不到时回退到常见英文/中文名。
 */
async function resolveFolderPath(client, folder) {
  if (folder === 'inbox') return 'INBOX'

  const list = await client.list({ statusQuery: false })
  if (folder === 'junk') {
    // 先找带 \Junk 标记的
    const flagged = list.find(
      (m) => m.specialUse === '\\Junk' || (m.flags && m.flags.has && m.flags.has('\\Junk'))
    )
    if (flagged) return flagged.path
    // 回退:按常见名匹配
    const names = ['Junk', 'Junk Email', 'Junk E-mail', 'Spam', '垃圾邮件', 'Bulk Mail']
    for (const n of names) {
      const hit = list.find((m) => m.name === n || m.path === n)
      if (hit) return hit.path
    }
    throw new Error('未找到垃圾邮件文件夹,请在邮箱网页端确认 IMAP 已开启该文件夹的订阅')
  }
  throw new Error(`未知 folder: ${folder}`)
}

export async function testConnection(account, secret) {
  try {
    await withClient(account, secret, async () => {})
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  }
}

/**
 * 拉取指定文件夹最近 limit 封邮件的元数据(不下载正文)。
 * folder: 'inbox' | 'junk',默认 inbox
 */
export async function fetchInbox(account, secret, { limit = 50, folder = 'inbox' } = {}) {
  return withClient(account, secret, async (client) => {
    const path = await resolveFolderPath(client, folder)
    const list = []
    const lock = await client.getMailboxLock(path)
    try {
      const mailbox = client.mailbox
      if (!mailbox || !mailbox.exists) return []

      const total = mailbox.exists
      const start = Math.max(1, total - limit + 1)
      const range = `${start}:${total}`

      for await (const msg of client.fetch(range, {
        envelope: true,
        flags: true,
        bodyStructure: true,
        uid: true,
        internalDate: true
      })) {
        const env = msg.envelope || {}
        const from = (env.from && env.from[0]) || {}
        const to = (env.to && env.to[0]) || {}
        list.push({
          uid: String(msg.uid),
          message_id: env.messageId || null,
          subject: env.subject || '(无主题)',
          from_addr: from.address ? `${from.name || ''} <${from.address}>`.trim() : '',
          to_addr: to.address ? `${to.name || ''} <${to.address}>`.trim() : '',
          date: env.date ? new Date(env.date).getTime() : (msg.internalDate ? new Date(msg.internalDate).getTime() : Date.now()),
          is_read: msg.flags && msg.flags.has('\\Seen') ? 1 : 0,
          has_attachment: hasAttachment(msg.bodyStructure) ? 1 : 0,
          snippet: ''
        })
      }
    } finally {
      lock.release()
    }
    list.sort((a, b) => b.date - a.date)
    return list
  })
}

/** 拉取单封邮件的完整内容(需要指定其所在文件夹)。 */
export async function fetchMailContent(account, secret, uid, { folder = 'inbox' } = {}) {
  return withClient(account, secret, async (client) => {
    const path = await resolveFolderPath(client, folder)
    const lock = await client.getMailboxLock(path)
    try {
      const { content } = await client.download(uid, undefined, { uid: true })
      const chunks = []
      for await (const chunk of content) chunks.push(chunk)
      const raw = Buffer.concat(chunks)
      const parsed = await simpleParser(raw)
      return {
        html: parsed.html || null,
        text: parsed.text || null,
        headers: JSON.stringify(Array.from(parsed.headers || []))
      }
    } finally {
      lock.release()
    }
  })
}

function hasAttachment(structure) {
  if (!structure) return false
  if (structure.disposition === 'attachment') return true
  if (Array.isArray(structure.childNodes)) {
    return structure.childNodes.some(hasAttachment)
  }
  return false
}
