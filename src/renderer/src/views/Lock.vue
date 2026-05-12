<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { api } from '../api.js'

const router = useRouter()
const password = ref('')
const loading = ref(false)

async function unlock() {
  if (!password.value) return ElMessage.warning('请输入密码')
  loading.value = true
  try {
    const ok = await api.auth.verify(password.value)
    if (ok) {
      sessionStorage.setItem('unlocked', '1')
      router.replace('/')
    } else {
      ElMessage.error('密码错误')
      password.value = ''
    }
  } catch (e) {
    ElMessage.error(e.message || '验证失败')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div style="height: 100vh; display: flex; align-items: center; justify-content: center; background: #1f2937">
    <el-card style="width: 380px; border-radius: 12px" shadow="always">
      <div style="text-align: center; margin-bottom: 24px">
        <el-icon style="font-size: 48px; color: #409eff"><Lock /></el-icon>
        <h2 style="margin: 12px 0 4px; font-size: 20px; color: #1f2328">Mail Manager</h2>
        <p style="color: #909399; font-size: 13px; margin: 0">请输入管理员密码解锁</p>
      </div>
      <el-input
        v-model="password"
        type="password"
        show-password
        placeholder="输入密码"
        size="large"
        @keyup.enter="unlock"
        autofocus
      />
      <el-button
        type="primary"
        style="width: 100%; margin-top: 16px"
        size="large"
        :loading="loading"
        @click="unlock"
      >
        解锁
      </el-button>
    </el-card>
  </div>
</template>
