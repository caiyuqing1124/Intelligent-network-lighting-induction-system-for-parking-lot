<script setup>
import { computed, ref } from 'vue'
import { ElButton, ElDialog, ElMessage, ElOption, ElSelect } from 'element-plus'
import AlertItem from '../../components/AlertItem/AlertItem.vue'
import DeviceCard from '../../components/DeviceCard/DeviceCard.vue'
import { useAlertStore } from '../../store/alertStore.js'
import { useDeviceStore } from '../../store/deviceStore.js'
import { useZoneStore } from '../../store/zoneStore.js'

const alertStore = useAlertStore()
const deviceStore = useDeviceStore()
const zoneStore = useZoneStore()
const levelFilter = ref('')
const resolvedFilter = ref('')
const selectedDeviceId = ref(null)

const hasFilters = computed(
  () => levelFilter.value !== '' || resolvedFilter.value !== '',
)
const alertRows = computed(() =>
  alertStore.alerts.map((alert) => {
    const device = deviceStore.getById(alert.deviceId)
    return {
      alert,
      device,
      zoneName: device
        ? (zoneStore.getById(device.zoneId)?.name ?? '未知分区')
        : '未知分区',
    }
  }),
)
const filteredRows = computed(() =>
  alertRows.value.filter(({ alert }) => {
    if (levelFilter.value && alert.level !== levelFilter.value) return false
    if (resolvedFilter.value === 'unresolved' && alert.resolved) return false
    if (resolvedFilter.value === 'resolved' && !alert.resolved) return false
    return true
  }),
)
const criticalUnresolvedCount = computed(
  () =>
    alertStore.alerts.filter(
      (alert) => alert.level === 'critical' && !alert.resolved,
    ).length,
)
const recoveredUnresolvedCount = computed(
  () =>
    alertRows.value.filter(
      ({ alert, device }) => !alert.resolved && device?.status === 'online',
    ).length,
)
const dialogVisible = computed({
  get: () => selectedDeviceId.value !== null,
  set: (visible) => {
    if (!visible) selectedDeviceId.value = null
  },
})

function clearFilters() {
  levelFilter.value = ''
  resolvedFilter.value = ''
}

function resolveAlert(id) {
  if (alertStore.resolve(id)) ElMessage.success('告警已标记为已处理')
}

function openDevice(id) {
  if (deviceStore.getById(id)) selectedDeviceId.value = id
}
</script>

<template>
  <section class="page-heading">
    <div>
      <p class="eyebrow">告警中心</p>
      <h1>设备异常处置台</h1>
      <p class="subheading">
        告警确认与设备恢复相互独立；本页记录仅属于当前模拟会话。
      </p>
    </div>
    <span class="alert-session-label"
      >本次会话 {{ alertStore.alerts.length }} 条</span
    >
  </section>

  <section class="alert-overview" aria-label="告警概况">
    <div class="alert-overview-lead">
      <span>待处理总数</span>
      <strong>{{ alertStore.unresolvedCount }}</strong>
      <small>运营人员尚未确认的历史告警</small>
    </div>
    <div>
      <span>严重未处理</span>
      <strong>{{ criticalUnresolvedCount }}</strong>
      <small>由设备故障产生</small>
    </div>
    <div>
      <span>设备已恢复、告警未处理</span>
      <strong>{{ recoveredUnresolvedCount }}</strong>
      <small>设备在线不代替人工确认</small>
    </div>
    <div class="alert-overview-note">
      <strong>处置口径</strong>
      <p>“已处理”只表示运营人员确认，不会改变设备的在线、离线或故障状态。</p>
    </div>
  </section>

  <section class="alert-content">
    <div class="alert-toolbar" aria-label="告警筛选">
      <div>
        <strong>告警记录</strong>
        <span
          >显示 {{ filteredRows.length }} /
          {{ alertStore.alerts.length }} 条</span
        >
      </div>
      <ElSelect
        v-model="levelFilter"
        class="alert-filter"
        placeholder="全部级别"
        aria-label="筛选告警级别"
      >
        <ElOption label="全部级别" value="" />
        <ElOption label="提示" value="info" />
        <ElOption label="警告" value="warning" />
        <ElOption label="严重" value="critical" />
      </ElSelect>
      <ElSelect
        v-model="resolvedFilter"
        class="alert-filter"
        placeholder="全部处理状态"
        aria-label="筛选处理状态"
      >
        <ElOption label="全部处理状态" value="" />
        <ElOption label="未处理" value="unresolved" />
        <ElOption label="已处理" value="resolved" />
      </ElSelect>
      <ElButton :disabled="!hasFilters" @click="clearFilters">
        清除筛选
      </ElButton>
    </div>

    <div v-if="filteredRows.length" class="alert-list">
      <AlertItem
        v-for="row in filteredRows"
        :key="row.alert.id"
        :alert="row.alert"
        :device="row.device"
        :zone-name="row.zoneName"
        @resolve="resolveAlert"
        @view-device="openDevice"
      />
    </div>

    <div v-else-if="hasFilters" class="alert-empty">
      <span class="empty-symbol">筛</span>
      <strong>没有符合当前条件的告警</strong>
      <p>可以调整级别或处理状态，也可以清除全部筛选条件。</p>
      <ElButton type="primary" plain @click="clearFilters">清除筛选</ElButton>
    </div>

    <div v-else class="alert-empty">
      <span class="empty-symbol safe">✓</span>
      <strong>本次会话暂未产生告警</strong>
      <p>模拟引擎检测到设备离线或故障后，告警会自动出现在这里。</p>
      <RouterLink class="text-link" to="/devices">查看设备运行状态</RouterLink>
    </div>
  </section>

  <ElDialog
    v-model="dialogVisible"
    title="关联设备详情"
    width="min(540px, 92vw)"
    destroy-on-close
  >
    <DeviceCard v-if="selectedDeviceId" :device-id="selectedDeviceId" />
  </ElDialog>
</template>

<style scoped>
.alert-session-label {
  border-radius: 20px;
  padding: 8px 12px;
  background: #eef3f8;
  color: #61758d;
  font-size: 12px;
  white-space: nowrap;
}
.alert-overview {
  display: grid;
  grid-template-columns: 1fr 1fr 1.35fr minmax(270px, 1.5fr);
  overflow: hidden;
  margin-bottom: 20px;
  border: 1px solid #e3e9f0;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 8px 22px #1d2c4208;
}
.alert-overview > div {
  min-width: 0;
  padding: 20px 22px;
  border-right: 1px solid #e9eef4;
}
.alert-overview > div:last-child {
  border-right: 0;
}
.alert-overview span,
.alert-overview small,
.alert-overview strong {
  display: block;
}
.alert-overview span,
.alert-overview small {
  color: #7e8fa3;
  font-size: 11px;
}
.alert-overview > div > strong {
  margin: 8px 0;
  color: #2c445f;
  font-size: 25px;
}
.alert-overview-lead {
  background: #172b45;
}
.alert-overview-lead span,
.alert-overview-lead small {
  color: #a6b8ce;
}
.alert-overview .alert-overview-lead strong {
  color: #fff;
}
.alert-overview-note {
  background: #f8fafc;
}
.alert-overview .alert-overview-note strong {
  margin: 0 0 7px;
  color: #3b5571;
  font-size: 13px;
}
.alert-overview-note p {
  margin: 0;
  color: #74869b;
  font-size: 11px;
  line-height: 1.65;
}
.alert-content {
  min-height: 390px;
}
.alert-toolbar {
  display: flex;
  align-items: center;
  gap: 11px;
  margin-bottom: 15px;
  padding: 15px 17px;
  border: 1px solid #e3e9f0;
  border-radius: 12px;
  background: #fff;
}
.alert-toolbar > div {
  flex: 1;
  min-width: 190px;
}
.alert-toolbar strong,
.alert-toolbar span {
  display: block;
}
.alert-toolbar strong {
  color: #344d69;
  font-size: 14px;
}
.alert-toolbar span {
  margin-top: 4px;
  color: #8594a6;
  font-size: 11px;
}
.alert-filter {
  width: 165px;
}
.alert-list {
  display: grid;
  gap: 12px;
}
.alert-empty {
  min-height: 330px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 1px dashed #d6e0ea;
  border-radius: 14px;
  background: #f8fafc;
  color: #76889d;
  text-align: center;
}
.empty-symbol {
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  margin-bottom: 14px;
  border-radius: 15px;
  background: #e8f1fc;
  color: #3275bd;
  font-weight: 800;
}
.empty-symbol.safe {
  background: #e6f5ed;
  color: #188054;
}
.alert-empty strong {
  color: #405a77;
  font-size: 16px;
}
.alert-empty p {
  max-width: 470px;
  margin: 8px 20px 16px;
  font-size: 12px;
  line-height: 1.6;
}
@media (max-width: 1050px) {
  .alert-overview {
    grid-template-columns: 1fr 1fr 1fr;
  }
  .alert-overview-note {
    grid-column: 1 / -1;
    border-top: 1px solid #e9eef4;
  }
}
@media (max-width: 720px) {
  .alert-overview {
    grid-template-columns: 1fr 1fr;
  }
  .alert-overview > div:nth-child(2) {
    border-right: 0;
  }
  .alert-overview > div:nth-child(3) {
    grid-column: 1 / -1;
    border-top: 1px solid #e9eef4;
  }
  .alert-toolbar {
    align-items: stretch;
    flex-direction: column;
  }
  .alert-filter,
  .alert-toolbar .el-button {
    width: 100%;
  }
}
</style>
