import type { ChatThinkingLevel } from '../../src/shared/chat-panel'

export interface ChatThinkingResolution {
  requestedThinking?: ChatThinkingLevel
  effectiveThinking: ChatThinkingLevel
  downgradedFrom?: ChatThinkingLevel
  source: 'explicit' | 'learned-fallback' | 'safe-default'
}

export interface LearnedThinkingCompat {
  unsupported?: ChatThinkingLevel[]
  fallback?: ChatThinkingLevel
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

function normalizeUnsupportedLevels(values: unknown): ChatThinkingLevel[] {
  if (!Array.isArray(values)) return []
  const normalized = values
    .map((value) => normalizeThinkingLevel(value))
    .filter((value): value is ChatThinkingLevel => Boolean(value))
  return Array.from(new Set(normalized))
}

export function resolveChatThinking(params: {
  requestedThinking?: ChatThinkingLevel
  learnedCompat?: LearnedThinkingCompat | null
}): ChatThinkingResolution {
  const requestedThinking = normalizeThinkingLevel(params.requestedThinking)
  const learnedFallback = normalizeThinkingLevel(params.learnedCompat?.fallback)
  const unsupported = normalizeUnsupportedLevels(params.learnedCompat?.unsupported)

  if (requestedThinking) {
    if (learnedFallback && unsupported.includes(requestedThinking)) {
      return {
        requestedThinking,
        effectiveThinking: learnedFallback,
        downgradedFrom: requestedThinking,
        source: 'learned-fallback',
      }
    }

    return {
      requestedThinking,
      effectiveThinking: requestedThinking,
      source: 'explicit',
    }
  }

  if (learnedFallback) {
    return {
      effectiveThinking: learnedFallback,
      source: 'learned-fallback',
    }
  }

  return {
    effectiveThinking: 'off',
    source: 'safe-default',
  }
}

function extractSupportedValues(raw: string): string[] {
  const match = raw.match(/supported values are:\s*([^\n.]+)/i) ?? raw.match(/supported values:\s*([^\n.]+)/i)
  if (!match?.[1]) return []
  const fragment = match[1]
  const quoted = Array.from(fragment.matchAll(/['"]([^'"]+)['"]/g)).map((entry) => entry[1]?.trim())
  if (quoted.length > 0) return quoted.filter(Boolean)
  return fragment
    .split(/,|\band\b/gi)
    .map((entry) => entry.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '').trim())
    .filter(Boolean)
}

export function pickFallbackThinkingFromError(params: {
  message: string
  attempted: ChatThinkingLevel[]
}): ChatThinkingLevel | undefined {
  const attempted = new Set(params.attempted)
  const supported = extractSupportedValues(String(params.message || '').trim())
    .map((value) => normalizeThinkingLevel(value))
    .filter((value): value is ChatThinkingLevel => Boolean(value))

  for (const value of supported) {
    if (!attempted.has(value)) return value
  }

  if (/not supported/i.test(String(params.message || '')) && !attempted.has('off')) {
    return 'off'
  }

  return undefined
}
