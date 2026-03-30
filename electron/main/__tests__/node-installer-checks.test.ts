import { describe, expect, it, vi } from 'vitest'
import {
  classifyMacNodeInstallerFailure,
  classifyNodeInstallerDownloadFailure,
  inspectMacNodeInstaller,
} from '../node-installer-checks'

function createAvailableMacCommandProbe() {
  return async (
    commandId: import('../command-capabilities').PlatformCommandId
  ): Promise<import('../command-capabilities').CommandCapabilityProbeResult> => ({
    id: commandId,
    platform: 'darwin' as const,
    command: String(commandId),
    supported: true,
    available: true,
    source: 'named-command' as const,
    message: '',
  })
}

describe('classifyMacNodeInstallerFailure', () => {
  it('classifies macOS compatibility errors', () => {
    const issue = classifyMacNodeInstallerFailure(
      'installer: This package is incompatible with this version of macOS.'
    )
    expect(issue.kind).toBe('unsupported-macos')
  })

  it('classifies Gatekeeper or policy rejection errors', () => {
    const issue = classifyMacNodeInstallerFailure('spctl: rejected (the code is valid but does not seem to be an app)')
    expect(issue.kind).toBe('blocked-by-policy')
  })

  it('classifies user-cancelled installer prompts', () => {
    const issue = classifyMacNodeInstallerFailure('execution error: User canceled. (-128)')
    expect(issue.kind).toBe('user-cancelled')
  })
})

describe('classifyNodeInstallerDownloadFailure', () => {
  it('normalizes installer download failures into a structured issue', () => {
    const issue = classifyNodeInstallerDownloadFailure('getaddrinfo ENOTFOUND nodejs.org')

    expect(issue.kind).toBe('download-failed')
    expect(issue.message).toContain('自动下载 Node.js 安装包失败')
    expect(issue.details).toContain('ENOTFOUND')
  })
})

describe('inspectMacNodeInstaller', () => {
  it('fails when the downloaded installer is missing', async () => {
    const result = await inspectMacNodeInstaller('/tmp/node.pkg', {
      fileExists: async () => false,
    })

    expect(result.ok).toBe(false)
    expect(result.issue?.kind).toBe('missing-installer')
  })

  it('fails when the current user is not an admin', async () => {
    const runDirect = vi.fn(async (command: string) => {
      if (command === 'id') {
        return { ok: true, stdout: 'staff everyone', stderr: '', code: 0 }
      }
      return { ok: true, stdout: 'ok', stderr: '', code: 0 }
    })

    const result = await inspectMacNodeInstaller('/tmp/node.pkg', {
      fileExists: async () => true,
      fileSize: async () => 1024,
      probeCommandCapability: createAvailableMacCommandProbe(),
      runDirect,
    })

    expect(result.ok).toBe(false)
    expect(result.issue?.kind).toBe('not-admin-user')
  })

  it('fails when signature validation rejects the package', async () => {
    const runDirect = vi.fn(async (command: string) => {
      if (command === 'id') {
        return { ok: true, stdout: 'staff admin everyone', stderr: '', code: 0 }
      }
      if (command === 'pkgutil') {
        return { ok: false, stdout: '', stderr: 'pkgutil: could not verify signature', code: 1 }
      }
      return { ok: true, stdout: 'ok', stderr: '', code: 0 }
    })

    const result = await inspectMacNodeInstaller('/tmp/node.pkg', {
      fileExists: async () => true,
      fileSize: async () => 1024,
      probeCommandCapability: createAvailableMacCommandProbe(),
      runDirect,
    })

    expect(result.ok).toBe(false)
    expect(result.issue?.kind).toBe('corrupted-installer')
  })

  it('fails when Gatekeeper blocks the package', async () => {
    const runDirect = vi.fn(async (command: string) => {
      if (command === 'id') {
        return { ok: true, stdout: 'staff admin everyone', stderr: '', code: 0 }
      }
      if (command === 'pkgutil') {
        return { ok: true, stdout: 'Package "node.pkg": signed by Apple', stderr: '', code: 0 }
      }
      if (command === 'spctl') {
        return { ok: false, stdout: '', stderr: 'assessment denied', code: 1 }
      }
      return { ok: true, stdout: 'ok', stderr: '', code: 0 }
    })

    const result = await inspectMacNodeInstaller('/tmp/node.pkg', {
      fileExists: async () => true,
      fileSize: async () => 1024,
      probeCommandCapability: createAvailableMacCommandProbe(),
      runDirect,
    })

    expect(result.ok).toBe(false)
    expect(result.issue?.kind).toBe('blocked-by-policy')
  })

  it('fails early when a required macOS system command is unavailable', async () => {
    const result = await inspectMacNodeInstaller('/tmp/node.pkg', {
      fileExists: async () => true,
      fileSize: async () => 1024,
      probeCommandCapability: async (commandId) => {
        if (commandId === 'pkgutil') {
          return {
            id: 'pkgutil',
            platform: 'darwin',
            command: 'pkgutil',
            supported: true,
            available: false,
            source: 'named-command',
            message: 'pkgutil is required to validate the installer signature on macOS.',
          }
        }
        return {
          id: commandId,
          platform: 'darwin',
          command: String(commandId),
          supported: true,
          available: true,
          source: 'named-command',
          message: '',
        }
      },
      runDirect: vi.fn(async () => ({ ok: true, stdout: 'ok', stderr: '', code: 0 })),
    })

    expect(result.ok).toBe(false)
    expect(result.issue?.kind).toBe('missing-system-command')
  })

  it('passes when the installer exists, is signed, and policy allows it', async () => {
    const runDirect = vi.fn(async (command: string) => {
      if (command === 'id') {
        return { ok: true, stdout: 'staff admin everyone', stderr: '', code: 0 }
      }
      if (command === 'pkgutil') {
        return { ok: true, stdout: 'Package "node.pkg": signed by Apple', stderr: '', code: 0 }
      }
      if (command === 'spctl') {
        return { ok: true, stdout: '', stderr: '', code: 0 }
      }
      return { ok: true, stdout: 'ok', stderr: '', code: 0 }
    })

    const result = await inspectMacNodeInstaller('/tmp/node.pkg', {
      fileExists: async () => true,
      fileSize: async () => 1024,
      probeCommandCapability: createAvailableMacCommandProbe(),
      runDirect,
    })

    expect(result).toEqual({ ok: true })
  })
})
