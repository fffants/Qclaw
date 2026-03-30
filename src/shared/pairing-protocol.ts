export const PAIRING_CODE_MIN_LENGTH = 4
export const PAIRING_CODE_MAX_LENGTH = 16
export const PAIRING_CODE_TOKEN_SOURCE = `[A-HJ-NP-Z2-9]{${PAIRING_CODE_MIN_LENGTH},${PAIRING_CODE_MAX_LENGTH}}`
export const PAIRING_CODE_PATTERN = new RegExp(`\\b${PAIRING_CODE_TOKEN_SOURCE}\\b`)

export type PairingApproveErrorCode = 'no_pending_request' | 'expired' | 'already_paired' | 'unknown'

export interface PairingApproveResultLike {
  ok?: boolean
  stdout?: string | null
  stderr?: string | null
  errorCode?: PairingApproveErrorCode | null
}

const PAIRING_APPROVE_ERROR_PATTERNS: Record<Exclude<PairingApproveErrorCode, 'unknown'>, readonly RegExp[]> = {
  no_pending_request: [/No pending pairing request/i],
  expired: [/\bexpired\b/i],
  already_paired: [/already paired/i],
}

const PAIRING_APPROVE_SUCCESS_PATTERNS: readonly RegExp[] = [
  /Approved\s+\w+\s+sender\b/i,
  /\baccess approved\b/i,
]

function normalizePairingApproveErrorCode(value: unknown): PairingApproveErrorCode | undefined {
  switch (value) {
    case 'no_pending_request':
    case 'expired':
    case 'already_paired':
    case 'unknown':
      return value
    default:
      return undefined
  }
}

function collectPairingApproveText(input: PairingApproveResultLike | string | null | undefined): string {
  if (typeof input === 'string') return input
  return [input?.stderr, input?.stdout].map((value) => String(value || '').trim()).filter(Boolean).join('\n')
}

function classifyPairingApproveText(text: string): PairingApproveErrorCode {
  const normalizedText = String(text || '').trim()
  if (!normalizedText) return 'unknown'

  for (const [errorCode, patterns] of Object.entries(PAIRING_APPROVE_ERROR_PATTERNS)) {
    if (patterns.some((pattern) => pattern.test(normalizedText))) {
      return errorCode as PairingApproveErrorCode
    }
  }

  return 'unknown'
}

export function resolvePairingApproveErrorCode(
  input: PairingApproveResultLike | string | null | undefined
): PairingApproveErrorCode | undefined {
  const explicitErrorCode =
    typeof input === 'string' ? undefined : normalizePairingApproveErrorCode(input?.errorCode)
  if (explicitErrorCode && explicitErrorCode !== 'unknown') {
    return explicitErrorCode
  }

  const text = collectPairingApproveText(input)
  if (text) {
    return classifyPairingApproveText(text)
  }

  return explicitErrorCode
}

export function isPairingApproveConfirmed(
  input: PairingApproveResultLike | string | null | undefined
): boolean {
  if (typeof input !== 'string' && input?.ok) return true

  const text = collectPairingApproveText(input)
  if (!text) return false

  return PAIRING_APPROVE_SUCCESS_PATTERNS.some((pattern) => pattern.test(text))
}

export function isPairingCodeReady(code: string): boolean {
  const normalized = String(code || '').trim()
  return normalized.length >= PAIRING_CODE_MIN_LENGTH && normalized.length <= PAIRING_CODE_MAX_LENGTH
}
