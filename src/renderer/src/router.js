import { createRouter, createWebHashHistory } from 'vue-router'
import Accounts from './views/Accounts.vue'
import Inbox from './views/Inbox.vue'
import Services from './views/Services.vue'
import Lock from './views/Lock.vue'
import Settings from './views/Settings.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/lock', name: 'lock', component: Lock, meta: { noAuth: true } },
    { path: '/', redirect: '/accounts' },
    { path: '/accounts', name: 'accounts', component: Accounts },
    { path: '/inbox/:id?', name: 'inbox', component: Inbox, props: true },
    { path: '/services', name: 'services', component: Services },
    { path: '/settings', name: 'settings', component: Settings },
    { path: '/workspace/:id', name: 'workspace', component: () => import('./views/Workspace.vue'), props: true }
  ]
})

// 路由守卫:检查是否需要解锁
let authChecked = false
let needsAuth = false

router.beforeEach(async (to) => {
  if (to.meta.noAuth) return true

  if (!authChecked) {
    try {
      const res = await window.api.auth.hasPassword()
      needsAuth = (res && res.ok && res.data === true)
    } catch {
      needsAuth = false
    }
    authChecked = true
  }

  if (needsAuth && sessionStorage.getItem('unlocked') !== '1') {
    return { name: 'lock' }
  }
  return true
})

export default router
