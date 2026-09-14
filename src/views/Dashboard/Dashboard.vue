<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { getActivePinia } from 'pinia'
import { getAppSimulator } from '../../mock/simulator.js'
import { useDeviceStore } from '../../store/deviceStore.js'
import { useZoneStore } from '../../store/zoneStore.js'
import { useRuleStore } from '../../store/ruleStore.js'
import { useEnergyStore } from '../../store/energyStore.js'

const deviceStore = useDeviceStore()
const zoneStore = useZoneStore()
const ruleStore = useRuleStore()
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

const onlineCount = computed(
  () => deviceStore.devices.filter((item) => item.status === 'online').length,
)
const activeSensors = computed(
  () =>
    deviceStore.sensors.filter(
      (item) => item.status === 'online' && item.triggered,
    ).length,
)
const workingLights = computed(
  () =>
    deviceStore.lights.filter(
      (item) => item.status === 'online' && item.lightState === 'full',
    ).length,
)
const zoneRows = computed(() =>
  zoneStore.zones.map((zone) => {
    const members = zone.deviceIds.map((id) => deviceStore.getById(id))
    const sensors = members.filter((item) => item?.type === 'sensor')
    const lights = members.filter((item) => item?.type === 'light')
    const active = sensors.filter(
      (item) => item.status === 'online' && item.triggered,
    ).length
    const until = zone.delayUntilAt
    let phase = '低亮待机'
    if (active > 0) phase = '感应联动'
    else if (until !== null && now.value < until) phase = '延时回落'
    else if (sensors.every((item) => item.status !== 'online'))
      phase = '感应器不可用'
    return {
      ...zone,
      phase,
      active,
      lights: lights.length,
      brightness:
        lights.find((item) => item.status === 'online')?.brightness ?? null,
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
    return `${zone.name}：感应保持中，剩余 ${seconds} 秒；${zone.lights} 盏灯当前亮度 ${zone.brightness ?? '--'}%。`
  }
  if (zone.active > 0) {
    return `${zone.name}：该感应器已结束，同区还有 ${zone.active} 只感应器触发，灯组继续保持工作亮度。`
  }
  if (zone.remaining !== null && zone.remaining > 0) {
    return `${zone.name}：全部感应结束，${zone.remaining} 秒后灯组回到低亮待机。`
  }
  return `${zone.name}：回落已完成，灯组当前亮度 ${zone.brightness ?? '--'}%。`
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
      <p class="eyebrow">运行总览</p>
      <h1>全场照明联动状态</h1>
      <p class="subheading">
        设备状态由本地模拟引擎持续更新，刷新页面后重新开始本次会话。
      </p>
    </div>
    <span class="running-indicator"
      ><i></i>引擎{{ simulator.running ? '运行中' : '未启动' }}</span
    >
  </section>

  <section class="metrics" aria-label="实时运行指标">
    <div class="metric">
      <span>在线设备</span
      ><strong>{{ onlineCount }} / {{ deviceStore.devices.length }}</strong>
    </div>
    <div class="metric">
      <span>感应触发中</span><strong>{{ activeSensors }}</strong>
    </div>
    <div class="metric">
      <span>工作亮度灯具</span
      ><strong>{{ workingLights }} / {{ deviceStore.lights.length }}</strong>
    </div>
    <div class="metric">
      <span>会话实际用电</span
      ><strong
        >{{ energyStore.actualKwh.toFixed(4) }} <small>kWh</small></strong
      >
    </div>
  </section>

  <section class="panel">
    <div class="panel-heading">
      <div>
        <h2>分区运行状态</h2>
        <p>感应保持结束后，全部传感器停止触发才开始回落计时。</p>
      </div>
      <span>共 {{ zoneRows.length }} 个分区</span>
    </div>
    <div class="zone-list">
      <article v-for="zone in zoneRows" :key="zone.id" class="zone-row">
        <div class="zone-name">
          <strong>{{ zone.name }}</strong
          ><small>{{ zone.rule?.name }}</small>
        </div>
        <div class="zone-phase">
          <span :class="['phase-dot', { active: zone.active > 0 }]"></span
          >{{ zone.phase }}
        </div>
        <div class="zone-value">{{ zone.active }} 个感应中</div>
        <div class="zone-value">
          {{ zone.brightness === null ? '--' : `${zone.brightness}%` }} 亮度
        </div>
        <div class="zone-value">
          {{
            zone.remaining === null
              ? '无回落计时'
              : `${zone.remaining} 秒后回落`
          }}
        </div>
      </article>
    </div>
  </section>

  <section v-if="isDevelopment" class="panel dev-panel">
    <div class="panel-heading">
      <div>
        <h2>联动验证</h2>
        <p>
          点击感应器后直接看下方结果；引擎每 3 秒自动结算状态，无需手动刷新。
        </p>
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
        上方“分区运行状态”和统计卡片也会同步变化；{{
          randomEventsEnabled
            ? '随机模拟可能触发其他分区。'
            : '随机事件已暂停，可稳定观察本次联动。'
        }}
      </small>
    </div>
  </section>
</template>
