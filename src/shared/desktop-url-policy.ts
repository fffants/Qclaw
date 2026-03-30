import installWebPolicy from '../../install-web-v1.manifest.json'

interface DesktopOAuthProviderPolicy {
  defaultCallbackUrl: string
  callbackUrlEnv: string
  callbackPortEnv: string
  probeHosts: string[]
}

interface DesktopUrlPolicy {
  devServer: {
    defaultUrl: string
  }
  loopbackHosts: string[]
  externalOpen: {
    secureSchemes: string[]
    loopbackHttpSchemes: string[]
  }
  oauth: {
    openaiCodex: DesktopOAuthProviderPolicy
  }
}

const desktopPolicy = (installWebPolicy as { desktop?: DesktopUrlPolicy }).desktop

function normalizeHost(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\[/, '')
    .replace(/\]$/, '')
}

function isValidPort(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= 65_535
}

function parsePort(raw: unknown): number | null {
  const text = String(raw ?? '').trim()
  if (!text) return null
  const port = Number.parseInt(text, 10)
  return isValidPort(port) ? port : null
}

function parseHttpUrl(raw: unknown): URL | null {
  const text = String(raw ?? '').trim()
  if (!text) return null

  try {
    const parsed = new URL(text)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed
  } catch {
    return null
  }
}

const defaultLoopbackHosts = desktopPolicy?.loopbackHosts || ['localhost', '127.0.0.1', '::1']
const secureSchemes = desktopPolicy?.externalOpen.secureSchemes || ['https:']
const loopbackHttpSchemes = desktopPolicy?.externalOpen.loopbackHttpSchemes || ['http:']
const openAICodexPolicy = desktopPolicy?.oauth.openaiCodex || {
  defaultCallbackUrl: 'http://127.0.0.1:1455/auth/callback',
  callbackUrlEnv: 'QCLAW_OPENAI_CALLBACK_URL',
  callbackPortEnv: 'QCLAW_OPENAI_CALLBACK_PORT',
  probeHosts: ['127.0.0.1', 'localhost'],
}

export const DESKTOP_URL_POLICY = Object.freeze({
  devServerDefaultUrl: desktopPolicy?.devServer.defaultUrl || 'http://127.0.0.1:7777/',
  loopbackHosts: defaultLoopbackHosts.map(normalizeHost),
  secureSchemes: secureSchemes.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean),
  loopbackHttpSchemes: loopbackHttpSchemes
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean),
  oauth: {
    openAICodex: {
      defaultCallbackUrl: openAICodexPolicy.defaultCallbackUrl,
      callbackUrlEnv: openAICodexPolicy.callbackUrlEnv,
      callbackPortEnv: openAICodexPolicy.callbackPortEnv,
      probeHosts: openAICodexPolicy.probeHosts.map(normalizeHost),
    },
  },
})

export function isLoopbackHost(hostname: string): boolean {
  const normalized = normalizeHost(hostname)
  if (!normalized) return false
  if (DESKTOP_URL_POLICY.loopbackHosts.includes(normalized)) return true
  if (/^127(?:\.\d{1,3}){3}$/.test(normalized)) return true
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true
  if (/^::ffff:127(?:\.\d{1,3}){3}$/i.test(normalized)) return true
  return false
}

export function isAllowedExternalOpenUrl(rawUrl: string): boolean {
  const parsed = parseHttpUrl(rawUrl)
  if (!parsed) return false

  const protocol = parsed.protocol.toLowerCase()
  if (DESKTOP_URL_POLICY.secureSchemes.includes(protocol)) return true
  if (DESKTOP_URL_POLICY.loopbackHttpSchemes.includes(protocol) && isLoopbackHost(parsed.hostname)) return true
  return false
}

export function resolveDevServerUrl(env: Record<string, string | undefined> = process.env): string {
  const envUrl = parseHttpUrl(env.VITE_DEV_SERVER_URL)
  return envUrl?.toString() || DESKTOP_URL_POLICY.devServerDefaultUrl
}

export function resolveOpenAICodexCallbackUrl(
  env: Record<string, string | undefined> = process.env
): URL {
  const callbackUrlOverride = parseHttpUrl(env[DESKTOP_URL_POLICY.oauth.openAICodex.callbackUrlEnv])
  if (callbackUrlOverride && isLoopbackHost(callbackUrlOverride.hostname)) {
    return callbackUrlOverride
  }

  const baseUrl = new URL(DESKTOP_URL_POLICY.oauth.openAICodex.defaultCallbackUrl)
  const portOverride = parsePort(env[DESKTOP_URL_POLICY.oauth.openAICodex.callbackPortEnv])
  if (portOverride) {
    baseUrl.port = String(portOverride)
  }
  return baseUrl
}

export function buildOpenAICodexCallbackProbeUrls(
  env: Record<string, string | undefined> = process.env
): string[] {
  const callbackUrl = resolveOpenAICodexCallbackUrl(env)
  const candidateHosts = Array.from(
    new Set(
      [callbackUrl.hostname, ...DESKTOP_URL_POLICY.oauth.openAICodex.probeHosts]
        .map(normalizeHost)
        .filter((host) => host && isLoopbackHost(host))
    )
  )

  return candidateHosts.map((host) => {
    const probeUrl = new URL(callbackUrl.toString())
    probeUrl.hostname = host
    probeUrl.searchParams.set('code', 'qclaw_probe')
    probeUrl.searchParams.set('state', 'qclaw_probe')
    return probeUrl.toString()
  })
}
