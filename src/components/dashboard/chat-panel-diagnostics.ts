import type {
  ChatCapabilitySnapshot,
  ChatSessionDebugSnapshot,
  ChatTraceEntry,
} from '../../shared/chat-panel'

export interface ChatCapabilityIndicator {
  label: string
  value: string
  active: boolean
  tone: 'teal' | 'gray'
}

export interface ChatDiagnosticFieldRow {
  label: string
  value: string
}

function toBooleanLabel(value: boolean, truthy: string, falsy: string): string {
  return value ? truthy : falsy
}

export function buildChatCapabilityIndicators(
  snapshot: ChatCapabilitySnapshot | null | undefined
): ChatCapabilityIndicator[] {
  if (!snapshot) {
    return [
      {
        label: 'Capability',
        value: '未读取',
        active: false,
        tone: 'gray',
      },
    ]
  }

  return [
    {
      label: 'sessions.patch',
      value: toBooleanLabel(snapshot.supportsSessionsPatch, '可用', '不可用'),
      active: snapshot.supportsSessionsPatch,
      tone: snapshot.supportsSessionsPatch ? 'teal' : 'gray',
    },
    {
      label: 'chat.history',
      value: toBooleanLabel(snapshot.supportsChatHistory, '主链已启用', '仍在保守回退'),
      active: snapshot.supportsChatHistory,
      tone: snapshot.supportsChatHistory ? 'teal' : 'gray',
    },
    {
      label: 'gateway chat.send',
      value: toBooleanLabel(snapshot.supportsGatewayChatSend, '可用', '不可用'),
      active: snapshot.supportsGatewayChatSend,
      tone: snapshot.supportsGatewayChatSend ? 'teal' : 'gray',
    },
    {
      label: 'gateway rpc',
      value: toBooleanLabel(snapshot.supportsGatewayRpc, '可用', '不可用'),
      active: snapshot.supportsGatewayRpc,
      tone: snapshot.supportsGatewayRpc ? 'teal' : 'gray',
    },
  ]
}

export function buildChatDebugFieldRows(
  snapshot: ChatSessionDebugSnapshot | null | undefined
): ChatDiagnosticFieldRow[] {
  if (!snapshot) return []

  return [
    { label: '会话 ID', value: snapshot.resolvedSessionId || '未解析' },
    { label: '会话 Key', value: snapshot.resolvedSessionKey || '无可信 sessionKey' },
    { label: '历史来源', value: snapshot.historySource },
    { label: 'Authority', value: snapshot.authorityKind },
    { label: '本地缓存', value: snapshot.cachePresence },
    { label: '续写能力', value: toBooleanLabel(snapshot.canContinue, '可续写', '不可续写') },
    { label: '切模能力', value: toBooleanLabel(snapshot.canPatchModel, '可原地切模', '不可原地切模') },
    { label: '失败分类', value: snapshot.failureClass },
    { label: '确认模型', value: snapshot.confirmedModel || '未确认' },
    { label: '意图模型', value: snapshot.intentSelectedModel || '无' },
    {
      label: 'Legacy 语义',
      value: toBooleanLabel(snapshot.legacySemanticsActive, '仍在启用 legacy fallback', '已脱离 legacy fallback'),
    },
  ]
}

export function formatChatTraceEntryLabel(entry: ChatTraceEntry): string {
  return `${entry.operation}.${entry.stage}`
}

export function formatChatTraceEntryMeta(entry: ChatTraceEntry): string {
  const parts = [
    entry.sessionId ? `session=${entry.sessionId}` : '',
    entry.historySource ? `history=${entry.historySource}` : '',
    entry.failureClass && entry.failureClass !== 'none' ? `failure=${entry.failureClass}` : '',
    entry.confirmedModel ? `model=${entry.confirmedModel}` : '',
  ].filter(Boolean)
  return parts.join(' · ')
}
