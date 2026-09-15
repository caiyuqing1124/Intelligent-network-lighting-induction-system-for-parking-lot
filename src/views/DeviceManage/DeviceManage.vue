<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ElButton, ElDialog, ElInput, ElOption, ElSelect } from 'element-plus'
import DeviceCard from '../../components/DeviceCard/DeviceCard.vue'
import { useDeviceStore } from '../../store/deviceStore.js'
import { useZoneStore } from '../../store/zoneStore.js'

const deviceStore = useDeviceStore()
const zoneStore = useZoneStore()
const search = ref('')
const typeFilter = ref('')
const statusFilter = ref('')
const selectedDeviceId = ref(null)
const now = ref(Date.now())
let clockId

onMounted(() => {
  clockId = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})
onUnmounted(() => clearInterval(clockId))

const hasFilters = computed(
  () =>
    search.value.trim() !== '' ||
    typeFilter.value !== '' ||
    statusFilter.value !== '',
)
const filteredDevices = computed(() => {
  const keyword = search.value.trim().toLocaleLowerCase()
  return deviceStore.devices.filter((device) => {
    if (typeFilter.value && device.type !== typeFilter.value) return false
    if (statusFilter.value && device.status !== statusFilter.value) return false
    if (!keyword) return true
    const zoneName = zoneStore.getById(device.zoneId)?.name ?? ''
    return (
      device.id.toLocaleLowerCase().includes(keyword) ||
      zoneName.toLocaleLowerCase().includes(keyword)
    )
  })
})
const dialogVisible = computed({
  get: () => selectedDeviceId.value !== null,
  set: (visible) => {
    if (!visible) selectedDeviceId.value = null
  },
})
const onlineCount = computed(
  () =>
    deviceStore.devices.filter((device) => device.status === 'online').length,
)

function clearFilters() {
  search.value = ''
  typeFilter.value = ''
  statusFilter.value = ''
}

function statusLabel(status) {
  return { online: '在线', offline: '离线', fault: '故障' }[status] ?? '未知'
}

function formatRemaining(untilAt) {
  if (untilAt === null) return '--'
  const seconds = Math.max(0, Math.ceil((untilAt - now.value) / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function deviceReading(device) {
  if (device.type === 'sensor')
    return device.status !== 'online'
      ? '不参与感应'
      : device.triggered
        ? '感应中'
        : '未触发'
  return device.status === 'online'
    ? `${device.brightness}% 亮度`
    : `停止输出（上次 ${device.brightness}%）`
}
</script>

<template>
  <section class="page-heading">
    <div>
      <p class="eyebrow">设备管理</p>
      <h1>全场设备台账</h1>
      <p class="subheading">
        集中查看灯具与感应器状态，在线灯具可进入详情手动控制。
      </p>
    </div>
    <span class="device-count"
      >{{ onlineCount }} / {{ deviceStore.devices.length }} 台在线</span
    >
  </section>

  <section class="panel device-manage-panel">
    <div class="device-toolbar" aria-label="设备筛选">
      <ElInput
        v-model="search"
        class="device-search"
        placeholder="搜索设备编号或分区名称"
        clearable
        aria-label="搜索设备编号或分区名称"
      />
      <ElSelect
        v-model="typeFilter"
        class="device-filter"
        aria-label="筛选设备类型"
        placeholder="全部类型"
      >
        <ElOption label="全部类型" value="" />
        <ElOption label="灯具" value="light" />
        <ElOption label="感应器" value="sensor" />
      </ElSelect>
      <ElSelect
        v-model="statusFilter"
        class="device-filter"
        aria-label="筛选设备状态"
        placeholder="全部状态"
      >
        <ElOption label="全部状态" value="" />
        <ElOption label="在线" value="online" />
        <ElOption label="离线" value="offline" />
        <ElOption label="故障" value="fault" />
      </ElSelect>
      <ElButton :disabled="!hasFilters" @click="clearFilters"
        >清除筛选</ElButton
      >
    </div>

    <div class="device-table-heading">
      <h2>设备列表</h2>
      <span
        >显示 {{ filteredDevices.length }} /
        {{ deviceStore.devices.length }} 台</span
      >
    </div>
    <div v-if="filteredDevices.length" class="device-table-wrap">
      <table class="device-table">
        <thead>
          <tr>
            <th scope="col">设备编号</th>
            <th scope="col">类型</th>
            <th scope="col">所属分区</th>
            <th scope="col">在线状态</th>
            <th scope="col">实时状态</th>
            <th scope="col">控制模式</th>
            <th scope="col">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="device in filteredDevices" :key="device.id">
            <td class="device-id-cell">{{ device.id }}</td>
            <td>{{ device.type === 'light' ? '灯具' : '感应器' }}</td>
            <td>{{ zoneStore.getById(device.zoneId)?.name ?? '未知分区' }}</td>
            <td>
              <span :class="['device-status', device.status]">{{
                statusLabel(device.status)
              }}</span>
            </td>
            <td>{{ deviceReading(device) }}</td>
            <td>
              <span v-if="device.type === 'sensor'" class="mode-muted">—</span>
              <span
                v-else-if="device.manualUntilAt !== null"
                class="manual-mode"
                >手动模式 · {{ formatRemaining(device.manualUntilAt) }}</span
              >
              <span v-else class="mode-muted">自动模式</span>
            </td>
            <td>
              <button
                type="button"
                class="table-action"
                @click="selectedDeviceId = device.id"
              >
                {{ device.type === 'light' ? '查看与控制' : '查看详情' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else-if="hasFilters" class="device-empty">
      没有符合当前搜索或筛选条件的设备；可修改条件或点击“清除筛选”。
    </p>
    <p v-else class="device-empty">暂无设备数据，请检查本地模拟数据。</p>
  </section>

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
.device-manage-panel {
  min-width: 0;
}
.device-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  padding-bottom: 20px;
  border-bottom: 1px solid #e9eef5;
}
.device-search {
  width: min(330px, 100%);
}
.device-filter {
  width: 150px;
}
.device-table-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 20px 0 14px;
}
.device-table-heading h2 {
  margin: 0;
  font-size: 18px;
}
.device-table-heading span {
  color: #8190a4;
  font-size: 13px;
}
.device-id-cell {
  color: #26496e;
  font-weight: 650;
}
.device-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 20px;
  padding: 5px 9px;
  font-size: 12px;
}
.device-status::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.device-status.online {
  color: #198354;
  background: #e9f7ef;
}
.device-status.offline {
  color: #708195;
  background: #eff2f5;
}
.device-status.fault {
  color: #c64c3e;
  background: #fff0ed;
}
.manual-mode {
  color: #a66a1d;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}
.mode-muted {
  color: #8392a4;
}
.device-empty {
  margin: 0;
  padding: 55px 14px;
  color: #7d8da0;
  text-align: center;
  font-size: 14px;
}
@media (max-width: 650px) {
  .device-toolbar :deep(.el-input),
  .device-toolbar :deep(.el-select) {
    width: 100%;
  }
}
</style>
