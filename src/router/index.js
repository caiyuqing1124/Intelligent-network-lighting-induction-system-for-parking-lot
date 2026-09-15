import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('../views/Dashboard/Dashboard.vue'),
    },
    {
      path: '/zones',
      name: 'zones',
      component: () => import('../views/ZoneMonitor/ZoneMonitor.vue'),
    },
    {
      path: '/devices',
      name: 'devices',
      component: () => import('../views/DeviceManage/DeviceManage.vue'),
    },
    {
      path: '/scenes',
      name: 'scenes',
      component: () => import('../views/SceneControl/SceneControl.vue'),
    },
    {
      path: '/alerts',
      name: 'alerts',
      component: () => import('../views/AlertCenter/AlertCenter.vue'),
    },
    {
      path: '/energy',
      name: 'energy',
      component: () => import('../views/EnergyReport/EnergyReport.vue'),
    },
  ],
})

export default router
