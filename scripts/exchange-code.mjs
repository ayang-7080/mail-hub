// 用 authorization code 换取 refresh_token + access_token
// 用法: node scripts/exchange-code.mjs <code>
//       或 node scripts/exchange-code.mjs <code> <redirect_uri>
//       或 node scripts/exchange-code.mjs <code> <redirect_uri> <client_id>

import https from 'node:https'

const code = process.argv[2]
const redirectUri = process.argv[3] || 'http://localhost:5000'
const clientId = process.argv[4] || '9e5f94bc-e8a4-4e73-b8be-63364c29d753' // Thunderbird
const tenant = 'common'

if (!code) {
  console.error('用法: node scripts/exchange-code.mjs <code> [redirect_uri] [client_id]')
  process.exit(1)
}

const scope = [
  'https://outlook.office.com/IMAP.AccessAsUser.All',
  'https://outlook.office.com/SMTP.Send',
  'offline_access'
].join(' ')

const form = new URLSearchParams({
  client_id: clientId,
  grant_type: 'authorization_code',
  code,
  redirect_uri: redirectUri,
  scope
}).toString()

const req = https.request(
  {
    method: 'POST',
    hostname: 'login.microsoftonline.com',
    path: `/${tenant}/oauth2/v2.0/token`,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(form)
    }
  },
  (res) => {
    const chunks = []
    res.on('data', (c) => chunks.push(c))
    res.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      let json
      try { json = JSON.parse(text) } catch { json = { raw: text } }

      console.log('HTTP', res.statusCode)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log('\n========== 成功 ==========')
        console.log('access_token  (前 40 位):', (json.access_token || '').slice(0, 40) + '...')
        console.log('expires_in    :', json.expires_in, '秒')
        console.log('token_type    :', json.token_type)
        console.log('scope         :', json.scope)
        console.log('\n========== refresh_token(保存这个)==========')
        console.log(json.refresh_token)
        console.log('\n把上面这行完整复制,填进应用的"新增账号 → OAuth"就行。')
      } else {
        console.error('\n========== 失败 ==========')
        console.error(JSON.stringify(json, null, 2))
        console.error('\n常见错误:')
        console.error('  AADSTS70000 / invalid_grant : code 已使用或已过期,重新跑一次授权')
        console.error('  AADSTS50011               : redirect_uri 和申请 code 时不一致')
        console.error('  AADSTS65001               : 需要用户重新同意授权')
      }
    })
  }
)
req.on('error', (e) => {
  console.error('请求失败:', e.message)
  process.exit(1)
})
req.write(form)
req.end()
