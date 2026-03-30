import { atomicWriteJson } from './atomic-write'
import {
  buildAutomaticVerifiedAvailableRecords,
  normalizeModelVerificationRecord,
  sortModelVerificationRecords,
  upsertModelVerificationRecord,
  type ModelVerificationSnapshot,
  type PersistedModelVerificationState,
} from '../../src/shared/model-verification-state'

const fs = process.getBuiltinModule('node:fs') as typeof import('node:fs')
const os = process.getBuiltinModule('node:os') as typeof import('node:os')
const path = process.getBuiltinModule('node:path') as typeof import('node:path')

const { readFile } = fs.promises
const { homedir } = os

const STORE_VERSION = 1
const STORE_RELATIVE_PATH = path.join('models', 'verification-state.json')

function resolveUserDataDirectory(): string {
  return String(process.env.QCLAW_USER_DATA_DIR || path.join(homedir(), '.qclaw-lite')).trim()
}

function resolveStorePath(): string {
  return path.join(resolveUserDataDirectory(), STORE_RELATIVE_PATH)
}

async function loadStore(): Promise<ModelVerificationSnapshot> {
  try {
    const raw = await readFile(resolveStorePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<ModelVerificationSnapshot>
    const records = Array.isArray(parsed.records)
      ? parsed.records
          .map((record) => normalizeModelVerificationRecord(record))
          .filter((record): record is NonNullable<typeof record> => Boolean(record))
      : []

    return {
      version: STORE_VERSION,
      records: sortModelVerificationRecords(records),
    }
  } catch {
    return {
      version: STORE_VERSION,
      records: [],
    }
  }
}

async function saveStore(store: ModelVerificationSnapshot): Promise<void> {
  await atomicWriteJson(resolveStorePath(), store, {
    description: '模型验证状态缓存',
  })
}

export async function getModelVerificationState(): Promise<ModelVerificationSnapshot> {
  return loadStore()
}

export async function syncModelVerificationState(input?: {
  statusData?: Record<string, any> | null
}): Promise<ModelVerificationSnapshot> {
  const store = await loadStore()
  const now = new Date().toISOString()
  const automaticRecords = buildAutomaticVerifiedAvailableRecords(input?.statusData || null, now)

  let nextRecords = store.records
  let changed = false
  for (const record of automaticRecords) {
    const result = upsertModelVerificationRecord(nextRecords, record)
    nextRecords = result.records
    changed = changed || result.changed
  }

  if (!changed) {
    return {
      version: STORE_VERSION,
      records: nextRecords,
    }
  }

  const nextStore: ModelVerificationSnapshot = {
    version: STORE_VERSION,
    records: nextRecords,
  }
  await saveStore(nextStore)
  return nextStore
}

export async function recordModelVerification(input: {
  modelKey: string
  verificationState: PersistedModelVerificationState
}): Promise<ModelVerificationSnapshot> {
  const store = await loadStore()
  const result = upsertModelVerificationRecord(store.records, {
    modelKey: input.modelKey,
    verificationState: input.verificationState,
    source: input.verificationState === 'verified-available' ? 'switch-success' : 'switch-failed',
    updatedAt: new Date().toISOString(),
  })

  const nextStore: ModelVerificationSnapshot = {
    version: STORE_VERSION,
    records: result.records,
  }

  if (result.changed) {
    await saveStore(nextStore)
  }

  return nextStore
}
