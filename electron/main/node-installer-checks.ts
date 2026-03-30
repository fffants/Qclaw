import {
  probePlatformCommandCapability,
  type CommandCapabilityProbeResult,
  type PlatformCommandId,
} from './command-capabilities'
import { MAIN_RUNTIME_POLICY } from './runtime-policy'
import {
  classifyMacNodeInstallerFailure,
  classifyNodeInstallerDownloadFailure,
  createNodeInstallerIssue,
  type NodeInstallerIssue,
  type NodeInstallerReadinessResult,
} from '../../src/shared/node-installer-issues'

interface CliLikeResult {
  ok: boolean
  stdout: string
  stderr: string
  code: number | null
}

interface InspectMacNodeInstallerOptions {
  fileExists?: (path: string) => Promise<boolean>
  fileSize?: (path: string) => Promise<number>
  runDirect?: (command: string, args: string[], timeout?: number) => Promise<CliLikeResult>
  probeCommandCapability?: (
    commandId: PlatformCommandId
  ) => Promise<CommandCapabilityProbeResult>
}
export {
  classifyMacNodeInstallerFailure,
  classifyNodeInstallerDownloadFailure,
  createNodeInstallerIssue,
}
export type { NodeInstallerIssue, NodeInstallerReadinessResult }

export async function inspectMacNodeInstaller(
  installerPath: string,
  options: InspectMacNodeInstallerOptions = {}
): Promise<NodeInstallerReadinessResult> {
  const fsPromises = process.getBuiltinModule('node:fs/promises') as typeof import('node:fs/promises')
  const fileExists =
    options.fileExists ||
    (async (targetPath: string) => {
      try {
        await fsPromises.access(targetPath)
        return true
      } catch {
        return false
      }
    })
  const getFileSize =
    options.fileSize ||
    (async (targetPath: string) => {
      const fileStat = await fsPromises.stat(targetPath)
      return fileStat.size
    })
  const runDirect = options.runDirect
  const probeCommandCapability =
    options.probeCommandCapability ||
    ((commandId: PlatformCommandId) =>
      probePlatformCommandCapability(commandId, {
        platform: 'darwin',
        env: process.env,
      }))

  if (!(await fileExists(installerPath))) {
    return { ok: false, issue: createNodeInstallerIssue('missing-installer', installerPath) }
  }

  try {
    const size = await getFileSize(installerPath)
    if (size <= 0) {
      return { ok: false, issue: createNodeInstallerIssue('corrupted-installer', 'Downloaded installer file is empty') }
    }
  } catch (error) {
    return {
      ok: false,
      issue: createNodeInstallerIssue(
        'corrupted-installer',
        error instanceof Error ? error.message : String(error)
      ),
    }
  }

  if (!runDirect) {
    return { ok: true }
  }

  for (const commandId of ['id', 'pkgutil', 'spctl'] as const) {
    const capability = await probeCommandCapability(commandId)
    if (!capability.available) {
      return {
        ok: false,
        issue: createNodeInstallerIssue(
          'missing-system-command',
          capability.message || `${capability.command} is unavailable`
        ),
      }
    }
  }

  const groupsResult = await runDirect(
    'id',
    ['-Gn'],
    MAIN_RUNTIME_POLICY.nodeInstallerChecks.groupsTimeoutMs
  )
  if (groupsResult.ok) {
    const groups = groupsResult.stdout
      .trim()
      .split(/\s+/g)
      .filter(Boolean)
      .map((group) => group.toLowerCase())
    if (groups.length > 0 && !groups.includes('admin')) {
      return { ok: false, issue: createNodeInstallerIssue('not-admin-user', groupsResult.stdout) }
    }
  }

  const signatureResult = await runDirect(
    'pkgutil',
    ['--check-signature', installerPath],
    MAIN_RUNTIME_POLICY.nodeInstallerChecks.signatureTimeoutMs
  )
  if (!signatureResult.ok) {
    return {
      ok: false,
      issue: createNodeInstallerIssue(
        'corrupted-installer',
        `${signatureResult.stdout}\n${signatureResult.stderr}`.trim()
      ),
    }
  }

  const policyResult = await runDirect(
    'spctl',
    ['--assess', '--type', 'install', '-v', installerPath],
    MAIN_RUNTIME_POLICY.nodeInstallerChecks.policyTimeoutMs
  )
  if (!policyResult.ok) {
    return {
      ok: false,
      issue: createNodeInstallerIssue(
        'blocked-by-policy',
        `${policyResult.stdout}\n${policyResult.stderr}`.trim()
      ),
    }
  }

  return { ok: true }
}
