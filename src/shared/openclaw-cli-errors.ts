export type OnboardErrorCode =
  | 'already_initialized'
  | 'gateway_closed'
  | 'websocket_1006'
  | 'windows_task_conflict'
  | 'windows_access_denied'
  | 'unknown'

export interface OnboardFailureLike {
  stderr?: string | null
  errorCode?: OnboardErrorCode | null
}

export interface OnboardFailureClassification {
  errorCode: OnboardErrorCode
  fatal: boolean
}

const NON_FATAL_ONBOARD_ERROR_PATTERNS: Record<Exclude<OnboardErrorCode, 'unknown'>, readonly RegExp[]> = {
  already_initialized: [
    /\balready (?:configured|initialized|set up|setup|exists)\b/i,
    /\bhas already been (?:configured|initialized)\b/i,
  ],
  gateway_closed: [/gateway closed/i],
  websocket_1006: [/\b1006\b/],
  windows_task_conflict: [/\bschtasks\b/i],
  windows_access_denied: [/\baccess is denied\b/i],
}

const NON_FATAL_ONBOARD_ERROR_CODES = new Set<OnboardErrorCode>([
  'already_initialized',
  'gateway_closed',
  'websocket_1006',
  'windows_task_conflict',
  'windows_access_denied',
])

function normalizeOnboardErrorCode(value: unknown): OnboardErrorCode | undefined {
  switch (value) {
    case 'already_initialized':
    case 'gateway_closed':
    case 'websocket_1006':
    case 'windows_task_conflict':
    case 'windows_access_denied':
    case 'unknown':
      return value
    default:
      return undefined
  }
}

function collectOnboardErrorText(input: OnboardFailureLike | string | null | undefined): string {
  if (typeof input === 'string') return input
  return String(input?.stderr || '')
}

function classifyOnboardErrorText(text: string): OnboardErrorCode {
  const normalizedText = String(text || '').trim()
  if (!normalizedText) return 'unknown'

  for (const [errorCode, patterns] of Object.entries(NON_FATAL_ONBOARD_ERROR_PATTERNS)) {
    if (patterns.some((pattern) => pattern.test(normalizedText))) {
      return errorCode as OnboardErrorCode
    }
  }

  return 'unknown'
}

export function classifyOnboardFailure(
  input: OnboardFailureLike | string | null | undefined
): OnboardFailureClassification {
  const explicitErrorCode =
    typeof input === 'string' ? undefined : normalizeOnboardErrorCode(input?.errorCode)
  const text = collectOnboardErrorText(input)
  const derivedErrorCode = text ? classifyOnboardErrorText(text) : undefined
  const errorCode =
    explicitErrorCode && explicitErrorCode !== 'unknown'
      ? explicitErrorCode
      : derivedErrorCode || explicitErrorCode || 'unknown'

  return {
    errorCode,
    fatal: !NON_FATAL_ONBOARD_ERROR_CODES.has(errorCode),
  }
}

export function isNonFatalOnboardFailure(input: OnboardFailureLike | string | null | undefined): boolean {
  return !classifyOnboardFailure(input).fatal
}

export function isPluginAlreadyInstalledError(stderr: string): boolean {
  return /\balready exists\b/i.test(String(stderr || ''))
}
