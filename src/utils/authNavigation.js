export function authenticationNavigation(to, isAuthenticated) {
  if (to.meta.requiresAuth && !isAuthenticated) {
    return {
      name: 'login',
      query: to.fullPath === '/' ? {} : { redirect: to.fullPath },
    }
  }
  if (to.meta.guestOnly && isAuthenticated) return { name: 'dashboard' }
  return true
}
