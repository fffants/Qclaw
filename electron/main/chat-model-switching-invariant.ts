const SEND_TIME_MODEL_OVERRIDE_ERROR =
  '禁止在发送消息时携带 model；请先通过 patchChatSessionModel()/sessions.patch 切换当前会话模型'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function resolveSendTimeModelOverrideErrorMessage(source: string): string {
  const normalizedSource = String(source || '').trim()
  return normalizedSource
    ? `${normalizedSource}：${SEND_TIME_MODEL_OVERRIDE_ERROR}`
    : SEND_TIME_MODEL_OVERRIDE_ERROR
}

export function hasSendTimeModelOverride(value: unknown): boolean {
  return isRecord(value) && Object.prototype.hasOwnProperty.call(value, 'model')
}

export function assertNoSendTimeModelOverride(value: unknown, source: string): void {
  if (!hasSendTimeModelOverride(value)) return
  throw new Error(resolveSendTimeModelOverrideErrorMessage(source))
}
