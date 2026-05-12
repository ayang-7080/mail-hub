<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api.js'

const services = ref([])
const loading = ref(false)
const newName = ref('')

async function load() {
  loading.value = true
  try {
    services.value = await api.services.list()
  } finally {
    loading.value = false
  }
}

async function addService() {
  const name = newName.value.trim()
  if (!name) return ElMessage.warning('请输入服务名称')
  try {
    await api.services.create(name)
    newName.value = ''
    ElMessage.success('已添加')
    await load()
  } catch (e) {
    console.error(e)
  }
}

async function renameRow(row) {
  try {
    const { value } = await ElMessageBox.prompt('新名称', '重命名服务', {
      inputValue: row.name,
      confirmButtonText: '确定',
      cancelButtonText: '取消'
    })
    if (!value || !value.trim()) return
    await api.services.rename(row.id, value.trim())
    ElMessage.success('已重命名')
    await load()
  } catch {}
}

async function removeRow(row) {
  try {
    await ElMessageBox.confirm(
      `确定删除服务「${row.name}」？已关联该服务的邮箱将自动取消关联。`,
      '提示', { type: 'warning' }
    )
  } catch { return }
  await api.services.remove(row.id)
  ElMessage.success('已删除')
  await load()
}

onMounted(load)
</script>

<template>
  <div style="padding: 20px">
    <el-card shadow="never">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span style="font-size: 16px; font-weight: 600">已注册服务管理</span>
          <div style="display: flex; gap: 8px">
            <el-input
              v-model="newName"
              placeholder="新服务名称"
              style="width: 200px"
              @keyup.enter="addService"
            />
            <el-button type="primary" @click="addService">添加</el-button>
          </div>
        </div>
      </template>

      <el-alert type="info" :closable="false" style="margin-bottom: 16px">
        管理邮箱可能注册过的第三方服务。在账号管理的编辑弹窗中可以为每个邮箱勾选已注册的服务。
      </el-alert>

      <el-table :data="services" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="name" label="服务名称" min-width="200" />
        <el-table-column label="创建时间" width="180">
          <template #default="{ row }">
            {{ row.created_at ? new Date(row.created_at).toLocaleString() : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <el-button link @click="renameRow(row)">重命名</el-button>
            <el-button link type="danger" @click="removeRow(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>
