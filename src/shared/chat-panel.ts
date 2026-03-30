export type DashboardChatAvailabilityReason =
  | 'ready'
  | 'gateway-offline'
  | 'no-configured-model'
  | 'model-status-error'
  | 'chat-service-error'

export type DashboardChatAvailabilityState =
  | 'loading'
  | 'ready'
  | 'degraded'
  | 'offline'
  | 'no-model'
  | 'error'

export type ChatSessionKind = 'direct' | 'channel' | 'unknown'

export type ChatSessionOrigin = 'local-direct' | 'external-direct' | 'channel' | 'unknown'

export type ChatMessageRole = 'user' | 'assistant' | 'system'

export type ChatMessageStatus = 'pending' | 'sent' | 'error'

export type ChatThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high'

export type ChatSendErrorCode =
  | 'gateway-offline'
  | 'command-failed'
  | 'parse-failed'
  | 'timeout'
  | 'invalid-input'
  | 'canceled'

export type ChatExternalTranscriptErrorCode =
  | 'session-key-missing'
  | 'gateway-offline'
  | 'gateway-auth-failed'
  | 'session-not-found'
  | 'sessions-get-failed'
  | 'messages-map-failed'

export type ChatHistorySource = 'chat-history' | 'sessions-get' | 'local-cache' | 'none'

export type ChatAuthorityKind = 'upstream-direct' | 'upstream-channel' | 'local-cache-only' | 'mixed' | 'unknown'

export type ChatCachePresence = 'none' | 'local-shell' | 'local-transcript'

export type ChatFailureClass = 'none' | 'semantic' | 'permission' | 'connection' | 'capability' | 'unknown'

export type ChatFieldStateKind = 'confirmed' | 'intent' | 'cache' | 'derived'

export interface ChatUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  reasoningTokens?: number
}

export interface DashboardChatAvailability {
  state: DashboardChatAvailabilityState
  ready: boolean
  canSend: boolean
  reason: DashboardChatAvailabilityReason
  gatewayRunning: boolean
  connectedModels: string[]
  defaultModel?: string
  agentId: string
  message?: string
  transient?: boolean
  lastHealthyAt?: number
  consecutiveGatewayFailures?: number
}

export interface ChatSessionSummary {
  sessionId: string
  sessionKey?: string
  upstreamConfirmed?: boolean
  agentId: string
  model?: string
  selectedModel?: string
  canPatchModel?: boolean
  canContinue?: boolean
  authorityKind?: ChatAuthorityKind
  cachePresence?: ChatCachePresence
  legacySemanticsActive?: boolean
  modelSwitchBlockedReason?: string
  updatedAt: number
  kind: ChatSessionKind
  hasLocalTranscript: boolean
  totalTokens?: number
  contextTokens?: number
  localOnly?: boolean
}

export interface DashboardChatSessionStatus {
  defaultModel: string
  sessionModel: string
  sessionSource: string
  sessionOrigin: ChatSessionOrigin
  authorityKind?: ChatAuthorityKind
  cachePresence?: ChatCachePresence
  canContinue?: boolean
  willForkOnSend: boolean
  notice: string
}

export interface DashboardChatHistorySummary {
  originBadge: string
  secondaryBadge?: string
  modelDetail: string
}

export interface ChatMessage {
  id: string
  role: ChatMessageRole
  text: string
  createdAt: number
  status?: ChatMessageStatus
  model?: string
  requestedModel?: string
  transportSessionId?: string
  usage?: ChatUsage
}

export interface ChatTranscript {
  sessionId: string
  sessionKey?: string
  upstreamConfirmed?: boolean
  agentId: string
  model?: string
  selectedModel?: string
  historySource?: ChatHistorySource
  canPatchModel?: boolean
  canContinue?: boolean
  authorityKind?: ChatAuthorityKind
  cachePresence?: ChatCachePresence
  legacySemanticsActive?: boolean
  modelSwitchBlockedReason?: string
  updatedAt: number
  hasLocalTranscript: boolean
  messages: ChatMessage[]
  externalTranscriptLimit?: number
  externalTranscriptTruncated?: boolean
  externalTranscriptErrorCode?: ChatExternalTranscriptErrorCode
  externalTranscriptErrorMessage?: string
}

export interface ChatCapabilitySnapshot {
  version?: string
  discoveredAt?: string
  supportsSessionsPatch: boolean
  supportsChatHistory: boolean
  supportsGatewayChatSend: boolean
  supportsGatewayRpc: boolean
  notes: string[]
}

export interface ChatSessionDebugSnapshot {
  requestedSessionId: string
  trackedSessionId: string
  resolvedSessionId: string
  resolvedSessionKey?: string
  historySource: ChatHistorySource
  confirmedModel?: string
  intentSelectedModel?: string
  canPatchModel: boolean
  canContinue: boolean
  authorityKind: ChatAuthorityKind
  cachePresence: ChatCachePresence
  failureClass: ChatFailureClass
  legacySemanticsActive: boolean
  updatedAt: number
  fieldStates: Record<string, ChatFieldStateKind>
  notes: string[]
}

export interface ChatTraceEntry {
  id: string
  operation: 'transcript' | 'patch' | 'send' | 'create'
  stage: string
  sessionId?: string
  sessionKey?: string
  historySource?: ChatHistorySource
  confirmedModel?: string
  intentSelectedModel?: string
  failureClass?: ChatFailureClass
  message?: string
  createdAt: number
}

export interface ChatSendRequest {
  sessionId: string
  text: string
  // Deliberately no `model` field here. Session model changes must go through
  // `patchChatSessionModel()` so Qclaw mirrors OpenClaw Control UI semantics.
  thinking?: ChatThinkingLevel
}

export interface ChatSendResult {
  ok: boolean
  sessionId: string
  message?: ChatMessage
  errorCode?: ChatSendErrorCode
  messageText?: string
}

export interface ChatPatchSessionModelRequest {
  sessionId: string
  model: string
}

export interface ChatPatchSessionModelResult {
  ok: boolean
  sessionId: string
  sessionKey?: string
  model?: string
  messageText?: string
}

export interface ChatClearLocalTranscriptResult {
  ok: boolean
  sessionId: string
}

export type ChatStreamEvent =
  | {
      type: 'assistant-start'
      sessionId: string
      model?: string
    }
  | {
      type: 'assistant-delta'
      sessionId: string
      textDelta: string
      text: string
      model?: string
      usage?: ChatUsage
    }
  | {
      type: 'assistant-complete'
      sessionId: string
      message: ChatMessage
    }
  | {
      type: 'assistant-error'
      sessionId: string
      errorCode: ChatSendErrorCode
      messageText: string
    }
