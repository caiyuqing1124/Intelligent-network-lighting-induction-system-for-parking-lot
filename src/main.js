import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { ElButton } from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import router from './router/index.js'
import { getAppSimulator } from './mock/simulator.js'
import './style.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)
app.component('ElButton', ElButton)
app.mount('#app')

const simulator = getAppSimulator(pinia)
window.addEventListener('beforeunload', () => simulator.stop())
if (import.meta.hot) import.meta.hot.dispose(() => simulator.stop())
