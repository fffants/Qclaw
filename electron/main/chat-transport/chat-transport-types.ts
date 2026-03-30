import type { ChatThinkingLevel, ChatUsage } from '../../../src/shared/chat-panel'
import type { RunCliStreamOptions } from '../cli'

export interface CliLikeResult {
  ok: boolean
  stdout: string
  stderr: string
  code: number | null
  canceled?: boolean
}

export interface ChatTransportDeltaPayload {
  text: string
  delta: string
  model?: string
  usage?: ChatUsage
}

export interface ChatTransportRunParams {
  transportSessionId: string
  sessionKey?: string
  messageText: string
  // Deliberately no send-time model override. The active session model must
  // already be resolved before transport.send runs.
  thinking: ChatThinkingLevel
  signal?: AbortSignal
  onAssistantDelta?: (payload: ChatTransportDeltaPayload) => void
}

export interface ChatTransportRunResult extends CliLikeResult {
  streamedText: string
  streamedModel?: string
  streamedUsage?: ChatUsage
}

export interface ChatTransport {
  run(params: ChatTransportRunParams): Promise<ChatTransportRunResult>
}

export type RunStreamingCommand = (
  args: string[],
  options?: RunCliStreamOptions
) => Promise<CliLikeResult>
