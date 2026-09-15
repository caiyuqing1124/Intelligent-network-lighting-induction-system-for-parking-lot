import { defineStore } from 'pinia'
import { createFloorLayouts, createInitialZones } from '../mock/zones.js'

export const useZoneStore = defineStore('zones', {
  state: () => ({
    zones: createInitialZones(),
    floorLayouts: createFloorLayouts(),
  }),
  actions: {
    reset() {
      this.zones = createInitialZones()
      this.floorLayouts = createFloorLayouts()
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
