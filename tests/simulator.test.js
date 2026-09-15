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
