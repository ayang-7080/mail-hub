import { app } from 'electron'
import { initDb, getDb } from './db.js'
import { encryptString, decryptString, isEncryptionAvailable } from './crypto.js'
import { detectTypeByEmail } from './providers/types.js'
import * as accountService from './services/accountService.js'
import * as mailService from './services/mailService.js'

async function run() {
  await app.whenReady()
  try {
    console.log('[smoke] detectType qq.com =>', detectTypeByEmail('a@qq.com'))
    console.log('[smoke] detectType 163.com =>', detectTypeByEmail('a@163.com'))
    console.log('[smoke] detectType outlook.com =>', detectTypeByEmail('a@outlook.com'))

    console.log('[smoke] encryption available:', isEncryptionAvailable())
    const enc = encryptString('hello-secret')
    const dec = decryptString(enc)
    console.log('[smoke] encrypt/decrypt round-trip:', dec === 'hello-secret')

    initDb()

    // cleanup
    const db = getDb()
    db.exec(`DELETE FROM mails WHERE account_id IN (SELECT id FROM accounts WHERE email LIKE 'smoke_%')`)
    db.exec(`DELETE FROM accounts WHERE email LIKE 'smoke_%'`)

    const results = accountService.importBatch(
      [
        'qq----smoke_qq@qq.com----authcode123----',
        'smoke_163@163.com----code163----',
        'ms----smoke_ms@outlook.com--------token-abc',
        'ms_oauth----smoke_oauth@outlook.com----fake-refresh-token----9e5f94bc-e8a4-4e73-b8be-63364c29d753----common'
      ].join('\n')
    )
    console.log('[smoke] import results:', JSON.stringify(results, null, 2))

    const list = accountService.listAccounts().items
    console.log('[smoke] account count:', list.length)
    console.log('[smoke] accounts:', list.map(a => `${a.type}/${a.email}/${a.auth_mode}`))

    const oauthAcc = list.find(a => a.email === 'smoke_oauth@outlook.com')
    if (!oauthAcc) throw new Error('OAuth account not created')
    if (oauthAcc.auth_mode !== 'oauth') throw new Error('OAuth auth_mode wrong')
    if (!oauthAcc.oauth_client_id) throw new Error('OAuth client_id missing')
    console.log('[smoke] oauth fields OK')

    // folder test
    const testAcc = list[0]
    const now = Date.now()
    db.prepare(`INSERT INTO mails (account_id, folder, uid, subject, from_addr, to_addr, date, is_read, has_attachment, snippet, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, '', ?)`)
      .run(testAcc.id, 'inbox', 'uid-inbox-1', 'INBOX mail', 'a@a.com', 'b@b.com', now, now)
    db.prepare(`INSERT INTO mails (account_id, folder, uid, subject, from_addr, to_addr, date, is_read, has_attachment, snippet, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, '', ?)`)
      .run(testAcc.id, 'junk', 'uid-junk-1', 'JUNK mail', 'spam@x.com', 'b@b.com', now, now)

    const inboxMails = mailService.listMails(testAcc.id, { folder: 'inbox' })
    const junkMails = mailService.listMails(testAcc.id, { folder: 'junk' })
    if (inboxMails.length !== 1) throw new Error('inbox filter failed')
    if (junkMails.length !== 1) throw new Error('junk filter failed')
    console.log('[smoke] folder partition OK')

    // group/tag test
    accountService.upsertAccount({ id: list[0].id, group_name: 'work', tags: ['important', 'backup'] })
    accountService.upsertAccount({ id: list[1].id, group_name: 'work', tags: ['backup'] })

    const searched = accountService.listAccounts({ keyword: 'smoke_163' }).items
    if (searched.length !== 1) throw new Error('keyword search failed')
    console.log('[smoke] keyword search OK')

    const byGroup = accountService.listAccounts({ group: 'work' }).items
    if (byGroup.length !== 2) throw new Error('group filter failed: ' + byGroup.length)
    console.log('[smoke] group filter OK')

    const byTag = accountService.listAccounts({ tag: 'important' }).items
    if (byTag.length !== 1) throw new Error('tag filter failed')
    console.log('[smoke] tag filter OK')

    // cleanup
    for (const a of accountService.listAccounts().items) {
      if (a.email.startsWith('smoke_')) accountService.deleteAccount(a.id)
    }
    console.log('[smoke] cleanup done, remaining:', accountService.listAccounts().items.length)
    console.log('[smoke] OK')
    process.exit(0)
  } catch (e) {
    console.error('[smoke] FAIL:', e)
    process.exit(1)
  }
}

run()
