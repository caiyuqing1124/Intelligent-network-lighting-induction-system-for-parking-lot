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
  border: 1px solid #e3e9f0;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 8px 22px #1d2c4208;
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
  color: #2a415d;
  font-size: 18px;
}
.chart-panel-heading p {
  margin: 6px 0 0;
  color: #8191a4;
  font-size: 12px;
  line-height: 1.5;
}
.chart-panel-heading > span {
  border-radius: 20px;
  padding: 6px 9px;
  background: #eef3f8;
  color: #657a91;
  font-size: 10px;
  white-space: nowrap;
}
</style>
