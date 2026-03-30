export type FeishuDiagnosticActivityKind = 'workspace' | 'pairing-store' | 'none'

export interface FeishuBotDiagnosticListenRequest {
  accountId?: string
  timeoutMs?: number
  pollIntervalMs?: number
  requestId?: string
}

export interface FeishuBotDiagnosticListenResult {
  ok: boolean
  detected: boolean
  canceled?: boolean
  accountId: string
  activityKind: FeishuDiagnosticActivityKind
  summary: string
  evidencePath?: string
  startedAt: string
  endedAt: string
  timeoutMs: number
  waitedMs: number
  code: number | null
  stderr?: string
}

export interface FeishuBotDiagnosticSendRequest {
  accountId?: string
  openId: string
  recipientName?: string
  botLabel?: string
}

export interface FeishuBotDiagnosticSendResult {
  ok: boolean
  accountId: string
  openId: string
  recipientName?: string
  botLabel: string
  agentId: string
  machineLabel: string
  traceId: string
  sentAt: string
  sentText: string
  summary: string
  messageId?: string
  code: number | null
  stderr?: string
}

export interface FeishuDiagnosticMessageTextInput {
  botLabel: string
  accountId: string
  agentId: string
  machineLabel: string
  traceId: string
  sentAt: string
}
