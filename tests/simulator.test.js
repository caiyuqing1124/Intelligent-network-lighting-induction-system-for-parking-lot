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

function setup(startAt = 1_000_000) {
  const pinia = createPinia()
  const simulator = createSimulationController(pinia, {
    now: () => startAt,
    random: () => 1,
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
  assert.equal(simulator.start(), true)
  assert.equal(simulator.start(), false)
  assert.equal(simulator.stop(), true)
  assert.equal(simulator.stop(), false)
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
