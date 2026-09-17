import assert from 'node:assert/strict'
import test from 'node:test'
import { createPinia } from 'pinia'
import { createSimulationController } from '../src/mock/simulator.js'
import { useDeviceStore } from '../src/store/deviceStore.js'
import { useZoneStore } from '../src/store/zoneStore.js'
import { useEnergyStore } from '../src/store/energyStore.js'
import { useAlertStore } from '../src/store/alertStore.js'
import { useRuleStore } from '../src/store/ruleStore.js'
import { isScheduledNow } from '../src/utils/simulateSensor.js'
import { validateRule } from '../src/utils/validateRule.js'

function setup(startAt = 1_000_000, config = {}) {
  const pinia = createPinia()
  const simulator = createSimulationController(pinia, {
    now: () => startAt,
    random: () => 1,
    config,
  })
  simulator.reset(startAt)
  return {
    simulator,
    devices: useDeviceStore(pinia),
    zones: useZoneStore(pinia),
    energy: useEnergyStore(pinia),
    alerts: useAlertStore(pinia),
    rules: useRuleStore(pinia),
    startAt,
  }
}

test('manual brightness accepts zero and one hundred but rejects invalid inputs without mutation', () => {
  const { simulator, devices, startAt: t } = setup()
  const light = devices.getById('light-b1-a-1')
  assert.equal(simulator.manualSetLight(light.id, 0, t), true)
  assert.equal(light.lightState, 'off')
  assert.equal(light.brightness, 0)
  assert.equal(simulator.manualSetLight(light.id, 100, t + 1), true)
  const snapshot = JSON.stringify(light)
  for (const value of [-1, 101, 0.5, NaN, Infinity, '50', null, undefined]) {
    assert.equal(simulator.manualSetLight(light.id, value, t + 2), false)
    assert.equal(JSON.stringify(light), snapshot)
  }
  assert.equal(simulator.manualSetLight('missing', 50, t), false)
  assert.equal(simulator.manualSetLight('sensor-b1-a-1', 50, t), false)
})

test('zero return delay has no stale countdown and missing online sensors cancel an active countdown', () => {
  const { simulator, devices, zones, rules, startAt: t } = setup()
  const zone = zones.getById('zone-b1-a')
  simulator.updateRule(zone.ruleId, { triggerDelayOff: 0 }, t)
  simulator.triggerSensor('sensor-b1-a-1', t)
  simulator.tick(t + rules.getById(zone.ruleId).triggerHoldSeconds * 1000, {
    randomEvents: false,
  })
  assert.equal(zone.delayUntilAt, null)
  assert.equal(devices.getById('light-b1-a-1').brightness, 20)
  simulator.updateRule(zone.ruleId, { triggerDelayOff: 12 }, t + 7000)
  simulator.triggerSensor('sensor-b1-a-1', t + 7000)
  simulator.tick(t + 13000, { randomEvents: false })
  assert.ok(zone.delayUntilAt > t + 13000)
  simulator.setDeviceStatus('sensor-b1-a-1', 'offline', t + 14000)
  simulator.setDeviceStatus('sensor-b1-a-2', 'offline', t + 14000)
  assert.equal(zone.delayUntilAt, null)
  simulator.tick(t + 26000, { randomEvents: false })
  assert.equal(devices.getById('light-b1-a-1').brightness, 100)
})

test('ordinary and cross-midnight schedules are left-inclusive and right-exclusive', () => {
  const { rules } = setup()
  const rule = { ...rules.rules[0], scheduleEnabled: true }
  const at = (hour, minute) => new Date(2026, 8, 16, hour, minute).getTime()
  for (const [start, end, cases] of [
    [
      '08:00',
      '18:00',
      [
        [7, 59, false],
        [8, 0, true],
        [17, 59, true],
        [18, 0, false],
      ],
    ],
    [
      '22:00',
      '06:00',
      [
        [21, 59, false],
        [22, 0, true],
        [0, 0, true],
        [5, 59, true],
        [6, 0, false],
      ],
    ],
  ]) {
    Object.assign(rule, { scheduleStartTime: start, scheduleEndTime: end })
    for (const [hour, minute, expected] of cases)
      assert.equal(isScheduledNow(rule, at(hour, minute)), expected)
  }
  rule.scheduleEnabled = false
  assert.equal(isScheduledNow(rule, at(23, 0)), false)
  rule.scheduleEnabled = true
  rule.scheduleEndTime = rule.scheduleStartTime
  assert.equal(isScheduledNow(rule, at(23, 0)), false)
})

test('invalid rule shapes are safely rejected and never replace a saved rule', () => {
  const { simulator, rules, startAt: t } = setup()
  assert.ok(Object.keys(validateRule(null)).length > 0)
  assert.ok(Object.keys(validateRule(undefined)).length > 0)
  const rule = rules.rules[0]
  const snapshot = JSON.stringify(rule)
  for (const changes of [
    { name: ' ' },
    { name: '字'.repeat(31) },
    { scheduleEnabled: 'true' },
    { scheduleStartTime: '24:00' },
    { scheduleEndTime: rule.scheduleStartTime },
  ]) {
    assert.equal(simulator.updateRule(rule.id, changes, t), false)
    assert.equal(JSON.stringify(rule), snapshot)
  }
})

test('fault episodes remain deduplicated after handling and after recovery with an unresolved history', () => {
  const { simulator, devices, alerts, startAt: t } = setup()
  const id = 'light-b1-a-1'
  simulator.setDeviceStatus(id, 'fault', t)
  const first = alerts.alerts[0]
  alerts.resolve(first.id, t + 1)
  assert.equal(devices.getById(id).status, 'fault')
  assert.equal(alerts.recordFault(devices.getById(id), 'fault', t + 2), null)
  simulator.setDeviceStatus(id, 'online', t + 3)
  simulator.setDeviceStatus(id, 'fault', t + 4)
  assert.equal(alerts.alerts.length, 2)
  const second = alerts.alerts[0]
  simulator.setDeviceStatus(id, 'online', t + 5)
  assert.equal(second.resolved, false)
  simulator.setDeviceStatus(id, 'fault', t + 6)
  assert.equal(alerts.alerts.length, 2)
  alerts.resolve(second.id, t + 7)
  assert.equal(alerts.recordFault(devices.getById(id), 'fault', t + 8), null)
  simulator.setDeviceStatus(id, 'online', t + 9)
  simulator.setDeviceStatus(id, 'fault', t + 10)
  assert.equal(alerts.alerts.length, 3)
})

test('a ten-minute virtual session has one interval and restart resets every runtime domain', () => {
  const pinia = createPinia()
  let now = 1_000_000
  const timers = new Map()
  let nextTimer = 0
  const simulator = createSimulationController(pinia, {
    now: () => now,
    random: () => 1,
    setInterval: (callback) => {
      timers.set(++nextTimer, callback)
      return nextTimer
    },
    clearInterval: (id) => timers.delete(id),
  })
  const devices = useDeviceStore(pinia)
  const zones = useZoneStore(pinia)
  const rules = useRuleStore(pinia)
  const alerts = useAlertStore(pinia)
  const energy = useEnergyStore(pinia)
  assert.equal(simulator.start(), true)
  simulator.updateRule(rules.rules[0].id, { fullBrightness: 80 }, now)
  simulator.manualSetLight('light-b1-a-1', 0, now)
  simulator.setDeviceStatus('light-b1-a-2', 'fault', now)
  for (let tick = 0; tick < 200; tick++) {
    now += 3000
    assert.equal(simulator.start(), false)
    for (const callback of timers.values()) callback()
    assert.equal(timers.size, 1)
  }
  assert.equal(alerts.alerts.length, 1)
  assert.ok(energy.actualKwh > 0)
  assert.ok(energy.actualKwh <= energy.baselineKwh)
  assert.equal(simulator.stop(), true)
  assert.equal(simulator.stop(), false)
  assert.equal(timers.size, 0)
  now += 1000
  assert.equal(simulator.start(), true)
  assert.equal(rules.rules[0].fullBrightness, 100)
  assert.equal(alerts.alerts.length, 0)
  assert.deepEqual(alerts.activeEpisodes, {})
  assert.ok(zones.zones.every((zone) => zone.delayUntilAt === null))
  assert.ok(
    devices.devices.every(
      (device) =>
        device.status === 'online' &&
        device.manualUntilAt === null &&
        device.triggered !== true,
    ),
  )
  assert.equal(energy.actualKwh, 0)
  assert.equal(energy.baselineKwh, 0)
  assert.deepEqual(energy.samples, [{ at: now, actualKwh: 0, baselineKwh: 0 }])
  simulator.stop()
})

test('multiple sensors keep lights bright until all holds finish, then delay and return', () => {
  const { simulator, devices, zones, startAt: t } = setup()
  const light = devices.getById('light-b1-a-1')
  const first = devices.getById('sensor-b1-a-1')
  const second = devices.getById('sensor-b1-a-2')
  const zone = zones.getById('zone-b1-a')

  assert.equal(light.lightState, 'standby')
  simulator.triggerSensor(first.id, t + 1000)
  assert.equal(first.triggeredUntilAt, t + 7000)
  assert.equal(light.brightness, 100)
  simulator.triggerSensor(second.id, t + 4000)
  simulator.tick(t + 7001, { randomEvents: false })
  assert.equal(first.triggered, false)
  assert.equal(second.triggered, true)
  assert.equal(zone.delayUntilAt, null)
  assert.equal(light.lightState, 'full')

  simulator.tick(t + 10001, { randomEvents: false })
  assert.equal(second.triggered, false)
  assert.equal(zone.delayUntilAt, t + 22001)
  assert.equal(light.lightState, 'full')
  simulator.tick(t + 22000, { randomEvents: false })
  assert.equal(light.lightState, 'full')
  simulator.tick(t + 22001, { randomEvents: false })
  assert.equal(zone.delayUntilAt, null)
  assert.equal(light.lightState, 'standby')
  assert.equal(light.brightness, 20)
})

test('fixture references are consistent across devices, zones and rules', () => {
  const { devices, zones, rules } = setup()
  for (const zone of zones.zones) {
    assert.ok(rules.getById(zone.ruleId))
    assert.equal(
      zone.deviceIds.filter((id) => devices.getById(id)?.type === 'sensor')
        .length,
      2,
    )
    for (const id of zone.deviceIds)
      assert.equal(devices.getById(id)?.zoneId, zone.id)
  }
  assert.equal(devices.devices.length, 18)
})

test('new trigger cancels an active return timer and repeated trigger extends hold', () => {
  const { simulator, devices, zones, startAt: t } = setup()
  const sensor = devices.getById('sensor-b1-a-1')
  const light = devices.getById('light-b1-a-1')
  const zone = zones.getById('zone-b1-a')
  simulator.triggerSensor(sensor.id, t)
  simulator.triggerSensor(sensor.id, t + 4000)
  assert.equal(sensor.triggeredUntilAt, t + 10000)
  simulator.tick(t + 10000, { randomEvents: false })
  assert.equal(zone.delayUntilAt, t + 22000)
  simulator.triggerSensor(sensor.id, t + 15000)
  assert.equal(zone.delayUntilAt, null)
  assert.equal(light.lightState, 'full')
  simulator.tick(t + 21000, { randomEvents: false })
  assert.equal(zone.delayUntilAt, t + 33000)
  simulator.tick(t + 33000, { randomEvents: false })
  assert.equal(light.lightState, 'standby')
})

test('offline sensors leave the linkage and offline lamps cannot be manually controlled', () => {
  const { simulator, devices, startAt: t } = setup()
  simulator.triggerSensor('sensor-b1-a-1', t + 1000)
  simulator.setDeviceStatus('sensor-b1-a-1', 'offline', t + 2000)
  assert.equal(devices.getById('sensor-b1-a-1').triggered, false)
  assert.equal(simulator.triggerSensor('sensor-b1-a-1', t + 3000), false)
  simulator.setDeviceStatus('light-b1-a-1', 'fault', t + 4000)
  assert.equal(simulator.manualSetLight('light-b1-a-1', 80, t + 5000), false)
})

test('energy is settled from elapsed time, and start is idempotent', () => {
  const { simulator, energy, startAt: t } = setup()
  simulator.tick(t + 3_600_000, { randomEvents: false })
  assert.ok(Math.abs(energy.baselineKwh - 0.48) < 1e-9)
  assert.ok(Math.abs(energy.actualKwh - 0.088) < 1e-9)
  assert.ok(
    Math.abs(
      Object.values(energy.deviceTotals).reduce(
        (sum, total) => sum + total.actualKwh,
        0,
      ) - energy.actualKwh,
    ) < 1e-12,
  )
  assert.equal(simulator.start(), true)
  assert.equal(simulator.start(), false)
  assert.equal(simulator.stop(), true)
  assert.equal(simulator.stop(), false)
})

test('one light at 50 percent for 60 seconds has a reproducible device total', () => {
  const { simulator, energy, startAt: t } = setup()
  const deviceId = 'light-b1-a-1'

  simulator.manualSetLight(deviceId, 50, t)
  simulator.tick(t + 60_000, { randomEvents: false })

  const total = energy.deviceTotals[deviceId]
  assert.ok(Math.abs(total.actualKwh - 0.0003333333333333333) < 1e-12)
  assert.ok(Math.abs(total.baselineKwh - 0.0006666666666666666) < 1e-12)
  assert.equal(total.onlineDurationMs, 60_000)
  assert.equal(total.brightnessWeightedDurationMs, 30_000)
})

test('device energy accumulates brightness segments without double counting', () => {
  const { simulator, energy, startAt: t } = setup()
  const deviceId = 'light-b1-a-1'

  simulator.manualSetLight(deviceId, 50, t)
  simulator.manualSetLight(deviceId, 100, t + 30_000)
  simulator.tick(t + 60_000, { randomEvents: false })

  const total = energy.deviceTotals[deviceId]
  assert.ok(Math.abs(total.actualKwh - 0.0005) < 1e-12)
  assert.ok(Math.abs(total.baselineKwh - 0.0006666666666666666) < 1e-12)
  assert.equal(total.onlineDurationMs, 60_000)
  assert.equal(total.brightnessWeightedDurationMs, 45_000)
})

test('energy remains continuous across linkage, return, manual, rule, offline and recovery', () => {
  const { simulator, devices, energy, startAt: t } = setup()
  const deviceId = 'light-b1-a-1'

  simulator.triggerSensor('sensor-b1-a-1', t + 10_000)
  simulator.tick(t + 16_000, { randomEvents: false })
  simulator.tick(t + 28_000, { randomEvents: false })
  simulator.manualSetLight(deviceId, 50, t + 30_000)
  simulator.updateRule('rule-b1-a', { standbyBrightness: 25 }, t + 40_000)
  simulator.setDeviceStatus(deviceId, 'offline', t + 50_000)
  simulator.shortenRecoveryWait(deviceId, t + 60_000)
  simulator.tick(t + 61_000, { randomEvents: false })
  simulator.tick(t + 71_000, { randomEvents: false })

  const total = energy.deviceTotals[deviceId]
  const expectedActualKwh = (40 * 32.9) / 3_600_000
  const expectedBaselineKwh = (40 * 60) / 3_600_000
  assert.equal(devices.getById(deviceId).status, 'online')
  assert.equal(devices.getById(deviceId).brightness, 25)
  assert.equal(total.onlineDurationMs, 60_000)
  assert.equal(total.brightnessWeightedDurationMs, 32_900)
  assert.ok(Math.abs(total.actualKwh - expectedActualKwh) < 1e-12)
  assert.ok(Math.abs(total.baselineKwh - expectedBaselineKwh) < 1e-12)
  assert.ok(
    Math.abs(
      Object.values(energy.deviceTotals).reduce(
        (sum, item) => sum + item.actualKwh,
        0,
      ) - energy.actualKwh,
    ) < 1e-12,
  )
  assert.ok(
    Math.abs(
      Object.values(energy.deviceTotals).reduce(
        (sum, item) => sum + item.baselineKwh,
        0,
      ) - energy.baselineKwh,
    ) < 1e-12,
  )
})

test('offline time adds neither actual nor baseline device energy', () => {
  const { simulator, energy, startAt: t } = setup()
  const deviceId = 'light-b1-a-1'

  simulator.setDeviceStatus(deviceId, 'offline', t + 10_000)
  const beforeOffline = { ...energy.deviceTotals[deviceId] }
  simulator.tick(t + 20_000, { randomEvents: false })

  assert.deepEqual(energy.deviceTotals[deviceId], beforeOffline)
  assert.ok(Math.abs(beforeOffline.actualKwh - 0.000022222222222222223) < 1e-12)
  assert.ok(
    Math.abs(beforeOffline.baselineKwh - 0.00011111111111111112) < 1e-12,
  )
})

test('energy sampling obeys its configured interval and zero baseline has no savings rate', () => {
  const {
    simulator,
    energy,
    startAt: t,
  } = setup(1_000_000, {
    energySampleMs: 10_000,
  })

  assert.equal(energy.savingsPercent, null)
  assert.equal(energy.samples.length, 1)
  simulator.tick(t + 3000, { randomEvents: false })
  assert.equal(energy.samples.length, 1)
  simulator.tick(t + 10_000, { randomEvents: false })
  assert.equal(energy.samples.length, 2)
  simulator.tick(t + 15_000, { randomEvents: false })
  assert.equal(energy.samples.length, 2)
})

test('manual mode expires and a sensorless zone holds its last automatic output', () => {
  const { simulator, devices, zones, startAt: t } = setup()
  simulator.triggerSensor('sensor-b1-a-1', t + 1000)
  assert.equal(simulator.manualSetLight('light-b1-a-1', 0, t + 2000), true)
  assert.equal(devices.getById('light-b1-a-1').lightState, 'off')
  simulator.tick(t + 8000, { randomEvents: false })
  simulator.tick(t + 20000, { randomEvents: false })
  simulator.tick(t + 302000, { randomEvents: false })
  assert.equal(devices.getById('light-b1-a-1').manualUntilAt, null)
  assert.equal(devices.getById('light-b1-a-1').lightState, 'standby')

  simulator.triggerSensor('sensor-b1-a-1', t + 303000)
  simulator.setDeviceStatus('sensor-b1-a-1', 'offline', t + 304000)
  simulator.setDeviceStatus('sensor-b1-a-2', 'offline', t + 305000)
  assert.equal(zones.getById('zone-b1-a').delayUntilAt, null)
  assert.equal(devices.getById('light-b1-a-1').lightState, 'full')
})

test('manual control overrides linkage, restores early, and is cleared by a fault', () => {
  const { simulator, devices, startAt: t } = setup()
  const light = devices.getById('light-b1-a-1')
  simulator.triggerSensor('sensor-b1-a-1', t + 1000)
  assert.equal(light.brightness, 100)
  assert.equal(simulator.manualSetLight(light.id, 0, t + 2000), true)
  assert.equal(light.brightness, 0)
  assert.equal(light.manualUntilAt, t + 302000)
  assert.equal(simulator.restoreAutomatic(light.id, t + 3000), true)
  assert.equal(light.manualUntilAt, null)
  assert.equal(light.brightness, 100)
  assert.equal(simulator.restoreAutomatic(light.id, t + 4000), false)
  simulator.manualSetLight(light.id, 35, t + 5000)
  simulator.setDeviceStatus(light.id, 'fault', t + 6000)
  assert.equal(light.manualUntilAt, null)
  assert.equal(simulator.manualSetLight(light.id, 70, t + 7000), false)
})

test('development shortcut expires manual mode through the normal tick', () => {
  const { simulator, devices, startAt: t } = setup()
  const light = devices.getById('light-b1-a-1')
  simulator.manualSetLight(light.id, 0, t + 1000)
  assert.equal(simulator.shortenManualWait(light.id, t + 2000), true)
  assert.equal(light.manualUntilAt, t + 2000)
  assert.equal(light.brightness, 0)
  simulator.tick(t + 3000, { randomEvents: false })
  assert.equal(light.manualUntilAt, null)
  assert.equal(light.lightState, 'standby')
  assert.equal(light.brightness, 20)
  assert.equal(simulator.shortenManualWait(light.id, t + 4000), false)
})

test('recovery ends a fault episode while alert handling remains independent', () => {
  const { simulator, devices, alerts, startAt: t } = setup()
  simulator.setDeviceStatus('sensor-b1-a-1', 'offline', t + 1000)
  const firstAlert = alerts.alerts[0]
  assert.equal(alerts.alerts.length, 1)
  assert.equal(firstAlert.resolved, false)
  simulator.setDeviceStatus('sensor-b1-a-1', 'online', t + 2000)
  assert.equal(firstAlert.resolved, false)
  simulator.setDeviceStatus('sensor-b1-a-1', 'offline', t + 3000)
  assert.equal(alerts.alerts.length, 1)
  alerts.resolve(firstAlert.id, t + 4000)
  assert.equal(devices.getById('sensor-b1-a-1').status, 'offline')
  simulator.setDeviceStatus('sensor-b1-a-1', 'online', t + 5000)
  simulator.setDeviceStatus('sensor-b1-a-1', 'offline', t + 6000)
  assert.equal(alerts.alerts.length, 2)
})

test('shortened recovery still completes through tick and leaves its alert unresolved', () => {
  const { simulator, devices, alerts, startAt: t } = setup()
  const device = devices.getById('light-b1-a-1')

  simulator.setDeviceStatus(device.id, 'offline', t + 1000)
  const alert = alerts.alerts[0]
  assert.equal(device.status, 'offline')
  assert.ok(device.recoverAt > t + 1000)
  assert.equal(simulator.shortenRecoveryWait(device.id, t + 2000), true)
  assert.equal(device.status, 'offline')
  assert.equal(device.recoverAt, t + 2000)

  simulator.tick(t + 3000, { randomEvents: false })
  assert.equal(device.status, 'online')
  assert.equal(device.recoverAt, null)
  assert.equal(alert.resolved, false)
  assert.equal(alert.resolvedAt, null)
  assert.equal(simulator.shortenRecoveryWait(device.id, t + 4000), false)
})

test('resolving an alert never changes the current device status', () => {
  const { simulator, devices, alerts, startAt: t } = setup()
  const device = devices.getById('sensor-b1-a-1')

  simulator.setDeviceStatus(device.id, 'fault', t + 1000)
  const alert = alerts.alerts[0]
  assert.equal(alerts.resolve(alert.id, t + 2000), true)
  assert.equal(alert.resolved, true)
  assert.equal(alert.resolvedAt, t + 2000)
  assert.equal(device.status, 'fault')
  assert.equal(alerts.resolve(alert.id, t + 3000), false)
})

test('scheduled standby supports a range crossing midnight', () => {
  const { rules } = setup()
  const rule = rules.getById('rule-b1-b')
  assert.equal(
    isScheduledNow(rule, new Date(2026, 8, 14, 23, 0).getTime()),
    true,
  )
  assert.equal(
    isScheduledNow(rule, new Date(2026, 8, 15, 5, 59).getTime()),
    true,
  )
  assert.equal(
    isScheduledNow(rule, new Date(2026, 8, 15, 6, 0).getTime()),
    false,
  )
})

test('rule update settles old energy and immediately recalculates automatic lights', () => {
  const { simulator, devices, energy, rules, startAt: t } = setup()
  const automaticLight = devices.getById('light-b1-a-1')
  const manualLight = devices.getById('light-b1-a-2')

  simulator.triggerSensor('sensor-b1-a-1', t + 1000)
  simulator.manualSetLight(manualLight.id, 35, t + 1500)
  assert.equal(
    simulator.updateRule('rule-b1-a', { fullBrightness: 50 }, t + 2000),
    true,
  )

  assert.equal(rules.getById('rule-b1-a').fullBrightness, 50)
  assert.equal(automaticLight.brightness, 50)
  assert.equal(manualLight.brightness, 35)
  assert.equal(manualLight.manualUntilAt, t + 301500)
  assert.equal(energy.lastSettledAt, t + 2000)
  assert.ok(Math.abs(energy.actualKwh - 0.00008083333333333334) < 1e-12)
})

test('rule update applies normal and cross-midnight standby while rejecting invalid values', () => {
  const night = new Date(2026, 8, 15, 23, 0).getTime()
  const { simulator, devices, rules } = setup(night)
  const light = devices.getById('light-b1-a-1')

  assert.equal(
    simulator.updateRule('rule-b1-a', { standbyBrightness: 28 }, night + 1000),
    true,
  )
  assert.equal(light.brightness, 28)
  assert.equal(
    simulator.updateRule(
      'rule-b1-a',
      {
        scheduleEnabled: true,
        scheduleStartTime: '22:00',
        scheduleEndTime: '06:00',
        scheduledBrightness: 9,
      },
      night + 2000,
    ),
    true,
  )
  assert.equal(light.brightness, 9)

  const savedRule = { ...rules.getById('rule-b1-a') }
  assert.equal(
    simulator.updateRule(
      'rule-b1-a',
      { scheduleStartTime: '06:00', scheduleEndTime: '06:00' },
      night + 3000,
    ),
    false,
  )
  assert.deepEqual(rules.getById('rule-b1-a'), savedRule)
})

test('rule validation enforces integer ranges, brightness order and valid times', () => {
  const validRule = {
    name: '测试策略',
    triggerHoldSeconds: 6,
    triggerDelayOff: 12,
    standbyBrightness: 20,
    fullBrightness: 80,
    scheduleEnabled: true,
    scheduleStartTime: '22:00',
    scheduleEndTime: '06:00',
    scheduledBrightness: 10,
  }
  assert.deepEqual(validateRule(validRule), {})
  assert.ok(
    validateRule({ ...validRule, triggerHoldSeconds: 0 }).triggerHoldSeconds,
  )
  assert.ok(
    validateRule({ ...validRule, triggerDelayOff: 1.5 }).triggerDelayOff,
  )
  assert.ok(validateRule({ ...validRule, fullBrightness: 10 }).fullBrightness)
  assert.ok(
    validateRule({ ...validRule, scheduleStartTime: '25:00' })
      .scheduleStartTime,
  )
  assert.ok(
    validateRule({
      ...validRule,
      scheduleStartTime: '08:00',
      scheduleEndTime: '08:00',
    }).scheduleEndTime,
  )
})
