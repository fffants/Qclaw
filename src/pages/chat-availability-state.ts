import type {
  DashboardChatAvailability,
  DashboardChatAvailabilityState,
} from '../shared/chat-panel'

export interface ChatPageAvailabilityState {
  availabilityState: DashboardChatAvailabilityState
  canSend: boolean
  gatewayRunning: boolean
  connectedModels: string[]
  defaultModel: string
  availabilityMessage: string
}

export interface ChatPageAvailabilityApi {
  getChatAvailability: () => Promise<DashboardChatAvailability>
  gatewayHealth: () => Promise<{ running?: boolean } | null | undefined>
  readConfig: () => Promise<Record<string, any> | null>
}

function normalizeModelList(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return Array.from(
    new Set(
      input
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )
  )
}

function extractDefaultModelFromConfig(config: Record<string, any> | null): string {
  return String(config?.defaultModel ?? config?.agents?.defaults?.model?.primary ?? config?.model ?? '').trim()
}

function fromAvailability(availability: DashboardChatAvailability): ChatPageAvailabilityState {
  const connectedModels = normalizeModelList(availability.connectedModels)
  const defaultModel = String(availability.defaultModel || connectedModels[0] || '').trim()
  const availabilityState = availability.state || (availability.ready ? 'ready' : 'offline')

  return {
    availabilityState,
    canSend: Boolean(availability.canSend),
    gatewayRunning: Boolean(availability.gatewayRunning),
    connectedModels,
    defaultModel,
    availabilityMessage: availabilityState === 'ready' ? '' : String(availability.message || '').trim(),
  }
}

async function fromFallback(api: ChatPageAvailabilityApi): Promise<ChatPageAvailabilityState> {
  let gatewayRunning = false
  try {
    const health = await api.gatewayHealth()
    gatewayRunning = Boolean(health?.running)
  } catch {
    gatewayRunning = false
  }

  let defaultModel = ''
  try {
    const config = await api.readConfig()
    defaultModel = extractDefaultModelFromConfig(config)
  } catch {
    defaultModel = ''
  }

  return {
    availabilityState: 'error',
    canSend: false,
    gatewayRunning,
    connectedModels: [],
    defaultModel,
    availabilityMessage: '聊天状态读取失败，请稍后重试',
  }
}

export async function resolveChatPageAvailabilityState(
  api: ChatPageAvailabilityApi
): Promise<ChatPageAvailabilityState> {
  try {
    const availability = await api.getChatAvailability()
    return fromAvailability(availability)
  } catch {
    return fromFallback(api)
  }
}
