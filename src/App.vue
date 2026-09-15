<script setup>
import { useAlertStore } from './store/alertStore.js'

const alertStore = useAlertStore()
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand-mark">P</div>
      <div class="brand-copy">
        <strong>停车场智能网络照明感应系统</strong>
        <span>运营管理后台</span>
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
    </header>
    <main class="main-content"><RouterView /></main>
  </div>
</template>
