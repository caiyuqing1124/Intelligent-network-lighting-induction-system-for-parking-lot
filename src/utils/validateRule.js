const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

function validateInteger(errors, rule, field, label, minimum, maximum) {
  const value = rule?.[field]
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    errors[field] = `${label}必须是 ${minimum}–${maximum} 的整数`
  }
}

export function validateRule(rule) {
  const errors = {}

  if (typeof rule?.name !== 'string' || rule.name.trim() === '')
    errors.name = '策略名称不能为空'
  else if (rule.name.trim().length > 30)
    errors.name = '策略名称不能超过 30 个字符'
  if (typeof rule?.scheduleEnabled !== 'boolean')
    errors.scheduleEnabled = '定时待机开关必须是有效状态'

  validateInteger(errors, rule, 'triggerHoldSeconds', '感应保持时间', 1, 3600)
  validateInteger(errors, rule, 'triggerDelayOff', '回落延时', 0, 3600)
  validateInteger(errors, rule, 'standbyBrightness', '普通待机亮度', 0, 100)
  validateInteger(errors, rule, 'fullBrightness', '工作亮度', 1, 100)
  validateInteger(errors, rule, 'scheduledBrightness', '定时待机亮度', 0, 100)

  if (
    !errors.fullBrightness &&
    !errors.standbyBrightness &&
    rule.fullBrightness < rule.standbyBrightness
  ) {
    errors.fullBrightness = '工作亮度不能低于普通待机亮度'
  }
  if (
    !errors.fullBrightness &&
    !errors.scheduledBrightness &&
    rule.fullBrightness < rule.scheduledBrightness
  ) {
    errors.fullBrightness = '工作亮度不能低于定时待机亮度'
  }

  if (!TIME_PATTERN.test(rule?.scheduleStartTime ?? ''))
    errors.scheduleStartTime = '请选择有效的开始时间'
  if (!TIME_PATTERN.test(rule?.scheduleEndTime ?? ''))
    errors.scheduleEndTime = '请选择有效的结束时间'
  if (
    !errors.scheduleStartTime &&
    !errors.scheduleEndTime &&
    rule.scheduleStartTime === rule.scheduleEndTime
  ) {
    errors.scheduleEndTime = '开始时间和结束时间不能相同'
  }

  return errors
}

export function isRuleValid(rule) {
  return Object.keys(validateRule(rule)).length === 0
}
