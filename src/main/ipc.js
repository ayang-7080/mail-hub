import { ipcMain } from 'electron'
import * as accountService from './services/accountService.js'
import * as mailService from './services/mailService.js'
import * as serviceService from './services/serviceService.js'
import * as settingsService from './services/settingsService.js'
import { MAIL_TYPES, TYPE_LABELS, OAUTH_DEFAULT_CLIENT_ID, OAUTH_DEFAULT_TENANT } from './providers/index.js'
import { isEncryptionAvailable } from './crypto.js'

/** 将 async handler 统一包装,捕获异常返回 { ok, data?, error? } 结构 */
function wrap(fn) {
  return async (_evt, ...args) => {
    try {
      const data = await fn(...args)
      return { ok: true, data }
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) }
    }
  }
}

export function registerIpc() {
  ipcMain.handle('app:getMeta', wrap(async () => ({
    types: MAIL_TYPES,
    typeLabels: TYPE_LABELS,
    encryption: isEncryptionAvailable(),
    oauthDefaults: {
      clientId: OAUTH_DEFAULT_CLIENT_ID,
      tenant: OAUTH_DEFAULT_TENANT
    }
  })))

  // 账号
  ipcMain.handle('accounts:list', wrap(async (filter) => accountService.listAccounts(filter)))
  ipcMain.handle('accounts:get', wrap(async (id) => accountService.getAccount(id)))
  ipcMain.handle('accounts:upsert', wrap(async (payload) => accountService.upsertAccount(payload)))
  ipcMain.handle('accounts:delete', wrap(async (id) => accountService.deleteAccount(id)))
  ipcMain.handle('accounts:test', wrap(async (id) => accountService.testAccount(id)))
  ipcMain.handle('accounts:import', wrap(async (text, extraMeta) => accountService.importBatch(text, extraMeta)))
  ipcMain.handle('accounts:export', wrap(async (filter) => accountService.exportAccounts(filter)))
  ipcMain.handle('accounts:importFile', wrap(async () => {
    const { dialog } = await import('electron')
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: '选择导入文件',
      filters: [{ name: '文本文件', extensions: ['txt', 'csv'] }, { name: '所有文件', extensions: ['*'] }],
      properties: ['openFile']
    })
    if (canceled || !filePaths.length) return null
    const fs = await import('fs')
    return fs.readFileSync(filePaths[0], 'utf8')
  }))
  ipcMain.handle('accounts:exportFile', wrap(async (content) => {
    const { dialog } = await import('electron')
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '导出账号',
      defaultPath: 'accounts_export.txt',
      filters: [{ name: '文本文件', extensions: ['txt'] }]
    })
    if (canceled || !filePath) return null
    const fs = await import('fs')
    fs.writeFileSync(filePath, content, 'utf8')
    return filePath
  }))
  ipcMain.handle('accounts:groups', wrap(async () => accountService.listGroups()))
  ipcMain.handle('accounts:tags', wrap(async () => accountService.listTags()))
  ipcMain.handle('accounts:deleteGroup', wrap(async (name, deleteAccounts) => accountService.deleteGroup(name, deleteAccounts)))
  ipcMain.handle('accounts:renameGroup', wrap(async (oldName, newName) => accountService.renameGroup(oldName, newName)))
  ipcMain.handle('accounts:batchSetGroup', wrap(async (ids, groupName) => accountService.batchSetGroup(ids, groupName)))
  ipcMain.handle('accounts:batchTest', wrap(async (ids) => {
    const results = []
    for (const id of ids) {
      try {
        const r = await accountService.testAccount(id)
        results.push({ id, ...r })
      } catch (e) {
        results.push({ id, ok: false, error: e.message || String(e) })
      }
    }
    return results
  }))
  ipcMain.handle('accounts:deleteTag', wrap(async (name) => accountService.deleteTag(name)))
  ipcMain.handle('accounts:renameTag', wrap(async (oldName, newName) => accountService.renameTag(oldName, newName)))

  // 已注册服务
  ipcMain.handle('services:list', wrap(async () => serviceService.listServices()))
  ipcMain.handle('services:create', wrap(async (name) => serviceService.createService(name)))
  ipcMain.handle('services:delete', wrap(async (id) => serviceService.deleteService(id)))
  ipcMain.handle('services:rename', wrap(async (id, newName) => serviceService.renameService(id, newName)))
  ipcMain.handle('services:getForAccount', wrap(async (accountId) => serviceService.getAccountServices(accountId)))
  ipcMain.handle('services:setForAccount', wrap(async (accountId, serviceIds) => serviceService.setAccountServices(accountId, serviceIds)))
  ipcMain.handle('services:batchGet', wrap(async (accountIds) => serviceService.batchGetAccountServices(accountIds)))

  // 邮件
  ipcMain.handle('mails:sync', wrap(async (accountId, opts) => mailService.syncInbox(accountId, opts)))
  ipcMain.handle('mails:list', wrap(async (accountId, opts) => mailService.listMails(accountId, opts)))
  ipcMain.handle('mails:content', wrap(async (mailId) => mailService.getMailContent(mailId)))

  // 管理员密码
  ipcMain.handle('auth:hasPassword', wrap(async () => settingsService.hasPassword()))
  ipcMain.handle('auth:verify', wrap(async (password) => settingsService.verifyPassword(password)))
  ipcMain.handle('auth:setPassword', wrap(async (oldPw, newPw) => settingsService.setPassword(oldPw, newPw)))

  // 设置
  ipcMain.handle('settings:getSyncInterval', wrap(async () => settingsService.getSyncInterval()))
  ipcMain.handle('settings:setSyncInterval', wrap(async (seconds) => settingsService.setSyncInterval(seconds)))
}
