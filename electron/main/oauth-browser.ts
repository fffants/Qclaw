const ANSI_ESCAPE_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]/g
const OPEN_EXTERNAL_URL_PATTERN = /\bOpen:\s*(https?:\/\/[^\s"'`<>]+)/gi
const GENERIC_URL_PATTERN = /\bhttps?:\/\/[^\s"'`<>]+/gi
const MAX_SCAN_BUFFER = 16_384
const USER_CODE_TEXT_PATTERN = /\b(?:enter|use|input)(?:\s+the)?\s+code[:\s]+([A-Z0-9-]{4,})\b/i
const TERMINAL_DEVICE_CODE_CLIENT_MARKERS = new Set(['OpenClaw', 'qwen-code'])

export interface OAuthChallenge {
  verificationUri: string
  userCode?: string
}

function normalizeCapturedUrl(raw: string): string {
  return raw.trim().replace(/[),.;]+$/g, '')
}

function isLikelyOAuthUrl(candidate: string): boolean {
  const lower = candidate.toLowerCase()
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) return false

  try {
    const parsed = new URL(candidate)
    const queryKeys = Array.from(parsed.searchParams.keys()).map((key) => key.toLowerCase())
    const hasOAuthPath = parsed.pathname.toLowerCase().includes('oauth')
    const hasAuthorizePath = parsed.pathname.toLowerCase().includes('authorize')
    const hasQuery = queryKeys.length > 0
    const hasOAuthQuery =
      queryKeys.includes('response_type') ||
      queryKeys.includes('state') ||
      queryKeys.includes('code_challenge') ||
      queryKeys.includes('client_id') ||
      queryKeys.includes('user_code') ||
      queryKeys.includes('device_code') ||
      queryKeys.includes('verification_uri')
    const hasOAuthMarker =
      lower.includes('codex_cli') ||
      lower.includes('openid') ||
      lower.includes('offline_access')

    return hasOAuthQuery || hasOAuthMarker || (hasOAuthPath && hasQuery) || (hasAuthorizePath && hasQuery)
  } catch {
    return false
  }
}

function extractUserCodeFromUrl(candidate: string): string | undefined {
  try {
    const parsed = new URL(candidate)
    const fromQuery = parsed.searchParams.get('user_code') || parsed.searchParams.get('device_code')
    const normalized = String(fromQuery || '').trim()
    return normalized || undefined
  } catch {
    return undefined
  }
}

function extractUserCodeFromText(output: string): string | undefined {
  const cleaned = output.replace(ANSI_ESCAPE_PATTERN, '')
  const matched = cleaned.match(USER_CODE_TEXT_PATTERN)
  const normalized = String(matched?.[1] || '').trim()
  return normalized || undefined
}

export function extractOpenExternalUrls(output: string): string[] {
  if (!output) return []

  const cleaned = output.replace(ANSI_ESCAPE_PATTERN, '')
  const urls: string[] = []
  const seen = new Set<string>()
  const candidates: string[] = []
  for (const match of cleaned.matchAll(OPEN_EXTERNAL_URL_PATTERN)) {
    candidates.push(match[1] || '')
  }
  for (const match of cleaned.matchAll(GENERIC_URL_PATTERN)) {
    candidates.push(match[0] || '')
  }

  for (const raw of candidates) {
    const normalized = normalizeCapturedUrl(raw)
    if (!normalized || !isLikelyOAuthUrl(normalized) || seen.has(normalized)) continue
    seen.add(normalized)
    urls.push(normalized)
  }

  return urls
}

export function extractOAuthChallenges(output: string): OAuthChallenge[] {
  const urls = extractOpenExternalUrls(output)
  if (urls.length === 0) return []

  const fallbackUserCode = extractUserCodeFromText(output)
  return urls.map((verificationUri) => ({
    verificationUri,
    userCode: extractUserCodeFromUrl(verificationUri) || fallbackUserCode,
  }))
}

function isLikelyCompleteDeviceOAuthUrl(candidate: string): boolean {
  try {
    const parsed = new URL(candidate)
    const userCode = String(parsed.searchParams.get('user_code') || parsed.searchParams.get('device_code') || '').trim()
    if (userCode.length < 6) return false

    const clientMarker = String(parsed.searchParams.get('client') || parsed.searchParams.get('client_id') || '').trim()
    return TERMINAL_DEVICE_CODE_CLIENT_MARKERS.has(clientMarker)
  } catch {
    return false
  }
}

function canFlushTerminalOAuthChallenge(buffer: string): boolean {
  const cleaned = buffer.replace(ANSI_ESCAPE_PATTERN, '').trimEnd()
  if (!cleaned) return false

  const urls = extractOpenExternalUrls(cleaned)
  if (urls.length === 0) return false

  const lastUrl = urls[urls.length - 1]
  return cleaned.endsWith(lastUrl) && isLikelyCompleteDeviceOAuthUrl(lastUrl)
}

export function shouldAutoOpenBrowserForArgs(args: string[]): boolean {
  if (!Array.isArray(args) || args.length === 0) return false

  const [command, subcommand, action] = args

  if (command === 'onboard') {
    return true
  }

  return command === 'models' && subcommand === 'auth' && (action === 'login' || action === 'login-github-copilot')
}

export function createOAuthOutputScanner(
  openExternal: (url: string) => void | Promise<void>
): (chunk: string) => void {
  const scanChallenge = createOAuthChallengeScanner((challenge) => openExternal(challenge.verificationUri))
  return (chunk: string) => {
    scanChallenge(chunk)
  }
}

export function createOAuthChallengeScanner(
  onChallenge: (challenge: OAuthChallenge) => void | Promise<void>
): (chunk: string) => void {
  let scanBuffer = ''
  let pendingChunk = ''
  const opened = new Set<string>()

  return (chunk: string) => {
    if (!chunk) return

    pendingChunk = `${pendingChunk}${chunk}`
    if (pendingChunk.length > MAX_SCAN_BUFFER) {
      pendingChunk = pendingChunk.slice(-MAX_SCAN_BUFFER)
    }

    // Only scan when we have a stable delimiter boundary. This avoids opening
    // partial OAuth URLs when chunks split in the middle of query params.
    const stableBoundary = pendingChunk.search(/\s(?=[^\s]*$)/)
    if (stableBoundary < 0 && !canFlushTerminalOAuthChallenge(pendingChunk)) {
      return
    }

    let ready = stableBoundary >= 0 ? pendingChunk.slice(0, stableBoundary + 1) : pendingChunk
    pendingChunk = stableBoundary >= 0 ? pendingChunk.slice(stableBoundary + 1) : ''
    if (pendingChunk && canFlushTerminalOAuthChallenge(pendingChunk)) {
      ready = `${ready}${pendingChunk}`
      pendingChunk = ''
    }
    scanBuffer = `${scanBuffer}${ready}`
    if (scanBuffer.length > MAX_SCAN_BUFFER) {
      scanBuffer = scanBuffer.slice(-MAX_SCAN_BUFFER)
    }

    const challenges = extractOAuthChallenges(scanBuffer)
    for (const challenge of challenges) {
      if (opened.has(challenge.verificationUri)) continue
      opened.add(challenge.verificationUri)
      Promise.resolve(onChallenge(challenge)).catch(() => {
        // 浏览器拉起失败不应影响命令流程，保持 best-effort。
      })
    }
  }
}
