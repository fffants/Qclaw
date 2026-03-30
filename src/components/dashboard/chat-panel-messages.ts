import type { ChatMessage, ChatUsage } from '../../shared/chat-panel'

const EMBEDDED_MESSAGE_TIMESTAMP_PATTERN =
  /^\[((?:[A-Za-z]{3}\s+)?\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?\s+GMT[+-]\d{1,2})\]\s*/

export interface PendingAssistantPreview {
  sending: boolean
  started: boolean
  stopping: boolean
  text?: string
  model?: string
  usage?: ChatUsage
}

export interface ChatMessageDisplayText {
  body: string
  embeddedTimestamp: string
}

export interface BuildRenderedChatMessagesInput {
  baseMessages: ChatMessage[]
  pendingUserText?: string
  pendingAssistant: PendingAssistantPreview
  now?: () => number
}

export function resolveChatMessageDisplayText(
  text: string
): ChatMessageDisplayText {
  const normalized = String(text || '').trim()
  if (!normalized) {
    return {
      body: '',
      embeddedTimestamp: '',
    }
  }

  const matched = normalized.match(EMBEDDED_MESSAGE_TIMESTAMP_PATTERN)
  if (!matched) {
    return {
      body: normalized,
      embeddedTimestamp: '',
    }
  }

  const body = normalized.slice(matched[0].length).trim()
  if (!body) {
    return {
      body: normalized,
      embeddedTimestamp: '',
    }
  }

  return {
    body,
    embeddedTimestamp: matched[1],
  }
}

export function buildRenderedChatMessages(input: BuildRenderedChatMessagesInput): ChatMessage[] {
  const now = input.now ?? Date.now
  const renderedMessages = [...(Array.isArray(input.baseMessages) ? input.baseMessages : [])]
  const pendingUserText = String(input.pendingUserText || '').trim()

  if (pendingUserText) {
    renderedMessages.push({
      id: '__pending-user__',
      role: 'user',
      text: pendingUserText,
      createdAt: now(),
      status: 'pending',
    })
  }

  const pendingAssistantText = String(input.pendingAssistant.text || '')
  const shouldShowAssistantPreview =
    input.pendingAssistant.sending ||
    input.pendingAssistant.started ||
    input.pendingAssistant.stopping ||
    Boolean(pendingAssistantText.trim())

  if (!shouldShowAssistantPreview) {
    return renderedMessages
  }

  renderedMessages.push({
    id: '__pending-assistant__',
    role: 'assistant',
    text: pendingAssistantText || (input.pendingAssistant.stopping ? '正在停止回答...' : 'AI 正在思考...'),
    createdAt: now() + 1,
    status: 'pending',
    model: String(input.pendingAssistant.model || '').trim() || undefined,
    usage: input.pendingAssistant.usage,
  })

  return renderedMessages
}

export function shouldShowFullscreenChatLoader(params: {
  loadingSessions: boolean
  loadingTranscript: boolean
  renderedMessageCount: number
}): boolean {
  return params.renderedMessageCount === 0 && (params.loadingSessions || params.loadingTranscript)
}
