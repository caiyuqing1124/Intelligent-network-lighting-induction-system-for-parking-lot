import test from 'node:test'
import assert from 'node:assert/strict'
import { createPinia } from 'pinia'
import { useDeviceStore } from '../src/store/deviceStore.js'
import { useZoneStore } from '../src/store/zoneStore.js'
import { useAlertStore } from '../src/store/alertStore.js'
import {
  filterDevices,
  filterAlertRows,
  filterEnergyRows,
} from '../src/utils/filterRecords.js'

test('device filters intersect, ignore search whitespace and restore all rows when cleared', () => {
  const pinia = createPinia()
  const devices = useDeviceStore(pinia)
  const zones = useZoneStore(pinia)
  const run = (filters) => filterDevices(devices.devices, zones.zones, filters)
  assert.equal(run({ search: '   ' }).length, 18)
  assert.equal(run({ search: ' LIGHT-B1-A-1 ' }).length, 1)
  assert.equal(
    run({ search: 'B1-A', type: 'sensor', status: 'online' }).length,
    2,
  )
  for (const filters of [
    { search: '不存在' },
    { status: 'fault' },
    { type: 'missing' },
    { search: 'light-b1-a-1', type: 'sensor' },
  ])
    assert.equal(run(filters).length, 0)
  assert.equal(run({ search: '', type: '', status: '' }).length, 18)
  assert.deepEqual(filterDevices([], [], {}), [])
})

test('alert filters distinguish resolved states, handle no results and restore records when cleared', () => {
  const pinia = createPinia()
  const alerts = useAlertStore(pinia)
  const devices = useDeviceStore(pinia)
  alerts.recordFault(devices.devices[0], 'offline', 1000)
  alerts.recordFault(devices.devices[1], 'fault', 2000)
  alerts.resolve(alerts.alerts[0].id, 3000)
  const rows = alerts.alerts.map((alert) => ({ alert }))
  assert.equal(
    filterAlertRows(rows, { level: 'critical', resolved: 'resolved' }).length,
    1,
  )
  assert.equal(
    filterAlertRows(rows, { level: 'warning', resolved: 'unresolved' }).length,
    1,
  )
  assert.equal(filterAlertRows(rows, { level: 'info' }).length, 0)
  assert.equal(
    filterAlertRows(rows, { level: 'critical', resolved: 'unresolved' }).length,
    0,
  )
  assert.equal(filterAlertRows(rows, { level: '', resolved: '' }).length, 2)
  assert.deepEqual(filterAlertRows([], {}), [])
})

test('energy zone filtering handles missing zones and returns the complete ledger when cleared', () => {
  const devices = useDeviceStore(createPinia())
  const rows = devices.lights.map((device) => ({ device }))
  assert.equal(filterEnergyRows(rows, 'zone-b1-a').length, 4)
  assert.equal(filterEnergyRows(rows, 'missing').length, 0)
  assert.equal(filterEnergyRows(rows, '').length, 12)
  assert.deepEqual(filterEnergyRows([], ''), [])
})
