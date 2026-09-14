export const floorLayouts = {
  B1: {
    viewBox: '0 0 800 420',
    lanes: [
      { x: 40, y: 175, width: 720, height: 70 },
      { x: 385, y: 40, width: 30, height: 340 },
    ],
  },
  B2: {
    viewBox: '0 0 800 420',
    lanes: [{ x: 40, y: 175, width: 720, height: 70 }],
  },
}

export const initialZones = [
  {
    id: 'zone-b1-a',
    name: 'B1-A区',
    floor: 'B1',
    deviceIds: [
      'sensor-b1-a-1',
      'sensor-b1-a-2',
      'light-b1-a-1',
      'light-b1-a-2',
      'light-b1-a-3',
      'light-b1-a-4',
    ],
    ruleId: 'rule-b1-a',
    delayUntilAt: null,
  },
  {
    id: 'zone-b1-b',
    name: 'B1-B区',
    floor: 'B1',
    deviceIds: [
      'sensor-b1-b-1',
      'sensor-b1-b-2',
      'light-b1-b-1',
      'light-b1-b-2',
      'light-b1-b-3',
      'light-b1-b-4',
    ],
    ruleId: 'rule-b1-b',
    delayUntilAt: null,
  },
  {
    id: 'zone-b2-a',
    name: 'B2-A区',
    floor: 'B2',
    deviceIds: [
      'sensor-b2-a-1',
      'sensor-b2-a-2',
      'light-b2-a-1',
      'light-b2-a-2',
      'light-b2-a-3',
      'light-b2-a-4',
    ],
    ruleId: 'rule-b2-a',
    delayUntilAt: null,
  },
]

export function createInitialZones() {
  return initialZones.map((zone) => ({
    ...zone,
    deviceIds: [...zone.deviceIds],
  }))
}
