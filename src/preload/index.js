import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getMeta: () => ipcRenderer.invoke('app:getMeta'),
  accounts: {
    list: (filter) => ipcRenderer.invoke('accounts:list', filter),
    get: (id) => ipcRenderer.invoke('accounts:get', id),
    upsert: (payload) => ipcRenderer.invoke('accounts:upsert', payload),
    delete: (id) => ipcRenderer.invoke('accounts:delete', id),
    test: (id) => ipcRenderer.invoke('accounts:test', id),
    importBatch: (text, extraMeta) => ipcRenderer.invoke('accounts:import', text, extraMeta),
    exportAccounts: (filter) => ipcRenderer.invoke('accounts:export', filter),
    importFile: () => ipcRenderer.invoke('accounts:importFile'),
    exportFile: (content) => ipcRenderer.invoke('accounts:exportFile', content),
    groups: () => ipcRenderer.invoke('accounts:groups'),
    tags: () => ipcRenderer.invoke('accounts:tags'),
    deleteGroup: (name, deleteAccounts) => ipcRenderer.invoke('accounts:deleteGroup', name, deleteAccounts),
    renameGroup: (oldName, newName) => ipcRenderer.invoke('accounts:renameGroup', oldName, newName),
    batchSetGroup: (ids, groupName) => ipcRenderer.invoke('accounts:batchSetGroup', ids, groupName),
    batchTest: (ids) => ipcRenderer.invoke('accounts:batchTest', ids),
    deleteTag: (name) => ipcRenderer.invoke('accounts:deleteTag', name),
    renameTag: (oldName, newName) => ipcRenderer.invoke('accounts:renameTag', oldName, newName)
  },
  services: {
    list: () => ipcRenderer.invoke('services:list'),
    create: (name) => ipcRenderer.invoke('services:create', name),
    delete: (id) => ipcRenderer.invoke('services:delete', id),
    rename: (id, newName) => ipcRenderer.invoke('services:rename', id, newName),
    getForAccount: (accountId) => ipcRenderer.invoke('services:getForAccount', accountId),
    setForAccount: (accountId, serviceIds) => ipcRenderer.invoke('services:setForAccount', accountId, serviceIds),
    batchGet: (accountIds) => ipcRenderer.invoke('services:batchGet', accountIds)
  },
  mails: {
    sync: (accountId, opts) => ipcRenderer.invoke('mails:sync', accountId, opts),
    list: (accountId, opts) => ipcRenderer.invoke('mails:list', accountId, opts),
    content: (mailId) => ipcRenderer.invoke('mails:content', mailId)
  },
  auth: {
    hasPassword: () => ipcRenderer.invoke('auth:hasPassword'),
    verify: (password) => ipcRenderer.invoke('auth:verify', password),
    setPassword: (oldPw, newPw) => ipcRenderer.invoke('auth:setPassword', oldPw, newPw)
  },
  settings: {
    getSyncInterval: () => ipcRenderer.invoke('settings:getSyncInterval'),
    setSyncInterval: (seconds) => ipcRenderer.invoke('settings:setSyncInterval', seconds)
  }
}

contextBridge.exposeInMainWorld('api', api)
