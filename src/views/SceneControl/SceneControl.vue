<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { getActivePinia } from 'pinia'
import {
  ElButton,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElMessage,
  ElMessageBox,
  ElSwitch,
  ElTimePicker,
} from 'element-plus'
import EmptyState from '../../components/EmptyState/EmptyState.vue'
import { getAppSimulator } from '../../mock/simulator.js'
import { useDeviceStore } from '../../store/deviceStore.js'
import { useRuleStore } from '../../store/ruleStore.js'
import { useZoneStore } from '../../store/zoneStore.js'
import { isScheduledNow } from '../../utils/simulateSensor.js'
import { validateRule } from '../../utils/validateRule.js'

const deviceStore = useDeviceStore()
const ruleStore = useRuleStore()
const zoneStore = useZoneStore()
const simulator = getAppSimulator(getActivePinia())
const isDevelopment = import.meta.env.DEV
const selectedRuleId = ref(ruleStore.rules[0]?.id ?? null)
const formRef = ref(null)
const now = ref(Date.now())
const randomEventsEnabled = ref(simulator.randomEventsEnabled)
const draft = ref(createDraft(selectedRuleId.value))
let clockId

onMounted(() => {
  clockId = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})
onUnmounted(() => clearInterval(clockId))

function createDraft(ruleId) {
  const rule = ruleStore.getById(ruleId)
  return rule ? { ...rule } : null
}

const selectedRule = computed(() =>
  selectedRuleId.value ? ruleStore.getById(selectedRuleId.value) : null,
)
const hasUnsavedChanges = computed(
  () =>
    Boolean(draft.value && selectedRule.value) &&
    JSON.stringify(draft.value) !== JSON.stringify(selectedRule.value),
)
const assignedZones = computed(() =>
  selectedRule.value
    ? zoneStore.zones.filter((zone) => zone.ruleId === selectedRule.value.id)
    : [],
)
const assignedZoneIds = computed(
  () => new Set(assignedZones.value.map((zone) => zone.id)),
)
const liveState = computed(() => {
  const members = deviceStore.devices.filter((device) =>
    assignedZoneIds.value.has(device.zoneId),
  )
  const onlineLights = members.filter(
    (device) => device.type === 'light' && device.status === 'online',
  )
  const automaticLights = onlineLights.filter(
    (light) => light.manualUntilAt === null,
  )
  const manualLights = onlineLights.filter(
    (light) => light.manualUntilAt !== null,
  )
  const activeSensors = members.filter(
    (device) =>
      device.type === 'sensor' &&
      device.status === 'online' &&
      device.triggered,
  )
  return {
    automaticLights,
    manualLights,
    activeSensors,
    brightnesses: [
      ...new Set(automaticLights.map((light) => light.brightness)),
    ],
  }
})
const scheduleActive = computed(() =>
  selectedRule.value ? isScheduledNow(selectedRule.value, now.value) : false,
)

function validatorFor(field) {
  return (_rule, _value, callback) => {
    const error = draft.value ? validateRule(draft.value)[field] : '策略不存在'
    callback(error ? new Error(error) : undefined)
  }
}

const formRules = {
  name: [{ validator: validatorFor('name'), trigger: 'blur' }],
  triggerHoldSeconds: [
    { validator: validatorFor('triggerHoldSeconds'), trigger: 'change' },
  ],
  triggerDelayOff: [
    { validator: validatorFor('triggerDelayOff'), trigger: 'change' },
  ],
  standbyBrightness: [
    { validator: validatorFor('standbyBrightness'), trigger: 'change' },
  ],
  fullBrightness: [
    { validator: validatorFor('fullBrightness'), trigger: 'change' },
  ],
  scheduleStartTime: [
    { validator: validatorFor('scheduleStartTime'), trigger: 'change' },
  ],
  scheduleEndTime: [
    { validator: validatorFor('scheduleEndTime'), trigger: 'change' },
  ],
  scheduledBrightness: [
    { validator: validatorFor('scheduledBrightness'), trigger: 'change' },
  ],
}

async function selectRule(id) {
  if (id === selectedRuleId.value) return
  if (hasUnsavedChanges.value) {
    try {
      await ElMessageBox.confirm(
        '当前策略有尚未保存的修改，切换后这些修改将丢失。',
        '切换策略',
        {
          confirmButtonText: '放弃并切换',
          cancelButtonText: '继续编辑',
          type: 'warning',
        },
      )
    } catch {
      return
    }
  }
  selectedRuleId.value = id
  draft.value = createDraft(id)
  await nextTick()
  formRef.value?.clearValidate()
}

async function discardChanges() {
  draft.value = createDraft(selectedRuleId.value)
  await nextTick()
  formRef.value?.clearValidate()
}

async function saveRule() {
  if (!draft.value || !formRef.value) return
  try {
    await formRef.value.validate()
  } catch {
    ElMessage.warning('请先修正表单中的配置错误')
    return
  }
  const changes = { ...draft.value, name: draft.value.name.trim() }
  if (!simulator.updateRule(selectedRuleId.value, changes)) {
    ElMessage.error('策略保存失败，请检查配置后重试')
    return
  }
  draft.value = createDraft(selectedRuleId.value)
  now.value = Date.now()
  await nextTick()
  formRef.value?.clearValidate()
  ElMessage.success('策略已保存并应用到自动模式灯具')
}

function toggleRandomEvents() {
  randomEventsEnabled.value = !randomEventsEnabled.value
  simulator.setRandomEventsEnabled(randomEventsEnabled.value)
}

function triggerCurrentZone() {
  const sensor = assignedZones.value
    .flatMap((zone) => zone.deviceIds)
    .map((id) => deviceStore.getById(id))
    .find((device) => device?.type === 'sensor' && device.status === 'online')
  if (!sensor) {
    ElMessage.warning('当前策略关联分区没有可用的在线感应器')
    return
  }
  if (simulator.triggerSensor(sensor.id)) {
    now.value = Date.now()
    ElMessage.success(`已触发 ${sensor.id}`)
  }
}

function timeRangeLabel(rule) {
  if (!rule.scheduleEnabled) return '定时待机未启用'
  return `${rule.scheduleStartTime}–${rule.scheduleEndTime}${
    rule.scheduleStartTime > rule.scheduleEndTime ? ' · 跨午夜' : ''
  }`
}
</script>

<template>
  <section class="page-heading">
    <div>
      <p class="eyebrow">场景策略</p>
      <h1>联动策略配置</h1>
      <p class="subheading">
        调整感应保持、灯组回落与定时待机；保存后立即应用到自动模式灯具。
      </p>
    </div>
    <span class="scene-count page-meta-pill"
      >{{ ruleStore.rules.length }} 套固定策略</span
    >
  </section>

  <div v-if="ruleStore.rules.length" class="scene-workspace">
    <aside class="scene-list" aria-label="联动策略列表">
      <div class="scene-list-heading">
        <span>策略目录</span>
        <small>选择后编辑</small>
      </div>
      <button
        v-for="rule in ruleStore.rules"
        :key="rule.id"
        type="button"
        class="scene-list-item"
        :class="{ selected: selectedRuleId === rule.id }"
        :aria-pressed="selectedRuleId === rule.id"
        @click="selectRule(rule.id)"
      >
        <span class="scene-list-index">{{
          rule.id.split('-').at(-1).toUpperCase()
        }}</span>
        <span class="scene-list-copy">
          <strong>{{ rule.name }}</strong>
          <small>{{ timeRangeLabel(rule) }}</small>
        </span>
        <span class="scene-list-brightness">{{ rule.fullBrightness }}%</span>
      </button>
    </aside>

    <main v-if="draft && selectedRule" class="scene-editor">
      <header class="scene-editor-heading">
        <div>
          <div class="scene-heading-line">
            <h2>{{ selectedRule.name }}</h2>
            <span v-if="hasUnsavedChanges" class="unsaved-pill">尚未保存</span>
          </div>
          <p>
            关联分区：{{
              assignedZones.map((zone) => zone.name).join('、') ||
              '暂无关联分区'
            }}
          </p>
        </div>
        <span class="schedule-state" :class="{ active: scheduleActive }">
          {{ scheduleActive ? '当前处于定时时段' : '当前使用普通时段' }}
        </span>
      </header>

      <section class="live-rule-strip" aria-label="策略当前运行状态">
        <div>
          <span>在线自动灯具</span>
          <strong>{{ liveState.automaticLights.length }} 盏</strong>
        </div>
        <div>
          <span>自动输出亮度</span>
          <strong>
            {{
              liveState.brightnesses.length
                ? `${liveState.brightnesses.join(' / ')}%`
                : '--'
            }}
          </strong>
        </div>
        <div>
          <span>感应保持中</span>
          <strong>{{ liveState.activeSensors.length }} 只</strong>
        </div>
        <div>
          <span>手动模式灯具</span>
          <strong>{{ liveState.manualLights.length }} 盏</strong>
        </div>
      </section>

      <ElForm
        ref="formRef"
        class="scene-form"
        :model="draft"
        :rules="formRules"
        label-position="top"
        status-icon
      >
        <section class="form-section">
          <div class="form-section-heading">
            <span>01</span>
            <div>
              <h3>基本信息与感应时序</h3>
              <p>保持时间从每次有效触发开始计算；再次触发会延长保持。</p>
            </div>
          </div>
          <div class="form-grid">
            <ElFormItem label="策略名称" prop="name" class="wide-field">
              <ElInput v-model="draft.name" maxlength="30" show-word-limit />
            </ElFormItem>
            <ElFormItem label="感应保持时间" prop="triggerHoldSeconds">
              <ElInputNumber
                v-model="draft.triggerHoldSeconds"
                :min="1"
                :max="3600"
                :precision="0"
                controls-position="right"
              />
              <span class="field-unit">秒</span>
            </ElFormItem>
            <ElFormItem label="无人回落延时" prop="triggerDelayOff">
              <ElInputNumber
                v-model="draft.triggerDelayOff"
                :min="0"
                :max="3600"
                :precision="0"
                controls-position="right"
              />
              <span class="field-unit">秒</span>
            </ElFormItem>
          </div>
        </section>

        <section class="form-section">
          <div class="form-section-heading">
            <span>02</span>
            <div>
              <h3>灯组亮度</h3>
              <p>工作亮度不能低于普通和定时待机亮度。</p>
            </div>
          </div>
          <div class="brightness-grid">
            <ElFormItem label="普通待机亮度" prop="standbyBrightness">
              <ElInputNumber
                v-model="draft.standbyBrightness"
                :min="0"
                :max="100"
                :precision="0"
                controls-position="right"
              />
              <span class="field-unit">%</span>
            </ElFormItem>
            <ElFormItem label="感应工作亮度" prop="fullBrightness">
              <ElInputNumber
                v-model="draft.fullBrightness"
                :min="1"
                :max="100"
                :precision="0"
                controls-position="right"
              />
              <span class="field-unit">%</span>
            </ElFormItem>
            <ElFormItem label="定时待机亮度" prop="scheduledBrightness">
              <ElInputNumber
                v-model="draft.scheduledBrightness"
                :min="0"
                :max="100"
                :precision="0"
                controls-position="right"
              />
              <span class="field-unit">%</span>
            </ElFormItem>
          </div>
        </section>

        <section class="form-section schedule-section">
          <div class="form-section-heading">
            <span>03</span>
            <div>
              <h3>定时待机</h3>
              <p>只改变自动模式的待机亮度，感应工作亮度不受影响。</p>
            </div>
            <ElSwitch
              v-model="draft.scheduleEnabled"
              inline-prompt
              active-text="启用"
              inactive-text="关闭"
              aria-label="启用定时待机"
            />
          </div>
          <div
            class="schedule-time-grid"
            :class="{ muted: !draft.scheduleEnabled }"
          >
            <ElFormItem label="开始时间" prop="scheduleStartTime">
              <ElTimePicker
                v-model="draft.scheduleStartTime"
                format="HH:mm"
                value-format="HH:mm"
                :clearable="false"
                placeholder="选择开始时间"
              />
            </ElFormItem>
            <span class="time-arrow" aria-hidden="true">→</span>
            <ElFormItem label="结束时间" prop="scheduleEndTime">
              <ElTimePicker
                v-model="draft.scheduleEndTime"
                format="HH:mm"
                value-format="HH:mm"
                :clearable="false"
                placeholder="选择结束时间"
              />
            </ElFormItem>
            <p class="schedule-help">
              起止时间跨越 00:00
              时自动按跨午夜时段执行；关闭后保留本组时间配置。
            </p>
          </div>
        </section>

        <footer class="form-actions">
          <span>策略保存不会覆盖在线灯具的手动模式。</span>
          <div>
            <ElButton :disabled="!hasUnsavedChanges" @click="discardChanges">
              放弃修改
            </ElButton>
            <ElButton
              type="primary"
              :disabled="!hasUnsavedChanges"
              @click="saveRule"
            >
              保存并立即应用
            </ElButton>
          </div>
        </footer>
      </ElForm>

      <section v-if="isDevelopment" class="scene-dev-tools">
        <div>
          <strong>开发验证</strong>
          <span>可暂停随机事件，再触发当前策略关联分区观察工作亮度。</span>
        </div>
        <ElButton @click="toggleRandomEvents">
          {{ randomEventsEnabled ? '暂停随机事件' : '恢复随机事件' }}
        </ElButton>
        <ElButton type="primary" plain @click="triggerCurrentZone">
          触发当前分区感应
        </ElButton>
      </section>
    </main>
  </div>

  <EmptyState
    v-else
    class="panel"
    symbol="策"
    title="暂无策略数据"
    description="请检查策略基础配置，数据恢复后这里会显示可编辑的联动策略。"
  />
</template>

<style scoped>
.scene-count {
  color: #71839a;
  font-size: 15px;
  white-space: nowrap;
}
.scene-workspace {
  display: grid;
  grid-template-columns: minmax(240px, 0.72fr) minmax(0, 2.25fr);
  gap: 20px;
  align-items: start;
}
.scene-list,
.scene-editor {
  border: 1px solid #e3eaf2;
  border-radius: 15px;
  background: #fff;
  box-shadow: var(--shadow-panel);
}
.scene-list {
  position: sticky;
  top: 20px;
  overflow: hidden;
}
.scene-list-heading {
  display: flex;
  justify-content: space-between;
  padding: 18px 18px 13px;
  color: #405875;
  font-size: 15px;
  font-weight: 700;
}
.scene-list-heading small {
  color: #91a0b2;
  font-weight: 400;
}
.scene-list-item {
  width: 100%;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  border: 0;
  border-top: 1px solid #edf1f5;
  padding: 16px;
  background: #fff;
  color: #334b67;
  text-align: left;
  cursor: pointer;
}
.scene-list-item:hover,
.scene-list-item.selected {
  background: var(--color-primary-soft);
}
.scene-list-item.selected {
  box-shadow: inset 3px 0 #2f7dd8;
}
.scene-list-item:focus-visible {
  outline: 3px solid #80b9ff;
  outline-offset: -3px;
}
.scene-list-index {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  background: #e8eef6;
  color: #52708e;
  font-size: 13px;
  font-weight: 800;
}
.scene-list-item.selected .scene-list-index {
  background: var(--color-primary);
  color: #fff;
}
.scene-list-copy {
  min-width: 0;
}
.scene-list-copy strong,
.scene-list-copy small {
  display: block;
}
.scene-list-copy strong {
  overflow: hidden;
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.scene-list-copy small {
  margin-top: 5px;
  color: #8392a5;
  font-size: 13px;
}
.scene-list-brightness {
  color: #266cb9;
  font-size: 15px;
  font-weight: 750;
}
.scene-editor {
  min-width: 0;
  padding: 26px;
}
.scene-editor-heading,
.scene-heading-line,
.form-section-heading,
.form-actions,
.scene-dev-tools {
  display: flex;
  align-items: center;
}
.scene-editor-heading {
  justify-content: space-between;
  gap: 20px;
}
.scene-heading-line {
  gap: 10px;
}
.scene-editor-heading h2 {
  margin: 0;
  font-size: 22px;
}
.scene-editor-heading p {
  margin: 7px 0 0;
  color: #8190a3;
  font-size: 14px;
}
.unsaved-pill,
.schedule-state {
  border-radius: 20px;
  padding: 6px 9px;
  font-size: 13px;
  white-space: nowrap;
}
.unsaved-pill {
  color: #9a641d;
  background: #fff2d9;
}
.schedule-state {
  color: #62768d;
  background: #eef2f6;
}
.schedule-state.active {
  color: #176c53;
  background: #e5f6ef;
}
.live-rule-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 23px 0 8px;
  border-radius: 12px;
  background: #152942;
  color: #fff;
}
.live-rule-strip div {
  min-width: 0;
  padding: 15px 17px;
  border-right: 1px solid #ffffff17;
}
.live-rule-strip div:last-child {
  border-right: 0;
}
.live-rule-strip span,
.live-rule-strip strong {
  display: block;
}
.live-rule-strip span {
  color: #9fb2c9;
  font-size: 13px;
}
.live-rule-strip strong {
  overflow: hidden;
  margin-top: 7px;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 17px;
}
.scene-form {
  margin-top: 18px;
}
.form-section {
  padding: 22px 0;
  border-top: 1px solid var(--color-border-light);
}
.form-section-heading {
  gap: 12px;
  margin-bottom: 19px;
}
.form-section-heading > span {
  color: #2a77cc;
  font-size: 14px;
  font-weight: 800;
}
.form-section-heading > div {
  flex: 1;
}
.form-section-heading h3 {
  margin: 0;
  font-size: 16px;
}
.form-section-heading p {
  margin: 4px 0 0;
  color: #8493a5;
  font-size: 13px;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 22px;
}
.wide-field {
  grid-column: 1 / -1;
}
.brightness-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 22px;
}
.field-unit {
  margin-left: 8px;
  color: #738399;
  font-size: 14px;
}
.scene-form :deep(.el-input-number) {
  width: min(180px, calc(100% - 28px));
}
.schedule-section .el-switch {
  margin-left: auto;
}
.schedule-time-grid {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) auto minmax(180px, 1fr);
  gap: 12px;
  align-items: center;
  max-width: 580px;
  transition: opacity 180ms ease;
}
.schedule-time-grid.muted {
  opacity: 0.65;
}
.schedule-time-grid :deep(.el-date-editor) {
  width: 100%;
}
.time-arrow {
  color: #8b9bad;
  padding-top: 5px;
}
.schedule-help {
  grid-column: 1 / -1;
  margin: -4px 0 0;
  color: #8292a5;
  font-size: 13px;
  line-height: 1.6;
}
.form-actions {
  justify-content: space-between;
  gap: 20px;
  padding-top: 21px;
  border-top: 1px solid #e4eaf1;
}
.form-actions > span {
  color: #71849a;
  font-size: 14px;
}
.form-actions > div {
  display: flex;
  gap: 8px;
}
.scene-dev-tools {
  flex-wrap: wrap;
  gap: 9px;
  margin-top: 22px;
  padding: 15px;
  border: 1px dashed #cddcea;
  border-radius: 10px;
  background: var(--color-surface-muted);
}
.scene-dev-tools > div {
  flex: 1;
  min-width: 230px;
}
.scene-dev-tools strong,
.scene-dev-tools span {
  display: block;
}
.scene-dev-tools strong {
  color: #415d7b;
  font-size: 15px;
}
.scene-dev-tools span {
  margin-top: 4px;
  color: #8494a7;
  font-size: 13px;
}
@media (max-width: 960px) {
  .scene-workspace {
    grid-template-columns: 1fr;
  }
  .scene-list {
    position: static;
  }
  .live-rule-strip {
    grid-template-columns: 1fr 1fr;
  }
  .live-rule-strip div:nth-child(2) {
    border-right: 0;
  }
  .live-rule-strip div:nth-child(-n + 2) {
    border-bottom: 1px solid #ffffff17;
  }
}
@media (max-width: 650px) {
  .scene-editor {
    padding: 18px;
  }
  .scene-editor-heading,
  .form-actions {
    align-items: flex-start;
    flex-direction: column;
  }
  .form-grid,
  .brightness-grid,
  .schedule-time-grid {
    grid-template-columns: 1fr;
    gap: 0;
  }
  .wide-field,
  .schedule-help {
    grid-column: 1;
  }
  .time-arrow {
    display: none;
  }
  .form-actions > div,
  .form-actions .el-button {
    width: 100%;
  }
  .form-actions .el-button + .el-button {
    margin-left: 0;
  }
}
</style>
