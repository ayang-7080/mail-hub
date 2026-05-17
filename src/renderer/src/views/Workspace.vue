<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { api } from '../api.js'

const route = useRoute()
const router = useRouter()
const accountId = computed(() => Number(route.params.id))

const account = ref(null)
const mails = ref([])
const allServices = ref([])
const checkedServices = ref([])
const groupsList = ref([])
const loading = ref(false)
const syncing = ref(false)
const autoSync = ref(true)
const syncInterval = ref(30) // 秒
const lastSyncTime = ref(null)
const newMailCount = ref(0)

// 可编辑字段
const editingFields = ref({
  group_name: '',
  name: '',
  at_token: '',
  rt_token: '',
  payurl: ''
})
const fieldSaving = ref(false)

// 邮件详情
const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref(null)
const viewMode = ref('html')

let timer = null
let destroyed = false

async function loadAccount() {
  const res = await api.accounts.list({})
  const list = res.items || res
  account.value = list.find((a) => a.id === accountId.value) || null
  if (account.value) {
    editingFields.value = {
      group_name: account.value.group_name || '',
      name: account.value.name || '',
      at_token: account.value.at_token || '',
      rt_token: account.value.rt_token || '',
      payurl: account.value.payurl || ''
    }
  }
}

async function loadGroups() {
  groupsList.value = await api.accounts.groups()
}

async function saveFields() {
  fieldSaving.value = true
  try {
    await api.accounts.upsert({
      id: accountId.value,
      ...JSON.parse(JSON.stringify(editingFields.value))
    })
    ElMessage.success('已保存')
    await loadAccount()
    await loadGroups()
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  } finally {
    fieldSaving.value = false
  }
}

async function loadServices() {
  allServices.value = await api.services.list()
  checkedServices.value = await api.services.getForAccount(accountId.value)
}

async function syncNow(silent = false) {
  if (syncing.value || destroyed) return
  syncing.value = true
  try {
    const prevCount = mails.value.length
    await api.mails.sync(accountId.value, { limit: 50, folder: 'inbox' })
    if (destroyed) return
    mails.value = await api.mails.list(accountId.value, { limit: 200, folder: 'inbox' })
    if (destroyed) return
    lastSyncTime.value = new Date()
    const diff = mails.value.length - prevCount
    if (diff > 0 && prevCount > 0) {
      newMailCount.value += diff
      if (!silent) ElMessage.success(`收到 ${diff} 封新邮件`)
    }
  } catch (e) {
    // 离开页面后不弹任何错误
    if (destroyed) return
    if (!silent) ElMessage.error('同步失败: ' + (e.message || e))
    // 如果是账号不存在,停止自动同步
    if (e.message && e.message.includes('不存在')) {
      autoSync.value = false
      stopAutoSync()
    }
  } finally {
    syncing.value = false
  }
}

async function loadMails() {
  loading.value = true
  try {
    mails.value = await api.mails.list(accountId.value, { limit: 200, folder: 'inbox' })
  } finally {
    loading.value = false
  }
}

async function toggleService(serviceId, checked) {
  if (checked) {
    if (!checkedServices.value.includes(serviceId)) {
      checkedServices.value.push(serviceId)
    }
  } else {
    checkedServices.value = checkedServices.value.filter((id) => id !== serviceId)
  }
  await api.services.setForAccount(accountId.value, [...checkedServices.value])
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

function startAutoSync() {
  stopAutoSync()
  if (autoSync.value && !destroyed) {
    timer = setInterval(() => {
      if (!destroyed) syncNow(true)
    }, syncInterval.value * 1000)
  }
}

function stopAutoSync() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function formatDate(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleString()
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => {
    ElMessage.success('已复制')
  }).catch(() => {
    ElMessage.error('复制失败')
  })
}

function goBack() {
  const fromGroup = route.query.from_group
  router.push({
    name: 'accounts',
    query: fromGroup != null ? { group: fromGroup } : {}
  })
}

onMounted(async () => {
  await loadAccount()
  if (!account.value) {
    ElMessage.error('账号不存在')
    goBack()
    return
  }
  // 从设置读取刷新间隔
  try {
    const interval = await api.settings.getSyncInterval()
    if (interval >= 3) syncInterval.value = interval
  } catch {}
  await Promise.all([loadServices(), loadMails(), loadGroups()])
  await syncNow(true)
  startAutoSync()
})

onUnmounted(() => {
  destroyed = true
  stopAutoSync()
})
</script>

<template>
  <el-container style="height: 100%">
    <!-- 左侧:邮件列表 -->
    <el-container style="flex: 1">
      <el-header style="background: #fff; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: space-between; height: 56px">
        <div style="display: flex; align-items: center; gap: 12px">
          <el-button @click="goBack" :icon="'ArrowLeft'" circle size="small" />
          <div v-if="account">
            <span style="font-size: 16px; font-weight: 600; cursor: pointer" @click="copyText(account.email)" title="点击复制">
              {{ account.email }}
              <el-icon style="margin-left: 4px; color: #909399; vertical-align: -2px"><CopyDocument /></el-icon>
            </span>
            <el-tag :class="'tag-type-' + account.type" size="small" style="margin-left: 8px">
              {{ account.type === 'ms' ? '微软' : account.type === 'qq' ? 'QQ' : '163' }}
            </el-tag>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 12px">
          <el-tag v-if="newMailCount > 0" type="danger" effect="dark" size="small">
            +{{ newMailCount }} 新邮件
          </el-tag>
          <span v-if="lastSyncTime" style="color: #909399; font-size: 12px">
            上次同步: {{ lastSyncTime.toLocaleTimeString() }}
          </span>
          <el-switch v-model="autoSync" active-text="自动" @change="autoSync ? startAutoSync() : stopAutoSync()" />
          <el-input-number v-model="syncInterval" :min="3" :max="600" :step="5" size="small" style="width: 100px" @change="startAutoSync" />
          <span style="color: #909399; font-size: 12px">秒</span>
          <el-button type="primary" :loading="syncing" @click="syncNow(false)">
            <el-icon><Refresh /></el-icon>
            <span style="margin-left: 4px">立即同步</span>
          </el-button>
        </div>
      </el-header>

      <el-main style="padding: 0">
        <el-table
          :data="mails"
          v-loading="loading"
          stripe
          height="calc(100vh - 56px)"
          @row-click="openMail"
          style="cursor: pointer"
          :empty-text="'收件箱为空'"
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

    <!-- 右侧:邮箱信息编辑 + 已注册服务快速勾选 -->
    <el-aside width="320px" style="background: #fff; border-left: 1px solid #e5e7eb">
      <el-scrollbar style="height: 100vh">
        <!-- 邮箱信息编辑 -->
        <div style="padding: 14px 16px; border-bottom: 1px solid #eee; font-weight: 600; font-size: 14px">
          邮箱信息
        </div>
        <div style="padding: 12px 16px; border-bottom: 1px solid #eee">
          <el-form label-position="top" size="small">
            <el-form-item label="备注名">
              <el-input v-model="editingFields.name" placeholder="选填" />
            </el-form-item>
            <el-form-item label="分组">
              <el-select
                v-model="editingFields.group_name"
                filterable allow-create clearable
                placeholder="选择或新建"
                style="width: 100%"
              >
                <el-option v-for="g in groupsList" :key="g.name" :label="g.name" :value="g.name" />
              </el-select>
            </el-form-item>
            <el-form-item label="at_token">
              <el-input v-model="editingFields.at_token" type="textarea" :rows="2" placeholder="JSON 格式" />
            </el-form-item>
            <el-form-item label="rt_token">
              <el-input v-model="editingFields.rt_token" type="textarea" :rows="2" placeholder="JSON 格式" />
            </el-form-item>
            <el-form-item label="payurl">
              <el-input v-model="editingFields.payurl" type="textarea" :rows="2" placeholder="支付链接(长文本)" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="fieldSaving" @click="saveFields" style="width: 100%">保存</el-button>
            </el-form-item>
          </el-form>
        </div>

        <!-- 已注册服务 -->
        <div style="padding: 14px 16px; border-bottom: 1px solid #eee; font-weight: 600; font-size: 14px">
          已注册服务
        </div>
        <div style="padding: 12px 16px">
          <div v-for="s in allServices" :key="s.id" style="margin-bottom: 8px">
            <el-checkbox
              :model-value="checkedServices.includes(s.id)"
              @change="(val) => toggleService(s.id, val)"
              :label="s.name"
            />
          </div>
          <div v-if="!allServices.length" style="color: #909399; font-size: 12px">
            暂无服务,请先在「注册服务」页面添加
          </div>
        </div>
      </el-scrollbar>
    </el-aside>

    <!-- 邮件详情 -->
    <el-drawer v-model="detailVisible" size="55%" direction="rtl">
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
