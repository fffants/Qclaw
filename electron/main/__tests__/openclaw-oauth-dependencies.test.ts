import { describe, expect, it, vi } from 'vitest'
import {
  buildGeminiCliMissingMessage,
  inspectOAuthDependencyForAuthChoice,
  installOAuthExternalDependency,
} from '../openclaw-oauth-dependencies'

describe('openclaw oauth dependencies', () => {
  it('treats Gemini OAuth as ready when OAuth client env is already configured', async () => {
    const result = await inspectOAuthDependencyForAuthChoice('google-gemini-cli', {
      readEnvFile: async () => ({
        GEMINI_CLI_OAUTH_CLIENT_ID: 'client-id-from-env-file',
        GOOGLE_CLOUD_PROJECT: 'demo-project',
      }),
      runShell: vi.fn(async () => ({ ok: false, stdout: '', stderr: 'not found', code: 1 })),
    })

    expect(result).toEqual({
      ready: true,
      satisfiedBy: 'env',
      warnings: [],
    })
  })

  it('adds a non-blocking warning when Gemini OAuth may still need GOOGLE_CLOUD_PROJECT', async () => {
    const result = await inspectOAuthDependencyForAuthChoice('google-gemini-cli', {
      readEnvFile: async () => ({}),
      runShell: vi.fn(async (command: string, args: string[]) => {
        if (command === 'gemini' && args[0] === '--version') {
          return { ok: true, stdout: 'gemini 1.0.0', stderr: '', code: 0 }
        }
        return { ok: false, stdout: '', stderr: 'not found', code: 1 }
      }),
    })

    expect(result.ready).toBe(true)
    expect(result.satisfiedBy).toBe('command')
    expect(result.warnings).toEqual([
      expect.objectContaining({
        id: 'google-cloud-project-missing',
      }),
    ])
    expect(result.warnings?.[0]?.message).toContain('GOOGLE_CLOUD_PROJECT')
  })

  it('returns npm-first install guidance on macOS when npm works and Homebrew is not writable', async () => {
    const runShell = vi.fn(async (command: string, args: string[]) => {
      if (command === 'brew' && args[0] === '--version') {
        return { ok: true, stdout: 'Homebrew 4.0.0', stderr: '', code: 0 }
      }
      if (command === 'brew' && args[0] === '--prefix') {
        return { ok: true, stdout: '/opt/homebrew', stderr: '', code: 0 }
      }
      if (command === 'npm' && args[0] === '--version') {
        return { ok: true, stdout: '10.0.0', stderr: '', code: 0 }
      }
      return { ok: false, stdout: '', stderr: 'command not found', code: 1 }
    })

    const result = await inspectOAuthDependencyForAuthChoice('google-gemini-cli', {
      platform: 'darwin',
      readEnvFile: async () => ({}),
      runShell,
      checkPathWritable: async () => false,
    })

    expect(result.ready).toBe(false)
    expect(result.action?.message).toBe(buildGeminiCliMissingMessage())
    expect(result.action?.recommendedMethod).toBe('npm')
    expect(result.action?.installOptions.map((option) => option.method)).toEqual(['npm'])
  })

  it('falls back to brew on macOS when npm is unavailable but Homebrew is writable', async () => {
    const runShell = vi.fn(async (command: string, args: string[]) => {
      if (command === 'brew' && args[0] === '--version') {
        return { ok: true, stdout: 'Homebrew 4.0.0', stderr: '', code: 0 }
      }
      if (command === 'brew' && args[0] === '--prefix') {
        return { ok: true, stdout: '/opt/homebrew', stderr: '', code: 0 }
      }
      if (command === 'npm' && args[0] === '--version') {
        return { ok: false, stdout: '', stderr: 'npm missing', code: 1 }
      }
      return { ok: false, stdout: '', stderr: 'command not found', code: 1 }
    })

    const result = await inspectOAuthDependencyForAuthChoice('google-gemini-cli', {
      platform: 'darwin',
      readEnvFile: async () => ({}),
      runShell,
      checkPathWritable: async () => true,
    })

    expect(result.ready).toBe(false)
    expect(result.action?.recommendedMethod).toBe('brew')
    expect(result.action?.installOptions.map((option) => option.method)).toEqual(['brew'])
  })

  it('installs Gemini CLI through npm when npm is the selected method', async () => {
    const runShell = vi.fn(async (command: string, args: string[]) => {
      if (command === 'gemini' && args[0] === '--version') {
        return { ok: false, stdout: '', stderr: 'not found', code: 1 }
      }
      if (command === 'npm' && args[0] === '--version') {
        return { ok: true, stdout: '10.0.0', stderr: '', code: 0 }
      }
      if (command === 'npm' && args[0] === 'install') {
        return { ok: true, stdout: 'installed', stderr: '', code: 0 }
      }
      return { ok: false, stdout: '', stderr: 'missing', code: 1 }
    })

    const result = await installOAuthExternalDependency(
      {
        dependencyId: 'gemini-cli',
        method: 'npm',
      },
      {
        platform: 'win32',
        readEnvFile: async () => ({}),
        runShell,
        refreshEnvironment: async () => ({ ok: true }),
        waitForCommandAvailable: async () => ({ ok: true, stdout: 'gemini 1.0.0' }),
      }
    )

    expect(result.ok).toBe(true)
    expect(result.method).toBe('npm')
    expect(runShell).toHaveBeenCalledWith(
      'npm',
      ['install', '-g', '@google/gemini-cli'],
      expect.any(Number)
    )
  })

  it('rejects explicitly selecting brew when only npm is currently feasible', async () => {
    const runShell = vi.fn(async (command: string, args: string[]) => {
      if (command === 'brew' && args[0] === '--version') {
        return { ok: true, stdout: 'Homebrew 4.0.0', stderr: '', code: 0 }
      }
      if (command === 'brew' && args[0] === '--prefix') {
        return { ok: true, stdout: '/opt/homebrew', stderr: '', code: 0 }
      }
      if (command === 'npm' && args[0] === '--version') {
        return { ok: true, stdout: '10.0.0', stderr: '', code: 0 }
      }
      if (command === 'gemini' && args[0] === '--version') {
        return { ok: false, stdout: '', stderr: 'not found', code: 1 }
      }
      return { ok: false, stdout: '', stderr: 'missing', code: 1 }
    })

    const result = await installOAuthExternalDependency(
      {
        dependencyId: 'gemini-cli',
        method: 'brew',
      },
      {
        platform: 'darwin',
        readEnvFile: async () => ({}),
        runShell,
        checkPathWritable: async () => false,
      }
    )

    expect(result.ok).toBe(false)
    expect(result.method).toBe('brew')
    expect(result.message).toContain('不可用安装方式：brew')
  })
})
