import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../../shared/chat-panel'
import {
  buildRenderedChatMessages,
  resolveChatMessageDisplayText,
  shouldShowFullscreenChatLoader,
} from './chat-panel-messages'

function createMessage(overrides: Partial<ChatMessage> & Pick<ChatMessage, 'id' | 'role' | 'text'>): ChatMessage {
  return {
    id: overrides.id,
    role: overrides.role,
    text: overrides.text,
    createdAt: overrides.createdAt ?? 1,
    status: overrides.status ?? 'sent',
    model: overrides.model,
    requestedModel: overrides.requestedModel,
    transportSessionId: overrides.transportSessionId,
    usage: overrides.usage,
  }
}

describe('chat panel message helpers', () => {
  it('keeps optimistic user and assistant bubbles visible while a reply is streaming', () => {
    const messages = buildRenderedChatMessages({
      baseMessages: [
        createMessage({
          id: 'assistant-1',
          role: 'assistant',
          text: '上一条回复',
        }),
      ],
      pendingUserText: '深圳天气怎么样',
      pendingAssistant: {
        sending: true,
        started: true,
        stopping: false,
        text: '深圳今天晴转多云',
        model: 'openai/gpt-5.1-codex',
      },
      now: () => 100,
    })

    expect(messages.map((message) => message.id)).toEqual([
      'assistant-1',
      '__pending-user__',
      '__pending-assistant__',
    ])
    expect(messages.at(-1)).toMatchObject({
      role: 'assistant',
      text: '深圳今天晴转多云',
      status: 'pending',
      model: 'openai/gpt-5.1-codex',
    })
  })

  it('shows an assistant preview bubble as soon as streaming starts even before any delta arrives', () => {
    const messages = buildRenderedChatMessages({
      baseMessages: [],
      pendingUserText: '你好',
      pendingAssistant: {
        sending: true,
        started: true,
        stopping: false,
        text: '',
      },
      now: () => 200,
    })

    expect(messages).toHaveLength(2)
    expect(messages[1]).toMatchObject({
      id: '__pending-assistant__',
      text: 'AI 正在思考...',
      status: 'pending',
    })
  })

  it('strips embedded timestamp prefixes from message bodies for display', () => {
    expect(resolveChatMessageDisplayText('[Sat 2026-03-28 01:05 GMT+8] 你好')).toEqual({
      body: '你好',
      embeddedTimestamp: 'Sat 2026-03-28 01:05 GMT+8',
    })
  })

  it('keeps explicit json message bodies visible in the chat surface', () => {
    expect(
      resolveChatMessageDisplayText(
        '{"command":"curl -s \\"wttr.in/Shenzhen?format=%C\\"","workdir":"/Users/test/.openclaw/workspace","yieldMs":10000,"timeout":20}'
      )
    ).toEqual({
      body: '{"command":"curl -s \\"wttr.in/Shenzhen?format=%C\\"","workdir":"/Users/test/.openclaw/workspace","yieldMs":10000,"timeout":20}',
      embeddedTimestamp: '',
    })
  })

  it('keeps the original body when an embedded timestamp prefix has no message text after it', () => {
    expect(resolveChatMessageDisplayText('[Sat 2026-03-28 01:05 GMT+8]')).toEqual({
      body: '[Sat 2026-03-28 01:05 GMT+8]',
      embeddedTimestamp: '',
    })
  })

  it('never shows the fullscreen chat loader once there are messages to render', () => {
    expect(
      shouldShowFullscreenChatLoader({
        loadingSessions: true,
        loadingTranscript: true,
        renderedMessageCount: 2,
      })
    ).toBe(false)
    expect(
      shouldShowFullscreenChatLoader({
        loadingSessions: true,
        loadingTranscript: false,
        renderedMessageCount: 0,
      })
    ).toBe(true)
  })
})
