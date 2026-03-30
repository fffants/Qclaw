import { describe, expect, it, vi } from 'vitest'

import { rerunReadOnlyCommandAfterStalePluginRepair } from '../openclaw-readonly-stale-plugin-repair'

describe('read-only stale plugin repair helper', () => {
  it('retries a read-only command once after stale plugin repair changes config', async () => {
    const runCommand = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        stdout:
          'Config warnings:\n- plugins.allow: plugin not found: fake-stale-plugin (stale config entry ignored; remove it from plugins config)',
        stderr: '',
        code: 0,
      })
      .mockResolvedValueOnce({
        ok: true,
        stdout: 'doctor clean',
        stderr: '',
        code: 0,
      })
    const repairStalePluginConfigFromCommandResult = vi.fn(async () => ({
      stalePluginIds: ['fake-stale-plugin'],
      changed: true,
      removedPluginIds: ['fake-stale-plugin'],
    }))

    const result = await rerunReadOnlyCommandAfterStalePluginRepair(
      () => runCommand(),
      {
      repairStalePluginConfigFromCommandResult,
      }
    )

    expect(runCommand).toHaveBeenCalledTimes(2)
    expect(repairStalePluginConfigFromCommandResult).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      ok: true,
      stdout: 'doctor clean',
      stderr: '',
      code: 0,
    })
  })

  it('falls back to the original result when stale plugin repair throws', async () => {
    const originalResult = {
      ok: true,
      stdout:
        'Config warnings:\n- plugins.allow: plugin not found: fake-stale-plugin (stale config entry ignored; remove it from plugins config)',
      stderr: '',
      code: 0,
    }
    const runCommand = vi.fn(async () => originalResult)
    const repairStalePluginConfigFromCommandResult = vi.fn(async () => {
      throw new Error('repair failed')
    })

    const result = await rerunReadOnlyCommandAfterStalePluginRepair(
      () => runCommand(),
      {
      repairStalePluginConfigFromCommandResult,
      }
    )

    expect(runCommand).toHaveBeenCalledTimes(1)
    expect(result).toEqual(originalResult)
  })

  it('falls back to the original result when the retry run throws after a successful repair', async () => {
    const originalResult = {
      ok: true,
      stdout:
        'Config warnings:\n- plugins.allow: plugin not found: fake-stale-plugin (stale config entry ignored; remove it from plugins config)',
      stderr: '',
      code: 0,
    }
    const runCommand = vi
      .fn()
      .mockResolvedValueOnce(originalResult)
      .mockRejectedValueOnce(new Error('retry spawn failed'))
    const repairStalePluginConfigFromCommandResult = vi.fn(async () => ({
      stalePluginIds: ['fake-stale-plugin'],
      changed: true,
      removedPluginIds: ['fake-stale-plugin'],
    }))

    const result = await rerunReadOnlyCommandAfterStalePluginRepair(
      () => runCommand(),
      {
        repairStalePluginConfigFromCommandResult,
      }
    )

    expect(runCommand).toHaveBeenCalledTimes(2)
    expect(result).toEqual(originalResult)
  })
})
