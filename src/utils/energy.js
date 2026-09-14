export function calculateEnergyDelta(devices, durationMs) {
  if (durationMs <= 0) return { actualKwh: 0, baselineKwh: 0 }
  const hours = durationMs / 3_600_000
  let actualKwh = 0
  let baselineKwh = 0
  for (const device of devices) {
    if (device.type !== 'light' || device.status !== 'online') continue
    const ratedKilowatts = device.ratedPowerW / 1000
    baselineKwh += ratedKilowatts * hours
    actualKwh += ratedKilowatts * (device.brightness / 100) * hours
  }
  return { actualKwh, baselineKwh }
}
