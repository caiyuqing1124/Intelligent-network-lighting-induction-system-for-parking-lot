import { defineStore } from 'pinia'
import { createInitialZones } from '../mock/zones.js'

export const useZoneStore = defineStore('zones', {
  state: () => ({ zones: createInitialZones() }),
  actions: {
    reset() {
      this.zones = createInitialZones()
    },
    getById(id) {
      return this.zones.find((zone) => zone.id === id)
    },
    setDelay(zoneId, delayUntilAt) {
      const zone = this.getById(zoneId)
      if (zone) zone.delayUntilAt = delayUntilAt
    },
  },
})
