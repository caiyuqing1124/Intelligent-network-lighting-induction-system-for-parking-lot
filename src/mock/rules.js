export const initialRules = [
  {
    id: 'rule-b1-a',
    name: 'B1 A区通行联动',
    triggerHoldSeconds: 6,
    triggerDelayOff: 12,
    standbyBrightness: 20,
    fullBrightness: 100,
    scheduleEnabled: false,
    scheduleStartTime: '22:00',
    scheduleEndTime: '06:00',
    scheduledBrightness: 10,
  },
  {
    id: 'rule-b1-b',
    name: 'B1 B区夜间节能',
    triggerHoldSeconds: 6,
    triggerDelayOff: 15,
    standbyBrightness: 20,
    fullBrightness: 90,
    scheduleEnabled: true,
    scheduleStartTime: '22:00',
    scheduleEndTime: '06:00',
    scheduledBrightness: 10,
  },
  {
    id: 'rule-b2-a',
    name: 'B2 A区通行联动',
    triggerHoldSeconds: 8,
    triggerDelayOff: 18,
    standbyBrightness: 15,
    fullBrightness: 100,
    scheduleEnabled: false,
    scheduleStartTime: '23:00',
    scheduleEndTime: '05:00',
    scheduledBrightness: 8,
  },
]

export function createInitialRules() {
  return initialRules.map((rule) => ({ ...rule }))
}
