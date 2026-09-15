export function calculateEnergyDelta(devices, durationMs) {
  if (durationMs <= 0) return { actualKwh: 0, baselineKwh: 0, deviceTotals: {} }
  const hours = durationMs / 3_600_000
  let actualKwh = 0
  let baselineKwh = 0
  const deviceTotals = {}
  for (const device of devices) {
    if (device.type !== 'light' || device.status !== 'online') continue
    const ratedKilowatts = device.ratedPowerW / 1000
    const deviceBaselineKwh = ratedKilowatts * hours
    const deviceActualKwh = ratedKilowatts * (device.brightness / 100) * hours
    baselineKwh += deviceBaselineKwh
    actualKwh += deviceActualKwh
    deviceTotals[device.id] = {
      actualKwh: deviceActualKwh,
      baselineKwh: deviceBaselineKwh,
      onlineDurationMs: durationMs,
      brightnessWeightedDurationMs: durationMs * (device.brightness / 100),
    }
  }
  return { actualKwh, baselineKwh, deviceTotals }
}
