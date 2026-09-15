<script setup>
import { computed, ref } from 'vue'
import { use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { ElOption, ElSelect } from 'element-plus'
import VChart from 'vue-echarts'
import ChartPanel from '../../components/ChartPanel/ChartPanel.vue'
import { SIMULATOR_CONFIG } from '../../mock/simulator.js'
import { useDeviceStore } from '../../store/deviceStore.js'
import { useEnergyStore } from '../../store/energyStore.js'
import { useZoneStore } from '../../store/zoneStore.js'

use([
  CanvasRenderer,
  LineChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
])

const deviceStore = useDeviceStore()
const energyStore = useEnergyStore()
const zoneStore = useZoneStore()
const zoneFilter = ref('')
const selectedDeviceId = ref(deviceStore.lights[0]?.id ?? null)

const zeroTotal = Object.freeze({
  actualKwh: 0,
  baselineKwh: 0,
  onlineDurationMs: 0,
  brightnessWeightedDurationMs: 0,
})

const deviceRows = computed(() =>
  deviceStore.lights.map((device) => {
    const total = energyStore.deviceTotals[device.id] ?? zeroTotal
    const averageBrightness =
      total.onlineDurationMs > 0
        ? (total.brightnessWeightedDurationMs / total.onlineDurationMs) * 100
        : null
    return {
      device,
      zone: zoneStore.getById(device.zoneId),
      total,
      averageBrightness,
      savedKwh: total.baselineKwh - total.actualKwh,
    }
  }),
)
const filteredRows = computed(() =>
  zoneFilter.value
    ? deviceRows.value.filter((row) => row.device.zoneId === zoneFilter.value)
    : deviceRows.value,
)
const selectedRow = computed(() =>
  deviceRows.value.find((row) => row.device.id === selectedDeviceId.value),
)
const detailsActualKwh = computed(() =>
  deviceRows.value.reduce((sum, row) => sum + row.total.actualKwh, 0),
)
const detailsBaselineKwh = computed(() =>
  deviceRows.value.reduce((sum, row) => sum + row.total.baselineKwh, 0),
)
const detailsMatch = computed(
  () =>
    Math.abs(detailsActualKwh.value - energyStore.actualKwh) < 1e-12 &&
    Math.abs(detailsBaselineKwh.value - energyStore.baselineKwh) < 1e-12,
)
const savedKwh = computed(() => energyStore.baselineKwh - energyStore.actualKwh)
const currentPowerW = computed(() =>
  deviceStore.lights.reduce(
    (sum, light) =>
      sum +
      (light.status === 'online'
        ? light.ratedPowerW * (light.brightness / 100)
        : 0),
    0,
  ),
)
const hasTrend = computed(() => energyStore.samples.length >= 2)
const trendOption = computed(() => ({
  animationDuration: 300,
  color: ['#2878d7', '#dc9d31'],
  grid: { left: 66, right: 22, top: 42, bottom: 38 },
  legend: {
    top: 0,
    right: 0,
    textStyle: { color: '#60748b', fontSize: 11 },
  },
  tooltip: {
    trigger: 'axis',
    formatter: (params) =>
      [
        new Date(params[0].value[0]).toLocaleTimeString('zh-CN', {
          hour12: false,
        }),
        ...params.map(
          (item) =>
            `${item.marker}${item.seriesName}：${item.value[1].toFixed(6)} kWh`,
        ),
      ].join('<br>'),
  },
  xAxis: {
    type: 'time',
    boundaryGap: false,
    axisLabel: { color: '#7b8da2', formatter: '{HH}:{mm}:{ss}' },
    axisLine: { lineStyle: { color: '#dce5ef' } },
    axisTick: { show: false },
    splitLine: { show: false },
  },
  yAxis: {
    type: 'value',
    min: 0,
    axisLabel: { color: '#7b8da2', formatter: (value) => value.toFixed(5) },
    splitLine: { lineStyle: { color: '#edf2f7' } },
  },
  series: [
    {
      name: '模拟实际用电',
      type: 'line',
      showSymbol: false,
      lineStyle: { width: 3 },
      areaStyle: { color: 'rgba(40, 120, 215, 0.10)' },
      data: energyStore.samples.map((sample) => [sample.at, sample.actualKwh]),
    },
    {
      name: '在线时段常亮基准',
      type: 'line',
      showSymbol: false,
      lineStyle: { width: 2, type: 'dashed' },
      data: energyStore.samples.map((sample) => [
        sample.at,
        sample.baselineKwh,
      ]),
    },
  ],
}))

function formatEnergy(value) {
  return Number(value).toFixed(6)
}

function formatTime(timestamp) {
  if (timestamp === null) return '--'
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false })
}

function formatDuration(durationMs) {
  const totalSeconds = Math.max(0, durationMs / 1000)
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)} 秒`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  return `${minutes} 分 ${seconds} 秒`
}

function statusLabel(status) {
  return { online: '在线', offline: '离线', fault: '故障' }[status] ?? '未知'
}

function selectAudit(deviceId) {
  selectedDeviceId.value = deviceId
}
</script>

<template>
  <section class="page-heading">
    <div>
      <p class="eyebrow">能耗报表</p>
      <h1>本次会话能耗核算</h1>
      <p class="subheading">
        每个数字均由灯具在线时长和实际亮度累计得出；刷新页面后重新从 0 开始。
      </p>
    </div>
    <span class="energy-cutoff"
      >统计截止 {{ formatTime(energyStore.lastSettledAt) }}</span
    >
  </section>

  <section class="energy-ledger-hero" aria-label="本次会话能耗汇总">
    <div class="energy-primary-total">
      <span>模拟实际用电</span>
      <strong>{{ formatEnergy(energyStore.actualKwh) }}</strong>
      <small>kWh</small>
      <p>当前灯具模拟功率 {{ currentPowerW.toFixed(1) }} W</p>
    </div>
    <div class="energy-comparison">
      <div>
        <span>在线时段常亮基准</span>
        <strong>{{ formatEnergy(energyStore.baselineKwh) }} kWh</strong>
      </div>
      <div>
        <span>累计节省</span>
        <strong>{{ formatEnergy(savedKwh) }} kWh</strong>
      </div>
      <div>
        <span>节能率</span>
        <strong>
          {{
            energyStore.savingsPercent === null
              ? '--'
              : `${energyStore.savingsPercent.toFixed(2)}%`
          }}
        </strong>
      </div>
    </div>
    <div class="energy-session-info">
      <div>
        <span>统计开始</span>
        <strong>{{ formatTime(energyStore.startedAt) }}</strong>
      </div>
      <div>
        <span>已核算会话时长</span>
        <strong>
          {{
            formatDuration(
              Math.max(
                0,
                (energyStore.lastSettledAt ?? 0) -
                  (energyStore.startedAt ?? energyStore.lastSettledAt ?? 0),
              ),
            )
          }}
        </strong>
      </div>
      <p>离线或故障时间不计入实际用电，也不计入常亮基准。</p>
    </div>
  </section>

  <section class="energy-analysis-grid">
    <ChartPanel
      title="真实累计趋势"
      subtitle="只连接模拟引擎实际采样点，不补造刷新前数据。"
      :tag="`${SIMULATOR_CONFIG.energySampleMs / 1000} 秒采样`"
    >
      <VChart
        v-if="hasTrend"
        class="energy-report-chart"
        :option="trendOption"
        autoresize
      />
      <div v-else class="energy-chart-empty">
        <strong>正在等待第二个真实采样点</strong>
        <span>
          会话从 0 开始；约 {{ SIMULATOR_CONFIG.energySampleMs / 1000 }}
          秒后形成首段趋势。
        </span>
      </div>
    </ChartPanel>

    <article class="calculation-panel">
      <div class="calculation-heading">
        <div>
          <span>单灯复核</span>
          <h2>{{ selectedRow?.device.id ?? '暂无灯具' }}</h2>
        </div>
        <span
          v-if="selectedRow"
          :class="['audit-status', selectedRow.device.status]"
        >
          {{ statusLabel(selectedRow.device.status) }}
        </span>
      </div>
      <template v-if="selectedRow">
        <dl class="audit-factors">
          <div>
            <dt>额定功率</dt>
            <dd>{{ selectedRow.device.ratedPowerW }} W</dd>
          </div>
          <div>
            <dt>在线累计时长</dt>
            <dd>{{ formatDuration(selectedRow.total.onlineDurationMs) }}</dd>
          </div>
          <div>
            <dt>累计平均亮度</dt>
            <dd>
              {{
                selectedRow.averageBrightness === null
                  ? '--'
                  : `${selectedRow.averageBrightness.toFixed(2)}%`
              }}
            </dd>
          </div>
        </dl>
        <div
          v-if="selectedRow.averageBrightness !== null"
          class="audit-formula"
        >
          <span>实际用电公式</span>
          <p>
            {{ selectedRow.device.ratedPowerW }} W ×
            {{ selectedRow.averageBrightness.toFixed(4) }}% ×
            {{ (selectedRow.total.onlineDurationMs / 3_600_000).toFixed(6) }} h
            ÷ 1000
          </p>
          <strong>= {{ formatEnergy(selectedRow.total.actualKwh) }} kWh</strong>
        </div>
        <div v-else class="audit-formula empty">
          该灯具尚无在线累计时长，暂时不能计算平均亮度。
        </div>
        <div class="baseline-formula">
          <span>常亮基准不乘亮度：</span>
          <strong>{{ formatEnergy(selectedRow.total.baselineKwh) }} kWh</strong>
        </div>
      </template>
    </article>
  </section>

  <section class="device-energy-ledger">
    <header class="ledger-heading">
      <div>
        <h2>逐灯累计明细</h2>
        <p>选择“核算”可在上方查看该灯具的完整计算过程。</p>
      </div>
      <div class="ledger-tools">
        <span :class="['ledger-check', { matched: detailsMatch }]">
          {{ detailsMatch ? '明细合计与全场汇总一致' : '明细与汇总存在差异' }}
        </span>
        <ElSelect
          v-model="zoneFilter"
          class="zone-energy-filter"
          placeholder="全部分区"
          aria-label="筛选能耗分区"
        >
          <ElOption label="全部分区" value="" />
          <ElOption
            v-for="zone in zoneStore.zones"
            :key="zone.id"
            :label="zone.name"
            :value="zone.id"
          />
        </ElSelect>
      </div>
    </header>

    <div v-if="filteredRows.length" class="energy-table-wrap">
      <table class="energy-detail-table">
        <thead>
          <tr>
            <th scope="col">灯具编号</th>
            <th scope="col">分区 / 状态</th>
            <th scope="col">额定功率</th>
            <th scope="col">在线时长</th>
            <th scope="col">平均亮度</th>
            <th scope="col">实际用电 kWh</th>
            <th scope="col">常亮基准 kWh</th>
            <th scope="col">节省 kWh</th>
            <th scope="col">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in filteredRows"
            :key="row.device.id"
            :class="{ selected: selectedDeviceId === row.device.id }"
          >
            <td class="energy-device-id">{{ row.device.id }}</td>
            <td>
              <span>{{ row.zone?.name ?? '未知分区' }}</span>
              <small :class="['row-status', row.device.status]">
                {{ statusLabel(row.device.status) }}
              </small>
            </td>
            <td>{{ row.device.ratedPowerW }} W</td>
            <td>{{ formatDuration(row.total.onlineDurationMs) }}</td>
            <td>
              {{
                row.averageBrightness === null
                  ? '--'
                  : `${row.averageBrightness.toFixed(2)}%`
              }}
            </td>
            <td class="number-cell">{{ formatEnergy(row.total.actualKwh) }}</td>
            <td class="number-cell">
              {{ formatEnergy(row.total.baselineKwh) }}
            </td>
            <td class="number-cell saved">{{ formatEnergy(row.savedKwh) }}</td>
            <td>
              <button
                type="button"
                class="table-action"
                @click="selectAudit(row.device.id)"
              >
                核算
              </button>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th colspan="5" scope="row">全场逐灯明细合计</th>
            <td>{{ formatEnergy(detailsActualKwh) }}</td>
            <td>{{ formatEnergy(detailsBaselineKwh) }}</td>
            <td>{{ formatEnergy(detailsBaselineKwh - detailsActualKwh) }}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
    <p v-else class="energy-empty">
      当前分区没有灯具能耗记录，请选择其他分区或检查本地设备数据。
    </p>
  </section>

  <section class="energy-method-note">
    <strong>统一核算口径</strong>
    <p>
      模拟功率 P = 额定功率 × 亮度百分比；电量 E = P × 持续秒数 ÷
      3,600,000。常亮基准只累计设备在线时段，刷新页面后运行数据和曲线均重置。
    </p>
  </section>
</template>

<style scoped>
.energy-cutoff {
  max-width: 270px;
  color: #6f8197;
  font-size: 12px;
  text-align: right;
}
.energy-ledger-hero {
  display: grid;
  grid-template-columns: 1.15fr 1.45fr 1fr;
  overflow: hidden;
  margin-bottom: 20px;
  border-radius: 15px;
  background: #172b45;
  color: #fff;
  box-shadow: 0 12px 28px #172b4520;
}
.energy-ledger-hero > div {
  min-width: 0;
  padding: 25px 27px;
  border-right: 1px solid #ffffff17;
}
.energy-ledger-hero > div:last-child {
  border-right: 0;
}
.energy-primary-total span,
.energy-comparison span,
.energy-session-info span {
  color: #a6b8cc;
  font-size: 11px;
}
.energy-primary-total > strong {
  display: inline-block;
  margin-top: 9px;
  font-size: 34px;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.03em;
}
.energy-primary-total > small {
  margin-left: 6px;
  color: #b8c8da;
}
.energy-primary-total p {
  margin: 11px 0 0;
  color: #8fd1bb;
  font-size: 11px;
}
.energy-comparison {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  align-items: center;
}
.energy-comparison strong,
.energy-session-info strong {
  display: block;
  margin-top: 7px;
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}
.energy-session-info div + div {
  margin-top: 12px;
}
.energy-session-info p {
  margin: 14px 0 0;
  color: #9fb1c6;
  font-size: 10px;
  line-height: 1.55;
}
.energy-analysis-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(320px, 0.85fr);
  gap: 20px;
  margin-bottom: 20px;
}
.energy-report-chart,
.energy-chart-empty {
  height: 285px;
}
.energy-chart-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px dashed #d9e2ec;
  border-radius: 10px;
  background: #f8fafc;
  color: #8292a5;
  text-align: center;
  font-size: 12px;
}
.energy-chart-empty strong {
  color: #45617e;
  font-size: 14px;
}
.calculation-panel {
  padding: 24px;
  border-radius: 14px;
  background: #f7f0df;
  color: #3d4650;
  box-shadow: 0 8px 22px #1d2c4208;
}
.calculation-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding-bottom: 17px;
  border-bottom: 1px solid #dfd2b6;
}
.calculation-heading span {
  color: #8d7957;
  font-size: 10px;
}
.calculation-heading h2 {
  margin: 5px 0 0;
  font-size: 17px;
}
.audit-status {
  border-radius: 20px;
  padding: 5px 8px;
  background: #e7e0d0;
}
.audit-status.online {
  color: #187a55;
  background: #ddede4;
}
.audit-status.fault {
  color: #b94e42;
  background: #f4ded8;
}
.audit-factors {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin: 17px 0;
}
.audit-factors div {
  min-width: 0;
}
.audit-factors dt {
  color: #887a63;
  font-size: 10px;
}
.audit-factors dd {
  margin: 6px 0 0;
  font-size: 13px;
  font-weight: 700;
}
.audit-formula {
  padding: 15px;
  border-radius: 10px;
  background: #fffdf7;
}
.audit-formula span,
.baseline-formula span {
  color: #87765a;
  font-size: 10px;
}
.audit-formula p {
  margin: 8px 0;
  color: #59616c;
  font-family: Consolas, monospace;
  font-size: 11px;
  line-height: 1.6;
}
.audit-formula strong {
  color: #176b52;
  font-size: 16px;
  font-variant-numeric: tabular-nums;
}
.audit-formula.empty {
  color: #82745e;
  font-size: 12px;
  line-height: 1.6;
}
.baseline-formula {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #ded1b5;
  font-size: 12px;
}
.device-energy-ledger {
  overflow: hidden;
  margin-bottom: 20px;
  border: 1px solid #e3e9f0;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 8px 22px #1d2c4208;
}
.ledger-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  padding: 20px 23px;
  border-bottom: 1px solid #e8edf3;
}
.ledger-heading h2 {
  margin: 0;
  color: #2c435e;
  font-size: 18px;
}
.ledger-heading p {
  margin: 5px 0 0;
  color: #8292a5;
  font-size: 11px;
}
.ledger-tools {
  display: flex;
  align-items: center;
  gap: 12px;
}
.ledger-check {
  color: #b64c42;
  font-size: 11px;
  white-space: nowrap;
}
.ledger-check.matched {
  color: #188054;
}
.zone-energy-filter {
  width: 150px;
}
.energy-table-wrap {
  overflow-x: auto;
}
.energy-detail-table {
  width: 100%;
  border-collapse: collapse;
  color: #50647c;
  font-size: 11px;
  text-align: left;
  white-space: nowrap;
}
.energy-detail-table th,
.energy-detail-table td {
  padding: 13px 12px;
  border-bottom: 1px solid #edf1f5;
}
.energy-detail-table thead th {
  background: #f5f8fb;
  color: #687d94;
  font-weight: 650;
}
.energy-detail-table tbody tr.selected {
  background: #eff6ff;
}
.energy-detail-table td span,
.energy-detail-table td small {
  display: block;
}
.energy-detail-table td small {
  margin-top: 3px;
  font-size: 9px;
}
.energy-device-id {
  color: #2b527a;
  font-weight: 700;
}
.row-status.online,
.number-cell.saved {
  color: #188054;
}
.row-status.offline {
  color: #77879a;
}
.row-status.fault {
  color: #c34d42;
}
.number-cell,
.energy-detail-table tfoot td {
  font-variant-numeric: tabular-nums;
}
.energy-detail-table tfoot th,
.energy-detail-table tfoot td {
  border-bottom: 0;
  background: #172b45;
  color: #fff;
  font-weight: 700;
}
.energy-detail-table tfoot th {
  text-align: right;
}
.energy-empty {
  margin: 0;
  padding: 55px 20px;
  color: #7d8da0;
  text-align: center;
  font-size: 12px;
}
.energy-method-note {
  display: flex;
  gap: 18px;
  align-items: flex-start;
  padding: 17px 20px;
  border-left: 4px solid #2878d7;
  border-radius: 8px;
  background: #eaf3ff;
}
.energy-method-note strong {
  color: #255d99;
  font-size: 12px;
  white-space: nowrap;
}
.energy-method-note p {
  margin: 0;
  color: #5f7590;
  font-size: 11px;
  line-height: 1.65;
}
@media (max-width: 1100px) {
  .energy-ledger-hero {
    grid-template-columns: 1fr 1.5fr;
  }
  .energy-session-info {
    grid-column: 1 / -1;
    border-top: 1px solid #ffffff17;
  }
  .energy-analysis-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 720px) {
  .energy-ledger-hero,
  .energy-comparison {
    grid-template-columns: 1fr;
  }
  .energy-ledger-hero > div {
    border-right: 0;
    border-bottom: 1px solid #ffffff17;
  }
  .energy-ledger-hero > div:last-child {
    border-bottom: 0;
  }
  .ledger-heading,
  .ledger-tools,
  .energy-method-note {
    align-items: stretch;
    flex-direction: column;
  }
  .zone-energy-filter {
    width: 100%;
  }
}
</style>
