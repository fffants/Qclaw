import type { CliResult } from './cli'
import { MAIN_RUNTIME_POLICY } from './runtime-policy'

export interface GatewaySecretApplyResult {
  ok: boolean
  requestedAction: 'hot-reload' | 'restart'
  appliedAction: 'hot-reload' | 'restart'
  note?: string
}

interface ApplyGatewaySecretActionParams {
  requestedAction: 'hot-reload' | 'restart'
  runCommand: (args: string[], timeout?: number) => Promise<CliResult>
  attemptedCommands?: string[][]
}

const GATEWAY_RESTART_TIMEOUT_MS = MAIN_RUNTIME_POLICY.cli.defaultCommandTimeoutMs
const SECRETS_RELOAD_TIMEOUT_MS = MAIN_RUNTIME_POLICY.cli.defaultCommandTimeoutMs

export async function applyGatewaySecretAction(
  params: ApplyGatewaySecretActionParams
): Promise<GatewaySecretApplyResult> {
  const restartCommand = ['gateway', 'restart']

  if (params.requestedAction === 'restart') {
    params.attemptedCommands?.push(restartCommand)
    const restartResult = await params.runCommand(restartCommand, GATEWAY_RESTART_TIMEOUT_MS)
    return {
      ok: restartResult.ok,
      requestedAction: 'restart',
      appliedAction: 'restart',
      note: restartResult.stderr || restartResult.stdout || '',
    }
  }

  const hotReloadCommand = ['secrets', 'reload']
  params.attemptedCommands?.push(hotReloadCommand)
  const hotReloadResult = await params.runCommand(hotReloadCommand, SECRETS_RELOAD_TIMEOUT_MS)
  if (hotReloadResult.ok) {
    return {
      ok: true,
      requestedAction: 'hot-reload',
      appliedAction: 'hot-reload',
    }
  }

  params.attemptedCommands?.push(restartCommand)
  const restartResult = await params.runCommand(restartCommand, GATEWAY_RESTART_TIMEOUT_MS)
  if (restartResult.ok) {
    return {
      ok: true,
      requestedAction: 'hot-reload',
      appliedAction: 'restart',
      note: 'secrets reload failed, fallback to restart',
    }
  }

  return {
    ok: false,
    requestedAction: 'hot-reload',
    appliedAction: 'restart',
    note:
      restartResult.stderr ||
      hotReloadResult.stderr ||
      hotReloadResult.stdout ||
      'gateway secret apply failed',
  }
}
