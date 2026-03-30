import { describe, expect, it, vi } from 'vitest'
import {
  QCLAW_PERMISSION_REPAIR_MARKER,
  runCliLikeWithPermissionAutoRepair,
  runFsWithPermissionAutoRepair,
} from '../openclaw-permission-auto-repair'

function createOpenClawPaths(homeDir: string) {
  return {
    homeDir,
    configFile: `${homeDir}/openclaw.json`,
    envFile: `${homeDir}/.env`,
    credentialsDir: `${homeDir}/credentials`,
    modelCatalogCacheFile: `${homeDir}/qclaw-model-catalog-cache.json`,
    displayHomeDir: '~/.openclaw',
    displayConfigFile: '~/.openclaw/openclaw.json',
    displayEnvFile: '~/.openclaw/.env',
    displayCredentialsDir: '~/.openclaw/credentials',
    displayModelCatalogCacheFile: '~/.openclaw/qclaw-model-catalog-cache.json',
  }
}

describe('openclaw permission auto repair', () => {
  it('repairs trusted OpenClaw permission failures and retries the command once', async () => {
    let repaired = false
    const runPrivilegedRepair = vi.fn(async () => {
      repaired = true
      return { ok: true, stdout: '', stderr: '', code: 0 }
    })
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        stdout: '',
        stderr:
          "Failed to read config at /Users/tester/.openclaw/openclaw.json Error: EACCES: permission denied, open '/Users/tester/.openclaw/openclaw.json'",
        code: 1,
      })
      .mockResolvedValueOnce({
        ok: true,
        stdout: 'ok',
        stderr: '',
        code: 0,
      })

    const result = await runCliLikeWithPermissionAutoRepair(
      execute,
      {
        operation: 'openclaw-cli',
        controlDomain: 'oauth',
        args: ['models', 'auth', 'login', '--provider', 'openai-codex'],
      },
      {
        platform: 'darwin',
        homeDir: '/Users/tester',
        userDataDir: '/Users/tester/Library/Application Support/Qclaw',
        safeWorkDir: '/Users/tester/Library/Application Support/Qclaw/runtime',
        pluginNpmCacheDir: '/tmp/qclaw-lite/npm-cache',
        currentUser: {
          uid: 501,
          gid: 20,
          username: 'tester',
        },
        getOpenClawPaths: async () => createOpenClawPaths('/Users/tester/.openclaw'),
        probePath: async (pathname: string) => ({
          displayPath: pathname.replace('/Users/tester', '~'),
          exists: true,
          writable: repaired || !pathname.startsWith('/Users/tester/.openclaw'),
          checkPath: pathname,
          ownerUid: repaired ? 501 : pathname.startsWith('/Users/tester/.openclaw') ? 0 : 501,
          ownerMatchesCurrentUser: repaired ? true : pathname.startsWith('/Users/tester/.openclaw') ? false : true,
        }),
        runPrivilegedRepair,
      }
    )

    expect(execute).toHaveBeenCalledTimes(2)
    expect(runPrivilegedRepair).toHaveBeenCalledTimes(1)
    const repairRequest = (runPrivilegedRepair as any).mock.calls[0]?.[0] as
      | { command?: string }
      | undefined
    expect(String(repairRequest?.command || '')).toContain(
      "chown -R '501':'20' '/Users/tester/.openclaw'"
    )
    expect(result.ok).toBe(true)
    expect(result.stdout).toBe('ok')
  })

  it('retries fs reads after repairing a trusted permission failure', async () => {
    let repaired = false
    const runPrivilegedRepair = vi.fn(async () => {
      repaired = true
      return { ok: true, stdout: '', stderr: '', code: 0 }
    })
    const execute = vi.fn(async () => {
      if (!repaired) {
        const error = new Error("EACCES: permission denied, open '/Users/tester/.openclaw/openclaw.json'")
        ;(error as NodeJS.ErrnoException).code = 'EACCES'
        ;(error as NodeJS.ErrnoException).path = '/Users/tester/.openclaw/openclaw.json'
        throw error
      }
      return { ok: true }
    })

    const result = await runFsWithPermissionAutoRepair(
      execute,
      {
        operation: 'read-config',
        controlDomain: 'oauth',
        targetPath: '/Users/tester/.openclaw/openclaw.json',
      },
      {
        platform: 'darwin',
        homeDir: '/Users/tester',
        userDataDir: '/Users/tester/Library/Application Support/Qclaw',
        safeWorkDir: '/Users/tester/Library/Application Support/Qclaw/runtime',
        pluginNpmCacheDir: '/tmp/qclaw-lite/npm-cache',
        currentUser: {
          uid: 501,
          gid: 20,
          username: 'tester',
        },
        getOpenClawPaths: async () => createOpenClawPaths('/Users/tester/.openclaw'),
        probePath: async (pathname: string) => ({
          displayPath: pathname.replace('/Users/tester', '~'),
          exists: true,
          writable: repaired || !pathname.startsWith('/Users/tester/.openclaw'),
          checkPath: pathname,
          ownerUid: repaired ? 501 : pathname.startsWith('/Users/tester/.openclaw') ? 0 : 501,
          ownerMatchesCurrentUser: repaired ? true : pathname.startsWith('/Users/tester/.openclaw') ? false : true,
        }),
        runPrivilegedRepair,
      }
    )

    expect(execute).toHaveBeenCalledTimes(2)
    expect(runPrivilegedRepair).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ok: true })
  })

  it('does not auto-repair untrusted paths and returns an annotated result', async () => {
    const runPrivilegedRepair = vi.fn()
    const execute = vi.fn().mockResolvedValue({
      ok: false,
      stdout: '',
      stderr:
        "npm error code EACCES\nnpm error path /opt/homebrew/lib/node_modules/openclaw\nnpm error syscall rename",
      code: 1,
    })

    const result = await runCliLikeWithPermissionAutoRepair(
      execute,
      {
        operation: 'shell',
        controlDomain: 'env-setup',
        command: 'npm',
        args: ['install', '-g', 'openclaw'],
      },
      {
        platform: 'darwin',
        homeDir: '/Users/tester',
        userDataDir: '/Users/tester/Library/Application Support/Qclaw',
        safeWorkDir: '/Users/tester/Library/Application Support/Qclaw/runtime',
        pluginNpmCacheDir: '/tmp/qclaw-lite/npm-cache',
        currentUser: {
          uid: 501,
          gid: 20,
          username: 'tester',
        },
        getOpenClawPaths: async () => createOpenClawPaths('/Users/tester/.openclaw'),
        probePath: async (pathname: string) => ({
          displayPath: pathname.replace('/Users/tester', '~'),
          exists: true,
          writable: false,
          checkPath: pathname,
          ownerUid: 0,
          ownerMatchesCurrentUser: false,
        }),
        runPrivilegedRepair,
      }
    )

    expect(execute).toHaveBeenCalledTimes(1)
    expect(runPrivilegedRepair).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
    expect(result.stderr).toContain(QCLAW_PERMISSION_REPAIR_MARKER)
    expect(result.stderr).toContain('当前故障路径不在 Qclaw 的安全自动修复范围内')
  })

  it('fails closed for direct commands without path context in system domains', async () => {
    const runPrivilegedRepair = vi.fn()
    const execute = vi.fn().mockResolvedValue({
      ok: false,
      stdout: '',
      stderr: 'launchctl: permission denied',
      code: 1,
    })

    const result = await runCliLikeWithPermissionAutoRepair(
      execute,
      {
        operation: 'direct',
        controlDomain: 'upgrade',
        command: 'launchctl',
        args: ['remove', 'com.example.qclaw'],
      },
      {
        platform: 'darwin',
        homeDir: '/Users/tester',
        userDataDir: '/Users/tester/Library/Application Support/Qclaw',
        safeWorkDir: '/Users/tester/Library/Application Support/Qclaw/runtime',
        pluginNpmCacheDir: '/tmp/qclaw-lite/npm-cache',
        currentUser: {
          uid: 501,
          gid: 20,
          username: 'tester',
        },
        getOpenClawPaths: async () => createOpenClawPaths('/Users/tester/.openclaw'),
        probePath: async (pathname: string) => ({
          displayPath: pathname.replace('/Users/tester', '~'),
          exists: true,
          writable: false,
          checkPath: pathname,
          ownerUid: 0,
          ownerMatchesCurrentUser: false,
        }),
        runPrivilegedRepair,
      }
    )

    expect(execute).toHaveBeenCalledTimes(1)
    expect(runPrivilegedRepair).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: false,
      stdout: '',
      stderr: 'launchctl: permission denied',
      code: 1,
    })
  })
})
