const zonePositions = [
  { zoneId: 'zone-b1-a', floor: 'B1', prefix: 'b1-a', x: 165, standby: 20 },
  { zoneId: 'zone-b1-b', floor: 'B1', prefix: 'b1-b', x: 620, standby: 20 },
  { zoneId: 'zone-b2-a', floor: 'B2', prefix: 'b2-a', x: 395, standby: 15 },
]

function createSensor(zone, index, now) {
  return {
    id: `sensor-${zone.prefix}-${index + 1}`,
    type: 'sensor',
    zoneId: zone.zoneId,
    status: 'online',
    lightState: null,
    brightness: null,
    ratedPowerW: null,
    triggered: false,
    triggeredUntilAt: null,
    manualUntilAt: null,
    recoverAt: null,
    mapX: zone.x + (index === 0 ? -60 : 60),
    mapY: 210,
    lastActiveAt: now,
  }
}

function createLight(zone, index, now) {
  return {
    id: `light-${zone.prefix}-${index + 1}`,
    type: 'light',
    zoneId: zone.zoneId,
    status: 'online',
    lightState: 'standby',
    brightness: zone.standby,
    ratedPowerW: 40,
    triggered: null,
    triggeredUntilAt: null,
    manualUntilAt: null,
    recoverAt: null,
    mapX: zone.x + (index % 2 === 0 ? -70 : 70),
    mapY: index < 2 ? 95 : 325,
    lastActiveAt: now,
  }
}

export function createInitialDevices(now = Date.now()) {
  return zonePositions.flatMap((zone) => [
    ...Array.from({ length: 2 }, (_, index) => createSensor(zone, index, now)),
    ...Array.from({ length: 4 }, (_, index) => createLight(zone, index, now)),
  ])
}
