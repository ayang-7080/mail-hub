<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { api } from '../api.js'

const route = useRoute()
const router = useRouter()

const accounts = ref([])
const meta = ref({ types: [], typeLabels: {} })
const currentId = ref(null)
const currentFolder = ref('inbox')
const currentAccount = computed(() => accounts.value.find((a) => a.id === currentId.value))

const mails = ref([])
const loadingList = ref(false)
const syncing = ref(false)

const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref(null)
const viewMode = ref('html')

async function loadAccounts() {
  const res = await api.accounts.list({})
  accounts.value = res.items || res
  const fromRoute = Number(route.params.id)
  if (fromRoute && accounts.value.some((a) => a.id === fromRoute)) {
    currentId.value = fromRoute
  } else if (accounts.value.length && !currentId.value) {
    currentId.value = accounts.value[0].id
  }
}

async function loadMails() {
  if (!currentId.value) {
    mails.value = []
    return
  }
  loadingList.value = true
  try {
    mails.value = await api.mails.list(currentId.value, { limit: 200, folder: currentFolder.value })
  } finally {
    loadingList.value = false
  }
}

async function syncNow() {
  if (!currentId.value) return
  syncing.value = true
  try {
    const r = await api.mails.sync(currentId.value, { limit: 50, folder: currentFolder.value })
    ElMessage.success(`已同步 ${r.count} 封(${currentFolder.value === 'junk' ? '垃圾邮件' : '收件箱'})`)
    await loadMails()
    await loadAccounts()
  } catch {} finally {
    syncing.value = false
  }
}

async function openMail(row) {
  detailVisible.value = true
  detail.value = null
  detailLoading.value = true
  try {
    detail.value = await api.mails.content(row.id)
    viewMode.value = detail.value.content.html ? 'html' : 'text'
  } catch {
    detailVisible.value = false
  } finally {
    detailLoading.value = false
  }
}

function formatDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleString()
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => {
    ElMessage.success('已复制')
  }).catch(() => {
    ElMessage.error('复制失败')
  })
}

function onSwitchAccount(id) {
  currentId.value = id
  router.replace({ name: 'inbox', params: { id } })
}

function onSwitchFolder(f) {
  currentFolder.value = f
}

watch(currentId, () => {
  loadMails()
})
watch(currentFolder, () => {
  loadMails()
})

onMounted(async () => {
  meta.value = await api.getMeta()
  await loadAccounts()
  await loadMails()
})
</script>

<template>
  <el-container style="height: 100%">
    <!-- 账号侧栏 -->
    <el-aside width="260px" style="border-right: 1px solid #e5e7eb; background: #fff">
      <div style="padding: 12px; border-bottom: 1px solid #eee; font-weight: 600">
        账号({{ accounts.length }})
      </div>
      <el-scrollbar style="height: calc(100vh - 48px)">
        <div
          v-for="a in accounts"
          :key="a.id"
          @click="onSwitchAccount(a.id)"
          class="account-item"
          :class="{ active: a.id === currentId }"
        >
          <div style="display: flex; justify-content: space-between; align-items: center">
            <el-tag :class="'tag-type-' + a.type" size="small" disable-transitions>
              {{ meta.typeLabels[a.type] || a.type }}
            </el-tag>
            <div>
              <el-tag v-if="a.auth_mode === 'oauth'" type="success" size="small" effect="plain" style="margin-right: 4px">
                OAuth
              </el-tag>
              <el-tag v-if="a.status === 'error'" type="danger" size="small">异常</el-tag>
            </div>
          </div>
          <div style="margin-top: 4px; font-size: 13px; font-weight: 500">{{ a.email }}</div>
          <div v-if="a.name && a.name !== a.email" style="color: #8c8c8c; font-size: 12px">{{ a.name }}</div>
        </div>
        <el-empty v-if="!accounts.length" description="暂无账号,请先在账号管理添加" />
      </el-scrollbar>
    </el-aside>

    <!-- 收件箱主区 -->
    <el-container>
      <el-header
        style="background: #fff; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: space-between"
      >
        <div style="display: flex; align-items: center; gap: 16px">
          <span style="font-size: 16px; font-weight: 600; cursor: pointer" v-if="currentAccount" @click="copyText(currentAccount.email)" title="点击复制">
            {{ currentAccount.email }}
            <el-icon style="margin-left: 4px; color: #909399; vertical-align: -2px"><CopyDocument /></el-icon>
          </span>
          <span v-else style="color: #909399">未选择账号</span>
          <el-radio-group
            v-model="currentFolder"
            size="default"
            :disabled="!currentId"
          >
            <el-radio-button value="inbox">
              <el-icon style="vertical-align: -2px"><Message /></el-icon>
              <span style="margin-left: 4px">收件箱</span>
            </el-radio-button>
            <el-radio-button value="junk">
              <el-icon style="vertical-align: -2px"><DeleteFilled /></el-icon>
              <span style="margin-left: 4px">垃圾邮件</span>
            </el-radio-button>
          </el-radio-group>
        </div>
        <el-button
          type="primary"
          :loading="syncing"
          :disabled="!currentId"
          @click="syncNow"
        >
          <el-icon><Refresh /></el-icon>
          <span style="margin-left: 4px">同步{{ currentFolder === 'junk' ? '垃圾邮件' : '收件箱' }}</span>
        </el-button>
      </el-header>

      <el-main style="padding: 0">
        <el-table
          :data="mails"
          v-loading="loadingList"
          stripe
          height="calc(100vh - 60px)"
          @row-click="openMail"
          style="cursor: pointer"
          :empty-text="currentId ? `${currentFolder === 'junk' ? '垃圾邮件' : '收件箱'}为空,点击右上角同步` : '请选择账号'"
        >
          <el-table-column width="40">
            <template #default="{ row }">
              <el-icon v-if="row.has_attachment" color="#909399"><Paperclip /></el-icon>
            </template>
          </el-table-column>
          <el-table-column label="发件人" min-width="200">
            <template #default="{ row }">
              <span :style="{ fontWeight: row.is_read ? 400 : 600 }">{{ row.from_addr || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="主题" min-width="400">
            <template #default="{ row }">
              <span :style="{ fontWeight: row.is_read ? 400 : 600 }">{{ row.subject || '(无主题)' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="时间" width="180">
            <template #default="{ row }">{{ formatDate(row.date) }}</template>
          </el-table-column>
        </el-table>
      </el-main>
    </el-container>

    <!-- 邮件详情 -->
    <el-drawer v-model="detailVisible" size="60%" direction="rtl">
      <template #header>
        <div v-if="detail">
          <div style="font-size: 16px; font-weight: 600">{{ detail.mail.subject || '(无主题)' }}</div>
          <div style="margin-top: 6px; color: #606266; font-size: 13px">
            <div>发件人:{{ detail.mail.from_addr }}</div>
            <div>时间:{{ formatDate(detail.mail.date) }}</div>
          </div>
        </div>
      </template>
      <div v-loading="detailLoading" style="min-height: 200px">
        <div v-if="detail" style="margin-bottom: 8px">
          <el-radio-group v-model="viewMode" size="small">
            <el-radio-button value="html" :disabled="!detail.content.html">HTML</el-radio-button>
            <el-radio-button value="text" :disabled="!detail.content.text">纯文本</el-radio-button>
          </el-radio-group>
        </div>
        <div v-if="detail && viewMode === 'html'" class="mail-html-body" v-html="detail.content.html" />
        <pre v-else-if="detail && viewMode === 'text'" style="white-space: pre-wrap; word-break: break-word">{{ detail.content.text }}</pre>
      </div>
    </el-drawer>
  </el-container>
</template>

<style scoped>
.account-item {
  padding: 10px 12px;
  border-bottom: 1px solid #f1f2f4;
  cursor: pointer;
  transition: background 0.1s;
}
.account-item:hover { background: #f5f7fa; }
.account-item.active { background: #ecf5ff; }
</style>
