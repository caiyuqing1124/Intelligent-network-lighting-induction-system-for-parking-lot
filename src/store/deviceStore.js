import { defineStore } from 'pinia'
import { createInitialDevices } from '../mock/devices.js'

export const useDeviceStore = defineStore('devices', {
  state: () => ({ devices: createInitialDevices() }),
  getters: {
    lights: (state) =>
      state.devices.filter((device) => device.type === 'light'),
    sensors: (state) =>
      state.devices.filter((device) => device.type === 'sensor'),
  },
  actions: {
    reset(now = Date.now()) {
      this.devices = createInitialDevices(now)
    },
    getById(id) {
      return this.devices.find((device) => device.id === id)
    },
    updateDevice(id, changes, now = Date.now()) {
      const device = this.getById(id)
      if (!device) return false
      const changed = Object.entries(changes).some(
        ([key, value]) => device[key] !== value,
      )
      if (!changed) return false
      Object.assign(device, changes, { lastActiveAt: now })
      return true
    },
  },
})
