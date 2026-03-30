import type { DashboardChatAvailabilityState } from '../../shared/chat-panel'

export interface ChatPanelAvailabilityInput {
  availabilityState: DashboardChatAvailabilityState
  canSend: boolean
  connectedModels: string[]
  availabilityMessage?: string
  preserveConversation: boolean
}

export interface ChatPanelAvailabilityView {
  isReady: boolean
  isDegraded: boolean
  isModelUnavailable: boolean
  canUseChatData: boolean
  resolvedAvailabilityMessage: string
  showAvailabilityBanner: boolean
  showAvailabilityEmptyState: boolean
  statusDetail: string
  headerBadgeColor: 'success' | 'warning' | 'surface'
  headerBadgeLabel: string
}

export function deriveChatPanelAvailabilityView(
  input: ChatPanelAvailabilityInput
): ChatPanelAvailabilityView {
  const hasConnectedModels = input.connectedModels.length > 0
  const isReady = input.availabilityState === 'ready'
  const isDegraded = input.availabilityState === 'degraded'
  const isModelUnavailable =
    input.availabilityState === 'no-model' || (!hasConnectedModels && !input.canSend)
  const canUseChatData = input.canSend
  const resolvedAvailabilityMessage = String(input.availabilityMessage || '').trim() || (
    input.availabilityState === 'loading'
      ? '正在读取聊天状态...'
      : input.availabilityState === 'degraded'
      ? '网关连接不稳定，正在自动恢复'
      : input.availabilityState === 'offline'
        ? '模型已配置，但网关当前未运行'
        : input.availabilityState === 'no-model'
          ? '当前还没有可直接对话的模型'
          : input.availabilityState === 'error'
            ? '聊天状态读取失败，请稍后重试'
            : ''
  )
  const showAvailabilityBanner = input.availabilityState !== 'ready' && input.preserveConversation
  const showAvailabilityEmptyState = !input.canSend && !showAvailabilityBanner
  const statusDetail = showAvailabilityBanner
    ? `${resolvedAvailabilityMessage}。当前聊天记录已保留，恢复后可继续查看或发送。`
    : resolvedAvailabilityMessage
  const headerBadgeColor =
    input.availabilityState === 'ready'
      ? 'success'
      : input.availabilityState === 'loading'
        ? 'surface'
      : input.availabilityState === 'degraded'
        ? 'warning'
        : input.availabilityState === 'no-model'
          ? 'warning'
          : 'surface'
  const headerBadgeLabel =
    input.availabilityState === 'ready'
      ? '可聊天'
      : input.availabilityState === 'loading'
        ? '读取中'
      : input.availabilityState === 'degraded'
        ? '连接波动'
        : input.availabilityState === 'no-model'
          ? '待连接模型'
          : input.availabilityState === 'error'
            ? '状态异常'
            : '网关离线'

  return {
    isReady,
    isDegraded,
    isModelUnavailable,
    canUseChatData,
    resolvedAvailabilityMessage,
    showAvailabilityBanner,
    showAvailabilityEmptyState,
    statusDetail,
    headerBadgeColor,
    headerBadgeLabel,
  }
}
