<script setup>
import { ref, onMounted, reactive, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api.js'

const router = useRouter()
const route = useRoute()
const accounts = ref([])
const groups = ref([])
const tagsAll = ref([])
const allServices = ref([])
const accountServicesMap = ref({})
const meta = ref({ types: [], typeLabels: {}, encryption: true, oauthDefaults: { clientId: '', tenant: 'common' } })
const loading = ref(false)
const total = ref(0)
const totalCount = ref(0)
const currentPage = ref(1)
const pageSize = ref(50)
const hideEmail = ref(false)

function maskEmail(email) {
  if (!hideEmail.value) return email
  if (!email) return email
  const at = email.indexOf('@')
  if (at < 0) return email
  const name = email.slice(0, at)
  const domain = email.slice(at)
  if (name.length <= 2) return name[0] + '*' + domain
  if (name.length <= 4) return name[0] + '***' + name[name.length - 1] + domain
  return name.slice(0, 2) + '***' + name.slice(-2) + domain
}

// ---------- 批量操作 ----------
const selectedRows = ref([])
const batchTesting = ref(false)
const batchGroupVisible = ref(false)
const batchGroupName = ref('')

function onSelectionChange(rows) {
  selectedRows.value = rows
}

async function batchSetGroup() {
  if (!selectedRows.value.length) return
  const ids = selectedRows.value.map((r) => r.id)
  try {
    await api.accounts.batchSetGroup(ids, batchGroupName.value)
    ElMessage.success(`已为 ${ids.length} 个账号设置分组`)
    batchGroupVisible.value = false
    batchGroupName.value = ''
    await loadAll()
  } catch (e) {
    console.error(e)
  }
}

async function batchTest() {
  if (!selectedRows.value.length) return
  const ids = selectedRows.value.map((r) => r.id)
  batchTesting.value = true
  try {
    const results = await api.accounts.batchTest(ids)
    const ok = results.filter((r) => r.ok).length
    const fail = results.length - ok
    ElMessage[fail ? 'warning' : 'success'](`测试完成:成功 ${ok},失败 ${fail}`)
    await load()
  } catch (e) {
    console.error(e)
  } finally {
    batchTesting.value = false
  }
}

const typeOptions = computed(() =>
  (meta.value.types || []).map((t) => ({ label: meta.value.typeLabels[t] || t, value: t }))
)

// ---------- 过滤 ----------
const filter = reactive({
  keyword: '',
  group: '',
  tag: '',
  type: '',
  auth_mode: '',
  sort: 'id_desc'
})

// ---------- 编辑弹窗 ----------
const editVisible = ref(false)
const editForm = reactive({
  id: null,
  name: '',
  email: '',
  type: '',
  auth_mode: 'imap',
  password: '',
  cookie: '',
  oauth_client_id: '',
  oauth_tenant: '',
  group_name: '',
  tags: [],
  service_ids: []
})
function resetForm() {
  Object.assign(editForm, {
    id: null, name: '', email: '', type: '', auth_mode: 'imap',
    password: '', cookie: '',
    oauth_client_id: meta.value.oauthDefaults?.clientId || '',
    oauth_tenant: meta.value.oauthDefaults?.tenant || 'common',
    group_name: '',
    tags: [],
    service_ids: []
  })
}
function openCreate() {
  resetForm()
  editVisible.value = true
}
async function openEdit(row) {
  resetForm()
  editForm.id = row.id
  editForm.name = row.name
  editForm.email = row.email
  editForm.type = row.type
  editForm.auth_mode = row.auth_mode
  editForm.oauth_client_id = row.oauth_client_id || meta.value.oauthDefaults?.clientId || ''
  editForm.oauth_tenant = row.oauth_tenant || meta.value.oauthDefaults?.tenant || 'common'
  editForm.group_name = row.group_name || ''
  editForm.tags = Array.isArray(row.tags) ? [...row.tags] : []
  editForm.password = ''
  editForm.cookie = ''
  // 加载该账号已勾选的服务
  try {
    editForm.service_ids = await api.services.getForAccount(row.id)
  } catch { editForm.service_ids = [] }
  editVisible.value = true
}
async function saveAccount() {
  try {
    const payload = JSON.parse(JSON.stringify(editForm))
    const serviceIds = payload.service_ids || []
    delete payload.service_ids
    if (payload.id) {
      if (payload.password === '') delete payload.password
      if (payload.cookie === '') delete payload.cookie
    }
    const id = await api.accounts.upsert(payload)
    // 保存已注册服务关联
    const accountId = payload.id || id
    if (accountId && serviceIds) {
      await api.services.setForAccount(accountId, serviceIds)
    }
    ElMessage.success(editForm.id ? '已更新' : '已添加')
    editVisible.value = false
    await loadAll()
  } catch (e) {
    console.error('[saveAccount]', e)
  }
}

// ---------- 批量导入 ----------
const importVisible = ref(false)
const importText = ref('')
const importGroup = ref('')
const importTags = ref([])
const importResults = ref([])
async function runImport() {
  try {
    const extraMeta = {
      group_name: importGroup.value || undefined,
      tags: importTags.value.length ? [...importTags.value] : undefined
    }
    const res = await api.accounts.importBatch(importText.value, extraMeta)
    importResults.value = res
    const ok = res.filter((r) => r.ok).length
    ElMessage.success(`导入完成:成功 ${ok} / 共 ${res.length}`)
    await loadAll()
  } catch (e) {
    console.error('[runImport]', e)
  }
}

async function importFromFile() {
  try {
    const content = await api.accounts.importFile()
    if (content === null) return // 用户取消
    importText.value = content
    ElMessage.success('文件已读取,请确认后点击"开始导入"')
  } catch (e) {
    console.error(e)
  }
}

async function exportAccounts() {
  exportVisible.value = true
}

const exportVisible = ref(false)
const exportOpts = reactive({
  scope: 'current',   // current(当前筛选) | all | group
  group: '',
  limit: 0,           // 0 = 全部
  format: 'standard'  // standard | email_only | email_password
})

async function doExport() {
  try {
    let exportFilter = {}
    if (exportOpts.scope === 'current') {
      exportFilter = JSON.parse(JSON.stringify(filter))
    } else if (exportOpts.scope === 'group') {
      exportFilter = { group: exportOpts.group }
    }
    // scope === 'all' 时 exportFilter 为空,导出全部

    const content = await api.accounts.exportAccounts({
      ...exportFilter,
      exportLimit: exportOpts.limit || 0,
      exportFormat: exportOpts.format
    })
    if (!content) return ElMessage.warning('没有可导出的账号')
    const path = await api.accounts.exportFile(content)
    if (path) {
      ElMessage.success(`已导出到: ${path}`)
      exportVisible.value = false
    }
  } catch (e) {
    console.error(e)
  }
}

// ---------- 列表操作 ----------
async function load() {
  loading.value = true
  try {
    const res = await api.accounts.list(JSON.parse(JSON.stringify({
      ...filter,
      page: currentPage.value,
      pageSize: pageSize.value
    })))
    accounts.value = res?.items || []
    total.value = res?.total || 0
  } catch (e) {
    console.error('[load accounts]', e)
    accounts.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
  await loadServiceMap()
}
async function loadGroupsAndTags() {
  try {
    const [g, t, s, allRes] = await Promise.all([
      api.accounts.groups(),
      api.accounts.tags(),
      api.services.list(),
      api.accounts.list({ pageSize: 1 })
    ])
    groups.value = g || []
    tagsAll.value = t || []
    allServices.value = s || []
    totalCount.value = allRes?.total || 0
  } catch (e) {
    console.error('[loadGroupsAndTags]', e)
  }
}
async function loadServiceMap() {
  const ids = accounts.value.map((a) => a.id)
  if (ids.length) {
    accountServicesMap.value = await api.services.batchGet(ids)
  } else {
    accountServicesMap.value = {}
  }
}
async function loadAll() {
  await Promise.all([load(), loadGroupsAndTags()])
  await loadServiceMap()
}

// 关键词搜索有节流感更自然,这里直接 watch
let searchTimer = null
watch(() => filter.keyword, () => {
  clearTimeout(searchTimer)
  currentPage.value = 1
  searchTimer = setTimeout(load, 200)
})
watch(() => [filter.group, filter.tag, filter.type, filter.auth_mode, filter.sort], () => {
  currentPage.value = 1
  load()
})
watch([currentPage, pageSize], load)

async function testRow(row) {
  row._testing = true
  try {
    const r = await api.accounts.test(row.id)
    if (r.ok) ElMessage.success(`${row.email} 连接成功`)
    else ElMessage.error(`${row.email}: ${r.error}`)
    await load()
  } finally {
    row._testing = false
  }
}

async function removeRow(row) {
  try {
    await ElMessageBox.confirm(`确定删除账号 ${row.email} ?`, '提示', { type: 'warning' })
  } catch { return }
  await api.accounts.remove(row.id)
  ElMessage.success('已删除')
  await loadAll()
}

function openInbox(row) {
  router.push({ name: 'inbox', params: { id: row.id } })
}

function openWorkspace(row) {
  router.push({
    name: 'workspace',
    params: { id: row.id },
    query: { from_group: filter.group || '' }
  })
}

function statusTag(s) {
  if (s === 'ok') return { type: 'success', text: '正常' }
  if (s === 'error') return { type: 'danger', text: '异常' }
  return { type: 'info', text: '未测试' }
}

function formatDate(ts) {
  if (!ts) return '-'
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => {
    ElMessage.success('已复制')
  }).catch(() => {
    ElMessage.error('复制失败')
  })
}

function resetFilter() {
  filter.keyword = ''
  filter.group = ''
  filter.tag = ''
  filter.type = ''
  filter.auth_mode = ''
  filter.sort = 'id_desc'
}

async function deleteGroup(name) {
  try {
    const action = await ElMessageBox.confirm(
      `删除分组「${name}」时,该分组下的邮箱如何处理？`,
      '删除分组',
      {
        distinguishCancelAndClose: true,
        confirmButtonText: '仅删除分组(邮箱移到未分组)',
        cancelButtonText: '同时删除邮箱',
        type: 'warning'
      }
    )
    // confirm = 仅删除分组
    await api.accounts.deleteGroup(name, false)
  } catch (action) {
    if (action === 'cancel') {
      // 用户选了"同时删除邮箱"
      try {
        await ElMessageBox.confirm(
          `⚠️ 确认要永久删除分组「${name}」下的所有邮箱吗？此操作不可恢复！`,
          '二次确认', { type: 'error', confirmButtonText: '确认删除', cancelButtonText: '取消' }
        )
        await api.accounts.deleteGroup(name, true)
      } catch { return }
    } else {
      return // close
    }
  }
  if (filter.group === name) filter.group = ''
  ElMessage.success('已删除')
  await loadAll()
}

async function renameGroupAction(name) {
  try {
    const { value } = await ElMessageBox.prompt('新分组名', '重命名分组', {
      inputValue: name,
      confirmButtonText: '确定',
      cancelButtonText: '取消'
    })
    if (!value || !value.trim() || value.trim() === name) return
    await api.accounts.renameGroup(name, value.trim())
    if (filter.group === name) filter.group = value.trim()
    ElMessage.success('已重命名')
    await loadAll()
  } catch {}
}

async function deleteTagAction(name) {
  try {
    await ElMessageBox.confirm(
      `确定删除标签「${name}」？将从所有邮箱中移除该标签。`,
      '删除标签', { type: 'warning' }
    )
  } catch { return }
  await api.accounts.deleteTag(name)
  if (filter.tag === name) filter.tag = ''
  ElMessage.success('标签已删除')
  await loadAll()
}

function getServiceNames(accountId) {
  const ids = accountServicesMap.value[accountId] || []
  return ids.map((id) => {
    const s = allServices.value.find((sv) => sv.id === id)
    return s ? s.name : ''
  }).filter(Boolean)
}

onMounted(async () => {
  meta.value = await api.getMeta()
  // 从 query 恢复分组(从工作台返回时)
  if (route.query.group != null) {
    filter.group = String(route.query.group)
  }
  await loadAll()
  if (!meta.value.encryption) {
    ElMessage.warning('当前系统未启用加密存储,密码将以明文保存,请谨慎使用')
  }
})
</script>

<template>
  <el-container style="height: 100%">
    <!-- 左侧分组/标签筛选 -->
    <el-aside width="220px" style="background: #fff; border-right: 1px solid #e5e7eb">
      <div style="padding: 12px; border-bottom: 1px solid #eee; font-weight: 600">分组</div>
      <el-scrollbar style="max-height: 40vh">
        <div
          class="side-item" :class="{ active: filter.group === '' }"
          @click="filter.group = ''"
        >
          全部 <span class="count">{{ totalCount }}</span>
        </div>
        <div
          class="side-item" :class="{ active: filter.group === '__none__' }"
          @click="filter.group = '__none__'"
        >
          未分组
        </div>
        <div
          v-for="g in groups" :key="g.name"
          class="side-item" :class="{ active: filter.group === g.name }"
          @click="filter.group = g.name"
        >
          <span>{{ g.name }} <span class="count">{{ g.count }}</span></span>
          <span class="side-actions">
            <el-icon class="action-icon" @click.stop="renameGroupAction(g.name)"><Edit /></el-icon>
            <el-icon class="action-icon del" @click.stop="deleteGroup(g.name)"><Close /></el-icon>
          </span>
        </div>
      </el-scrollbar>

      <div style="padding: 12px; border-top: 1px solid #eee; border-bottom: 1px solid #eee; font-weight: 600">标签</div>
      <el-scrollbar style="max-height: 40vh">
        <div style="padding: 8px 12px">
          <el-tag
            v-if="filter.tag"
            closable type="primary" @close="filter.tag = ''"
            style="margin-bottom: 6px"
          >筛选中: {{ filter.tag }}</el-tag>
          <div>
            <el-tag
              v-for="t in tagsAll" :key="t.name"
              :effect="filter.tag === t.name ? 'dark' : 'plain'"
              closable
              style="margin: 0 4px 4px 0; cursor: pointer"
              @click="filter.tag = filter.tag === t.name ? '' : t.name"
              @close="deleteTagAction(t.name)"
            >
              {{ t.name }} · {{ t.count }}
            </el-tag>
            <div v-if="!tagsAll.length" style="color: #909399; font-size: 12px">暂无标签</div>
          </div>
        </div>
      </el-scrollbar>
    </el-aside>

    <el-main style="padding: 20px">
      <el-card shadow="never">
        <template #header>
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap">
            <div style="display: flex; align-items: center; gap: 8px; flex: 1 1 400px">
              <el-input
                v-model="filter.keyword"
                placeholder="搜索邮箱 / 备注 / 分组 / 标签"
                clearable
                :prefix-icon="'Search'"
                style="max-width: 340px"
              />
              <el-select v-model="filter.type" placeholder="类型" clearable style="width: 100px">
                <el-option v-for="t in typeOptions" :key="t.value" :label="t.label" :value="t.value" />
              </el-select>
              <el-select v-model="filter.auth_mode" placeholder="认证" clearable style="width: 110px">
                <el-option label="IMAP" value="imap" />
                <el-option label="OAuth" value="oauth" />
                <el-option label="Cookie" value="cookie" />
              </el-select>
              <el-select v-model="filter.sort" style="width: 130px">
                <el-option label="ID 倒序" value="id_desc" />
                <el-option label="ID 正序" value="id_asc" />
                <el-option label="导入倒序" value="created_desc" />
                <el-option label="导入正序" value="created_asc" />
                <el-option label="邮箱 A-Z" value="email_asc" />
                <el-option label="同步时间" value="sync_desc" />
              </el-select>
              <el-button link @click="resetFilter">重置</el-button>
              <el-tooltip :content="hideEmail ? '显示完整邮箱' : '隐藏邮箱中间部分'" placement="top">
                <el-button link @click="hideEmail = !hideEmail">
                  <el-icon style="font-size: 18px"><View v-if="!hideEmail" /><Hide v-else /></el-icon>
                </el-button>
              </el-tooltip>
            </div>
            <el-space>
              <el-button @click="loadAll">刷新</el-button>
              <el-button type="primary" @click="openCreate">新增账号</el-button>
              <el-button type="success" @click="importVisible = true">批量导入</el-button>
              <el-button @click="exportAccounts">导出</el-button>
            </el-space>
          </div>
          <!-- 批量操作栏 -->
          <div v-if="selectedRows.length" style="margin-top: 8px; display: flex; align-items: center; gap: 8px">
            <span style="color: #606266; font-size: 13px">已选 {{ selectedRows.length }} 项:</span>
            <el-button size="small" @click="batchGroupVisible = true">批量设置分组</el-button>
            <el-button size="small" type="success" :loading="batchTesting" @click="batchTest">批量测试</el-button>
          </div>
        </template>

        <el-table :data="accounts" v-loading="loading" stripe size="small" @selection-change="onSelectionChange">
          <el-table-column type="selection" width="35" />
          <el-table-column prop="id" label="ID" width="50" />
          <el-table-column label="类型" width="80">
            <template #default="{ row }">
              <el-tag :class="'tag-type-' + row.type" disable-transitions size="small">
                {{ meta.typeLabels[row.type] || row.type }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="email" label="邮箱" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">
              <span style="cursor: pointer" @click.stop="copyText(row.email)" title="点击复制完整邮箱">
                {{ maskEmail(row.email) }}
                <el-icon style="margin-left: 4px; color: #909399; vertical-align: -2px"><CopyDocument /></el-icon>
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="备注" min-width="100" show-overflow-tooltip />
          <el-table-column label="分组" width="80">
            <template #default="{ row }">
              <el-tag v-if="row.group_name" type="info" effect="plain" size="small">{{ row.group_name }}</el-tag>
              <span v-else style="color: #c0c4cc">-</span>
            </template>
          </el-table-column>
          <el-table-column label="已注册服务" min-width="150" show-overflow-tooltip>
            <template #default="{ row }">
              <el-tag
                v-for="s in getServiceNames(row.id)" :key="s" size="small"
                type="success" effect="plain"
                style="margin-right: 3px"
              >{{ s }}</el-tag>
              <span v-if="!getServiceNames(row.id).length" style="color: #c0c4cc">-</span>
            </template>
          </el-table-column>
          <el-table-column label="认证" width="70">
            <template #default="{ row }">
              <el-tag
                :type="row.auth_mode === 'imap' ? 'primary' : (row.auth_mode === 'oauth' ? 'success' : 'warning')"
                effect="plain" size="small"
              >
                {{ row.auth_mode === 'imap' ? 'IMAP' : row.auth_mode === 'oauth' ? 'OAuth' : 'Cookie' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="70">
            <template #default="{ row }">
              <el-tag :type="statusTag(row.status).type" effect="light" size="small">
                {{ statusTag(row.status).text }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="导入时间" width="135">
            <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
          </el-table-column>
          <el-table-column label="最近同步" width="135">
            <template #default="{ row }">{{ formatDate(row.last_sync_at) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="300" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openWorkspace(row)">工作台</el-button>
              <el-button link type="primary" @click="openInbox(row)">收件箱</el-button>
              <el-button link type="success" :loading="row._testing" @click="testRow(row)">测试</el-button>
              <el-button link @click="openEdit(row)">编辑</el-button>
              <el-button link type="danger" @click="removeRow(row)">删除</el-button>
            </template>
          </el-table-column>
          <template #empty>
            <el-empty :description="filter.keyword || filter.group || filter.tag ? '没有符合条件的账号' : '还没有账号,点右上角添加'" />
          </template>
        </el-table>
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0">
          <span style="color: #909399; font-size: 13px">共 {{ total }} 条</span>
          <el-pagination
            v-model:current-page="currentPage"
            v-model:page-size="pageSize"
            :total="total"
            :page-sizes="[20, 50, 100, 200]"
            layout="sizes, prev, pager, next, jumper"
            background
            size="small"
          />
        </div>
      </el-card>
    </el-main>

    <!-- 新增 / 编辑 -->
    <el-dialog v-model="editVisible" :title="editForm.id ? '编辑账号' : '新增账号'" width="560px">
      <el-form :model="editForm" label-width="110px">
        <el-form-item label="邮箱类型">
          <el-select v-model="editForm.type" placeholder="(留空则按后缀自动识别)" clearable style="width: 100%">
            <el-option v-for="t in typeOptions" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="邮箱地址">
          <el-input v-model="editForm.email" placeholder="例如 name@qq.com" />
        </el-form-item>
        <el-form-item label="备注名">
          <el-input v-model="editForm.name" placeholder="选填" />
        </el-form-item>
        <el-form-item label="分组">
          <el-select
            v-model="editForm.group_name"
            filterable allow-create clearable
            placeholder="选填,支持新建"
            style="width: 100%"
          >
            <el-option v-for="g in groups" :key="g.name" :label="`${g.name} (${g.count})`" :value="g.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="标签">
          <el-select
            v-model="editForm.tags"
            multiple filterable allow-create
            placeholder="回车添加,支持新建"
            style="width: 100%"
          >
            <el-option v-for="t in tagsAll" :key="t.name" :label="`${t.name} (${t.count})`" :value="t.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="已注册服务">
          <el-checkbox-group v-model="editForm.service_ids">
            <el-checkbox
              v-for="s in allServices" :key="s.id"
              :value="s.id"
              :label="s.name"
              style="margin-right: 12px"
            />
          </el-checkbox-group>
          <div v-if="!allServices.length" style="color: #909399; font-size: 12px">
            暂无服务,请先在「已注册服务」页面添加
          </div>
        </el-form-item>
        <el-form-item label="认证方式">
          <el-radio-group v-model="editForm.auth_mode">
            <el-radio value="imap">IMAP</el-radio>
            <el-radio value="oauth" :disabled="editForm.type && editForm.type !== 'ms'">OAuth</el-radio>
            <el-radio value="cookie">Cookie</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="editForm.auth_mode === 'oauth' ? 'refresh_token' : '密码/授权码'">
          <el-input
            v-model="editForm.password"
            :type="editForm.auth_mode === 'oauth' ? 'textarea' : 'password'"
            :rows="editForm.auth_mode === 'oauth' ? 3 : undefined"
            :show-password="editForm.auth_mode !== 'oauth'"
            :placeholder="editForm.id ? '留空则保持不变' : (editForm.auth_mode === 'oauth' ? '微软 OAuth refresh_token' : 'IMAP 授权码')"
          />
        </el-form-item>
        <template v-if="editForm.auth_mode === 'oauth'">
          <el-form-item label="client_id">
            <el-input v-model="editForm.oauth_client_id" placeholder="默认 Thunderbird" clearable />
          </el-form-item>
          <el-form-item label="tenant">
            <el-input v-model="editForm.oauth_tenant" placeholder="common / consumers / GUID" clearable />
          </el-form-item>
        </template>
        <el-form-item v-if="editForm.auth_mode !== 'oauth'" label="Cookie/Token">
          <el-input
            v-model="editForm.cookie" type="textarea" :rows="3"
            :placeholder="editForm.id ? '留空则保持不变' : '网页版 cookie 或 token(可选)'"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" @click="saveAccount">保存</el-button>
      </template>
    </el-dialog>

    <!-- 批量导入 -->
    <el-dialog v-model="importVisible" title="批量导入账号" width="720px">
      <el-alert type="info" :closable="false" style="margin-bottom: 12px">
        <div>每行一条,分隔符固定为 <code>----</code>。支持以下格式(自动识别):</div>
        <pre style="margin: 4px 0 0; background: #f5f7fa; padding: 8px; border-radius: 4px;">类型----邮箱----密码----cookie
邮箱----密码----cookie
邮箱----密码
ms_oauth----邮箱----refresh_token[----client_id[----tenant]]
邮箱----登录密码----client_id(GUID)----refresh_token</pre>
        <div>类型可选:<code>qq</code> / <code>163</code> / <code>ms</code> / <code>ms_oauth</code>,缺省时按邮箱后缀识别。</div>
      </el-alert>
      <el-form :inline="true" style="margin-bottom: 8px">
        <el-form-item label="统一分组">
          <el-select v-model="importGroup" filterable allow-create clearable placeholder="选填" style="width: 160px">
            <el-option v-for="g in groups" :key="g.name" :label="g.name" :value="g.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="统一标签">
          <el-select v-model="importTags" multiple filterable allow-create placeholder="选填,回车添加" style="width: 260px">
            <el-option v-for="t in tagsAll" :key="t.name" :label="t.name" :value="t.name" />
          </el-select>
        </el-form-item>
      </el-form>
      <el-input
        v-model="importText" type="textarea" :rows="8"
        placeholder="qq----test@qq.com----xxxxxxxx
test@163.com----yyyyyyyy"
      />
      <div v-if="importResults.length" style="margin-top: 12px; max-height: 200px; overflow: auto">
        <el-table :data="importResults" size="small" border>
          <el-table-column label="行" prop="line" width="60" />
          <el-table-column label="结果" width="80">
            <template #default="{ row }">
              <el-tag :type="row.ok ? 'success' : 'danger'">{{ row.ok ? '成功' : '失败' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="信息">
            <template #default="{ row }">
              <span v-if="row.ok">{{ row.email }} <el-tag size="small" effect="plain" style="margin-left: 6px">{{ row.mode }}</el-tag></span>
              <span v-else style="color: #f56c6c">{{ row.error }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <template #footer>
        <el-button @click="importVisible = false">关闭</el-button>
        <el-button @click="importFromFile">从 TXT 文件导入</el-button>
        <el-button type="primary" @click="runImport">开始导入</el-button>
      </template>
    </el-dialog>

    <!-- 批量设置分组 -->
    <el-dialog v-model="batchGroupVisible" title="批量设置分组" width="400px">
      <el-form-item label="目标分组">
        <el-select
          v-model="batchGroupName"
          filterable allow-create clearable
          placeholder="选择或新建分组(留空则移到未分组)"
          style="width: 100%"
        >
          <el-option v-for="g in groups" :key="g.name" :label="g.name" :value="g.name" />
        </el-select>
      </el-form-item>
      <div style="color: #909399; font-size: 12px">将为已选的 {{ selectedRows.length }} 个账号设置分组</div>
      <template #footer>
        <el-button @click="batchGroupVisible = false">取消</el-button>
        <el-button type="primary" @click="batchSetGroup">确定</el-button>
      </template>
    </el-dialog>

    <!-- 导出设置 -->
    <el-dialog v-model="exportVisible" title="导出账号" width="480px">
      <el-form :model="exportOpts" label-width="90px">
        <el-form-item label="导出范围">
          <el-radio-group v-model="exportOpts.scope">
            <el-radio value="current">当前筛选结果</el-radio>
            <el-radio value="all">全部账号</el-radio>
            <el-radio value="group">指定分组</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="exportOpts.scope === 'group'" label="选择分组">
          <el-select v-model="exportOpts.group" placeholder="请选择" style="width: 100%">
            <el-option v-for="g in groups" :key="g.name" :label="`${g.name} (${g.count})`" :value="g.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="导出数量">
          <el-input-number v-model="exportOpts.limit" :min="0" :step="10" style="width: 180px" />
          <span style="margin-left: 8px; color: #909399; font-size: 12px">0 = 全部</span>
        </el-form-item>
        <el-form-item label="导出格式">
          <el-radio-group v-model="exportOpts.format">
            <el-radio value="standard">完整格式(类型----邮箱----密码----cookie)</el-radio>
            <el-radio value="email_only">仅邮箱</el-radio>
            <el-radio value="email_password">邮箱----密码</el-radio>
            <el-radio value="oauth_full">邮箱----密码----client_id----refresh_token</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="exportVisible = false">取消</el-button>
        <el-button type="primary" @click="doExport">导出</el-button>
      </template>
    </el-dialog>
  </el-container>
</template>

<style scoped>
.side-item {
  padding: 8px 14px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #303133;
}
.side-item:hover { background: #f5f7fa; }
.side-item.active { background: #ecf5ff; color: #0b6cff; font-weight: 500; }
.side-item .count {
  color: #909399;
  font-size: 12px;
  background: #f4f4f5;
  padding: 0 6px;
  border-radius: 10px;
}
.side-item.active .count { background: #d9ecff; color: #0b6cff; }
.side-actions { display: flex; gap: 4px; opacity: 0; transition: opacity 0.15s; }
.side-item:hover .side-actions { opacity: 1; }
.action-icon { color: #909399; font-size: 14px; cursor: pointer; }
.action-icon:hover { color: #409eff; }
.action-icon.del:hover { color: #f56c6c; }
.del-icon { opacity: 0; color: #909399; font-size: 14px; transition: opacity 0.15s; }
.side-item:hover .del-icon { opacity: 1; }
.del-icon:hover { color: #f56c6c; }
</style>
