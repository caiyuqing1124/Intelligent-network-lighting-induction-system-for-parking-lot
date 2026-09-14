import { defineStore } from 'pinia'
import { createInitialRules } from '../mock/rules.js'

export const useRuleStore = defineStore('rules', {
  state: () => ({ rules: createInitialRules() }),
  actions: {
    reset() {
      this.rules = createInitialRules()
    },
    getById(id) {
      return this.rules.find((rule) => rule.id === id)
    },
    updateRule(id, changes) {
      const rule = this.getById(id)
      if (!rule) return false
      Object.assign(rule, changes)
      return true
    },
  },
})
