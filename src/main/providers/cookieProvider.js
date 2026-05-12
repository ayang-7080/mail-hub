/**
 * Cookie / Token 方案占位 provider。
 * 后续会针对 QQ / 163 / 微软网页接口实现抓取。
 * 当前仅保留统一入口,任何调用都会抛出"未实现"错误。
 */

export async function testConnection(account, cookie) {
  return { ok: false, error: 'Cookie 方案尚未实现,仅保存账号' }
}

export async function fetchInbox(account, cookie, opts) {
  throw new Error(`Cookie 方案(${account.type})的收件箱抓取尚未实现`)
}

export async function fetchMailContent(account, cookie, uid, opts) {
  throw new Error(`Cookie 方案(${account.type})的正文抓取尚未实现`)
}
