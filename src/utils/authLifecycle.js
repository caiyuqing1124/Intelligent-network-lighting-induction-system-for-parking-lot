import { watch } from 'vue'

export function bindAuthenticationLifecycle(userStore, simulator) {
  const stopWatching = watch(
    () => userStore.isAuthenticated,
    (authenticated) => {
      if (authenticated) simulator.start()
      else simulator.stop()
    },
    { immediate: true, flush: 'sync' },
  )
  return () => {
    stopWatching()
    simulator.stop()
  }
}
