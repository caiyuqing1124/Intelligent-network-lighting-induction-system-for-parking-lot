export function filterDevices(
  devices,
  zones,
  { search = '', type = '', status = '' } = {},
) {
  const keyword = search.trim().toLocaleLowerCase('zh-CN')
  return devices.filter((device) => {
    if (type && device.type !== type) return false
    if (status && device.status !== status) return false
    const zoneName = zones.find((zone) => zone.id === device.zoneId)?.name ?? ''
    return (
      !keyword ||
      device.id.toLocaleLowerCase('zh-CN').includes(keyword) ||
      zoneName.toLocaleLowerCase('zh-CN').includes(keyword)
    )
  })
}

export function filterAlertRows(rows, { level = '', resolved = '' } = {}) {
  return rows.filter(({ alert }) => {
    if (level && alert.level !== level) return false
    if (resolved === 'unresolved' && alert.resolved) return false
    if (resolved === 'resolved' && !alert.resolved) return false
    return true
  })
}

export function filterEnergyRows(rows, zoneId = '') {
  return zoneId ? rows.filter((row) => row.device.zoneId === zoneId) : rows
}
