import type { ChatSendRequest } from './chat-panel'
import type { ChatTransportRunParams } from '../../electron/main/chat-transport/chat-transport-types'

const validSendRequest: ChatSendRequest = {
  sessionId: 'session-1',
  text: 'hello',
  thinking: 'off',
}

const validTransportRunParams: ChatTransportRunParams = {
  transportSessionId: 'transport-1',
  messageText: 'hello',
  thinking: 'off',
}

void validSendRequest
void validTransportRunParams

const invalidSendRequest: ChatSendRequest = {
  sessionId: 'session-1',
  text: 'hello',
  // @ts-expect-error Session model changes must never be passed through sendChatMessage.
  model: 'openai/gpt-4.1-mini',
}

const invalidTransportRunParams: ChatTransportRunParams = {
  transportSessionId: 'transport-1',
  messageText: 'hello',
  thinking: 'off',
  // @ts-expect-error Transports must never receive send-time model overrides.
  model: 'openai/gpt-4.1-mini',
}

void invalidSendRequest
void invalidTransportRunParams
