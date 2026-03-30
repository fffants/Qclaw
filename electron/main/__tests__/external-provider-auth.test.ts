import { describe, expect, it, vi } from 'vitest'

import { clearExternalProviderAuth } from '../external-provider-auth'

describe('clearExternalProviderAuth', () => {
  it('runs codex logout when removing openai-compatible providers', async () => {
    const runCommand = vi.fn(async () => ({
      ok: true,
      stdout: '',
      stderr: '',
      code: 0,
    }))

    const result = await clearExternalProviderAuth(
      {
        providerIds: ['openai'],
      },
      {
        runCommand,
      }
    )

    expect(runCommand).toHaveBeenCalledWith('codex', ['logout'], expect.any(Number))
    expect(result).toEqual({
      ok: true,
      cleared: true,
      attemptedSources: ['codex-cli'],
    })
  })

  it('treats openai-codex aliases as openai and surfaces logout failures', async () => {
    const runCommand = vi.fn(async () => ({
      ok: false,
      stdout: '',
      stderr: 'logout failed',
      code: 1,
    }))

    const result = await clearExternalProviderAuth(
      {
        providerIds: ['openai-codex'],
      },
      {
        runCommand,
      }
    )

    expect(runCommand).toHaveBeenCalledWith('codex', ['logout'], expect.any(Number))
    expect(result).toEqual({
      ok: false,
      cleared: false,
      attemptedSources: ['codex-cli'],
      error: 'logout failed',
    })
  })

  it('skips external cleanup for providers without a mapped external cli source', async () => {
    const runCommand = vi.fn()

    const result = await clearExternalProviderAuth(
      {
        providerIds: ['anthropic'],
      },
      {
        runCommand,
      }
    )

    expect(runCommand).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: true,
      cleared: false,
      attemptedSources: [],
    })
  })
})
