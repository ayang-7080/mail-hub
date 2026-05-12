/**
 * 支持的邮箱类型。
 * 后续扩展时在此添加。
 */
export const MAIL_TYPES = ['qq', '163', 'ms']

export const TYPE_LABELS = {
  qq: 'QQ',
  163: '163',
  ms: '微软'
}

/** 根据邮箱后缀猜测类型。 */
export function detectTypeByEmail(email) {
  if (!email) return null
  const lower = String(email).trim().toLowerCase()
  const at = lower.lastIndexOf('@')
  if (at < 0) return null
  const domain = lower.slice(at + 1)

  if (domain === 'qq.com' || domain.endsWith('.qq.com') || domain === 'foxmail.com') {
    return 'qq'
  }
  if (domain === '163.com' || domain === '126.com' || domain === 'yeah.net') {
    return '163'
  }
  if (
    domain === 'outlook.com' ||
    domain === 'hotmail.com' ||
    domain === 'live.com' ||
    domain === 'msn.com' ||
    domain.endsWith('.onmicrosoft.com') ||
    domain === 'outlook.jp'
  ) {
    return 'ms'
  }
  return null
}

/** 每种类型的 IMAP 服务器配置。 */
export const IMAP_CONFIG = {
  qq: { host: 'imap.qq.com', port: 993, secure: true },
  163: { host: 'imap.163.com', port: 993, secure: true },
  ms: { host: 'outlook.office365.com', port: 993, secure: true }
}
