import type { ChatThinkingLevel } from '../../src/shared/chat-panel'
import { atomicWriteJson } from './atomic-write'

const fs = process.getBuiltinModule('node:fs') as typeof import('node:fs')
const os = process.getBuiltinModule('node:os') as typeof import('node:os')
const path = process.getBuiltinModule('node:path') as typeof import('node:path')
const { readFile } = fs.promises
const { homedir } = os

export interface ChatThinkingCompatEntry {
  unsupported: ChatThinkingLevel[]
  fallback: ChatThinkingLevel
  learnedAt: number
  sourceError?: string
}

type ChatThinkingCompatStore = Record<string, ChatThinkingCompatEntry>

const STORE_RELATIVE_PATH = path.join('chat', 'model-thinking-compat.json')

function resolveUserDataDirectory(): string {
  return String(process.env.QCLAW_USER_DATA_DIR || path.join(homedir(), '.qclaw-lite')).trim()
}

function resolveStorePath(): string {
  return path.join(resolveUserDataDirectory(), STORE_RELATIVE_PATH)
}

function normalizeThinkingLevel(value: unknown): ChatThinkingLevel | undefined {
  const normalized = String(value || '').trim().toLowerCase()
  if (
    normalized === 'off' ||
    normalized === 'minimal' ||
    normalized === 'low' ||
    normalized === 'medium' ||
    normalized === 'high'
  ) {
    return normalized
  }
  return undefined
}

function normalizeEntry(value: unknown): ChatThinkingCompatEntry | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const fallback = normalizeThinkingLevel(record.fallback)
  if (!fallback) return null

  const unsupported = Array.isArray(record.unsupported)
    ? Array.from(
        new Set(
          record.unsupported
            .map((item) => normalizeThinkingLevel(item))
            .filter((item): item is ChatThinkingLevel => Boolean(item))
        )
      )
    : []
  const learnedAt = Number(record.learnedAt)
  const sourceError = String(record.sourceError || '').trim()

  return {
    unsupported,
    fallback,
    learnedAt: Number.isFinite(learnedAt) ? learnedAt : Date.now(),
    sourceError: sourceError || undefined,
  }
}

async function loadStore(): Promise<ChatThinkingCompatStore> {
  try {
    const raw = await readFile(resolveStorePath(), 'utf8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const normalized: ChatThinkingCompatStore = {}
    for (const [modelKey, entry] of Object.entries(parsed || {})) {
      const nextEntry = normalizeEntry(entry)
      if (!nextEntry) continue
      normalized[String(modelKey || '').trim()] = nextEntry
    }
    return normalized
  } catch {
    return {}
  }
}

async function saveStore(store: ChatThinkingCompatStore): Promise<void> {
  const storePath = resolveStorePath()
  await atomicWriteJson(storePath, store, {
    description: '模型 thinking 兼容缓存',
  })
}

export async function readChatThinkingCompat(modelKey: string): Promise<ChatThinkingCompatEntry | undefined> {
  const normalizedModelKey = String(modelKey || '').trim()
  if (!normalizedModelKey) return undefined
  const store = await loadStore()
  return store[normalizedModelKey]
}

export async function writeChatThinkingCompat(
  modelKey: string,
  params: {
    unsupported: ChatThinkingLevel
    fallback: ChatThinkingLevel
    learnedAt?: number
    sourceError?: string
  }
): Promise<ChatThinkingCompatEntry> {
  const normalizedModelKey = String(modelKey || '').trim()
  if (!normalizedModelKey) {
    throw new Error('modelKey is required')
  }

  const store = await loadStore()
  const existing = store[normalizedModelKey]
  const unsupported = Array.from(new Set([...(existing?.unsupported || []), params.unsupported]))
  const nextEntry: ChatThinkingCompatEntry = {
    unsupported,
    fallback: params.fallback,
    learnedAt: Number.isFinite(params.learnedAt) ? Number(params.learnedAt) : Date.now(),
    sourceError: String(params.sourceError || '').trim() || undefined,
  }

  store[normalizedModelKey] = nextEntry
  await saveStore(store)
  return nextEntry
}
