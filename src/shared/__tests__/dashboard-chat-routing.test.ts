import { describe, expect, it } from 'vitest'
import type { ChatSessionSummary } from '../chat-panel'
import {
  buildDashboardChatSessionStatus,
  buildHistorySessionSummary,
  pickDefaultActiveSession,
  resolveChatStreamSessionBinding,
  resolveCompletedSendSessionId,
  resolveDirectChatSessionAction,
} from '../dashboard-chat-routing'

function createSession(overrides: Partial<ChatSessionSummary> & Pick<ChatSessionSummary, 'sessionId'>): ChatSessionSummary {
  return {
    sessionId: overrides.sessionId,
    sessionKey: overrides.sessionKey,
    agentId: overrides.agentId || 'main',
    model: overrides.model,
    selectedModel: overrides.selectedModel,
    canPatchModel: overrides.canPatchModel,
    canContinue: overrides.canContinue,
    authorityKind: overrides.authorityKind,
    cachePresence: overrides.cachePresence,
    legacySemanticsActive: overrides.legacySemanticsActive,
    modelSwitchBlockedReason: overrides.modelSwitchBlockedReason,
    updatedAt: overrides.updatedAt ?? 0,
    kind: overrides.kind || 'direct',
    hasLocalTranscript: overrides.hasLocalTranscript ?? false,
    totalTokens: overrides.totalTokens,
    contextTokens: overrides.contextTokens,
    localOnly: overrides.localOnly,
  }
}

describe('dashboard chat routing', () => {
  it('prefers the most recently updated session by default', () => {
    const selected = pickDefaultActiveSession({
      sessions: [
        createSession({
          sessionId: 'external-newer',
          updatedAt: 200,
          kind: 'direct',
          hasLocalTranscript: false,
          localOnly: false,
        }),
        createSession({
          sessionId: 'local-older',
          updatedAt: 100,
          kind: 'direct',
          hasLocalTranscript: true,
          localOnly: false,
        }),
      ],
    })

    expect(selected).toBe('external-newer')
  })

  it('returns the newest available session when no local direct session exists', () => {
    const selected = pickDefaultActiveSession({
      sessions: [
        createSession({
          sessionId: 'external-only',
          updatedAt: 200,
          kind: 'direct',
          hasLocalTranscript: false,
          localOnly: false,
        }),
      ],
    })

    expect(selected).toBe('external-only')
    expect(resolveDirectChatSessionAction({ activeSessionId: selected })).toBe('reuse')
  })

  it('keeps a preferred session when it still exists', () => {
    const selected = pickDefaultActiveSession({
      preferredSessionId: 'external-picked',
      sessions: [
        createSession({
          sessionId: 'local-default',
          updatedAt: 100,
          kind: 'direct',
          hasLocalTranscript: true,
          localOnly: true,
        }),
        createSession({
          sessionId: 'external-picked',
          updatedAt: 200,
          kind: 'direct',
          hasLocalTranscript: false,
          localOnly: false,
        }),
      ],
    })

    expect(selected).toBe('external-picked')
  })

  it('reuses the active session when one is already selected', () => {
    expect(resolveDirectChatSessionAction({ activeSessionId: 'session-1' })).toBe('reuse')
  })

  it('creates a new session when no active session is selected', () => {
    expect(resolveDirectChatSessionAction({ activeSessionId: '' })).toBe('create')
  })

  it('describes a patchable OpenClaw history session as writable in place', () => {
    const status = buildDashboardChatSessionStatus({
      defaultModel: 'openai/gpt-5.4-pro',
      session: createSession({
        sessionId: 'external-history',
        sessionKey: 'agent:main:history-direct-session',
        model: 'custom-open-bigmodel-cn/glm-5',
        canContinue: true,
        authorityKind: 'upstream-direct',
        cachePresence: 'none',
        kind: 'direct',
        hasLocalTranscript: false,
        localOnly: false,
      }),
    })

    expect(status.sessionSource).toBe('OpenClaw 历史会话')
    expect(status.sessionModel).toBe('custom-open-bigmodel-cn/glm-5')
    expect(status.willForkOnSend).toBe(false)
    expect(status.notice).toBe('当前浏览的是 OpenClaw 历史会话；发送新消息会继续写入该会话。')
  })

  it('keeps external direct history in fork mode when the session lacks a continuation key', () => {
    const status = buildDashboardChatSessionStatus({
      defaultModel: 'openai/gpt-5.4-pro',
      session: createSession({
        sessionId: 'external-history-missing-key',
        model: 'custom-open-bigmodel-cn/glm-5',
        canContinue: false,
        authorityKind: 'upstream-direct',
        cachePresence: 'none',
        kind: 'direct',
        hasLocalTranscript: false,
        localOnly: false,
      }),
    })

    expect(status.sessionSource).toBe('OpenClaw 历史会话')
    expect(status.willForkOnSend).toBe(true)
    expect(status.notice).toBe('当前历史会话缺少可续写标识；发送新消息时会新建本地会话。')
  })

  it('recognizes feishu direct session key as a channel session and allows continuing in-place', () => {
    const status = buildDashboardChatSessionStatus({
      defaultModel: 'openai/gpt-5.4-pro',
      session: createSession({
        sessionId: 'feishu-history',
        sessionKey: 'agent:feishu-default:feishu:default:direct:ou_11ec143ee4079fad7afe9c5fa042404f',
        model: 'openai/gpt-5.1-codex',
        canContinue: true,
        authorityKind: 'upstream-channel',
        cachePresence: 'none',
        kind: 'direct',
        hasLocalTranscript: false,
        localOnly: false,
      }),
    })

    expect(status.sessionSource).toBe('飞书 历史会话')
    expect(status.willForkOnSend).toBe(false)
    expect(status.notice).toBe('当前浏览的是飞书来源会话；发送新消息会继续写入该会话。')
  })

  it('does not warn about model mismatch for local direct sessions', () => {
    const status = buildDashboardChatSessionStatus({
      defaultModel: 'openai/gpt-5.4-pro',
      session: createSession({
        sessionId: 'local-thread',
        model: 'openai/gpt-5.1-codex',
        canContinue: true,
        authorityKind: 'local-cache-only',
        cachePresence: 'local-transcript',
        kind: 'direct',
        hasLocalTranscript: true,
        localOnly: false,
      }),
    })

    expect(status.sessionSource).toBe('Qclaw 本地会话')
    expect(status.notice).toBe('')
  })

  it('keeps mixed upstream sessions labeled as OpenClaw history instead of local-only sessions', () => {
    const status = buildDashboardChatSessionStatus({
      defaultModel: 'openai/gpt-5.4-pro',
      session: createSession({
        sessionId: 'mixed-history',
        sessionKey: 'agent:main:history-direct-session',
        model: 'openai/gpt-5.1-codex',
        canContinue: true,
        authorityKind: 'mixed',
        cachePresence: 'local-transcript',
        kind: 'direct',
        hasLocalTranscript: true,
        localOnly: false,
      }),
    })

    expect(status.sessionOrigin).toBe('external-direct')
    expect(status.sessionSource).toBe('OpenClaw 历史会话（含本地缓存）')
    expect(status.willForkOnSend).toBe(false)
  })

  it('describes an upstream-confirmed local shadow as an OpenClaw confirmed session instead of a local shell', () => {
    const status = buildDashboardChatSessionStatus({
      defaultModel: 'openai/gpt-5.4-pro',
      session: createSession({
        sessionId: 'created-shadow',
        sessionKey: 'agent:main:created-shadow',
        model: 'openai/gpt-5.1-codex',
        canContinue: true,
        authorityKind: 'upstream-direct',
        cachePresence: 'local-shell',
        kind: 'direct',
        hasLocalTranscript: false,
        localOnly: false,
      }),
    })

    expect(status.sessionOrigin).toBe('external-direct')
    expect(status.sessionSource).toBe('OpenClaw 已确认会话')
    expect(status.willForkOnSend).toBe(false)
    expect(status.notice).toBe('当前会话已被 OpenClaw 确认创建；发送新消息会继续写入该会话。')
  })

  it('does not label an upstream-confirmed local shadow as local history in the sidebar summary', () => {
    const summary = buildHistorySessionSummary(
      createSession({
        sessionId: 'created-shadow',
        sessionKey: 'agent:main:created-shadow',
        model: 'openai/gpt-5.1-codex',
        canContinue: true,
        authorityKind: 'upstream-direct',
        cachePresence: 'local-shell',
        kind: 'direct',
        hasLocalTranscript: false,
        localOnly: false,
      })
    )

    expect(summary.originBadge).toBe('OpenClaw 会话')
    expect(summary.secondaryBadge).toBe('已确认')
    expect(summary.modelDetail).toBe('当前模型：openai/gpt-5.1-codex')
  })

  it('marks feishu channel sessions in history with a writable badge', () => {
    const summary = buildHistorySessionSummary(
      createSession({
        sessionId: 'feishu-history',
        sessionKey: 'agent:feishu-default:feishu:default:direct:ou_11ec143ee4079fad7afe9c5fa042404f',
        model: 'custom-open-bigmodel-cn/glm-5',
        canContinue: true,
        authorityKind: 'upstream-channel',
        cachePresence: 'none',
        kind: 'direct',
        hasLocalTranscript: false,
        localOnly: false,
      })
    )

    expect(summary.originBadge).toBe('飞书会话')
    expect(summary.secondaryBadge).toBe('可续写')
    expect(summary.modelDetail).toBe('历史模型：custom-open-bigmodel-cn/glm-5')
  })

  it('marks external direct history as writable only when a continuation key exists', () => {
    const writable = buildHistorySessionSummary(
      createSession({
        sessionId: 'external-writable',
        sessionKey: 'agent:main:history-direct-session',
        model: 'openai/gpt-5.4-pro',
        canContinue: true,
        authorityKind: 'upstream-direct',
        cachePresence: 'none',
        kind: 'direct',
        hasLocalTranscript: false,
        localOnly: false,
      })
    )
    const readonly = buildHistorySessionSummary(
      createSession({
        sessionId: 'external-readonly',
        model: 'openai/gpt-5.4-pro',
        canContinue: false,
        authorityKind: 'upstream-direct',
        cachePresence: 'none',
        kind: 'direct',
        hasLocalTranscript: false,
        localOnly: false,
      })
    )

    expect(writable.secondaryBadge).toBe('可续写')
    expect(readonly.secondaryBadge).toBe('只读历史')
  })

  it('describes local history using the last used model wording', () => {
    const summary = buildHistorySessionSummary(
      createSession({
        sessionId: 'local-history',
        model: 'openai/gpt-5.4-pro',
        canContinue: true,
        authorityKind: 'local-cache-only',
        cachePresence: 'local-transcript',
        kind: 'direct',
        hasLocalTranscript: true,
        localOnly: true,
      })
    )

    expect(summary.modelDetail).toBe('最近使用：openai/gpt-5.4-pro')
  })

  it('adopts the actual forked session id on assistant-start so the UI follows the real send target', () => {
    const nextTrackedSessionId = resolveChatStreamSessionBinding({
      trackedSessionId: 'external-history',
      incomingSessionId: 'forked-local',
      eventType: 'assistant-start',
    })

    expect(nextTrackedSessionId).toBe('forked-local')
  })

  it('keeps the current tracked session when an unrelated delta arrives', () => {
    const nextTrackedSessionId = resolveChatStreamSessionBinding({
      trackedSessionId: 'forked-local',
      incomingSessionId: 'other-session',
      eventType: 'assistant-delta',
    })

    expect(nextTrackedSessionId).toBe('forked-local')
  })

  it('refreshes transcript and session list with the result session id after a forked send', () => {
    const resolvedSessionId = resolveCompletedSendSessionId({
      requestedSessionId: 'external-history',
      resultSessionId: 'forked-local',
    })

    expect(resolvedSessionId).toBe('forked-local')
  })
})
