import { defineStore } from 'pinia'
import { calculateEnergyDelta } from '../utils/energy.js'

export const useEnergyStore = defineStore('energy', {
  state: () => ({
    startedAt: null,
    lastSettledAt: null,
    actualKwh: 0,
    baselineKwh: 0,
    deviceTotals: {},
    samples: [],
    lastSampledAt: null,
  }),
  getters: {
    savingsPercent: (state) =>
      state.baselineKwh > 0
        ? ((state.baselineKwh - state.actualKwh) / state.baselineKwh) * 100
        : null,
  },
  actions: {
    reset(now = null, devices = []) {
      this.startedAt = now
      this.lastSettledAt = now
      this.actualKwh = 0
      this.baselineKwh = 0
      this.deviceTotals = Object.fromEntries(
        devices
          .filter((device) => device.type === 'light')
          .map((device) => [
            device.id,
            {
              actualKwh: 0,
              baselineKwh: 0,
              onlineDurationMs: 0,
              brightnessWeightedDurationMs: 0,
            },
          ]),
      )
      this.samples =
        now === null ? [] : [{ at: now, actualKwh: 0, baselineKwh: 0 }]
      this.lastSampledAt = now
    },
    settle(devices, now) {
      if (this.lastSettledAt === null) {
        this.reset(now, devices)
        return
      }
      const delta = calculateEnergyDelta(devices, now - this.lastSettledAt)
      this.actualKwh += delta.actualKwh
      this.baselineKwh += delta.baselineKwh
      for (const [deviceId, deviceDelta] of Object.entries(
        delta.deviceTotals,
      )) {
        if (!this.deviceTotals[deviceId]) {
          this.deviceTotals[deviceId] = {
            actualKwh: 0,
            baselineKwh: 0,
            onlineDurationMs: 0,
            brightnessWeightedDurationMs: 0,
          }
        }
        const total = this.deviceTotals[deviceId]
        total.actualKwh += deviceDelta.actualKwh
        total.baselineKwh += deviceDelta.baselineKwh
        total.onlineDurationMs += deviceDelta.onlineDurationMs
        total.brightnessWeightedDurationMs +=
          deviceDelta.brightnessWeightedDurationMs
      }
      this.lastSettledAt = Math.max(this.lastSettledAt, now)
    },
    sample(now, minimumIntervalMs = 0) {
      if (
        this.lastSampledAt !== null &&
        now - this.lastSampledAt < minimumIntervalMs
      ) {
        return false
      }
      this.samples.push({
        at: now,
        actualKwh: this.actualKwh,
        baselineKwh: this.baselineKwh,
      })
      this.lastSampledAt = now
      return true
    },
  },
})
