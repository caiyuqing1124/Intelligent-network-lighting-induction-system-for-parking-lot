<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElButton, ElForm, ElFormItem, ElInput, ElMessage } from 'element-plus'
import { useUserStore } from '../../store/userStore.js'
import { validateRegistration } from '../../utils/validateRegistration.js'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const formRef = ref()
const submitting = ref(false)
const form = reactive({
  username:
    typeof route.query.username === 'string' ? route.query.username : '',
  password: '',
  confirmPassword: '',
})

function validatorFor(field) {
  return (_rule, _value, callback) => {
    const error = validateRegistration(form)[field]
    callback(error ? new Error(error) : undefined)
  }
}

const rules = {
  username: [{ validator: validatorFor('username'), trigger: 'blur' }],
  password: [{ validator: validatorFor('password'), trigger: 'blur' }],
  confirmPassword: [
    { validator: validatorFor('confirmPassword'), trigger: 'blur' },
  ],
}

async function submitRegistration() {
  if (submitting.value) return
  submitting.value = true
  try {
    const valid = await formRef.value.validate().catch(() => false)
    if (!valid) return
    const result = await userStore.register(form.username, form.password)
    if (result.ok) {
      ElMessage.success('账号注册成功')
      const redirect =
        typeof route.query.redirect === 'string'
          ? { redirect: route.query.redirect }
          : {}
      await router.replace({
        name: 'login',
        query: {
          registered: '1',
          username: result.account.username,
          ...redirect,
        },
      })
      return
    }
    const messages = {
      duplicate_username: '该用户名已注册，用户名不区分大小写',
      invalid_username: '请输入 1 至 30 个字符的用户名',
      invalid_password: '密码至少需要 8 位',
      storage_unavailable: '浏览器本地存储不可用，暂时无法注册',
      crypto_unavailable: '当前浏览器不支持安全摘要，暂时无法注册',
    }
    ElMessage.error(messages[result.reason] ?? '注册失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="auth-page register-page">
    <div class="auth-intro">
      <div class="auth-brand-mark">源</div>
      <p class="auth-brand-name">源多艺</p>
      <h1>建立本机运营账号</h1>
      <p>
        创建运营人员登录凭据，完成后即可进入设备监控、策略配置、告警处置与能耗核算功能。
      </p>
      <div class="register-guidance">
        <strong>注册前请注意</strong>
        <span>用户名去除首尾空格后保存，且不区分大小写。</span>
        <span>密码至少 8 位，请勿使用真实业务系统密码。</span>
        <span>忘记密码时，可返回登录页重置本机账号。</span>
      </div>
    </div>

    <div class="auth-form-column">
      <div class="auth-card">
        <div class="auth-card-heading">
          <p>本地账号注册</p>
          <h2>创建登录账号</h2>
          <span>完成后返回登录页，使用新账号进入管理后台。</span>
        </div>

        <ElForm
          ref="formRef"
          :model="form"
          :rules="rules"
          label-position="top"
          size="large"
          @submit.prevent="submitRegistration"
        >
          <ElFormItem label="用户名" prop="username">
            <ElInput
              v-model="form.username"
              maxlength="30"
              show-word-limit
              autocomplete="username"
              placeholder="请输入用户名"
              clearable
            />
          </ElFormItem>
          <ElFormItem label="密码" prop="password">
            <ElInput
              v-model="form.password"
              type="password"
              autocomplete="new-password"
              placeholder="至少 8 位"
              show-password
            />
          </ElFormItem>
          <ElFormItem label="确认密码" prop="confirmPassword">
            <ElInput
              v-model="form.confirmPassword"
              type="password"
              autocomplete="new-password"
              placeholder="请再次输入密码"
              show-password
            />
          </ElFormItem>
          <ElButton
            class="auth-submit"
            type="primary"
            native-type="submit"
            :loading="submitting"
          >
            注册账号
          </ElButton>
        </ElForm>

        <p class="auth-switch">
          已经注册过账号？
          <RouterLink
            :to="{
              name: 'login',
              query:
                typeof route.query.redirect === 'string'
                  ? { redirect: route.query.redirect }
                  : {},
            }"
          >
            返回登录
          </RouterLink>
        </p>
      </div>
      <footer class="auth-copyright">
        © {{ new Date().getFullYear() }} 福建源多艺科技集团有限公司
      </footer>
    </div>
  </section>
</template>
