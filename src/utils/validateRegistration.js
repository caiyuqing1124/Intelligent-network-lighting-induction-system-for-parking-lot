export function validateRegistration(form) {
  const errors = {}
  const username =
    typeof form?.username === 'string' ? form.username.trim() : ''
  if (!username) errors.username = '请输入用户名'
  else if (username.length > 30) errors.username = '用户名不能超过 30 个字符'
  if (typeof form?.password !== 'string' || !form.password)
    errors.password = '请输入密码'
  else if (form.password.length < 8) errors.password = '密码至少需要 8 位'
  if (typeof form?.confirmPassword !== 'string' || !form.confirmPassword)
    errors.confirmPassword = '请再次输入密码'
  else if (form.confirmPassword !== form.password)
    errors.confirmPassword = '两次输入的密码不一致'
  return errors
}
