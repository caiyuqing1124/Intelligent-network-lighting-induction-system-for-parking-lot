<script setup>
import { computed } from 'vue'

const props = defineProps({
  floor: { type: String, required: true },
  layout: { type: Object, required: true },
  zones: { type: Array, required: true },
  devices: { type: Array, required: true },
})
const emit = defineEmits(['select-device'])

const zoneMarkers = computed(() =>
  props.zones.map((zone) => {
    const members = props.devices.filter((device) => device.zoneId === zone.id)
    const x = members.length
      ? members.reduce((sum, device) => sum + device.mapX, 0) / members.length
      : 400
    return { id: zone.id, name: zone.name, x }
  }),
)

function deviceLabel(device) {
  const type = device.type === 'light' ? '灯具' : '感应器'
  const status =
    device.status === 'fault'
      ? '故障'
      : device.status === 'offline'
        ? '离线'
        : device.type === 'sensor'
          ? device.triggered
            ? '感应中'
            : '未触发'
          : `${device.brightness}% 亮度`
  return `${type} ${device.id}，${status}，打开详情`
}
</script>

<template>
  <svg
    class="floor-map"
    :viewBox="layout.viewBox"
    role="group"
    :aria-label="`${floor} 层车库平面图，点击设备点位查看详情`"
  >
    <rect x="0" y="0" width="800" height="420" rx="18" class="map-ground" />
    <g class="parking-stalls" aria-hidden="true">
      <template v-for="(row, rowIndex) in layout.parkingRows" :key="rowIndex">
        <rect
          v-for="slot in row.count"
          :key="slot"
          :x="row.x + (slot - 1) * (row.width + row.gap)"
          :y="row.y"
          :width="row.width"
          :height="row.height"
          rx="4"
        />
      </template>
    </g>
    <g class="map-lanes" aria-hidden="true">
      <rect
        v-for="(lane, index) in layout.lanes"
        :key="index"
        :x="lane.x"
        :y="lane.y"
        :width="lane.width"
        :height="lane.height"
        rx="5"
      />
      <path d="M52 210 H746" class="lane-line" />
    </g>
    <g class="zone-labels" aria-hidden="true">
      <text v-for="zone in zoneMarkers" :key="zone.id" :x="zone.x" y="30">
        {{ zone.name }}
      </text>
    </g>
    <g
      v-for="device in devices"
      :key="device.id"
      class="device-point"
      :class="[
        device.type,
        device.status,
        {
          triggered: device.triggered,
          off: device.type === 'light' && device.brightness === 0,
        },
      ]"
      role="button"
      tabindex="0"
      :aria-label="deviceLabel(device)"
      @click="emit('select-device', device.id)"
      @keydown.enter="emit('select-device', device.id)"
      @keydown.space.prevent="emit('select-device', device.id)"
    >
      <title>{{ deviceLabel(device) }}</title>
      <template v-if="device.type === 'light'">
        <circle
          class="light-glow"
          :cx="device.mapX"
          :cy="device.mapY"
          r="23"
          :style="{
            opacity:
              device.status === 'online' ? 0.08 + device.brightness * 0.005 : 0,
          }"
        />
        <circle class="light-ring" :cx="device.mapX" :cy="device.mapY" r="14" />
        <circle
          class="light-core"
          :cx="device.mapX"
          :cy="device.mapY"
          r="9"
          :style="{
            opacity:
              device.status === 'online'
                ? 0.25 + device.brightness * 0.0075
                : 1,
          }"
        />
      </template>
      <template v-else>
        <rect
          class="sensor-body"
          :x="device.mapX - 12"
          :y="device.mapY - 12"
          width="24"
          height="24"
          rx="5"
        />
        <circle class="sensor-core" :cx="device.mapX" :cy="device.mapY" r="4" />
      </template>
    </g>
  </svg>
</template>

<style scoped>
.floor-map {
  display: block;
  width: 100%;
  height: auto;
  background: #e8eef5;
  border: 1px solid #dae4ef;
  border-radius: 15px;
}
.map-ground {
  fill: #edf2f7;
}
.parking-stalls rect {
  fill: #f9fbfd;
  stroke: #c7d4e2;
  stroke-width: 2;
}
.map-lanes rect {
  fill: #d7e1ea;
}
.lane-line {
  fill: none;
  stroke: #fff;
  stroke-width: 2;
  stroke-dasharray: 16 12;
}
.zone-labels text {
  fill: #60758d;
  font-size: 17px;
  font-weight: 700;
  text-anchor: middle;
}
.device-point {
  cursor: pointer;
  outline: none;
}
.device-point:focus-visible .light-ring,
.device-point:focus-visible .sensor-body {
  stroke: #1c65c0;
  stroke-width: 5;
}
.light-glow {
  fill: #efb43d;
  transition: opacity 650ms ease;
}
.light-ring {
  fill: #fff;
  stroke: #d49829;
  stroke-width: 3;
}
.light-core {
  fill: #f6b52d;
  transition:
    opacity 650ms ease,
    fill 650ms ease;
}
.device-point.off .light-core {
  fill: #708399;
}
.device-point.off .light-ring {
  stroke: #8191a5;
}
.sensor-body {
  fill: #d9f3ee;
  stroke: #1d9c86;
  stroke-width: 3;
}
.sensor-core {
  fill: #1d9c86;
}
.device-point.triggered .sensor-body {
  fill: #c5e0ff;
  stroke: var(--color-primary);
}
.device-point.triggered .sensor-core {
  fill: var(--color-primary);
}
.device-point.offline .light-ring,
.device-point.offline .sensor-body {
  fill: #dce2e9;
  stroke: #8a98a9;
}
.device-point.offline .light-core,
.device-point.offline .sensor-core {
  fill: #8a98a9;
}
.device-point.fault .light-ring,
.device-point.fault .sensor-body {
  fill: #ffe9e6;
  stroke: #d7483b;
}
.device-point.fault .light-core,
.device-point.fault .sensor-core {
  fill: #d7483b;
}
</style>
