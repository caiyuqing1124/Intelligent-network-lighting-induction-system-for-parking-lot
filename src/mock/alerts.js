export function createInitialAlerts() {
  return []
}

export function createDeviceAlert(device, type, now, id) {
  const isFault = type === 'fault'
  return {
    id,
    deviceId: device.id,
    type,
    level: isFault ? 'critical' : 'warning',
    message: `${device.id}${isFault ? '发生故障' : '已离线'}`,
    createdAt: now,
    resolved: false,
    resolvedAt: null,
  }
}
