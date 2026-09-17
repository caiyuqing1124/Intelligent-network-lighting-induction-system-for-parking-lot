<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ElAlert,
  ElButton,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElMessageBox,
} from 'element-plus'
import { useUserStore } from '../../store/userStore.js'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const formRef = ref()
const submitting = ref(false)
const forgotDialogVisible = ref(false)
const forgotUsername = ref('')
const resettingAccount = ref(false)
const form = reactive({
  username:
    typeof route.query.username === 'string' ? route.query.username : '',
  password: '',
})
const rules = {
  username: [
    {
      validator: (_rule, value, callback) =>
        callback(
          typeof value === 'string' && value.trim()
            ? undefined
            : new Error('请输入用户名'),
        ),
      trigger: 'blur',
    },
  ],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

function postLoginTarget() {
  const redirect = route.query.redirect
  if (
    typeof redirect !== 'string' ||
    !redirect.startsWith('/') ||
    redirect.startsWith('//')
  ) {
    return { name: 'dashboard' }
  }
  const resolved = router.resolve(redirect)
  return resolved.matched.some((record) => record.meta.requiresAuth)
    ? resolved.fullPath
    : { name: 'dashboard' }
}

async function submitLogin() {
  if (submitting.value) return
  submitting.value = true
  try {
    const valid = await formRef.value.validate().catch(() => false)
    if (!valid) return
    const result = await userStore.login(form.username, form.password)
    if (result.ok) {
      ElMessage.success('登录成功，正在进入系统')
      await router.replace(postLoginTarget())
      return
    }
    const messages = {
      account_not_found: '账号不存在，请检查用户名或先注册账号',
      wrong_password: '密码错误，请重新输入',
      storage_unavailable: '浏览器本地存储不可用，暂时无法登录',
      session_unavailable: '登录状态无法保存，请检查浏览器存储设置后重试',
      crypto_unavailable: '当前浏览器不支持安全摘要，暂时无法登录',
      missing_credentials: '请输入用户名和密码',
    }
    ElMessage.error(messages[result.reason] ?? '登录失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}

function openForgotPassword() {
  forgotUsername.value = form.username.trim()
  forgotDialogVisible.value = true
}

async function resetLocalAccount() {
  const username = forgotUsername.value.trim()
  if (!username) {
    ElMessage.warning('请输入需要重新注册的用户名')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确认移除本机账号“${username}”吗？移除后需要重新注册。`,
      '确认重置本地账号',
      {
        type: 'warning',
        confirmButtonText: '移除并重新注册',
        cancelButtonText: '取消',
      },
    )
  } catch {
    return
  }

  resettingAccount.value = true
  try {
    const result = userStore.removeAccount(username)
    if (!result.ok) {
      const messages = {
        account_not_found: '没有找到该本地账号，请检查用户名',
        storage_unavailable: '浏览器本地存储不可用，无法重置账号',
        invalid_username: '请输入有效用户名',
      }
      ElMessage.error(messages[result.reason] ?? '账号重置失败，请稍后重试')
      return
    }
    forgotDialogVisible.value = false
    ElMessage.success('本地账号已移除，请重新注册')
    await router.push({
      name: 'register',
      query: {
        username: result.account.username,
        ...(typeof route.query.redirect === 'string'
          ? { redirect: route.query.redirect }
          : {}),
      },
    })
  } finally {
    resettingAccount.value = false
  }
}
</script>

<template>
  <section class="auth-page">
    <div class="auth-intro">
      <div class="auth-brand-mark">源</div>
      <p class="auth-brand-name">源多艺</p>
      <h1>停车场智能网络<br />照明感应系统</h1>
      <p>
        统一查看灯具、感应器、联动策略、故障告警与照明能耗，辅助物业人员集中掌握停车场照明运行情况。
      </p>
      <ul class="auth-feature-list">
        <li><span>01</span>车辆感应与分区灯组自动联动</li>
        <li><span>02</span>设备状态和故障告警集中呈现</li>
        <li><span>03</span>按灯具运行状态核算照明能耗</li>
      </ul>
    </div>

    <div class="auth-form-column">
      <div class="auth-card">
        <div class="auth-card-heading">
          <p>运营人员入口</p>
          <h2>登录管理后台</h2>
          <span>使用当前浏览器中已经注册的账号登录。</span>
        </div>

        <ElAlert
          v-if="route.query.registered === '1'"
          class="auth-notice"
          title="注册成功，请使用新账号登录"
          type="success"
          :closable="false"
          show-icon
        />

        <ElForm
          ref="formRef"
          :model="form"
          :rules="rules"
          label-position="top"
          size="large"
          @submit.prevent="submitLogin"
        >
          <ElFormItem label="用户名" prop="username">
            <ElInput
              v-model="form.username"
              maxlength="30"
              autocomplete="username"
              placeholder="请输入已注册用户名"
              clearable
            />
          </ElFormItem>
          <ElFormItem label="密码" prop="password">
            <ElInput
              v-model="form.password"
              type="password"
              autocomplete="current-password"
              placeholder="请输入密码"
              show-password
            />
          </ElFormItem>
          <div class="auth-form-tools">
            <ElButton link type="primary" @click="openForgotPassword">
              忘记密码？
            </ElButton>
          </div>
          <ElButton
            class="auth-submit"
            type="primary"
            native-type="submit"
            :loading="submitting"
          >
            登录
          </ElButton>
        </ElForm>

        <p class="auth-switch">
          当前浏览器还没有账号？
          <RouterLink
            :to="{
              name: 'register',
              query:
                typeof route.query.redirect === 'string'
                  ? { redirect: route.query.redirect }
                  : {},
            }"
          >
            注册本地账号
          </RouterLink>
        </p>
      </div>
      <footer class="auth-copyright">
        © {{ new Date().getFullYear() }} 福建源多艺科技集团有限公司
      </footer>
    </div>

    <ElDialog
      v-model="forgotDialogVisible"
      title="忘记密码"
      width="min(460px, 92vw)"
      destroy-on-close
    >
      <div class="forgot-password-copy">
        <strong>重新建立本地账号</strong>
        <p>
          当前密码无法直接读取。输入原用户名并确认移除后，即可使用同一用户名重新注册。
        </p>
      </div>
      <ElInput
        v-model="forgotUsername"
        maxlength="30"
        placeholder="请输入原用户名"
        aria-label="需要重新注册的用户名"
        @keyup.enter="resetLocalAccount"
      />
      <template #footer>
        <ElButton @click="forgotDialogVisible = false">取消</ElButton>
        <ElButton
          type="danger"
          :loading="resettingAccount"
          :disabled="!forgotUsername.trim()"
          @click="resetLocalAccount"
        >
          移除并重新注册
        </ElButton>
      </template>
    </ElDialog>
  </section>
</template>
