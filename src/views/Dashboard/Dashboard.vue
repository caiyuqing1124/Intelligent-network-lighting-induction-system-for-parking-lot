<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { getActivePinia } from 'pinia'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { getAppSimulator } from '../../mock/simulator.js'
import { useAlertStore } from '../../store/alertStore.js'
import { useDeviceStore } from '../../store/deviceStore.js'
import { useZoneStore } from '../../store/zoneStore.js'
import { useRuleStore } from '../../store/ruleStore.js'
import { useEnergyStore } from '../../store/energyStore.js'

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent])

const deviceStore = useDeviceStore()
const zoneStore = useZoneStore()
const ruleStore = useRuleStore()
const alertStore = useAlertStore()
const energyStore = useEnergyStore()
const simulator = getAppSimulator(getActivePinia())
const isDevelopment = import.meta.env.DEV
const now = ref(Date.now())
const selectedSensorId = ref(null)
const lastTriggeredAt = ref(null)
const randomEventsEnabled = ref(simulator.randomEventsEnabled)
let clockId

onMounted(() => {
  clockId = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})
onUnmounted(() => clearInterval(clockId))

const deviceCount = computed(() => deviceStore.devices.length)
const onlineCount = computed(
  () =>
    deviceStore.devices.filter((device) => device.status === 'online').length,
)
const onlineRate = computed(() =>
  deviceCount.value === 0
    ? '--'
    : `${((onlineCount.value / deviceCount.value) * 100).toFixed(1)}%`,
)
const onlineLights = computed(() =>
  deviceStore.lights.filter((light) => light.status === 'online'),
)
const litLights = computed(
  () => onlineLights.value.filter((light) => light.brightness > 0).length,
)
const litRate = computed(() =>
  onlineLights.value.length === 0
    ? '--'
    : `${((litLights.value / onlineLights.value.length) * 100).toFixed(1)}%`,
)
const alertCount = computed(() => alertStore.alerts.length)
const hasEnergyTrend = computed(() => energyStore.samples.length >= 2)
const energyOption = computed(() => ({
  animationDuration: 300,
  grid: { left: 58, right: 18, top: 18, bottom: 32 },
  tooltip: {
    trigger: 'axis',
    formatter: (params) =>
      [
        new Date(params[0].value[0]).toLocaleTimeString('zh-CN', {
          hour12: false,
        }),
        ...params.map(
          (item) =>
            `${item.marker}${item.seriesName}：${item.value[1].toFixed(4)} kWh`,
        ),
      ].join('<br>'),
  },
  xAxis: {
    type: 'time',
    boundaryGap: false,
    axisLabel: { color: '#728198', formatter: '{HH}:{mm}:{ss}' },
    axisLine: { lineStyle: { color: '#dce5ef' } },
    axisTick: { show: false },
    splitLine: { show: false },
  },
  yAxis: {
    type: 'value',
    min: 0,
    axisLabel: { color: '#728198', formatter: (value) => value.toFixed(4) },
    splitLine: { lineStyle: { color: '#edf2f7' } },
  },
  series: [
    {
      name: '模拟实际用电',
      type: 'line',
      smooth: false,
      showSymbol: false,
      lineStyle: { width: 3, color: '#2878d7' },
      itemStyle: { color: '#2878d7' },
      areaStyle: { color: 'rgba(40, 120, 215, 0.10)' },
      data: energyStore.samples.map((sample) => [sample.at, sample.actualKwh]),
    },
    {
      name: '在线时段常亮基准',
      type: 'line',
      smooth: false,
      showSymbol: false,
      lineStyle: { width: 2, type: 'dashed', color: '#e5a544' },
      itemStyle: { color: '#e5a544' },
      data: energyStore.samples.map((sample) => [
        sample.at,
        sample.baselineKwh,
      ]),
    },
  ],
}))

const zoneRows = computed(() =>
  zoneStore.zones.map((zone) => {
    const members = zone.deviceIds.map((id) => deviceStore.getById(id))
    const sensors = members.filter((device) => device?.type === 'sensor')
    const lights = members.filter((device) => device?.type === 'light')
    const onlineLights = lights.filter((device) => device.status === 'online')
    const automaticLights = onlineLights.filter(
      (device) => device.manualUntilAt === null,
    )
    const manualLights = onlineLights.filter(
      (device) => device.manualUntilAt !== null,
    )
    const active = sensors.filter(
      (device) => device.status === 'online' && device.triggered,
    ).length
    const until = zone.delayUntilAt
    let phase = '低亮待机'
    if (active > 0) phase = '感应联动'
    else if (until !== null && now.value < until) phase = '延时回落'
    else if (sensors.every((device) => device.status !== 'online'))
      phase = '感应器不可用'
    return {
      ...zone,
      phase,
      active,
      automaticLights: automaticLights.length,
      manualLights: manualLights.length,
      automaticBrightness: automaticLights[0]?.brightness ?? null,
      remaining:
        until === null
          ? null
          : Math.max(0, Math.ceil((until - now.value) / 1000)),
      rule: ruleStore.getById(zone.ruleId),
    }
  }),
)

const selectedSensor = computed(() =>
  selectedSensorId.value ? deviceStore.getById(selectedSensorId.value) : null,
)
const selectedZone = computed(() =>
  selectedSensor.value
    ? zoneRows.value.find((zone) => zone.id === selectedSensor.value.zoneId)
    : null,
)
const feedback = computed(() => {
  const sensor = selectedSensor.value
  const zone = selectedZone.value
  if (!sensor || !zone)
    return '点击下方任一感应器，这里会显示灯组亮度、保持时间和回落进度。'
  if (sensor.status !== 'online')
    return `${zone.name}：该感应器不可用，无法触发联动。`
  if (sensor.triggered) {
    const seconds = Math.max(
      0,
      Math.ceil((sensor.triggeredUntilAt - now.value) / 1000),
    )
    const automaticCopy =
      zone.automaticLights > 0
        ? `${zone.automaticLights} 盏自动灯具当前亮度 ${zone.automaticBrightness ?? '--'}%`
        : '当前没有自动模式灯具'
    const manualCopy =
      zone.manualLights > 0
        ? `；另有 ${zone.manualLights} 盏灯处于手动模式`
        : ''
    return `${zone.name}：感应保持中，剩余 ${seconds} 秒；${automaticCopy}${manualCopy}。`
  }
  if (zone.active > 0)
    return `${zone.name}：该感应器已结束，同区还有 ${zone.active} 只感应器触发，灯组继续保持工作亮度。`
  if (zone.remaining !== null && zone.remaining > 0)
    return `${zone.name}：全部感应结束，${zone.remaining} 秒后灯组回到低亮待机。`
  return `${zone.name}：回落已完成，自动灯具当前亮度 ${zone.automaticBrightness ?? '--'}%。`
})

function sensorLabel(sensor) {
  const zone = zoneStore.getById(sensor.zoneId)
  const number = sensor.id.split('-').at(-1)
  return `${zone?.name ?? '未知分区'} ${number}号感应器`
}

function trigger(id) {
  if (simulator.triggerSensor(id)) {
    selectedSensorId.value = id
    lastTriggeredAt.value = new Date().toLocaleTimeString('zh-CN', {
      hour12: false,
    })
    now.value = Date.now()
  }
}

function toggleRandomEvents() {
  randomEventsEnabled.value = !randomEventsEnabled.value
  simulator.setRandomEventsEnabled(randomEventsEnabled.value)
}
</script>

<template>
  <section class="page-heading">
    <div>
      <p class="eyebrow">运营驾驶舱</p>
      <h1>全场运行总览</h1>
      <p class="subheading">
        本地模拟数据持续更新；刷新页面将重新开始本次运行会话。
      </p>
    </div>
    <span class="running-indicator" :class="{ stopped: !simulator.running }">
      <i></i>{{ simulator.running ? '模拟运行中' : '模拟未启动' }}
    </span>
  </section>

  <section class="metrics" aria-label="全场运行指标">
    <div class="metric">
      <span>设备总数</span>
      <strong>{{ deviceCount }}</strong>
      <small>灯具与感应器合计</small>
    </div>
    <div class="metric">
      <span>在线率</span>
      <strong>{{ onlineRate }}</strong>
      <small>{{ onlineCount }} / {{ deviceCount }} 台在线</small>
    </div>
    <div class="metric">
      <span>当前亮灯率</span>
      <strong>{{ litRate }}</strong>
      <small>{{ litLights }} / {{ onlineLights.length }} 盏在线灯具亮灯</small>
    </div>
    <div class="metric metric-alert">
      <span>本次会话告警数</span>
      <strong>{{ alertCount }}</strong>
      <small class="alert-chip">未处理 {{ alertStore.unresolvedCount }}</small>
    </div>
  </section>

  <section class="overview-grid">
    <article class="panel energy-panel">
      <div class="panel-heading">
        <div>
          <h2>本次会话用电趋势</h2>
          <p>按灯具状态持续时间累计，曲线从本次会话的 0 开始。</p>
        </div>
        <span>本地模拟估算</span>
      </div>
      <div class="energy-totals">
        <div>
          <span>模拟实际用电</span
          ><strong>{{ energyStore.actualKwh.toFixed(4) }}</strong> kWh
        </div>
        <div>
          <span>在线时段常亮基准</span
          ><strong>{{ energyStore.baselineKwh.toFixed(4) }}</strong> kWh
        </div>
      </div>
      <div class="chart-legend" aria-hidden="true">
        <span><i class="actual-line"></i>模拟实际用电</span>
        <span><i class="baseline-line"></i>在线时段常亮基准</span>
      </div>
      <VChart
        v-if="hasEnergyTrend"
        class="energy-chart"
        :option="energyOption"
        autoresize
      />
      <div v-else class="chart-empty">
        <strong>正在积累本次会话数据</strong>
        <span
          >模拟引擎完成首次周期采样后显示趋势；当前没有足够的时间点连成曲线。</span
        >
      </div>
    </article>

    <article class="panel zone-panel">
      <div class="panel-heading">
        <div>
          <h2>分区运行状态</h2>
          <p>查看各分区当前的感应与回落阶段。</p>
        </div>
        <RouterLink class="text-link" to="/zones">查看分区</RouterLink>
      </div>
      <div v-if="zoneRows.length" class="zone-summary-list">
        <div v-for="zone in zoneRows" :key="zone.id" class="zone-summary-row">
          <div class="zone-name">
            <strong>{{ zone.name }}</strong>
            <small>{{ zone.rule?.name }}</small>
          </div>
          <div class="zone-summary-status">
            <span :class="['phase-dot', { active: zone.active > 0 }]"></span>
            {{ zone.phase }}
          </div>
          <small>{{ zone.active }} 个感应中</small>
        </div>
      </div>
      <p v-else class="empty-copy">暂无分区数据，请检查本地模拟数据。</p>
    </article>
  </section>

  <section v-if="isDevelopment" class="panel dev-panel">
    <div class="panel-heading">
      <div>
        <h2>联动验证</h2>
        <p>仅开发环境显示；点击感应器后可观察灯组亮度、保持时间和回落进度。</p>
      </div>
      <el-button @click="toggleRandomEvents">
        {{ randomEventsEnabled ? '暂停随机事件' : '恢复随机事件' }}
      </el-button>
    </div>
    <div class="sensor-buttons">
      <el-button
        v-for="sensor in deviceStore.sensors"
        :key="sensor.id"
        :type="sensor.triggered ? 'primary' : 'default'"
        :disabled="sensor.status !== 'online'"
        @click="trigger(sensor.id)"
      >
        {{ sensorLabel(sensor)
        }}{{ sensor.triggered ? ' · 触发中' : ' · 点击触发' }}
      </el-button>
    </div>
    <div
      class="trigger-feedback"
      :class="{ 'has-selection': selectedSensorId }"
    >
      <div class="trigger-feedback-title">
        <strong>{{ selectedZone?.phase ?? '等待操作' }}</strong>
        <span v-if="lastTriggeredAt">最近点击：{{ lastTriggeredAt }}</span>
      </div>
      <p>{{ feedback }}</p>
      <small v-if="selectedSensorId">
        上方分区状态与统计会同步变化；{{
          randomEventsEnabled
            ? '随机模拟可能触发其他分区。'
            : '随机事件已暂停，可稳定观察本次联动。'
        }}
      </small>
    </div>
  </section>
</template>
