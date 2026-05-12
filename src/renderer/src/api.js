import { ElMessage } from 'element-plus'

function unwrap(promise, { silent = false } = {}) {
  return promise.then((res) => {
    if (res && res.ok) return res.data
    const msg = (res && res.error) || '操作失败'
    if (!silent) ElMessage.error(msg)
    throw new Error(msg)
  })
}

export const api = {
  getMeta: () => unwrap(window.api.getMeta()),
  accounts: {
    list: (filter) => unwrap(window.api.accounts.list(filter)),
    get: (id) => unwrap(window.api.accounts.get(id)),
    upsert: (payload) => unwrap(window.api.accounts.upsert(payload)),
    remove: (id) => unwrap(window.api.accounts.delete(id)),
    test: (id) => unwrap(window.api.accounts.test(id), { silent: true }),
    importBatch: (text, extraMeta) => unwrap(window.api.accounts.importBatch(text, extraMeta)),
    exportAccounts: (filter) => unwrap(window.api.accounts.exportAccounts(filter)),
    importFile: () => unwrap(window.api.accounts.importFile()),
    exportFile: (content) => unwrap(window.api.accounts.exportFile(content)),
    groups: () => unwrap(window.api.accounts.groups()),
    tags: () => unwrap(window.api.accounts.tags()),
    deleteGroup: (name, deleteAccounts) => unwrap(window.api.accounts.deleteGroup(name, deleteAccounts)),
    renameGroup: (oldName, newName) => unwrap(window.api.accounts.renameGroup(oldName, newName)),
    batchSetGroup: (ids, groupName) => unwrap(window.api.accounts.batchSetGroup(ids, groupName)),
    batchTest: (ids) => unwrap(window.api.accounts.batchTest(ids)),
    deleteTag: (name) => unwrap(window.api.accounts.deleteTag(name)),
    renameTag: (oldName, newName) => unwrap(window.api.accounts.renameTag(oldName, newName))
  },
  services: {
    list: () => unwrap(window.api.services.list()),
    create: (name) => unwrap(window.api.services.create(name)),
    remove: (id) => unwrap(window.api.services.delete(id)),
    rename: (id, newName) => unwrap(window.api.services.rename(id, newName)),
    getForAccount: (accountId) => unwrap(window.api.services.getForAccount(accountId)),
    setForAccount: (accountId, serviceIds) => unwrap(window.api.services.setForAccount(accountId, serviceIds)),
    batchGet: (accountIds) => unwrap(window.api.services.batchGet(accountIds))
  },
  mails: {
    sync: (accountId, opts) => unwrap(window.api.mails.sync(accountId, opts)),
    list: (accountId, opts) => unwrap(window.api.mails.list(accountId, opts)),
    content: (mailId) => unwrap(window.api.mails.content(mailId))
  },
  auth: {
    hasPassword: () => unwrap(window.api.auth.hasPassword()),
    verify: (password) => unwrap(window.api.auth.verify(password)),
    setPassword: (oldPw, newPw) => unwrap(window.api.auth.setPassword(oldPw, newPw))
  },
  settings: {
    getSyncInterval: () => unwrap(window.api.settings.getSyncInterval()),
    setSyncInterval: (seconds) => unwrap(window.api.settings.setSyncInterval(seconds))
  }
}
