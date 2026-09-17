<script setup>
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  tag: { type: String, default: '' },
})
</script>

<template>
  <article class="chart-panel">
    <header class="chart-panel-heading">
      <div>
        <h2>{{ title }}</h2>
        <p v-if="subtitle">{{ subtitle }}</p>
      </div>
      <span v-if="tag">{{ tag }}</span>
    </header>
    <slot />
  </article>
</template>

<style scoped>
.chart-panel {
  min-width: 0;
  padding: 24px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-panel);
}
.chart-panel-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 18px;
}
.chart-panel-heading h2 {
  margin: 0;
  color: var(--color-text-primary);
  font-size: 18px;
}
.chart-panel-heading p {
  margin: 6px 0 0;
  color: var(--color-text-muted);
  font-size: 14px;
  line-height: 1.5;
}
.chart-panel-heading > span {
  border-radius: 20px;
  padding: 6px 9px;
  background: #eef3f8;
  color: #657a91;
  font-size: 13px;
  white-space: nowrap;
}
</style>
