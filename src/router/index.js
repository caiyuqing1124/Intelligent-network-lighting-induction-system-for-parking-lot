import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '../store/userStore.js'
import { authenticationNavigation } from '../utils/authNavigation.js'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: { name: 'dashboard' } },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/Login/Login.vue'),
      meta: { guestOnly: true, title: '登录' },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('../views/Register/Register.vue'),
      meta: { guestOnly: true, title: '注册账号' },
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('../views/Dashboard/Dashboard.vue'),
      meta: { requiresAuth: true, title: '运行总览' },
    },
    {
      path: '/zones',
      name: 'zones',
      component: () => import('../views/ZoneMonitor/ZoneMonitor.vue'),
      meta: { requiresAuth: true, title: '分区监控' },
    },
    {
      path: '/devices',
      name: 'devices',
      component: () => import('../views/DeviceManage/DeviceManage.vue'),
      meta: { requiresAuth: true, title: '设备管理' },
    },
    {
      path: '/scenes',
      name: 'scenes',
      component: () => import('../views/SceneControl/SceneControl.vue'),
      meta: { requiresAuth: true, title: '策略配置' },
    },
    {
      path: '/alerts',
      name: 'alerts',
      component: () => import('../views/AlertCenter/AlertCenter.vue'),
      meta: { requiresAuth: true, title: '告警中心' },
    },
    {
      path: '/energy',
      name: 'energy',
      component: () => import('../views/EnergyReport/EnergyReport.vue'),
      meta: { requiresAuth: true, title: '能耗报表' },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  const userStore = useUserStore()
  return authenticationNavigation(to, userStore.isAuthenticated)
})

router.afterEach((to) => {
  document.title = to.meta.title
    ? `${to.meta.title} · 停车场智能网络照明感应系统`
    : '停车场智能网络照明感应系统'
})

export default router
