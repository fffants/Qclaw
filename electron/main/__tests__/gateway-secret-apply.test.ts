import { describe, expect, it, vi } from 'vitest'
import { applyGatewaySecretAction } from '../gateway-secret-apply'

describe('applyGatewaySecretAction', () => {
  it('uses secrets reload for hot-reload actions', async () => {
    const runCommand = vi.fn(async () => ({ ok: true, stdout: 'reloaded', stderr: '', code: 0 }))
    const attemptedCommands: string[][] = []

    const result = await applyGatewaySecretAction({
      requestedAction: 'hot-reload',
      runCommand,
      attemptedCommands,
    })

    expect(result).toEqual({
      ok: true,
      requestedAction: 'hot-reload',
      appliedAction: 'hot-reload',
    })
    expect(attemptedCommands).toEqual([['secrets', 'reload']])
  })

  it('falls back to gateway restart when secrets reload fails', async () => {
    const runCommand = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, stdout: '', stderr: 'reload failed', code: 1 })
      .mockResolvedValueOnce({ ok: true, stdout: 'Gateway restarted', stderr: '', code: 0 })
    const attemptedCommands: string[][] = []

    const result = await applyGatewaySecretAction({
      requestedAction: 'hot-reload',
      runCommand,
      attemptedCommands,
    })

    expect(result).toEqual({
      ok: true,
      requestedAction: 'hot-reload',
      appliedAction: 'restart',
      note: 'secrets reload failed, fallback to restart',
    })
    expect(attemptedCommands).toEqual([['secrets', 'reload'], ['gateway', 'restart']])
  })
})
