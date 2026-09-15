<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { getActivePinia } from 'pinia'
import { ElButton, ElSlider } from 'element-plus'
import { getAppSimulator } from '../../mock/simulator.js'
import { useDeviceStore } from '../../store/deviceStore.js'
import { useRuleStore } from '../../store/ruleStore.js'
import { useZoneStore } from '../../store/zoneStore.js'

const props = defineProps({ deviceId: { type: String, required: true } })
const deviceStore = useDeviceStore()
const zoneStore = useZoneStore()
const ruleStore = useRuleStore()
const simulator = getAppSimulator(getActivePinia())
const isDevelopment = import.meta.env.DEV
const device = computed(() => deviceStore.getById(props.deviceId))
const zone = computed(() =>
  device.value ? zoneStore.getById(device.value.zoneId) : null,
)
const selectedBrightness = ref(0)
const now = ref(Date.now())
let clockId

onMounted(() => {
  clockId = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})
onUnmounted(() => clearInterval(clockId))

watch(
  () => device.value?.brightness,
  (brightness) => {
    if (brightness !== null && brightness !== undefined)
      selectedBrightness.value = brightness
  },
  { immediate: true },
)

function statusLabel(status) {
  return { online: '在线', offline: '离线', fault: '故障' }[status] ?? '未知'
}

function formatRemaining(untilAt) {
  if (untilAt === null) return '--'
  const seconds = Math.max(0, Math.ceil((untilAt - now.value) / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function setLight(brightness) {
  if (!device.value) return
  if (simulator.manualSetLight(device.value.id, brightness)) {
    selectedBrightness.value = brightness
    now.value = Date.now()
  }
}

function turnOn() {
  const rule = zone.value && ruleStore.getById(zone.value.ruleId)
  setLight(rule?.fullBrightness ?? 100)
}

function restoreAutomatic() {
  if (device.value && simulator.restoreAutomatic(device.value.id))
    now.value = Date.now()
}

function triggerSensor() {
  if (isDevelopment && device.value?.type === 'sensor')
    simulator.triggerSensor(device.value.id)
}

function injectFault(status) {
  if (isDevelopment && device.value)
    simulator.setDeviceStatus(device.value.id, status)
}

function shortenManualWait() {
  if (isDevelopment && device.value)
    simulator.shortenManualWait(device.value.id)
}

function shortenRecoveryWait() {
  if (
    isDevelopment &&
    device.value &&
    simulator.shortenRecoveryWait(device.value.id)
  ) {
    now.value = Date.now()
  }
}
</script>

<template>
  <div v-if="device" class="device-card">
    <dl class="device-details">
      <div>
        <dt>设备编号</dt>
        <dd>{{ device.id }}</dd>
      </div>
      <div>
        <dt>设备类型</dt>
        <dd>{{ device.type === 'light' ? '灯具' : '感应器' }}</dd>
      </div>
      <div>
        <dt>所属分区</dt>
        <dd>{{ zone?.name ?? '未知分区' }}</dd>
      </div>
      <div>
        <dt>设备状态</dt>
        <dd :class="['detail-status', device.status]">
          {{ statusLabel(device.status) }}
        </dd>
      </div>
      <div v-if="device.type === 'light'">
        <dt>当前亮度</dt>
        <dd>{{ device.brightness }}%</dd>
      </div>
      <div v-if="device.type === 'light'">
        <dt>控制模式</dt>
        <dd>
          {{
            device.manualUntilAt === null
              ? '自动模式'
              : `手动模式 · 剩余 ${formatRemaining(device.manualUntilAt)}`
          }}
        </dd>
      </div>
      <div v-if="device.type === 'sensor'">
        <dt>感应状态</dt>
        <dd>
          {{
            device.status === 'online' && device.triggered
              ? `感应保持中 · 剩余 ${formatRemaining(device.triggeredUntilAt)}`
              : '未触发'
          }}
        </dd>
      </div>
      <div>
        <dt>最近变化</dt>
        <dd>
          {{
            new Date(device.lastActiveAt).toLocaleString('zh-CN', {
              hour12: false,
            })
          }}
        </dd>
      </div>
      <div v-if="device.status !== 'online' && device.recoverAt !== null">
        <dt>预计恢复</dt>
        <dd>{{ formatRemaining(device.recoverAt) }} 后由模拟引擎自动恢复</dd>
      </div>
    </dl>

    <div v-if="device.type === 'light'" class="light-controls">
      <h3>手动控制</h3>
      <p v-if="device.status !== 'online'" class="control-disabled-note">
        设备{{ statusLabel(device.status) }}，当前不可手动控制。
      </p>
      <p v-else class="control-note">
        手动操作立即生效，并在 5 分钟后自动恢复策略控制。
      </p>
      <div class="light-switch-actions">
        <ElButton :disabled="device.status !== 'online'" @click="turnOn"
          >手动开启</ElButton
        >
        <ElButton :disabled="device.status !== 'online'" @click="setLight(0)"
          >手动关闭</ElButton
        >
      </div>
      <div class="brightness-control">
        <label for="device-brightness">调光亮度</label>
        <strong>{{ selectedBrightness }}%</strong>
        <ElSlider
          id="device-brightness"
          v-model="selectedBrightness"
          :min="0"
          :max="100"
          :disabled="device.status !== 'online'"
          show-input
          @change="setLight"
        />
      </div>
      <ElButton
        type="primary"
        plain
        :disabled="device.status !== 'online' || device.manualUntilAt === null"
        @click="restoreAutomatic"
        >提前恢复自动</ElButton
      >
    </div>

    <div v-if="isDevelopment" class="device-dev-tools">
      <span>开发验证</span>
      <ElButton
        v-if="device.type === 'sensor'"
        size="small"
        :disabled="device.status !== 'online'"
        @click="triggerSensor"
        >触发感应</ElButton
      >
      <ElButton
        v-if="device.type === 'light'"
        size="small"
        :disabled="device.status !== 'online' || device.manualUntilAt === null"
        @click="shortenManualWait"
        >缩短手动等待</ElButton
      >
      <ElButton
        v-if="device.status !== 'online'"
        size="small"
        :disabled="device.recoverAt === null"
        @click="shortenRecoveryWait"
        >缩短恢复等待</ElButton
      >
      <ElButton
        size="small"
        :disabled="device.status !== 'online'"
        @click="injectFault('offline')"
        >模拟离线</ElButton
      >
      <ElButton
        size="small"
        :disabled="device.status !== 'online'"
        @click="injectFault('fault')"
        >模拟故障</ElButton
      >
    </div>
  </div>
  <p v-else class="empty-copy">设备已不在本次会话中，请重新选择。</p>
</template>

<style scoped>
.device-details div {
  display: flex;
  padding: 10px 0;
  border-bottom: 1px solid #eef1f5;
  gap: 18px;
}
.device-details dt {
  width: 86px;
  flex: 0 0 86px;
  color: #7b8da1;
}
.device-details dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.detail-status.online {
  color: #168454;
}
.detail-status.offline {
  color: #7c8b9b;
}
.detail-status.fault {
  color: #ca493e;
}
.light-controls {
  margin-top: 22px;
  border-top: 1px solid #e6edf4;
  padding-top: 18px;
}
.light-controls h3 {
  margin: 0 0 8px;
  font-size: 16px;
}
.control-note,
.control-disabled-note {
  margin: 0 0 16px;
  color: #7c8d9f;
  font-size: 12px;
}
.control-disabled-note {
  color: #b2523e;
}
.light-switch-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 18px;
}
.brightness-control {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 6px;
  margin-bottom: 16px;
  align-items: center;
  font-size: 13px;
}
.brightness-control strong {
  color: #2878d7;
}
.brightness-control :deep(.el-slider) {
  grid-column: 1 / -1;
}
.device-dev-tools {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 20px;
  padding-top: 14px;
  border-top: 1px dashed #dce5ef;
}
.device-dev-tools span {
  margin-right: 5px;
  color: #8998aa;
  font-size: 12px;
}
</style>
