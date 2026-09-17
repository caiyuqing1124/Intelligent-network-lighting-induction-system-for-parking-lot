<script setup>
import { ElButton } from 'element-plus'

defineProps({
  alert: { type: Object, required: true },
  device: { type: Object, default: null },
  zoneName: { type: String, default: '未知分区' },
})
defineEmits(['resolve', 'view-device'])

function levelLabel(level) {
  return { info: '提示', warning: '警告', critical: '严重' }[level] ?? '未知'
}

function typeLabel(type) {
  return { offline: '设备离线', fault: '设备故障' }[type] ?? '未知告警'
}

function statusLabel(status) {
  return { online: '在线', offline: '离线', fault: '故障' }[status] ?? '未知'
}

function formatTime(timestamp) {
  if (timestamp === null) return '--'
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false })
}
</script>

<template>
  <article :class="['alert-item', `level-${alert.level}`]">
    <div class="alert-severity" aria-hidden="true">
      <span>{{ alert.level === 'critical' ? '!' : 'i' }}</span>
    </div>

    <div class="alert-main">
      <div class="alert-title-row">
        <div>
          <span :class="['level-label', alert.level]">
            {{ levelLabel(alert.level) }}
          </span>
          <span class="type-label">{{ typeLabel(alert.type) }}</span>
        </div>
        <time :datetime="new Date(alert.createdAt).toISOString()">
          {{ formatTime(alert.createdAt) }}
        </time>
      </div>
      <h3>{{ alert.message }}</h3>
      <div class="alert-device-line">
        <button
          v-if="device"
          type="button"
          class="device-link"
          @click="$emit('view-device', device.id)"
        >
          {{ alert.deviceId }}
        </button>
        <strong v-else>{{ alert.deviceId }}</strong>
        <span>{{ device?.type === 'light' ? '灯具' : '感应器' }}</span>
        <span>{{ zoneName }}</span>
      </div>
    </div>

    <div class="alert-state-panel">
      <div>
        <span>告警记录</span>
        <strong :class="alert.resolved ? 'resolved' : 'unresolved'">
          {{ alert.resolved ? '已处理' : '未处理' }}
        </strong>
        <small v-if="alert.resolved">
          {{ formatTime(alert.resolvedAt) }}
        </small>
      </div>
      <div>
        <span>设备当前</span>
        <strong :class="['device-current', device?.status ?? 'unknown']">
          {{ statusLabel(device?.status) }}
        </strong>
        <small>{{ device ? '当前状态' : '设备数据缺失' }}</small>
      </div>
    </div>

    <div class="alert-actions">
      <ElButton
        type="primary"
        plain
        :disabled="alert.resolved"
        @click="$emit('resolve', alert.id)"
      >
        {{ alert.resolved ? '已处理' : '标记已处理' }}
      </ElButton>
    </div>
  </article>
</template>

<style scoped>
.alert-item {
  position: relative;
  display: grid;
  grid-template-columns: 42px minmax(260px, 1.5fr) minmax(260px, 0.85fr) auto;
  gap: 16px;
  align-items: center;
  padding: 20px;
  border: 1px solid #e4eaf1;
  border-left: 4px solid #d5a33c;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 5px 18px rgb(29 44 66 / 7%);
}
.alert-item.level-critical {
  border-left-color: #d65347;
}
.alert-severity {
  align-self: start;
}
.alert-severity span {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: #fff4da;
  color: #ad741e;
  font-size: 17px;
  font-weight: 800;
}
.level-critical .alert-severity span {
  background: #ffebe8;
  color: #c64b40;
}
.alert-main {
  min-width: 0;
}
.alert-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.alert-title-row > div {
  display: flex;
  align-items: center;
  gap: 8px;
}
.alert-title-row time {
  color: #8594a6;
  font-size: 13px;
  white-space: nowrap;
}
.level-label,
.type-label {
  display: inline-flex;
  border-radius: 20px;
  padding: 4px 8px;
  font-size: 13px;
}
.level-label.warning {
  color: #99671d;
  background: var(--color-warning-soft);
}
.level-label.critical {
  color: #bb4339;
  background: #ffebe8;
}
.level-label.info {
  color: #286db7;
  background: #eaf3ff;
}
.type-label {
  color: var(--color-text-secondary);
  background: #eef2f6;
}
.alert-main h3 {
  margin: 10px 0 9px;
  color: #253b56;
  font-size: 16px;
}
.alert-device-line {
  display: flex;
  flex-wrap: wrap;
  gap: 7px 13px;
  align-items: center;
  color: #8190a3;
  font-size: 13px;
}
.device-link {
  border: 0;
  padding: 0;
  background: none;
  color: var(--color-primary);
  cursor: pointer;
  font: inherit;
  font-weight: 700;
}
.device-link:hover {
  text-decoration: underline;
}
.device-link:focus-visible {
  outline: 3px solid #80b9ff;
  outline-offset: 2px;
}
.alert-state-panel {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-left: 1px solid #e8edf3;
}
.alert-state-panel > div {
  min-width: 0;
  padding: 3px 16px;
}
.alert-state-panel span,
.alert-state-panel strong,
.alert-state-panel small {
  display: block;
}
.alert-state-panel span,
.alert-state-panel small {
  color: #8998aa;
  font-size: 12px;
}
.alert-state-panel strong {
  margin: 6px 0 5px;
  color: #3e536c;
  font-size: 15px;
}
.alert-state-panel strong.unresolved {
  color: #b45b30;
}
.alert-state-panel strong.resolved,
.device-current.online {
  color: var(--color-success);
}
.device-current.offline {
  color: #6c7c90;
}
.device-current.fault {
  color: var(--color-danger);
}
.alert-actions {
  justify-self: end;
}
@media (max-width: 1000px) {
  .alert-item {
    grid-template-columns: 42px minmax(0, 1fr) auto;
  }
  .alert-state-panel {
    grid-column: 2 / -1;
    grid-row: 2;
    border-top: 1px solid #e8edf3;
    border-left: 0;
    padding-top: 13px;
  }
}
@media (max-width: 650px) {
  .alert-item {
    grid-template-columns: 36px minmax(0, 1fr);
  }
  .alert-title-row {
    align-items: flex-start;
    flex-direction: column;
  }
  .alert-state-panel,
  .alert-actions {
    grid-column: 1 / -1;
  }
  .alert-actions,
  .alert-actions .el-button {
    width: 100%;
  }
}
</style>
