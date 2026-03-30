import { canonicalizeModelProviderId } from '../../src/lib/model-provider-aliases'
import { MAIN_RUNTIME_POLICY } from './runtime-policy'
import type { CliResult } from './cli'

export interface ClearExternalProviderAuthInput {
  providerIds: string[]
}

export interface ClearExternalProviderAuthResult {
  ok: boolean
  cleared: boolean
  attemptedSources: string[]
  error?: string
}

interface ExternalProviderAuthOptions {
  runCommand?: (command: string, args: string[], timeout?: number) => Promise<CliResult>
}

function normalizeProviderSet(providerIds: string[]): Set<string> {
  return new Set(
    (providerIds || [])
      .flatMap((value) => {
        const normalized = String(value || '').trim().toLowerCase()
        const canonical = canonicalizeModelProviderId(normalized)
        return [normalized, canonical]
      })
      .filter(Boolean)
  )
}

async function defaultRunCommand(command: string, args: string[], timeout?: number): Promise<CliResult> {
  const cli = await import('./cli')
  return cli.runShell(command, args, timeout, 'oauth')
}

export async function clearExternalProviderAuth(
  input: ClearExternalProviderAuthInput,
  options: ExternalProviderAuthOptions = {}
): Promise<ClearExternalProviderAuthResult> {
  const providerSet = normalizeProviderSet(input.providerIds || [])
  const attemptedSources: string[] = []
  let cleared = false

  if (providerSet.has('openai')) {
    attemptedSources.push('codex-cli')
    const runCommand = options.runCommand ?? defaultRunCommand
    const result = await runCommand('codex', ['logout'], MAIN_RUNTIME_POLICY.cli.defaultCommandTimeoutMs)
    if (!result.ok) {
      return {
        ok: false,
        cleared,
        attemptedSources,
        error: result.stderr || result.stdout || 'Codex logout failed',
      }
    }
    cleared = true
  }

  return {
    ok: true,
    cleared,
    attemptedSources,
  }
}
