import test from 'node:test'
import assert from 'node:assert/strict'
import { createPinia } from 'pinia'
import { ACCOUNT_STORAGE_KEY, SESSION_STORAGE_KEY } from '../src/utils/auth.js'
import { bindAuthenticationLifecycle } from '../src/utils/authLifecycle.js'
import { validateRegistration } from '../src/utils/validateRegistration.js'
import { useUserStore } from '../src/store/userStore.js'
import { useRuleStore } from '../src/store/ruleStore.js'
import { useAlertStore } from '../src/store/alertStore.js'
import { useEnergyStore } from '../src/store/energyStore.js'
import { useDeviceStore } from '../src/store/deviceStore.js'
import { createSimulationController } from '../src/mock/simulator.js'

function memoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
}

test('registration confirmation, minimum password and trimmed username share the page validation rules', () => {
  const valid = {
    username: ' operator ',
    password: '12345678',
    confirmPassword: '12345678',
  }
  assert.deepEqual(validateRegistration(valid), {})
  assert.ok(validateRegistration({ ...valid, username: ' ' }).username)
  assert.ok(validateRegistration({ ...valid, password: '1234567' }).password)
  assert.ok(
    validateRegistration({ ...valid, confirmPassword: '87654321' })
      .confirmPassword,
  )
  assert.ok(
    validateRegistration({ ...valid, confirmPassword: '' }).confirmPassword,
  )
  assert.equal(Object.keys(validateRegistration(null)).length, 3)
})

test('authentication drives one simulator, refresh resets runtime only, logout preserves registered accounts', async (context) => {
  for (const key of ['localStorage', 'sessionStorage']) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key)
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: memoryStorage(),
    })
    context.after(() => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    })
  }
  const timers = new Set()
  const options = {
    now: () => 1_000_000,
    random: () => 1,
    setInterval: (callback) => {
      timers.add(callback)
      return callback
    },
    clearInterval: (callback) => timers.delete(callback),
  }
  const pinia = createPinia()
  const user = useUserStore(pinia)
  const simulator = createSimulationController(pinia, options)
  const dispose = bindAuthenticationLifecycle(user, simulator)
  context.after(dispose)
  assert.equal(timers.size, 0)
  assert.equal((await user.register('Operator', '12345678')).ok, true)
  assert.equal(user.isAuthenticated, false)
  assert.equal((await user.login('OPERATOR', '12345678')).ok, true)
  assert.equal(timers.size, 1)
  simulator.updateRule('rule-b1-a', { fullBrightness: 80 })
  simulator.manualSetLight('light-b1-a-1', 0)
  simulator.setDeviceStatus('light-b1-a-2', 'fault')
  simulator.tick(1_030_000, { randomEvents: false })
  const accounts = globalThis.localStorage.getItem(ACCOUNT_STORAGE_KEY)
  for (let repeat = 0; repeat < 10; repeat++) {
    await user.login('operator', '12345678')
    simulator.start()
  }
  assert.equal(timers.size, 1)
  assert.equal(useRuleStore(pinia).getById('rule-b1-a').fullBrightness, 80)
  dispose()
  assert.equal(timers.size, 0)
  const refreshedPinia = createPinia()
  const refreshedUser = useUserStore(refreshedPinia)
  const refreshedSimulator = createSimulationController(refreshedPinia, options)
  const disposeRefreshed = bindAuthenticationLifecycle(
    refreshedUser,
    refreshedSimulator,
  )
  context.after(disposeRefreshed)
  assert.equal(refreshedUser.isAuthenticated, true)
  assert.equal(timers.size, 1)
  assert.equal(
    useRuleStore(refreshedPinia).getById('rule-b1-a').fullBrightness,
    100,
  )
  assert.equal(useAlertStore(refreshedPinia).alerts.length, 0)
  assert.equal(useEnergyStore(refreshedPinia).actualKwh, 0)
  assert.ok(
    useDeviceStore(refreshedPinia).devices.every(
      (device) => device.status === 'online' && device.manualUntilAt === null,
    ),
  )
  assert.equal(globalThis.localStorage.getItem(ACCOUNT_STORAGE_KEY), accounts)
  refreshedUser.clearSession()
  assert.equal(timers.size, 0)
  assert.equal(globalThis.sessionStorage.getItem(SESSION_STORAGE_KEY), null)
  assert.equal(globalThis.localStorage.getItem(ACCOUNT_STORAGE_KEY), accounts)
})
