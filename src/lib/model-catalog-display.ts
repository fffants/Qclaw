import { canonicalizeModelProviderId, getModelProviderAliasCandidates } from './model-provider-aliases'
import {
  buildAutomaticVerifiedAvailableRecords,
  buildModelVerificationRecordIndex,
  type ModelVerificationRecord,
} from '../shared/model-verification-state'
import { toRuntimeModelEquivalenceKey } from './model-runtime-resolution'

export type ModelCatalogDisplayMode = 'available' | 'all'
export type ModelCatalogVerificationState = 'verified-available' | 'verified-unavailable' | 'unverified'

export interface ModelCatalogDisplayItem {
  key?: string
  available?: boolean
  verificationState?: ModelCatalogVerificationState
}

export interface ModelCatalogDisplaySummary {
  mode: ModelCatalogDisplayMode
  totalCount: number
  availableCount: number
  visibleCount: number
  label: string
  detail: string
  pageEmptyText: string
  providerEmptyText: string
}

export function isCatalogModelAvailable(item: ModelCatalogDisplayItem | null | undefined): boolean {
  return item?.available !== false
}

function normalizeModelKey(value: unknown): string {
  const normalized = String(value || '').trim()
  if (!normalized.includes('/')) return normalized.toLowerCase()

  const [provider, ...rest] = normalized.split('/')
  const canonicalProvider = canonicalizeModelProviderId(provider)
  const modelId = rest.join('/')
  return `${canonicalProvider}/${modelId}`.toLowerCase()
}

function normalizeProviderId(value: unknown): string {
  return canonicalizeModelProviderId(value).trim().toLowerCase()
}

function collectNormalizedProviderIds(values: unknown[]): Set<string> {
  return new Set(values.map((value) => normalizeProviderId(value)).filter(Boolean))
}

function isConfiguredAuthProvider(entry: any): boolean {
  const status = String(entry?.status || '').trim().toLowerCase()
  if (status && !['missing', 'none', 'error', 'disabled', 'unconfigured'].includes(status)) return true
  if (entry?.authenticated === true) return true
  if (entry?.effective || entry?.modelsJson || entry?.env) return true
  if ((entry?.profiles?.count || 0) > 0) return true
  return false
}

function collectConfiguredProviderIds(statusData: Record<string, any> | null | undefined): Set<string> {
  const authProviders = Array.isArray(statusData?.auth?.providers) ? statusData.auth.providers : []
  const oauthProviders = Array.isArray(statusData?.auth?.oauth?.providers) ? statusData.auth.oauth.providers : []
  const configuredProviderIds = new Set<string>()

  for (const entry of [...authProviders, ...oauthProviders]) {
    const providerId = String(entry?.provider ?? entry?.providerId ?? '').trim()
    if (!providerId || !isConfiguredAuthProvider(entry)) continue
    for (const alias of getModelProviderAliasCandidates(providerId)) {
      configuredProviderIds.add(normalizeProviderId(alias))
    }
  }

  return configuredProviderIds
}

function collectStatusVerifiedAvailableModelKeys(
  statusData: Record<string, any> | null | undefined
): Set<string> {
  return new Set(
    buildAutomaticVerifiedAvailableRecords(statusData).map((record) => record.runtimeKey)
  )
}

function collectProviderIdsFromModelKeys(modelKeys: Set<string>): Set<string> {
  const providerIds: string[] = []
  for (const modelKey of modelKeys) {
    const [provider] = String(modelKey || '').split('/')
    if (provider) {
      providerIds.push(provider)
    }
  }
  return collectNormalizedProviderIds(providerIds)
}

export function reconcileCatalogAvailabilityWithStatus<T extends ModelCatalogDisplayItem>(
  catalog: T[],
  statusData: Record<string, any> | null | undefined,
  configuredProviderIds: string[] = [],
  verificationRecords: ModelVerificationRecord[] = []
): T[] {
  const allowedModelKeys = collectStatusVerifiedAvailableModelKeys(statusData)
  const runtimeConfiguredProviderIds = collectConfiguredProviderIds(statusData)
  const locallyScopedProviderIds = collectNormalizedProviderIds(configuredProviderIds)
  const providerIdsFromConfirmedModels = collectProviderIdsFromModelKeys(allowedModelKeys)
  const persistedVerificationIndex = buildModelVerificationRecordIndex(verificationRecords)
  const providerIdsFromPersistedVerification = collectProviderIdsFromModelKeys(
    new Set(Array.from(persistedVerificationIndex.keys()))
  )
  const scopedProviderIds = locallyScopedProviderIds.size > 0
    ? locallyScopedProviderIds
    : runtimeConfiguredProviderIds.size > 0
      ? runtimeConfiguredProviderIds
      : providerIdsFromConfirmedModels.size > 0
        ? providerIdsFromConfirmedModels
        : providerIdsFromPersistedVerification

  if (allowedModelKeys.size === 0 && persistedVerificationIndex.size === 0 && scopedProviderIds.size === 0) {
    return catalog
  }

  return catalog.map((item) => {
    const normalizedKey = normalizeModelKey(item?.key)
    const runtimeKey = toRuntimeModelEquivalenceKey(item?.key)
    const providerId = normalizeProviderId(String(item?.key || '').split('/')[0])
    if (!providerId || !scopedProviderIds.has(providerId)) return item

    if (runtimeKey && allowedModelKeys.has(runtimeKey)) {
      return {
        ...item,
        available: true,
        verificationState: 'verified-available',
      }
    }

    const persistedRecord = persistedVerificationIndex.get(runtimeKey || normalizedKey)
    if (persistedRecord?.verificationState === 'verified-available') {
      return {
        ...item,
        available: true,
        verificationState: 'verified-available',
      }
    }
    if (persistedRecord?.verificationState === 'verified-unavailable') {
      return {
        ...item,
        available: false,
        verificationState: 'verified-unavailable',
      }
    }

    return {
      ...item,
      available: false,
      verificationState: 'unverified',
    }
  })
}

export function filterCatalogForDisplay<T extends ModelCatalogDisplayItem>(
  catalog: T[],
  mode: ModelCatalogDisplayMode
): T[] {
  if (mode === 'all') return catalog
  return catalog.filter((item) => isCatalogModelAvailable(item))
}

export function buildModelCatalogDisplaySummary(
  catalog: ModelCatalogDisplayItem[],
  mode: ModelCatalogDisplayMode
): ModelCatalogDisplaySummary {
  const totalCount = catalog.length
  const availableCount = catalog.filter((item) => isCatalogModelAvailable(item)).length
  const visibleCount = mode === 'available' ? availableCount : totalCount

  if (mode === 'available') {
    return {
      mode,
      totalCount,
      availableCount,
      visibleCount,
      label: '当前显示：账号当前可用模型',
      detail: `共 ${availableCount} 个当前可用模型`,
      pageEmptyText: '当前账号下没有检测到可用模型',
      providerEmptyText: '当前账号下没有检测到该提供商的可用模型',
    }
  }

  return {
    mode,
    totalCount,
    availableCount,
    visibleCount,
    label: '当前显示：目录全量模型',
    detail: `共 ${totalCount} 个目录模型，其中 ${availableCount} 个已验证可用；其余模型可继续切换并等待验证`,
    pageEmptyText: '当前目录里没有可识别的模型',
    providerEmptyText: '该提供商当前没有目录模型',
  }
}
