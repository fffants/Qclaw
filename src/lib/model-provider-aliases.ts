function normalizeProviderId(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

const CANONICAL_PROVIDER_ID_BY_ALIAS: Record<string, string> = {
  'openai-codex': 'openai',
  gemini: 'google',
  'google-gemini-cli': 'google',
  'qwen-portal': 'qwen',
  'minimax-portal': 'minimax',
}

const EXTRA_PROVIDER_ALIASES: Record<string, string[]> = {
  openai: ['openai-codex'],
  google: ['gemini', 'google-gemini-cli'],
  qwen: ['qwen-portal'],
  minimax: ['minimax-portal'],
}

export function canonicalizeModelProviderId(value: unknown): string {
  const normalized = normalizeProviderId(value)
  if (!normalized) return ''
  return CANONICAL_PROVIDER_ID_BY_ALIAS[normalized] || normalized
}

export function getModelProviderAliasCandidates(value: unknown): string[] {
  const canonical = canonicalizeModelProviderId(value)
  if (!canonical) return []

  const seen = new Set<string>()
  const values = [canonical, ...(EXTRA_PROVIDER_ALIASES[canonical] || [])]
  const result: string[] = []
  for (const entry of values) {
    const normalized = normalizeProviderId(entry)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}
