import { describe, expect, it } from 'vitest'
import {
  buildChatCapabilityIndicators,
  buildChatDebugFieldRows,
  formatChatTraceEntryLabel,
  formatChatTraceEntryMeta,
} from './chat-panel-diagnostics'

describe('chat panel diagnostics helper', () => {
  it('builds stable capability indicators from a capability snapshot', () => {
    expect(
      buildChatCapabilityIndicators({
        version: 'OpenClaw 2026.3.23',
        supportsSessionsPatch: true,
        supportsChatHistory: false,
        supportsGatewayChatSend: true,
        supportsGatewayRpc: true,
        notes: [],
      })
    ).toEqual([
      { label: 'sessions.patch', value: '可用', active: true, tone: 'teal' },
      { label: 'chat.history', value: '仍在保守回退', active: false, tone: 'gray' },
      { label: 'gateway chat.send', value: '可用', active: true, tone: 'teal' },
      { label: 'gateway rpc', value: '可用', active: true, tone: 'teal' },
    ])
  })

  it('builds debug rows from a unified debug snapshot', () => {
    expect(
      buildChatDebugFieldRows({
        requestedSessionId: 'requested-1',
        trackedSessionId: 'tracked-1',
        resolvedSessionId: 'resolved-1',
        resolvedSessionKey: 'agent:main:resolved-1',
        historySource: 'sessions-get',
        confirmedModel: 'openai/gpt-5.4-pro',
        intentSelectedModel: 'openai/gpt-5.4-pro',
        canPatchModel: true,
        canContinue: true,
        authorityKind: 'mixed',
        cachePresence: 'local-transcript',
        failureClass: 'none',
        legacySemanticsActive: false,
        updatedAt: 123,
        fieldStates: {},
        notes: [],
      })
    ).toEqual([
      { label: '会话 ID', value: 'resolved-1' },
      { label: '会话 Key', value: 'agent:main:resolved-1' },
      { label: '历史来源', value: 'sessions-get' },
      { label: 'Authority', value: 'mixed' },
      { label: '本地缓存', value: 'local-transcript' },
      { label: '续写能力', value: '可续写' },
      { label: '切模能力', value: '可原地切模' },
      { label: '失败分类', value: 'none' },
      { label: '确认模型', value: 'openai/gpt-5.4-pro' },
      { label: '意图模型', value: 'openai/gpt-5.4-pro' },
      { label: 'Legacy 语义', value: '已脱离 legacy fallback' },
    ])
  })

  it('formats recent trace labels and metadata for compact display', () => {
    expect(
      formatChatTraceEntryLabel({
        id: 'trace-1',
        operation: 'transcript',
        stage: 'return-local-cache',
        sessionId: 'session-1',
        historySource: 'local-cache',
        confirmedModel: 'openai/gpt-5.4-pro',
        createdAt: 1,
      })
    ).toBe('transcript.return-local-cache')

    expect(
      formatChatTraceEntryMeta({
        id: 'trace-1',
        operation: 'send',
        stage: 'gateway-unavailable',
        sessionId: 'session-1',
        historySource: 'local-cache',
        failureClass: 'connection',
        confirmedModel: 'openai/gpt-5.4-pro',
        createdAt: 1,
      })
    ).toBe('session=session-1 · history=local-cache · failure=connection · model=openai/gpt-5.4-pro')
  })
})
