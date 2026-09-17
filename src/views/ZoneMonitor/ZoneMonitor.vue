<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ElDialog } from 'element-plus'
import DeviceCard from '../../components/DeviceCard/DeviceCard.vue'
import EmptyState from '../../components/EmptyState/EmptyState.vue'
import FloorMap from '../../components/FloorMap/FloorMap.vue'
import { useDeviceStore } from '../../store/deviceStore.js'
import { useZoneStore } from '../../store/zoneStore.js'

const deviceStore = useDeviceStore()
const zoneStore = useZoneStore()
const floors = computed(() => [
  ...new Set(zoneStore.zones.map((zone) => zone.floor)),
])
const selectedFloor = ref(floors.value[0] ?? '')
const selectedDeviceId = ref(null)
const now = ref(Date.now())
let clockId

onMounted(() => {
  clockId = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})
onUnmounted(() => clearInterval(clockId))

const floorZones = computed(() =>
  zoneStore.zones.filter((zone) => zone.floor === selectedFloor.value),
)
const floorDevices = computed(() => {
  const zoneIds = new Set(floorZones.value.map((zone) => zone.id))
  return deviceStore.devices.filter((device) => zoneIds.has(device.zoneId))
})
const floorLayout = computed(() => zoneStore.floorLayouts[selectedFloor.value])
const dialogVisible = computed({
  get: () => selectedDeviceId.value !== null,
  set: (visible) => {
    if (!visible) selectedDeviceId.value = null
  },
})
const zoneStates = computed(() =>
  floorZones.value.map((zone) => {
    const members = zone.deviceIds
      .map((id) => deviceStore.getById(id))
      .filter(Boolean)
    const sensors = members.filter((device) => device.type === 'sensor')
    const onlineSensors = sensors.filter((device) => device.status === 'online')
    const triggeredSensors = onlineSensors.filter((sensor) => sensor.triggered)
    const lights = members.filter((device) => device.type === 'light')
    const remaining =
      zone.delayUntilAt === null
        ? null
        : Math.max(0, Math.ceil((zone.delayUntilAt - now.value) / 1000))
    let phase = '低亮待机'
    if (triggeredSensors.length) phase = '感应联动'
    else if (onlineSensors.length === 0) phase = '感应器不可用'
    else if (remaining !== null && remaining > 0) phase = '延时回落'
    return {
      ...zone,
      sensors,
      lights,
      onlineSensors: onlineSensors.length,
      triggeredSensors: triggeredSensors.length,
      remaining,
      phase,
    }
  }),
)

function openDevice(id) {
  if (deviceStore.getById(id)) selectedDeviceId.value = id
}

function statusLabel(status) {
  return { online: '在线', offline: '离线', fault: '故障' }[status] ?? '未知'
}

function formatRemaining(untilAt) {
  if (untilAt === null) return '--'
  const seconds = Math.max(0, Math.ceil((untilAt - now.value) / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
</script>

<template>
  <section class="page-heading">
    <div>
      <p class="eyebrow">分区监控</p>
      <h1>车库照明当前分布</h1>
      <p class="subheading">查看灯具与感应器当前状态，点击点位查看详情。</p>
    </div>
    <span class="zone-device-count page-meta-pill"
      >{{ floorDevices.length }} 台设备 · {{ floorZones.length }} 个分区</span
    >
  </section>

  <div
    v-if="floors.length"
    class="floor-switch"
    role="group"
    aria-label="选择楼层"
  >
    <button
      v-for="floor in floors"
      :key="floor"
      type="button"
      :class="{ active: selectedFloor === floor }"
      :aria-pressed="selectedFloor === floor"
      @click="selectedFloor = floor"
    >
      {{ floor }} 层
    </button>
  </div>

  <div v-if="floorLayout" class="monitor-layout">
    <section class="panel map-panel">
      <div class="panel-heading">
        <div>
          <h2>{{ selectedFloor }} 层平面图</h2>
          <p>圆形为灯具，方形为感应器；点位颜色随状态变化。</p>
        </div>
      </div>
      <FloorMap
        :floor="selectedFloor"
        :layout="floorLayout"
        :zones="floorZones"
        :devices="floorDevices"
        @select-device="openDevice"
      />
      <div class="map-legend" aria-label="点位图例">
        <span><i class="legend-light"></i>灯具</span>
        <span><i class="legend-sensor"></i>感应器</span>
        <span><i class="legend-active"></i>感应中</span>
        <span><i class="legend-offline"></i>离线</span>
        <span><i class="legend-fault"></i>故障</span>
      </div>
    </section>

    <aside class="zone-status-stack" aria-label="分区联动状态">
      <article
        v-for="zone in zoneStates"
        :key="zone.id"
        class="panel zone-status-card"
      >
        <div class="zone-status-heading">
          <div>
            <h2>{{ zone.name }}</h2>
            <small>{{ zone.lights.length }} 盏灯具</small>
          </div>
          <span
            :class="[
              'zone-phase-pill',
              {
                active: zone.triggeredSensors > 0,
                warning: zone.onlineSensors === 0,
              },
            ]"
          >
            {{ zone.phase }}
          </span>
        </div>
        <div class="zone-trigger-count">
          <strong
            >{{ zone.triggeredSensors }} / {{ zone.sensors.length }}</strong
          >
          <span>感应器触发中</span>
        </div>
        <div
          v-if="zone.remaining !== null && zone.remaining > 0"
          class="return-timer"
        >
          <span>灯组回到待机倒计时</span
          ><strong>{{ formatRemaining(zone.delayUntilAt) }}</strong>
        </div>
        <p v-else-if="zone.onlineSensors === 0" class="zone-note">
          该区没有在线感应器，自动灯组保持最近一次输出。
        </p>
        <p v-else-if="zone.triggeredSensors > 0" class="zone-note">
          只要任一在线感应器仍在保持期，灯组继续保持工作亮度。
        </p>
        <p v-else class="zone-note">当前没有感应触发，灯组按策略待机。</p>
        <div class="sensor-status-list">
          <div v-for="sensor in zone.sensors" :key="sensor.id">
            <span>{{ sensor.id.split('-').at(-1) }} 号感应器</span>
            <strong v-if="sensor.status !== 'online'">{{
              statusLabel(sensor.status)
            }}</strong>
            <strong v-else-if="sensor.triggered"
              >保持 {{ formatRemaining(sensor.triggeredUntilAt) }}</strong
            >
            <strong v-else>未触发</strong>
          </div>
        </div>
      </article>
    </aside>
  </div>
  <EmptyState
    v-else
    class="panel"
    symbol="层"
    title="暂无楼层数据"
    description="请检查分区与楼层基础配置，数据恢复后这里会显示平面图。"
  />

  <ElDialog
    v-model="dialogVisible"
    title="设备详情"
    width="min(540px, 92vw)"
    destroy-on-close
  >
    <DeviceCard v-if="selectedDeviceId" :device-id="selectedDeviceId" />
  </ElDialog>
</template>

<style scoped>
.zone-device-count {
  color: #71839a;
  font-size: 15px;
  white-space: nowrap;
}
.floor-switch {
  display: inline-flex;
  gap: 5px;
  margin-bottom: 20px;
  padding: 5px;
  border: 1px solid var(--color-border);
  border-radius: 11px;
  background: var(--color-border-light);
}
.floor-switch button {
  border: 0;
  border-radius: 8px;
  padding: 10px 22px;
  background: transparent;
  color: #61748b;
  font: inherit;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}
.floor-switch button.active {
  background: #fff;
  color: #216cc1;
  box-shadow: 0 2px 8px #20344915;
}
.floor-switch button:focus-visible {
  outline: 3px solid #80b9ff;
  outline-offset: 2px;
}
.monitor-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) minmax(300px, 0.9fr);
  gap: 20px;
  align-items: start;
}
.map-panel {
  min-width: 0;
}
.map-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 18px;
  margin-top: 17px;
  color: #70839a;
  font-size: 14px;
}
.map-legend span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.map-legend i {
  display: inline-block;
  width: 12px;
  height: 12px;
  background: #f1b633;
  border-radius: 50%;
  border: 2px solid #d29827;
}
.map-legend .legend-sensor {
  background: #d9f3ee;
  border-color: #1d9c86;
  border-radius: 3px;
}
.map-legend .legend-active {
  background: #c5e0ff;
  border-color: var(--color-primary);
  border-radius: 3px;
}
.map-legend .legend-offline {
  background: #dce2e9;
  border-color: #8a98a9;
}
.map-legend .legend-fault {
  background: #ffe9e6;
  border-color: #d7483b;
}
.zone-status-stack {
  min-width: 0;
}
.zone-status-card {
  padding: 20px;
}
.zone-status-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.zone-status-heading h2 {
  margin: 0 0 4px;
  font-size: 17px;
}
.zone-status-heading small {
  color: #8a99ab;
  font-size: 14px;
}
.zone-phase-pill {
  color: #537087;
  background: #edf2f7;
  font-size: 14px;
  border-radius: 20px;
  padding: 6px 9px;
  white-space: nowrap;
}
.zone-phase-pill.active {
  color: #1e65b5;
  background: #e4f0ff;
}
.zone-phase-pill.warning {
  color: #b35531;
  background: #fff0e8;
}
.zone-trigger-count {
  display: flex;
  align-items: baseline;
  gap: 11px;
  margin: 15px 0 12px;
}
.zone-trigger-count strong {
  color: #244b75;
  font-size: 27px;
  line-height: 1;
}
.zone-trigger-count span {
  color: #7f91a5;
  font-size: 14px;
}
.return-timer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-radius: 8px;
  background: #fff4df;
  color: #8a651d;
  padding: 10px 12px;
  font-size: 14px;
}
.return-timer strong {
  font-size: 17px;
  font-variant-numeric: tabular-nums;
}
.zone-note {
  min-height: 18px;
  margin: 0 0 12px;
  color: #8795a6;
  font-size: 14px;
  line-height: 1.5;
}
.sensor-status-list {
  border-top: 1px solid #ebf0f5;
}
.sensor-status-list div {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding-top: 9px;
  color: #75879b;
  font-size: 14px;
}
.sensor-status-list strong {
  color: #436486;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
@media (max-width: 1050px) {
  .monitor-layout {
    grid-template-columns: 1fr;
  }
  .zone-status-stack {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 16px;
  }
  .zone-status-card {
    margin-bottom: 0;
  }
}
@media (max-width: 560px) {
  .zone-status-stack {
    grid-template-columns: 1fr;
  }
  .map-panel {
    padding: 16px;
  }
  .zone-device-count {
    white-space: normal;
  }
}
</style>
