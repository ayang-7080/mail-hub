<script setup>
import { ref, onMounted, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '../api.js'

const hasPassword = ref(false)
const form = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})
const loading = ref(false)
const syncInterval = ref(30)

async function load() {
  hasPassword.value = await api.auth.hasPassword()
  syncInterval.value = await api.settings.getSyncInterval()
}

async function savePassword() {
  if (form.newPassword && form.newPassword !== form.confirmPassword) {
    return ElMessage.error('两次输入的新密码不一致')
  }
  if (hasPassword.value && !form.oldPassword) {
    return ElMessage.error('请输入当前密码')
  }
  loading.value = true
  try {
    await api.auth.setPassword(form.oldPassword, form.newPassword)
    if (form.newPassword) {
      ElMessage.success('密码已设置,下次启动时生效')
    } else {
      ElMessage.success('密码已清除')
    }
    form.oldPassword = ''
    form.newPassword = ''
    form.confirmPassword = ''
    await load()
  } catch (e) {
    ElMessage.error(e.message || '操作失败')
  } finally {
    loading.value = false
  }
}

async function saveSyncInterval() {
  try {
    const val = await api.settings.setSyncInterval(syncInterval.value)
    syncInterval.value = val
    ElMessage.success('已保存,工作台将使用新的刷新间隔')
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  }
}

onMounted(load)
</script>

<template>
  <div style="padding: 20px">
    <el-card shadow="never" style="max-width: 560px">
      <template #header>
        <span style="font-size: 16px; font-weight: 600">安全设置</span>
      </template>

      <el-alert
        :type="hasPassword ? 'success' : 'info'"
        :closable="false"
        style="margin-bottom: 20px"
      >
        {{ hasPassword ? '已设置管理员密码,启动时需要输入密码才能进入' : '未设置管理员密码,任何人打开软件都可以直接使用' }}
      </el-alert>

      <el-form :model="form" label-width="110px">
        <el-form-item v-if="hasPassword" label="当前密码">
          <el-input v-model="form.oldPassword" type="password" show-password placeholder="输入当前密码" />
        </el-form-item>
        <el-form-item :label="hasPassword ? '新密码' : '设置密码'">
          <el-input v-model="form.newPassword" type="password" show-password placeholder="输入新密码(留空则清除密码)" />
        </el-form-item>
        <el-form-item v-if="form.newPassword" label="确认密码">
          <el-input v-model="form.confirmPassword" type="password" show-password placeholder="再次输入新密码" @keyup.enter="savePassword" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" @click="savePassword">
            {{ hasPassword ? (form.newPassword ? '修改密码' : '清除密码') : '设置密码' }}
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" style="max-width: 560px; margin-top: 16px">
      <template #header>
        <span style="font-size: 16px; font-weight: 600">工作台设置</span>
      </template>

      <el-form label-width="110px">
        <el-form-item label="刷新间隔">
          <el-input-number v-model="syncInterval" :min="3" :max="600" :step="5" style="width: 160px" />
          <span style="margin-left: 8px; color: #606266">秒</span>
          <span style="margin-left: 12px; color: #909399; font-size: 12px">最低 3 秒</span>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="saveSyncInterval">保存</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>
