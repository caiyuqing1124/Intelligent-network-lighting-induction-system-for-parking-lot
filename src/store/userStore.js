import { defineStore } from 'pinia'

const SESSION_KEY = 'parking-lighting-session'

function readSession() {
  return typeof sessionStorage !== 'undefined'
    ? sessionStorage.getItem(SESSION_KEY)
    : null
}

export const useUserStore = defineStore('user', {
  state: () => ({ username: readSession() }),
  getters: {
    isAuthenticated: (state) => Boolean(state.username),
  },
  actions: {
    setSession(username) {
      this.username = username
      if (typeof sessionStorage !== 'undefined')
        sessionStorage.setItem(SESSION_KEY, username)
    },
    clearSession() {
      this.username = null
      if (typeof sessionStorage !== 'undefined')
        sessionStorage.removeItem(SESSION_KEY)
    },
  },
})
