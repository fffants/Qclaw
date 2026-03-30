import type {
  ChatStreamEvent,
  ChatSessionOrigin,
  ChatSessionSummary,
  DashboardChatHistorySummary,
  DashboardChatSessionStatus,
} from './chat-panel'
import { getChannelDisplayName, parseChatSessionSourceFromKey } from './dashboard-chat-session-source'

export type DirectChatSessionAction = 'reuse' | 'create'

function normalizeModelLabel(model: string | undefined, fallback: string): string {
  return String(model || '').trim() || fallback
}

function describeChannelSession(session: ChatSessionSummary): string {
  const source = parseChatSessionSourceFromKey(session.sessionKey)
  if (source.sourceType !== 'channel') return '渠道历史会话'
  return `${getChannelDisplayName(source.sourceChannel)} 历史会话`
}

function canContinueChannelHistorySession(session: ChatSessionSummary | null | undefined): boolean {
  if (!session) return false
  const source = parseChatSessionSourceFromKey(session.sessionKey)
  if (session.kind !== 'channel' && source.sourceType !== 'channel') return false
  return session.canContinue ?? source.sourceType === 'channel'
}

function isUpstreamConfirmedDirectShadow(session: ChatSessionSummary | null | undefined): boolean {
  if (!session) return false
  if (session.kind !== 'direct') return false
  if (parseChatSessionSourceFromKey(session.sessionKey).sourceType === 'channel') return false
  if (session.hasLocalTranscript) return false
  if (session.cachePresence !== 'local-shell') return false
  if (String(session.sessionKey || '').trim() === '') return false
  return session.authorityKind === 'upstream-direct' || session.authorityKind === 'mixed'
}

export function resolveChatSessionOrigin(session: ChatSessionSummary | null | undefined): ChatSessionOrigin {
  if (!session) return 'unknown'
  if (session.kind === 'channel') return 'channel'

  const source = parseChatSessionSourceFromKey(session.sessionKey)
  if (source.sourceType === 'channel') return 'channel'

  if (session.authorityKind === 'local-cache-only') return 'local-direct'
  if (session.authorityKind === 'upstream-direct' || session.authorityKind === 'mixed') return 'external-direct'

  if (session.kind !== 'direct') return 'unknown'
  if (session.localOnly === true || session.hasLocalTranscript === true) return 'local-direct'
  return 'external-direct'
}

function describeSessionSource(session: ChatSessionSummary | null | undefined, origin: ChatSessionOrigin): string {
  if (!session) return '未选择会话'
  if (origin === 'local-direct') {
    return session.cachePresence === 'local-shell' && !session.hasLocalTranscript
      ? 'Qclaw 本地空会话'
      : 'Qclaw 本地会话'
  }
  if (origin === 'external-direct') {
    if (isUpstreamConfirmedDirectShadow(session)) {
      return session.cachePresence === 'local-shell' ? 'OpenClaw 已确认会话' : 'OpenClaw 会话'
    }
    if (session.authorityKind === 'mixed' && session.cachePresence === 'local-transcript') {
      return 'OpenClaw 历史会话（含本地缓存）'
    }
    if (session.authorityKind === 'mixed' && session.cachePresence === 'local-shell') {
      return 'OpenClaw 会话（含本地缓存）'
    }
    return 'OpenClaw 历史会话'
  }
  if (origin === 'channel') return describeChannelSession(session)
  return '未知来源'
}

function buildSessionNotice(params: {
  defaultModel: string
  session: ChatSessionSummary | null | undefined
  origin: ChatSessionOrigin
  sessionModel: string
}): { willForkOnSend: boolean; notice: string } {
  if (!params.session) {
    return {
      willForkOnSend: false,
      notice: '',
    }
  }

  if (params.origin === 'channel') {
    const source = parseChatSessionSourceFromKey(params.session.sessionKey)
    const channelLabel = getChannelDisplayName(source.sourceChannel)
    if (canContinueChannelHistorySession(params.session)) {
      return {
        willForkOnSend: false,
        notice: `当前浏览的是${channelLabel}来源会话；发送新消息会继续写入该会话。`,
      }
    }
    return {
      willForkOnSend: true,
      notice: `当前浏览的是${channelLabel}来源的历史会话；发送新消息时会新建本地会话。`,
    }
  }

  if (params.origin === 'external-direct') {
    const canContinue = params.session.canContinue ?? Boolean(String(params.session.sessionKey || '').trim())
    if (isUpstreamConfirmedDirectShadow(params.session)) {
      return {
        willForkOnSend: !canContinue,
        notice: canContinue
          ? '当前会话已被 OpenClaw 确认创建；发送新消息会继续写入该会话。'
          : '当前会话已被 OpenClaw 确认创建，但暂时缺少可续写标识；发送新消息时会新建本地会话。',
      }
    }
    return {
      willForkOnSend: !canContinue,
      notice: canContinue
        ? '当前浏览的是 OpenClaw 历史会话；发送新消息会继续写入该会话。'
        : '当前历史会话缺少可续写标识；发送新消息时会新建本地会话。',
    }
  }

  return {
    willForkOnSend: false,
    notice: '',
  }
}

function findExistingSessionId(
  sessions: ChatSessionSummary[],
  candidateSessionId: string | undefined
): string {
  const normalizedSessionId = String(candidateSessionId || '').trim()
  if (!normalizedSessionId) return ''
  return sessions.some((session) => session.sessionId === normalizedSessionId) ? normalizedSessionId : ''
}

export function pickDefaultActiveSession(params: {
  sessions: ChatSessionSummary[]
  preferredSessionId?: string
  currentActiveSessionId?: string
}): string {
  const sessions = Array.isArray(params.sessions) ? params.sessions : []
  const preferredSessionId = findExistingSessionId(sessions, params.preferredSessionId)
  if (preferredSessionId) return preferredSessionId

  const currentActiveSessionId = findExistingSessionId(sessions, params.currentActiveSessionId)
  if (currentActiveSessionId) return currentActiveSessionId

  return sessions[0]?.sessionId || ''
}

export function resolveDirectChatSessionAction(params: { activeSessionId?: string }): DirectChatSessionAction {
  return String(params.activeSessionId || '').trim() ? 'reuse' : 'create'
}

export function resolveChatStreamSessionBinding(params: {
  trackedSessionId?: string
  incomingSessionId?: string
  eventType: ChatStreamEvent['type']
}): string {
  const trackedSessionId = String(params.trackedSessionId || '').trim()
  const incomingSessionId = String(params.incomingSessionId || '').trim()
  if (!trackedSessionId) return ''
  if (!incomingSessionId) return trackedSessionId
  if (incomingSessionId === trackedSessionId) return trackedSessionId
  if (params.eventType === 'assistant-start') return incomingSessionId
  return trackedSessionId
}

export function resolveCompletedSendSessionId(params: {
  requestedSessionId?: string
  resultSessionId?: string
}): string {
  const resultSessionId = String(params.resultSessionId || '').trim()
  if (resultSessionId) return resultSessionId
  return String(params.requestedSessionId || '').trim()
}

export function buildDashboardChatSessionStatus(params: {
  defaultModel?: string
  session?: ChatSessionSummary | null
}): DashboardChatSessionStatus {
  const session = params.session || null
  const origin = resolveChatSessionOrigin(session)
  const rawDefaultModel = String(params.defaultModel || '').trim()
  const defaultModel = rawDefaultModel || '未设置'
  const sessionModel = session ? normalizeModelLabel(session.model, '默认路由') : '未选择会话'
  const noticeState = buildSessionNotice({
    defaultModel: rawDefaultModel,
    session,
    origin,
    sessionModel,
  })

  return {
    defaultModel,
    sessionModel,
    sessionSource: describeSessionSource(session, origin),
    sessionOrigin: origin,
    authorityKind: session?.authorityKind,
    cachePresence: session?.cachePresence,
    canContinue: session?.canContinue,
    willForkOnSend: noticeState.willForkOnSend,
    notice: noticeState.notice,
  }
}

export function buildHistorySessionSummary(session: ChatSessionSummary): DashboardChatHistorySummary {
  const origin = resolveChatSessionOrigin(session)

  if (origin === 'external-direct') {
    const canContinue = session.canContinue ?? Boolean(String(session.sessionKey || '').trim())
    if (isUpstreamConfirmedDirectShadow(session)) {
      return {
        originBadge: 'OpenClaw 会话',
        secondaryBadge: canContinue ? '已确认' : '待确认',
        modelDetail: session.model ? `当前模型：${session.model}` : '',
      }
    }
    return {
      originBadge: 'OpenClaw 历史',
      secondaryBadge: canContinue ? '可续写' : '只读历史',
      modelDetail: session.model ? `历史模型：${session.model}` : '',
    }
  }

  if (origin === 'channel') {
    const source = parseChatSessionSourceFromKey(session.sessionKey)
    const channelLabel = getChannelDisplayName(source.sourceChannel)
    return {
      originBadge: `${channelLabel}会话`,
      secondaryBadge: canContinueChannelHistorySession(session) ? '可续写' : '只读历史',
      modelDetail: session.model ? `历史模型：${session.model}` : '',
    }
  }

  if (session.hasLocalTranscript && (session.authorityKind === 'local-cache-only' || session.localOnly)) {
    return {
      originBadge: '本地记录',
      secondaryBadge: '本地创建',
      modelDetail: session.model ? `最近使用：${session.model}` : '',
    }
  }

  if (session.hasLocalTranscript) {
    return {
      originBadge: '本地记录',
      modelDetail: session.model ? `最近使用：${session.model}` : '',
    }
  }

  if (session.authorityKind === 'local-cache-only' || session.localOnly) {
    return {
      originBadge: '本地创建',
      modelDetail: session.model ? `最近使用：${session.model}` : '',
    }
  }

  return {
    originBadge: '未知来源',
    modelDetail: session.model ? `历史模型：${session.model}` : '',
  }
}
