import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const uiRoots = [
  join(projectRoot, 'src', 'views'),
  join(projectRoot, 'src', 'components'),
]

test('Element Plus controls inherit the Chinese locale', async () => {
  const source = await readFile(join(projectRoot, 'src', 'App.vue'), 'utf8')
  assert.match(
    source,
    /import zhCn from 'element-plus\/es\/locale\/lang\/zh-cn'/,
  )
  assert.match(source, /<ElConfigProvider :locale="zhCn">/)
})

test('interface copy uses operational wording instead of session terminology', async () => {
  const files = [
    join(projectRoot, 'src', 'App.vue'),
    ...(await Promise.all(uiRoots.map(vueFiles))).flat(),
  ]
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    assert.doesNotMatch(
      source,
      /本次会话|本次运行会话|本地会话|会话能耗|会话采样/,
    )
  }
})

test('energy methodology retains accurate data provenance and reset disclosure', async () => {
  const source = await readFile(
    join(projectRoot, 'src', 'views', 'EnergyReport', 'EnergyReport.vue'),
    'utf8',
  )
  assert.match(source, /数据由本地运行规则和灯具状态估算/)
  assert.match(source, /不代表电表或硬件实采读数/)
  assert.match(source, /刷新页面会重新初始化设备状态、策略、告警和能耗/)
  assert.match(source, /已注册账号不受影响/)
})

async function vueFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return vueFiles(path)
      return entry.name.endsWith('.vue') ? [path] : []
    }),
  )
  return nested.flat()
}

test('user-facing Vue files contain no prohibited placeholder wording', async () => {
  const files = [
    join(projectRoot, 'src', 'App.vue'),
    ...(await Promise.all(uiRoots.map(vueFiles))).flat(),
  ]
  const prohibited = [
    /lorem ipsum/i,
    /\bdemo\b/i,
    /示例/,
    /模板/,
    /演示账号/,
    /TODO/,
    /模拟/,
  ]

  for (const file of files) {
    const source = await readFile(file, 'utf8')
    for (const pattern of prohibited) {
      assert.doesNotMatch(source, pattern, `${file} 出现禁用文案 ${pattern}`)
    }
  }
})

test('Vue templates contain no empty native or Element Plus buttons', async () => {
  const files = [
    join(projectRoot, 'src', 'App.vue'),
    ...(await Promise.all(uiRoots.map(vueFiles))).flat(),
  ]
  const emptyButton = /<(?:button|ElButton)\b[^>]*>\s*<\/(?:button|ElButton)>/s

  for (const file of files) {
    const source = await readFile(file, 'utf8')
    assert.doesNotMatch(source, emptyButton, `${file} 存在空按钮`)
  }
})

test('explicit interface font sizes never fall below 12 pixels', async () => {
  const files = [
    join(projectRoot, 'src', 'style.css'),
    join(projectRoot, 'src', 'App.vue'),
    ...(await Promise.all(uiRoots.map(vueFiles))).flat(),
  ]

  for (const file of files) {
    const source = await readFile(file, 'utf8')
    const sizes = [...source.matchAll(/font-size:\s*([0-9.]+)px/g)].map(
      (match) => Number(match[1]),
    )
    assert.equal(
      sizes.some((size) => size < 12),
      false,
      `${file} 存在低于 12px 的界面字号`,
    )
  }
})

test('global interface tokens cover the shared visual system', async () => {
  const source = await readFile(join(projectRoot, 'src', 'style.css'), 'utf8')
  const requiredTokens = [
    '--color-primary',
    '--color-surface',
    '--color-text-primary',
    '--color-border',
    '--color-success',
    '--color-warning',
    '--color-danger',
    '--space-4',
    '--radius-lg',
    '--shadow-panel',
    '--control-height',
  ]

  for (const token of requiredTokens) {
    assert.match(source, new RegExp(`${token}:`), `缺少全局界面变量 ${token}`)
  }
})

test('user-facing terminology consistently uses 感应器', async () => {
  const files = [
    join(projectRoot, 'src', 'App.vue'),
    ...(await Promise.all(uiRoots.map(vueFiles))).flat(),
  ]

  for (const file of files) {
    const source = await readFile(file, 'utf8')
    assert.doesNotMatch(source, /传感器/, `${file} 使用了未统一的“传感器”称呼`)
  }
})

test('development controls are explicitly guarded from production', async () => {
  const files = [
    join(projectRoot, 'src', 'views', 'Dashboard', 'Dashboard.vue'),
    join(projectRoot, 'src', 'views', 'SceneControl', 'SceneControl.vue'),
    join(projectRoot, 'src', 'components', 'DeviceCard', 'DeviceCard.vue'),
  ]

  for (const file of files) {
    const source = await readFile(file, 'utf8')
    assert.match(source, /const isDevelopment = import\.meta\.env\.DEV/)
    assert.match(source, /v-if="isDevelopment"/)
  }
})
