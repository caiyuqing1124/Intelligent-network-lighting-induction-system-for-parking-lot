import { useAlertStore } from '../store/alertStore.js'
import { useDeviceStore } from '../store/deviceStore.js'
import { useEnergyStore } from '../store/energyStore.js'
import { useRuleStore } from '../store/ruleStore.js'
import { useZoneStore } from '../store/zoneStore.js'
import { reconcileZone } from '../utils/simulateSensor.js'
import { isRuleValid } from '../utils/validateRule.js'

export const SIMULATOR_CONFIG = Object.freeze({
  tickMs: 3000,
  sensorTriggerProbability: 0.08,
  faultProbability: 0.01,
  minimumRecoveryMs: 30_000,
  maximumRecoveryMs: 90_000,
  manualModeMs: 300_000,
  energySampleMs: 15_000,
})

let appSimulator = null

export function createSimulationController(pinia, options = {}) {
  const deviceStore = useDeviceStore(pinia)
  const zoneStore = useZoneStore(pinia)
  const ruleStore = useRuleStore(pinia)
  const alertStore = useAlertStore(pinia)
  const energyStore = useEnergyStore(pinia)
  const nowFn = options.now ?? Date.now
  const random = options.random ?? Math.random
  const scheduleInterval = options.setInterval ?? globalThis.setInterval
  const cancelInterval = options.clearInterval ?? globalThis.clearInterval
  const config = { ...SIMULATOR_CONFIG, ...options.config }
  let intervalId = null
  let randomEventsEnabled = true

  function settle(now) {
    energyStore.settle(deviceStore.devices, now)
  }

  function activeByZone() {
    return new Map(
      zoneStore.zones.map((zone) => [
        zone.id,
        zone.deviceIds.some((id) => {
          const device = deviceStore.getById(id)
          return (
            device?.type === 'sensor' &&
            device.status === 'online' &&
            device.triggered
          )
        }),
      ]),
    )
  }

  function reconcile(now, previousActive = new Map()) {
    for (const zone of zoneStore.zones) {
      const rule = ruleStore.getById(zone.ruleId)
      if (!rule) continue
      reconcileZone({
        zone,
        rule,
        devices: deviceStore.devices,
        now,
        wasActive: previousActive.get(zone.id) ?? false,
        updateDevice: (id, changes, at) =>
          deviceStore.updateDevice(id, changes, at),
        setDelay: (id, until) => zoneStore.setDelay(id, until),
      })
    }
  }

  function triggerSensor(id, now = nowFn()) {
    const sensor = deviceStore.getById(id)
    if (sensor?.type !== 'sensor' || sensor.status !== 'online') return false
    const zone = zoneStore.getById(sensor.zoneId)
    const rule = zone && ruleStore.getById(zone.ruleId)
    if (!rule) return false
    settle(now)
    const until = Math.max(
      sensor.triggeredUntilAt ?? 0,
      now + rule.triggerHoldSeconds * 1000,
    )
    deviceStore.updateDevice(
      id,
      { triggered: true, triggeredUntilAt: until },
      now,
    )
    reconcile(now)
    return true
  }

  function setDeviceStatus(id, status, now = nowFn()) {
    const device = deviceStore.getById(id)
    if (!device || !['online', 'offline', 'fault'].includes(status))
      return false
    if (device.status === status) return false
    settle(now)
    const previousActive = activeByZone()
    const oldStatus = device.status
    const changes = { status, recoverAt: null }
    if (device.type === 'sensor' && status !== 'online') {
      changes.triggered = false
      changes.triggeredUntilAt = null
    }
    if (device.type === 'light' && status !== 'online')
      changes.manualUntilAt = null
    if (status !== 'online') {
      const recoverySpan = config.maximumRecoveryMs - config.minimumRecoveryMs
      changes.recoverAt =
        now + config.minimumRecoveryMs + Math.floor(random() * recoverySpan)
    }
    deviceStore.updateDevice(id, changes, now)
    if (status === 'online') alertStore.endEpisode(id, oldStatus)
    else alertStore.recordFault(device, status, now)
    reconcile(now, previousActive)
    return true
  }

  function manualSetLight(id, brightness, now = nowFn()) {
    const light = deviceStore.getById(id)
    if (
      light?.type !== 'light' ||
      light.status !== 'online' ||
      !Number.isInteger(brightness) ||
      brightness < 0 ||
      brightness > 100
    ) {
      return false
    }
    settle(now)
    deviceStore.updateDevice(
      id,
      {
        brightness,
        lightState: brightness === 0 ? 'off' : 'full',
        manualUntilAt: now + config.manualModeMs,
      },
      now,
    )
    return true
  }

  function updateRule(id, changes, now = nowFn()) {
    const rule = ruleStore.getById(id)
    if (!rule) return false
    const nextRule = { ...rule, ...changes }
    if (!isRuleValid(nextRule)) return false

    settle(now)
    const previousActive = activeByZone()
    ruleStore.updateRule(id, nextRule)
    reconcile(now, previousActive)
    return true
  }

  function restoreAutomatic(id, now = nowFn()) {
    const light = deviceStore.getById(id)
    if (
      light?.type !== 'light' ||
      light.status !== 'online' ||
      light.manualUntilAt === null
    ) {
      return false
    }
    settle(now)
    deviceStore.updateDevice(id, { manualUntilAt: null }, now)
    reconcile(now)
    return true
  }

  function shortenManualWait(id, now = nowFn()) {
    const light = deviceStore.getById(id)
    if (
      light?.type !== 'light' ||
      light.status !== 'online' ||
      light.manualUntilAt === null
    ) {
      return false
    }
    deviceStore.updateDevice(id, { manualUntilAt: now }, now)
    return true
  }

  function shortenRecoveryWait(id, now = nowFn()) {
    const device = deviceStore.getById(id)
    if (!device || device.status === 'online' || device.recoverAt === null) {
      return false
    }
    deviceStore.updateDevice(id, { recoverAt: now }, now)
    return true
  }

  function tick(now = nowFn(), { randomEvents = true } = {}) {
    settle(now)
    const previousActive = activeByZone()
    for (const device of deviceStore.devices) {
      if (
        device.status !== 'online' &&
        device.recoverAt !== null &&
        now >= device.recoverAt
      ) {
        const oldStatus = device.status
        deviceStore.updateDevice(
          device.id,
          { status: 'online', recoverAt: null },
          now,
        )
        alertStore.endEpisode(device.id, oldStatus)
      }
      if (
        device.type === 'sensor' &&
        device.triggered &&
        now >= device.triggeredUntilAt
      ) {
        deviceStore.updateDevice(
          device.id,
          { triggered: false, triggeredUntilAt: null },
          now,
        )
      }
      if (
        device.type === 'light' &&
        device.manualUntilAt !== null &&
        now >= device.manualUntilAt
      ) {
        deviceStore.updateDevice(device.id, { manualUntilAt: null }, now)
      }
    }
    if (randomEvents) {
      for (const sensor of deviceStore.sensors) {
        if (
          sensor.status === 'online' &&
          random() < config.sensorTriggerProbability
        ) {
          const zone = zoneStore.getById(sensor.zoneId)
          const rule = zone && ruleStore.getById(zone.ruleId)
          if (rule) {
            deviceStore.updateDevice(
              sensor.id,
              {
                triggered: true,
                triggeredUntilAt: Math.max(
                  sensor.triggeredUntilAt ?? 0,
                  now + rule.triggerHoldSeconds * 1000,
                ),
              },
              now,
            )
          }
        }
      }
      if (random() < config.faultProbability) {
        const candidates = deviceStore.devices.filter(
          (device) => device.status === 'online',
        )
        if (candidates.length > 0) {
          const target = candidates[Math.floor(random() * candidates.length)]
          setDeviceStatus(target.id, random() < 0.5 ? 'offline' : 'fault', now)
        }
      }
    }
    reconcile(now, previousActive)
    energyStore.sample(now, config.energySampleMs)
  }

  function reset(now = nowFn()) {
    deviceStore.reset(now)
    zoneStore.reset()
    ruleStore.reset()
    alertStore.reset()
    energyStore.reset(now, deviceStore.devices)
    reconcile(now)
  }

  function start() {
    if (intervalId !== null) return false
    reset(nowFn())
    intervalId = scheduleInterval(
      () => tick(nowFn(), { randomEvents: randomEventsEnabled }),
      config.tickMs,
    )
    return true
  }

  function stop() {
    if (intervalId === null) return false
    cancelInterval(intervalId)
    intervalId = null
    settle(nowFn())
    return true
  }

  return {
    start,
    stop,
    reset,
    tick,
    triggerSensor,
    setDeviceStatus,
    manualSetLight,
    updateRule,
    restoreAutomatic,
    shortenManualWait,
    shortenRecoveryWait,
    setRandomEventsEnabled(enabled) {
      randomEventsEnabled = Boolean(enabled)
    },
    get running() {
      return intervalId !== null
    },
    get randomEventsEnabled() {
      return randomEventsEnabled
    },
  }
}

export function getAppSimulator(pinia) {
  if (appSimulator === null) appSimulator = createSimulationController(pinia)
  return appSimulator
}
