import { canonicalizeModelProviderId } from '../lib/model-provider-aliases'

export function extractConfiguredProviderIds(input: {
  config: Record<string, any> | null
  modelStatus?: Record<string, any> | null
}): string[] {
  const configuredFromConfig = [
    ...extractProviderIdsFromModelConfig(input.config),
    ...extractProviderIdsFromAuthProfiles(input.config),
  ]

  const configuredFromStatus = extractProviderIdsFromModelStatus(input.modelStatus)
  return Array.from(
    new Set(
      [...configuredFromConfig, ...configuredFromStatus]
        .map((providerId) => canonicalizeModelProviderId(providerId))
        .filter(Boolean)
    )
  )
}

function normalizeProviderId(value: unknown): string {
  return String(value || '').trim()
}

function extractProviderIdsFromModelConfig(config: Record<string, any> | null): string[] {
  const modelSection = config?.models
  if (!modelSection || typeof modelSection !== 'object' || Array.isArray(modelSection)) {
    return []
  }

  const providerMap =
    modelSection.providers && typeof modelSection.providers === 'object' && !Array.isArray(modelSection.providers)
      ? modelSection.providers
      : modelSection

  const reservedKeys = new Set(['mode', 'providers', 'allow', 'deny', 'fallbacks', 'imageFallbacks', 'aliases'])
  return Object.entries(providerMap)
    .filter(([providerId, providerConfig]: any) => {
      if (reservedKeys.has(String(providerId))) return false
      return providerConfig && (
        providerConfig.apiKey ||
        providerConfig.models?.length > 0 ||
        providerConfig.enabled === true ||
        providerConfig.baseUrl
      )
    })
    .map(([providerId]) => normalizeProviderId(providerId))
    .filter(Boolean)
}

function extractProviderIdsFromAuthProfiles(config: Record<string, any> | null): string[] {
  const profiles = config?.auth?.profiles
  if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) {
    return []
  }

  return Object.entries(profiles)
    .map(([profileKey, profile]: any) => {
      const fromProfile = normalizeProviderId(profile?.provider)
      if (fromProfile) return fromProfile
      const fromKey = String(profileKey || '').split(':')[0]
      return normalizeProviderId(fromKey)
    })
    .filter(Boolean)
}

function extractProviderIdsFromModelStatus(modelStatus?: Record<string, any> | null): string[] {
  const providers = [
    ...(Array.isArray(modelStatus?.auth?.providers) ? modelStatus.auth.providers : []),
    ...(Array.isArray(modelStatus?.auth?.oauth?.providers) ? modelStatus.auth.oauth.providers : []),
  ]
  return providers
    .filter((provider: any) => isConfiguredStatusProvider(provider))
    .map((provider: any) => normalizeProviderId(provider?.provider || provider?.providerId))
    .filter(Boolean)
}

function isConfiguredStatusProvider(provider: any): boolean {
  const status = String(provider?.status || '').trim().toLowerCase()
  if (status && !['missing', 'none', 'error', 'disabled', 'unconfigured'].includes(status)) {
    return true
  }
  if (provider?.authenticated === true) return true
  if (provider?.effective === true) return true
  if (provider?.effective && typeof provider.effective === 'object') return true
  if (provider?.modelsJson || provider?.env) return true
  if ((provider?.profiles?.count || 0) > 0) return true
  return false
}
