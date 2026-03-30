import type { ChatMessage, ChatSessionSummary, ChatTranscript, ChatUsage } from '../../src/shared/chat-panel'
import { atomicWriteJson } from './atomic-write'

const fs = process.getBuiltinModule('node:fs') as typeof import('node:fs')
const os = process.getBuiltinModule('node:os') as typeof import('node:os')
const path = process.getBuiltinModule('node:path') as typeof import('node:path')
const { readFile } = fs.promises
const { homedir } = os

interface StoredChatSessionRecord {
  scopeKey: string
  sessionId: string
  sessionKey?: string
  upstreamConfirmed?: boolean
  agentId: string
  model?: string
  selectedModel?: string
  transportSessionId?: string
  transportModel?: string
  kind: ChatSessionSummary['kind']
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
}

interface QClawChatStore {
  version: 3
  sessions: StoredChatSessionRecord[]
}

export interface LocalChatSessionState {
  sessionId: string
  sessionKey?: string
  upstreamConfirmed?: boolean
  agentId: string
  model?: string
  selectedModel?: string
  transportSessionId?: string
  transportModel?: string
  kind: ChatSessionSummary['kind']
  updatedAt: number
  hasLocalTranscript: boolean
  messages: ChatMessage[]
}

const STORE_VERSION = 3
const STORE_RELATIVE_PATH = path.join('chat', 'transcripts.json')

function buildGatewayChatSessionKey(agentId: string, transportSessionId: string): string {
  const normalizedAgentId = String(agentId || 'main').trim().toLowerCase() || 'main'
  const normalizedSessionId = String(transportSessionId || '').trim().toLowerCase()
  if (!normalizedSessionId) return ''
  return `agent:${normalizedAgentId}:${normalizedSessionId}`
}

function reconcileLegacySelectedModel(params: {
  model?: string
  selectedModel?: string
  sessionKey?: string
  hasMessages?: boolean
}): string | undefined {
  const model = String(params.model || '').trim()
  const selectedModel = String(params.selectedModel || '').trim()
  const sessionKey = String(params.sessionKey || '').trim()
  if (!selectedModel) return undefined
  if (sessionKey) return selectedModel
  if (!params.hasMessages) return selectedModel
  return model || undefined
}

function reconcileLegacyTransportModel(params: {
  model?: string
  selectedModel?: string
  transportModel?: string
  sessionKey?: string
  hasMessages?: boolean
}): string | undefined {
  const model = String(params.model || '').trim()
  const selectedModel = String(params.selectedModel || '').trim()
  const transportModel = String(params.transportModel || '').trim()
  const sessionKey = String(params.sessionKey || '').trim()

  if (sessionKey) return transportModel || undefined
  if (!params.hasMessages) {
    return transportModel || selectedModel || model || undefined
  }
  return model || undefined
}

function migrateLegacySessionRecord(record: StoredChatSessionRecord): {
  record: StoredChatSessionRecord
  changed: boolean
} {
  let changed = false
  const transportSessionId = String(record.transportSessionId || '').trim() || undefined
  const transportDerivedSessionKey =
    transportSessionId ? buildGatewayChatSessionKey(record.agentId || 'main', transportSessionId) : ''
  const rawSessionKey = String(record.sessionKey || '').trim()
  const explicitUpstreamConfirmed = record.upstreamConfirmed === true
  const trustedSessionKey =
    rawSessionKey && (explicitUpstreamConfirmed || rawSessionKey !== transportDerivedSessionKey)
      ? rawSessionKey
      : undefined
  const upstreamConfirmed = explicitUpstreamConfirmed || trustedSessionKey ? true : undefined

  if ((rawSessionKey || undefined) !== trustedSessionKey) {
    changed = true
  }
  if ((record.upstreamConfirmed || undefined) !== upstreamConfirmed) {
    changed = true
  }

  const selectedModel = reconcileLegacySelectedModel({
    model: record.model,
    selectedModel: record.selectedModel,
    sessionKey: trustedSessionKey,
    hasMessages: record.messages.length > 0,
  })
  if ((String(record.selectedModel || '').trim() || undefined) !== selectedModel) {
    changed = true
  }

  const transportModel = reconcileLegacyTransportModel({
    model: record.model,
    selectedModel,
    transportModel: record.transportModel,
    sessionKey: trustedSessionKey,
    hasMessages: record.messages.length > 0,
  })
  if ((String(record.transportModel || '').trim() || undefined) !== transportModel) {
    changed = true
  }

  return {
    changed,
    record: {
      ...record,
      sessionKey: trustedSessionKey,
      upstreamConfirmed,
      selectedModel,
      transportSessionId,
      transportModel,
    },
  }
}

function sanitizeUsage(value: unknown): ChatUsage | undefined {
  if (!value || typeof value !== 'object') return undefined
  const usage = value as Record<string, unknown>
  const inputTokens = Number(usage.inputTokens)
  const outputTokens = Number(usage.outputTokens)
  const totalTokens = Number(usage.totalTokens)
  const reasoningTokens = Number(usage.reasoningTokens)
  const normalized: ChatUsage = {}

  if (Number.isFinite(inputTokens) && inputTokens >= 0) normalized.inputTokens = inputTokens
  if (Number.isFinite(outputTokens) && outputTokens >= 0) normalized.outputTokens = outputTokens
  if (Number.isFinite(totalTokens) && totalTokens >= 0) normalized.totalTokens = totalTokens
  if (Number.isFinite(reasoningTokens) && reasoningTokens >= 0) normalized.reasoningTokens = reasoningTokens

  return Object.keys(normalized).length > 0 ? normalized : undefined
}

function resolveUserDataDirectory(): string {
  return String(process.env.QCLAW_USER_DATA_DIR || path.join(homedir(), '.qclaw-lite')).trim()
}

function resolveStorePath(): string {
  return path.join(resolveUserDataDirectory(), STORE_RELATIVE_PATH)
}

function sanitizeMessage(value: unknown): ChatMessage | null {
  if (!value || typeof value !== 'object') return null
  const message = value as Partial<ChatMessage>
  const id = String(message.id || '').trim()
  const text = String(message.text || '').trim()
  const role = message.role === 'assistant' || message.role === 'system' ? message.role : 'user'
  if (!id || !text) return null

  return {
    id,
    role,
    text,
    createdAt: Number.isFinite(message.createdAt) ? Number(message.createdAt) : Date.now(),
    status: message.status === 'pending' || message.status === 'error' ? message.status : 'sent',
    model: String(message.model || '').trim() || undefined,
    requestedModel: String(message.requestedModel || '').trim() || undefined,
    transportSessionId: String(message.transportSessionId || '').trim() || undefined,
    usage: sanitizeUsage(message.usage),
  }
}

function sanitizeSession(value: unknown): StoredChatSessionRecord | null {
  if (!value || typeof value !== 'object') return null
  const session = value as Partial<StoredChatSessionRecord>
  const scopeKey = String(session.scopeKey || '').trim()
  const sessionId = String(session.sessionId || '').trim()
  if (!scopeKey || !sessionId) return null

  return {
    scopeKey,
    sessionId,
    sessionKey: String((session as Partial<StoredChatSessionRecord>).sessionKey || '').trim() || undefined,
    upstreamConfirmed:
      typeof (session as Partial<StoredChatSessionRecord>).upstreamConfirmed === 'boolean'
        ? (session as Partial<StoredChatSessionRecord>).upstreamConfirmed
        : undefined,
    agentId: String(session.agentId || 'main').trim() || 'main',
    model: String(session.model || '').trim() || undefined,
    selectedModel: String(session.selectedModel || '').trim() || undefined,
    transportSessionId:
      String((session as Partial<StoredChatSessionRecord>).transportSessionId || '').trim() || undefined,
    transportModel:
      String((session as Partial<StoredChatSessionRecord>).transportModel || session.model || '').trim() || undefined,
    kind: session.kind === 'channel' || session.kind === 'unknown' ? session.kind : 'direct',
    createdAt: Number.isFinite(session.createdAt) ? Number(session.createdAt) : Date.now(),
    updatedAt: Number.isFinite(session.updatedAt) ? Number(session.updatedAt) : Date.now(),
    messages: Array.isArray(session.messages)
      ? session.messages
          .map(sanitizeMessage)
          .filter((message): message is ChatMessage => Boolean(message))
      : [],
  }
}

async function loadStore(): Promise<QClawChatStore> {
  try {
    const raw = await readFile(resolveStorePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<QClawChatStore> & { version?: number }
    const sanitizedSessions = Array.isArray(parsed.sessions)
      ? parsed.sessions
          .map(sanitizeSession)
          .filter((session): session is StoredChatSessionRecord => Boolean(session))
      : []
    let changed = Number(parsed.version) !== STORE_VERSION
    const migratedSessions = sanitizedSessions.map((session) => {
      const migrated = migrateLegacySessionRecord(session)
      changed = changed || migrated.changed
      return migrated.record
    })
    const migratedStore: QClawChatStore = {
      version: STORE_VERSION,
      sessions: migratedSessions,
    }
    if (changed) {
      await saveStore(migratedStore)
    }
    return migratedStore
  } catch {
    return {
      version: STORE_VERSION,
      sessions: [],
    }
  }
}

async function saveStore(store: QClawChatStore): Promise<void> {
  const storePath = resolveStorePath()
  await atomicWriteJson(storePath, store, {
    description: '聊天 transcript 缓存',
  })
}

function toTranscript(record: StoredChatSessionRecord | null | undefined): ChatTranscript | null {
  if (!record) return null
  return {
    sessionId: record.sessionId,
    sessionKey: record.sessionKey,
    upstreamConfirmed: record.upstreamConfirmed,
    agentId: record.agentId,
    model: record.model,
    selectedModel: record.selectedModel,
    updatedAt: record.updatedAt,
    hasLocalTranscript: record.messages.length > 0,
    messages: [...record.messages].sort((left, right) => left.createdAt - right.createdAt),
  }
}

function toSummary(record: StoredChatSessionRecord): ChatSessionSummary {
  return {
    sessionId: record.sessionId,
    sessionKey: record.sessionKey,
    upstreamConfirmed: record.upstreamConfirmed,
    agentId: record.agentId,
    model: record.model,
    selectedModel: record.selectedModel,
    updatedAt: record.updatedAt,
    kind: record.kind,
    hasLocalTranscript: record.messages.length > 0,
    localOnly: true,
  }
}

function toLocalSessionState(record: StoredChatSessionRecord | null | undefined): LocalChatSessionState | null {
  if (!record) return null
  return {
    sessionId: record.sessionId,
    sessionKey: record.sessionKey,
    upstreamConfirmed: record.upstreamConfirmed,
    agentId: record.agentId,
    model: record.model,
    selectedModel: record.selectedModel,
    transportSessionId: record.transportSessionId,
    transportModel: record.transportModel,
    kind: record.kind,
    updatedAt: record.updatedAt,
    hasLocalTranscript: record.messages.length > 0,
    messages: [...record.messages].sort((left, right) => left.createdAt - right.createdAt),
  }
}

function findSessionIndex(
  sessions: StoredChatSessionRecord[],
  scopeKey: string,
  sessionId: string
): number {
  return sessions.findIndex((session) => session.scopeKey === scopeKey && session.sessionId === sessionId)
}

export async function listLocalChatSessions(scopeKey: string): Promise<ChatSessionSummary[]> {
  const normalizedScopeKey = String(scopeKey || '').trim()
  if (!normalizedScopeKey) return []
  const store = await loadStore()
  return store.sessions
    .filter((session) => session.scopeKey === normalizedScopeKey)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .map(toSummary)
}

export async function listLocalChatSessionStates(scopeKey: string): Promise<LocalChatSessionState[]> {
  const normalizedScopeKey = String(scopeKey || '').trim()
  if (!normalizedScopeKey) return []
  const store = await loadStore()
  return store.sessions
    .filter((session) => session.scopeKey === normalizedScopeKey)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .map(toLocalSessionState)
    .filter((session): session is LocalChatSessionState => Boolean(session))
}

export async function readLocalChatTranscript(scopeKey: string, sessionId: string): Promise<ChatTranscript | null> {
  const normalizedScopeKey = String(scopeKey || '').trim()
  const normalizedSessionId = String(sessionId || '').trim()
  if (!normalizedScopeKey || !normalizedSessionId) return null

  const store = await loadStore()
  const record = store.sessions.find(
    (session) => session.scopeKey === normalizedScopeKey && session.sessionId === normalizedSessionId
  )
  return toTranscript(record)
}

export async function readLocalChatSessionState(
  scopeKey: string,
  sessionId: string
): Promise<LocalChatSessionState | null> {
  const normalizedScopeKey = String(scopeKey || '').trim()
  const normalizedSessionId = String(sessionId || '').trim()
  if (!normalizedScopeKey || !normalizedSessionId) return null

  const store = await loadStore()
  const record = store.sessions.find(
    (session) => session.scopeKey === normalizedScopeKey && session.sessionId === normalizedSessionId
  )
  return toLocalSessionState(record)
}

export async function ensureLocalChatSession(params: {
  scopeKey: string
  sessionId: string
  sessionKey?: string
  upstreamConfirmed?: boolean
  agentId?: string
  model?: string
  selectedModel?: string
  transportSessionId?: string
  transportModel?: string
  kind?: ChatSessionSummary['kind']
  updatedAt?: number
}): Promise<ChatTranscript> {
  const scopeKey = String(params.scopeKey || '').trim()
  const sessionId = String(params.sessionId || '').trim()
  if (!scopeKey || !sessionId) {
    throw new Error('Chat session scopeKey and sessionId are required')
  }

  const store = await loadStore()
  const now = Number.isFinite(params.updatedAt) ? Number(params.updatedAt) : Date.now()
  const index = findSessionIndex(store.sessions, scopeKey, sessionId)
  const requestedTrustedSessionKey = String(params.sessionKey || '').trim() || undefined
  const requestedTransportSessionId = String(params.transportSessionId || '').trim() || undefined
  const resolvedUpstreamConfirmed =
    typeof params.upstreamConfirmed === 'boolean'
      ? params.upstreamConfirmed
      : index >= 0
        ? store.sessions[index].upstreamConfirmed
        : requestedTrustedSessionKey
          ? !requestedTransportSessionId ||
            requestedTrustedSessionKey !==
              buildGatewayChatSessionKey(String(params.agentId || 'main').trim() || 'main', requestedTransportSessionId)
          : undefined
  const nextRecord: StoredChatSessionRecord =
    index >= 0
      ? {
          ...store.sessions[index],
          sessionKey:
            String(params.sessionKey || store.sessions[index].sessionKey || '').trim() || undefined,
          upstreamConfirmed: resolvedUpstreamConfirmed,
          agentId: String(params.agentId || store.sessions[index].agentId || 'main').trim() || 'main',
          model: String(params.model || store.sessions[index].model || '').trim() || undefined,
          selectedModel:
            String(params.selectedModel || store.sessions[index].selectedModel || '').trim() || undefined,
          transportSessionId:
            requestedTransportSessionId ||
            store.sessions[index].transportSessionId ||
            (requestedTrustedSessionKey || store.sessions[index].sessionKey ? undefined : sessionId),
          transportModel:
            String(params.transportModel || store.sessions[index].transportModel || params.model || '').trim() ||
            undefined,
          kind: params.kind || store.sessions[index].kind || 'direct',
          updatedAt: Math.max(store.sessions[index].updatedAt, now),
        }
      : {
          scopeKey,
          sessionId,
          sessionKey: requestedTrustedSessionKey,
          upstreamConfirmed: resolvedUpstreamConfirmed,
          agentId: String(params.agentId || 'main').trim() || 'main',
          model: String(params.model || '').trim() || undefined,
          selectedModel: String(params.selectedModel || '').trim() || undefined,
          transportSessionId: requestedTransportSessionId || (requestedTrustedSessionKey ? undefined : sessionId),
          transportModel: String(params.transportModel || params.model || '').trim() || undefined,
          kind: params.kind || 'direct',
          createdAt: now,
          updatedAt: now,
          messages: [],
        }

  if (index >= 0) {
    store.sessions[index] = nextRecord
  } else {
    store.sessions.push(nextRecord)
  }
  await saveStore(store)
  return toTranscript(nextRecord) as ChatTranscript
}

export async function appendLocalChatMessages(params: {
  scopeKey: string
  sessionId: string
  sessionKey?: string
  upstreamConfirmed?: boolean
  agentId?: string
  model?: string
  selectedModel?: string
  transportSessionId?: string
  transportModel?: string
  kind?: ChatSessionSummary['kind']
  messages: ChatMessage[]
  updatedAt?: number
}): Promise<ChatTranscript> {
  const scopeKey = String(params.scopeKey || '').trim()
  const sessionId = String(params.sessionId || '').trim()
  const nextMessages = params.messages
    .map(sanitizeMessage)
    .filter((message): message is ChatMessage => Boolean(message))
  if (!scopeKey || !sessionId || nextMessages.length === 0) {
    throw new Error('Appending chat messages requires scopeKey, sessionId, and at least one message')
  }

  const store = await loadStore()
  const now = Number.isFinite(params.updatedAt)
    ? Number(params.updatedAt)
    : Math.max(...nextMessages.map((message) => message.createdAt), Date.now())
  const index = findSessionIndex(store.sessions, scopeKey, sessionId)
  const requestedTrustedSessionKey = String(params.sessionKey || '').trim() || undefined
  const requestedTransportSessionId = String(params.transportSessionId || '').trim() || undefined
  const existing =
    index >= 0
      ? store.sessions[index]
      : {
          scopeKey,
          sessionId,
          sessionKey: requestedTrustedSessionKey,
          upstreamConfirmed:
            typeof params.upstreamConfirmed === 'boolean'
              ? params.upstreamConfirmed
              : requestedTrustedSessionKey
                ? !requestedTransportSessionId ||
                  requestedTrustedSessionKey !==
                    buildGatewayChatSessionKey(
                      String(params.agentId || 'main').trim() || 'main',
                      requestedTransportSessionId
                    )
                : undefined,
          agentId: String(params.agentId || 'main').trim() || 'main',
          model: String(params.model || '').trim() || undefined,
          selectedModel: String(params.selectedModel || '').trim() || undefined,
          transportSessionId:
            requestedTransportSessionId ||
            (requestedTrustedSessionKey && params.upstreamConfirmed === true ? undefined : sessionId),
          transportModel: String(params.transportModel || params.model || '').trim() || undefined,
          kind: params.kind || 'direct',
          createdAt: now,
          updatedAt: now,
          messages: [],
        }

  const mergedMessages = [...existing.messages]
  for (const message of nextMessages) {
    if (mergedMessages.some((item) => item.id === message.id)) continue
    mergedMessages.push(message)
  }

  const nextRecord: StoredChatSessionRecord = {
    ...existing,
    sessionKey: requestedTrustedSessionKey || existing.sessionKey,
    upstreamConfirmed:
      typeof params.upstreamConfirmed === 'boolean'
        ? params.upstreamConfirmed
        : existing.upstreamConfirmed,
    agentId: String(params.agentId || existing.agentId || 'main').trim() || 'main',
    model: String(params.model || existing.model || '').trim() || undefined,
    selectedModel: String(params.selectedModel || existing.selectedModel || '').trim() || undefined,
    transportSessionId:
      requestedTransportSessionId ||
      existing.transportSessionId ||
      (requestedTrustedSessionKey && (params.upstreamConfirmed === true || existing.upstreamConfirmed === true)
        ? undefined
        : sessionId),
    transportModel:
      String(params.transportModel || existing.transportModel || params.model || '').trim() || undefined,
    kind: params.kind || existing.kind || 'direct',
    updatedAt: Math.max(existing.updatedAt, now),
    messages: mergedMessages.sort((left, right) => left.createdAt - right.createdAt),
  }

  if (index >= 0) {
    store.sessions[index] = nextRecord
  } else {
    store.sessions.push(nextRecord)
  }
  await saveStore(store)
  return toTranscript(nextRecord) as ChatTranscript
}

export async function clearLocalChatTranscript(scopeKey: string, sessionId: string): Promise<boolean> {
  const normalizedScopeKey = String(scopeKey || '').trim()
  const normalizedSessionId = String(sessionId || '').trim()
  if (!normalizedScopeKey || !normalizedSessionId) return false

  const store = await loadStore()
  const index = findSessionIndex(store.sessions, normalizedScopeKey, normalizedSessionId)
  if (index < 0) return false

  store.sessions[index] = {
    ...store.sessions[index],
    messages: [],
    updatedAt: Date.now(),
  }
  await saveStore(store)
  return true
}
