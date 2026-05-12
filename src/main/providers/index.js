import * as imapProvider from './imapProvider.js'
import * as cookieProvider from './cookieProvider.js'

export function getProvider(authMode) {
  if (authMode === 'imap' || authMode === 'oauth') return imapProvider
  if (authMode === 'cookie') return cookieProvider
  throw new Error(`未知的 auth_mode: ${authMode}`)
}

export { MAIL_TYPES, TYPE_LABELS, detectTypeByEmail, IMAP_CONFIG } from './types.js'
export { DEFAULT_CLIENT_ID as OAUTH_DEFAULT_CLIENT_ID, DEFAULT_TENANT as OAUTH_DEFAULT_TENANT } from './msOAuth.js'
