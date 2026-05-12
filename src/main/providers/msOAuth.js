import { net } from 'electron'
import { encryptString } from '../crypto.js'
import { getDb } from '../db.js'

/**
 * 微软 OAuth2 支持。
 * 使用 refresh_token 换取 access_token,之后通过 XOAUTH2 接入 IMAP。
 *
 * 参考:
 *   https://learn.microsoft.com/en-us/exchange/client-developer/legacy-protocols/how-to-authenticate-an-imap-pop-smtp-application-by-using-oauth
 */

export const DEFAULT_CLIENT_ID = '9e5f94bc-e8a4-4e73-b8be-63364c29d753' // Thunderbird
export const DEFAULT_TENANT = 'common'

// 内存缓存:accountId -> { accessToken, expiresAt }
const tokenCache = new Map()

function tokenEndpoint(tenant) {
  const t = tenant || DEFAULT_TENANT
  return `https://login.microsoftonline.com/${encodeURIComponent(t)}/oauth2/v2.0/token`
}

/**
 * 通过 electron 的 net 模块发起 POST(避免额外依赖)。
 */
function httpPostForm(url, form) {
  return new Promise((resolve, reject) => {
    const body = Object.entries(form)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')
    const req = net.request({ method: 'POST', url })
    req.setHeader('Content-Type', 'application/x-www-form-urlencoded')
    let chunks = []
    req.on('response', (res) => {
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json
        try { json = JSON.parse(text) } catch { json = { raw: text } }
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(json)
        else reject(new Error(`OAuth token endpoint ${res.statusCode}: ${json.error_description || json.error || text}`))
      })
      res.on('error', reject)
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

/**
 * 用 refresh_token 换 access_token。
 * 如果响应里包含新的 refresh_token(微软有时会轮换),调用方需要持久化。
 */
export async function refreshAccessToken({ clientId, tenant, refreshToken }) {
  const scope = [
    'https://outlook.office.com/IMAP.AccessAsUser.All',
    'offline_access'
  ].join(' ')

  const res = await httpPostForm(tokenEndpoint(tenant), {
    client_id: clientId || DEFAULT_CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope
  })

  if (!res.access_token) {
    throw new Error('OAuth 响应缺少 access_token: ' + JSON.stringify(res))
  }
  return {
    accessToken: res.access_token,
    expiresIn: Number(res.expires_in) || 3600,
    newRefreshToken: res.refresh_token && res.refresh_token !== refreshToken ? res.refresh_token : null
  }
}

/**
 * 取一个可用的 access_token(缓存命中则返回内存值,否则刷新)。
 * accountRow: 完整的数据库行(含解密后的 password/refresh_token)。
 */
export async function getAccessToken(account, refreshToken) {
  const cached = tokenCache.get(account.id)
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.accessToken
  }

  const { accessToken, expiresIn, newRefreshToken } = await refreshAccessToken({
    clientId: account.oauth_client_id || DEFAULT_CLIENT_ID,
    tenant: account.oauth_tenant || DEFAULT_TENANT,
    refreshToken
  })

  tokenCache.set(account.id, {
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000
  })

  // 微软有时会轮换 refresh_token,落库
  if (newRefreshToken) {
    const db = getDb()
    db.prepare('UPDATE accounts SET password_enc = ?, updated_at = ? WHERE id = ?')
      .run(encryptString(newRefreshToken), Date.now(), account.id)
  }

  return accessToken
}

export function clearToken(accountId) {
  tokenCache.delete(accountId)
}
