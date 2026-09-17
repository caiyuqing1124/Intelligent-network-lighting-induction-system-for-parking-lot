<script setup>
import { computed, onUnmounted } from 'vue'
import { getActivePinia } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { getAppSimulator } from './mock/simulator.js'
import { useAlertStore } from './store/alertStore.js'
import { useUserStore } from './store/userStore.js'
import { bindAuthenticationLifecycle } from './utils/authLifecycle.js'

const alertStore = useAlertStore()
const userStore = useUserStore()
const route = useRoute()
const router = useRouter()
const simulator = getAppSimulator(getActivePinia())
const isGuestPage = computed(() => Boolean(route.meta.guestOnly))

const stopLifecycle = bindAuthenticationLifecycle(userStore, simulator)
onUnmounted(stopLifecycle)

async function logout() {
  userStore.clearSession()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <ElConfigProvider :locale="zhCn">
    <div class="app-shell">
      <header v-if="userStore.isAuthenticated" class="topbar">
        <div class="brand-mark">源</div>
        <div class="brand-copy">
          <strong>停车场智能网络照明感应系统</strong>
          <span>源多艺 · 运营管理后台</span>
        </div>
        <nav class="primary-nav" aria-label="业务导航">
          <RouterLink to="/dashboard">运行总览</RouterLink>
          <RouterLink to="/zones">分区监控</RouterLink>
          <RouterLink to="/devices">设备管理</RouterLink>
          <RouterLink to="/scenes">策略配置</RouterLink>
          <RouterLink to="/energy">能耗报表</RouterLink>
          <RouterLink class="alert-nav-link" to="/alerts">
            告警中心
            <b v-if="alertStore.unresolvedCount" class="nav-alert-count">
              {{
                alertStore.unresolvedCount > 99
                  ? '99+'
                  : alertStore.unresolvedCount
              }}
            </b>
          </RouterLink>
        </nav>
        <span
          class="session-scope"
          title="查看当前统计周期的设备状态与能耗汇总"
        >
          当前统计周期
        </span>
        <div class="account-menu">
          <span class="account-name" :title="userStore.username">
            {{ userStore.username }}
          </span>
          <ElButton class="logout-button" plain size="small" @click="logout">
            退出登录
          </ElButton>
        </div>
      </header>
      <main :class="isGuestPage ? 'auth-main-content' : 'main-content'">
        <RouterView v-slot="{ Component }">
          <Suspense>
            <div class="route-view">
              <component :is="Component" />
            </div>
            <template #fallback>
              <div class="route-loading" role="status" aria-live="polite">
                <span></span>
                <strong>正在加载页面</strong>
                <small>请稍候，系统正在准备当前功能。</small>
              </div>
            </template>
          </Suspense>
        </RouterView>
      </main>
    </div>
  </ElConfigProvider>
</template>
