export function isScheduledNow(rule, now) {
  if (!rule.scheduleEnabled) return false
  const date = new Date(now)
  const minute = date.getHours() * 60 + date.getMinutes()
  const [startHour, startMinute] = rule.scheduleStartTime.split(':').map(Number)
  const [endHour, endMinute] = rule.scheduleEndTime.split(':').map(Number)
  const start = startHour * 60 + startMinute
  const end = endHour * 60 + endMinute
  if (start === end) return false
  return start < end
    ? minute >= start && minute < end
    : minute >= start || minute < end
}

export function getStandbyBrightness(rule, now) {
  return isScheduledNow(rule, now)
    ? rule.scheduledBrightness
    : rule.standbyBrightness
}

export function reconcileZone({
  zone,
  rule,
  devices,
  now,
  wasActive,
  updateDevice,
  setDelay,
}) {
  const members = zone.deviceIds.map((id) =>
    devices.find((device) => device.id === id),
  )
  const onlineSensors = members.filter(
    (device) => device?.type === 'sensor' && device.status === 'online',
  )
  const active = onlineSensors.some((sensor) => sensor.triggered)

  if (active) {
    if (zone.delayUntilAt !== null) setDelay(zone.id, null)
  } else if (onlineSensors.length === 0) {
    if (zone.delayUntilAt !== null) setDelay(zone.id, null)
  } else if (zone.delayUntilAt === null && wasActive) {
    if (rule.triggerDelayOff > 0)
      setDelay(zone.id, now + rule.triggerDelayOff * 1000)
  } else if (zone.delayUntilAt !== null && now >= zone.delayUntilAt) {
    setDelay(zone.id, null)
  }

  if (!active && onlineSensors.length === 0) return

  const full = active || (zone.delayUntilAt !== null && now < zone.delayUntilAt)
  const brightness = full
    ? rule.fullBrightness
    : getStandbyBrightness(rule, now)
  const lightState = full ? 'full' : brightness === 0 ? 'off' : 'standby'
  for (const light of members) {
    if (
      light?.type !== 'light' ||
      light.status !== 'online' ||
      light.manualUntilAt !== null
    ) {
      continue
    }
    updateDevice(light.id, { lightState, brightness }, now)
  }
}
