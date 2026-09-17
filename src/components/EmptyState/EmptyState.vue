<script setup>
defineProps({
  symbol: { type: String, default: '空' },
  title: { type: String, required: true },
  description: { type: String, required: true },
  compact: { type: Boolean, default: false },
  tone: { type: String, default: 'neutral' },
})
</script>

<template>
  <div
    class="empty-state"
    :class="[`empty-state--${tone}`, { 'empty-state--compact': compact }]"
    role="status"
  >
    <span class="empty-state__symbol" aria-hidden="true">{{ symbol }}</span>
    <strong>{{ title }}</strong>
    <p>{{ description }}</p>
    <div v-if="$slots.default" class="empty-state__actions">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.empty-state {
  min-height: 280px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-8) var(--space-5);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface-muted);
  color: var(--color-text-secondary);
  text-align: center;
}
.empty-state--compact {
  min-height: 180px;
}
.empty-state__symbol {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  margin-bottom: var(--space-3);
  border-radius: 50%;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: 15px;
  font-weight: 800;
}
.empty-state--success .empty-state__symbol {
  background: var(--color-success-soft);
  color: var(--color-success);
}
.empty-state--warning .empty-state__symbol {
  background: var(--color-warning-soft);
  color: var(--color-warning);
}
.empty-state strong {
  color: var(--color-text-primary);
  font-size: 16px;
}
.empty-state p {
  max-width: 520px;
  margin: var(--space-2) 0 0;
  font-size: 14px;
  line-height: 1.7;
}
.empty-state__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-3);
  margin-top: var(--space-4);
}
</style>
