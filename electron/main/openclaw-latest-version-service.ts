import { net } from 'electron'
import type { OpenClawLatestVersionCheckResult } from '../../src/shared/openclaw-phase1'
import { runShell } from './cli'
import { MAIN_RUNTIME_POLICY } from './runtime-policy'
import {
  buildOpenClawNpmViewArgs,
  formatOpenClawMirrorFailureDetails,
  normalizeOpenClawVersionTag,
  runOpenClawNpmRegistryFallback,
} from './openclaw-download-fallbacks'
import { ensureManagedOpenClawNpmRuntime } from './openclaw-npm-runtime'
import { resolveSafeWorkingDirectory } from './runtime-working-directory'

const DEFAULT_OPENCLAW_METADATA_URL = 'https://registry.npmmirror.com/openclaw/latest'
const OPENCLAW_METADATA_URL_ENV = 'QCLAW_OPENCLAW_METADATA_URL'
interface LatestVersionCheckDependencies {
  requestMetadataText?: (url: string, timeoutMs: number) => Promise<string>
  requestLatestVersionFromNpm?: (timeoutMs: number) => Promise<string>
  metadataUrl?: string
  now?: () => Date
}

function resolveOpenClawMetadataUrl(override?: string): string {
  const configured =
    String(override || process.env[OPENCLAW_METADATA_URL_ENV] || '').trim() || DEFAULT_OPENCLAW_METADATA_URL
  return configured
}

function buildFailedLatestCheck(
  checkedAt: string,
  error: unknown
): OpenClawLatestVersionCheckResult {
  return {
    ok: false,
    latestVersion: '',
    checkedAt,
    source: 'npm-registry',
    error: error instanceof Error ? error.message : String(error),
  }
}

function extractLatestVersion(raw: string): string {
  const parsed = JSON.parse(raw) as {
    version?: unknown
    'dist-tags'?: {
      latest?: unknown
    }
  }

  const directVersion = typeof parsed.version === 'string' ? parsed.version.trim() : ''
  if (directVersion) return normalizeOpenClawVersionTag(directVersion)

  const distTagVersion =
    parsed['dist-tags'] && typeof parsed['dist-tags'].latest === 'string'
      ? parsed['dist-tags'].latest.trim()
      : ''
  if (distTagVersion) return normalizeOpenClawVersionTag(distTagVersion)

  throw new Error('Registry response did not include a latest version.')
}

async function requestMetadataTextViaElectronNet(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  try {
    const response = await net.fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Qclaw Phase1',
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Registry request failed with status ${response.status}`)
    }

    return await response.text()
  } catch (error) {
    const aborted = controller.signal.aborted
    if (aborted) {
      throw new Error('Latest version check timed out')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function requestLatestVersionFromNpm(timeoutMs: number): Promise<string> {
  const managedRuntime = await ensureManagedOpenClawNpmRuntime({
    workingDirectory: resolveSafeWorkingDirectory(),
    fetchTimeoutMs: timeoutMs,
  })
  const { result, attempts } = await runOpenClawNpmRegistryFallback((mirror) =>
    runShell(
      'npm',
      buildOpenClawNpmViewArgs(mirror.registryUrl, managedRuntime.commandOptions),
      timeoutMs,
      'upgrade'
    )
  )

  if (!result.ok) {
    throw new Error(
      formatOpenClawMirrorFailureDetails(attempts, {
        operationLabel: 'OpenClaw 最新版本查询',
      })
    )
  }

  const latestVersion = String(result.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1)

  if (!latestVersion) {
    throw new Error('npm view did not return a version.')
  }

  return normalizeOpenClawVersionTag(latestVersion)
}

export async function checkOpenClawLatestVersion(
  dependencies: LatestVersionCheckDependencies = {}
): Promise<OpenClawLatestVersionCheckResult> {
  const checkedAt = (dependencies.now || (() => new Date()))().toISOString()
  const timeoutMs = MAIN_RUNTIME_POLICY.cli.lightweightProbeTimeoutMs
  const metadataUrl = resolveOpenClawMetadataUrl(dependencies.metadataUrl)
  const requestMetadataText =
    dependencies.requestMetadataText || requestMetadataTextViaElectronNet
  const requestLatestVersion =
    dependencies.requestLatestVersionFromNpm || requestLatestVersionFromNpm

  try {
    const raw = await requestMetadataText(metadataUrl, timeoutMs)
    const latestVersion = extractLatestVersion(raw)
    return {
      ok: true,
      latestVersion,
      checkedAt,
      source: 'npm-registry',
    }
  } catch (networkError) {
    try {
      const latestVersion = await requestLatestVersion(timeoutMs)
      return {
        ok: true,
        latestVersion,
        checkedAt,
        source: 'npm-registry',
      }
    } catch {
      return buildFailedLatestCheck(checkedAt, networkError)
    }
  }
}
