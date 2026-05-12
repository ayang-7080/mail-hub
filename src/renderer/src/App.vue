<script setup>
import { RouterView, useRouter, useRoute } from 'vue-router'
import { computed } from 'vue'

const router = useRouter()
const route = useRoute()
const activeMenu = computed(() => '/' + (route.path.split('/')[1] || 'accounts'))
const isLockPage = computed(() => route.name === 'lock')

function go(idx) {
  router.push(idx)
}
</script>

<template>
  <!-- 锁屏页面不显示侧栏 -->
  <RouterView v-if="isLockPage" />
  <el-container v-else style="height: 100vh">
    <el-aside width="200px" style="background: #1f2937">
      <div style="color: #fff; padding: 18px 16px; font-size: 16px; font-weight: 600;">
        <el-icon style="vertical-align: -2px; margin-right: 6px"><Message /></el-icon>
        Mail Manager
      </div>
      <el-menu
        :default-active="activeMenu"
        background-color="#1f2937"
        text-color="#d1d5db"
        active-text-color="#ffffff"
        @select="go"
      >
        <el-menu-item index="/accounts">
          <el-icon><User /></el-icon><span>账号管理</span>
        </el-menu-item>
        <el-menu-item index="/inbox">
          <el-icon><Message /></el-icon><span>收件箱</span>
        </el-menu-item>
        <el-menu-item index="/services">
          <el-icon><Grid /></el-icon><span>注册服务</span>
        </el-menu-item>
        <el-menu-item index="/settings">
          <el-icon><Setting /></el-icon><span>设置</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-main style="padding: 0; background: #f6f7f9">
      <RouterView />
    </el-main>
  </el-container>
</template>
