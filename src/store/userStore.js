import { defineStore } from 'pinia'
import {
  authenticateLocalAccount,
  readValidSession,
  registerLocalAccount,
  removeLocalAccount,
  removeStoredSession,
  writeStoredSession,
} from '../utils/auth.js'

export const useUserStore = defineStore('user', {
  state: () => ({ username: readValidSession() }),
  getters: {
    isAuthenticated: (state) => Boolean(state.username),
  },
  actions: {
    setSession(username) {
      if (!writeStoredSession(username)) return false
      this.username = username
      return true
    },
    clearSession() {
      this.username = null
      removeStoredSession()
    },
    async register(username, password) {
      return registerLocalAccount(username, password)
    },
    async login(username, password) {
      const result = await authenticateLocalAccount(username, password)
      if (result.ok && !this.setSession(result.account.username))
        return { ok: false, reason: 'session_unavailable' }
      return result
    },
    removeAccount(username) {
      const result = removeLocalAccount(username)
      if (
        result.ok &&
        this.username &&
        this.username.toLocaleLowerCase('zh-CN') ===
          result.account.normalizedUsername
      ) {
        this.clearSession()
      }
      return result
    },
  },
})
