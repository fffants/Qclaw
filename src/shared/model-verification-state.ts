import { toRuntimeModelEquivalenceKey } from '../lib/model-runtime-resolution'

export type PersistedModelVerificationState = 'verified-available' | 'verified-unavailable'
export type ModelVerificationSource = 'runtime-auto' | 'switch-success' | 'switch-failed'

export interface ModelVerificationRecord {
  runtimeKey: string
  modelKey: string
  verificationState: PersistedModelVerificationState
  source: ModelVerificationSource
  updatedAt: string
}

export interface ModelVerificationSnapshot {
  version: number
  records: ModelVerificationRecord[]
}

export function normalizePersistedModelVerificationState(
  value: unknown
): PersistedModelVerificationState | null {
  const normalized = String(value || '').trim()
  if (normalized === 'verified-available' || normalized === 'verified-unavailable') {
    return normalized
  }
  return null
}

export function toModelVerificationRuntimeKey(modelKey: unknown): string {
  return toRuntimeModelEquivalenceKey(modelKey)
}

export function normalizeModelVerificationRecord(value: unknown): ModelVerificationRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const record = value as Partial<ModelVerificationRecord>
  const modelKey = String(record.modelKey || '').trim()
  const runtimeKey =
    String(record.runtimeKey || '').trim().toLowerCase() || toModelVerificationRuntimeKey(modelKey)
  const verificationState = normalizePersistedModelVerificationState(record.verificationState)
  const source = String(record.source || '').trim()
  const updatedAt = String(record.updatedAt || '').trim()

  if (!modelKey || !runtimeKey || !verificationState) return null
  if (source !== 'runtime-auto' && source !== 'switch-success' && source !== 'switch-failed') return null

  return {
    runtimeKey,
    modelKey,
    verificationState,
    source,
    updatedAt: updatedAt || new Date(0).toISOString(),
  }
}

export function sortModelVerificationRecords(records: ModelVerificationRecord[]): ModelVerificationRecord[] {
  return [...records].sort((left, right) => {
    if (left.runtimeKey === right.runtimeKey) {
      return left.modelKey.localeCompare(right.modelKey)
    }
    return left.runtimeKey.localeCompare(right.runtimeKey)
  })
}

export function buildModelVerificationRecordIndex(
  records: ModelVerificationRecord[]
): Map<string, ModelVerificationRecord> {
  const index = new Map<string, ModelVerificationRecord>()
  for (const record of records) {
    const runtimeKey = toModelVerificationRuntimeKey(record.runtimeKey || record.modelKey)
    if (!runtimeKey) continue
    index.set(runtimeKey, {
      ...record,
      runtimeKey,
    })
  }
  return index
}

export function upsertModelVerificationRecord(
  records: ModelVerificationRecord[],
  nextRecord: Omit<ModelVerificationRecord, 'runtimeKey'> & { runtimeKey?: string }
): {
  changed: boolean
  records: ModelVerificationRecord[]
} {
  const runtimeKey = String(nextRecord.runtimeKey || '').trim().toLowerCase()
    || toModelVerificationRuntimeKey(nextRecord.modelKey)
  const verificationState = normalizePersistedModelVerificationState(nextRecord.verificationState)
  const source = String(nextRecord.source || '').trim()
  const modelKey = String(nextRecord.modelKey || '').trim()
  const updatedAt = String(nextRecord.updatedAt || '').trim() || new Date().toISOString()

  if (!runtimeKey || !verificationState || !modelKey) {
    return {
      changed: false,
      records: sortModelVerificationRecords(records),
    }
  }

  if (source !== 'runtime-auto' && source !== 'switch-success' && source !== 'switch-failed') {
    return {
      changed: false,
      records: sortModelVerificationRecords(records),
    }
  }

  const normalizedNext: ModelVerificationRecord = {
    runtimeKey,
    modelKey,
    verificationState,
    source,
    updatedAt,
  }
  const index = records.findIndex((record) => record.runtimeKey === runtimeKey)
  if (index < 0) {
    return {
      changed: true,
      records: sortModelVerificationRecords([...records, normalizedNext]),
    }
  }

  const current = records[index]
  if (
    current.modelKey === normalizedNext.modelKey
    && current.verificationState === normalizedNext.verificationState
    && current.source === normalizedNext.source
  ) {
    return {
      changed: false,
      records: sortModelVerificationRecords(records),
    }
  }

  const next = [...records]
  next[index] = normalizedNext
  return {
    changed: true,
    records: sortModelVerificationRecords(next),
  }
}

function collectStatusModelCandidates(statusData: Record<string, any> | null | undefined): string[] {
  if (!statusData || typeof statusData !== 'object') return []

  const values = [
    statusData.defaultModel,
    statusData.resolvedDefault,
    statusData.model,
    statusData?.agent?.model,
    statusData?.agents?.defaults?.model?.primary,
    ...(Array.isArray(statusData.allowed) ? statusData.allowed : []),
  ]

  return values
    .map((value) => String(value || '').trim())
    .filter((value) => value.includes('/'))
}

export function buildAutomaticVerifiedAvailableRecords(
  statusData: Record<string, any> | null | undefined,
  now: string = new Date().toISOString()
): ModelVerificationRecord[] {
  const byRuntimeKey = new Map<string, string>()

  for (const modelKey of collectStatusModelCandidates(statusData)) {
    const runtimeKey = toModelVerificationRuntimeKey(modelKey)
    if (!runtimeKey || byRuntimeKey.has(runtimeKey)) continue
    byRuntimeKey.set(runtimeKey, modelKey)
  }

  return sortModelVerificationRecords(
    Array.from(byRuntimeKey.entries()).map(([runtimeKey, modelKey]) => ({
      runtimeKey,
      modelKey,
      verificationState: 'verified-available' as const,
      source: 'runtime-auto' as const,
      updatedAt: now,
    }))
  )
}

export function resolveRecordedModelVerificationStateFromSwitchResult(result: {
  ok: boolean
  modelApplied?: boolean
  gatewayReloaded?: boolean
}): PersistedModelVerificationState | null {
  if (result.ok) {
    return 'verified-available'
  }

  if (result.modelApplied === true && result.gatewayReloaded === true) {
    return 'verified-unavailable'
  }

  return null
}
