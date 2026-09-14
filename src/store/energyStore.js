import { defineStore } from 'pinia'
import { calculateEnergyDelta } from '../utils/energy.js'

export const useEnergyStore = defineStore('energy', {
  state: () => ({
    startedAt: null,
    lastSettledAt: null,
    actualKwh: 0,
    baselineKwh: 0,
    samples: [],
  }),
  getters: {
    savingsPercent: (state) =>
      state.baselineKwh > 0
        ? ((state.baselineKwh - state.actualKwh) / state.baselineKwh) * 100
        : null,
  },
  actions: {
    reset(now = null) {
      this.startedAt = now
      this.lastSettledAt = now
      this.actualKwh = 0
      this.baselineKwh = 0
      this.samples =
        now === null ? [] : [{ at: now, actualKwh: 0, baselineKwh: 0 }]
    },
    settle(devices, now) {
      if (this.lastSettledAt === null) {
        this.reset(now)
        return
      }
      const delta = calculateEnergyDelta(devices, now - this.lastSettledAt)
      this.actualKwh += delta.actualKwh
      this.baselineKwh += delta.baselineKwh
      this.lastSettledAt = Math.max(this.lastSettledAt, now)
    },
    sample(now) {
      this.samples.push({
        at: now,
        actualKwh: this.actualKwh,
        baselineKwh: this.baselineKwh,
      })
    },
  },
})
