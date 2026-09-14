import { defineStore } from 'pinia'
import { createDeviceAlert, createInitialAlerts } from '../mock/alerts.js'

export const useAlertStore = defineStore('alerts', {
  state: () => ({
    alerts: createInitialAlerts(),
    activeEpisodes: {},
    nextId: 1,
  }),
  getters: {
    unresolvedCount: (state) =>
      state.alerts.filter((alert) => !alert.resolved).length,
  },
  actions: {
    reset() {
      this.alerts = createInitialAlerts()
      this.activeEpisodes = {}
      this.nextId = 1
    },
    recordFault(device, type, now) {
      const key = `${device.id}:${type}`
      if (this.activeEpisodes[key]) return null
      this.activeEpisodes[key] = true
      const hasUnresolved = this.alerts.some(
        (alert) =>
          alert.deviceId === device.id &&
          alert.type === type &&
          !alert.resolved,
      )
      if (hasUnresolved) return null
      const alert = createDeviceAlert(
        device,
        type,
        now,
        `alert-${this.nextId++}`,
      )
      this.alerts.unshift(alert)
      return alert
    },
    endEpisode(deviceId, type) {
      delete this.activeEpisodes[`${deviceId}:${type}`]
    },
    resolve(id, now = Date.now()) {
      const alert = this.alerts.find((item) => item.id === id)
      if (!alert || alert.resolved) return false
      alert.resolved = true
      alert.resolvedAt = now
      return true
    },
  },
})
