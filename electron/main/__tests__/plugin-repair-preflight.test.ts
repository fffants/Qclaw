import { describe, expect, it, vi } from 'vitest'

import { runPluginRepairPreflight } from '../plugin-repair-preflight'

describe('runPluginRepairPreflight', () => {
  it('keeps the preflight best-effort when the repair step fails', async () => {
    const resolveHomeDir = vi.fn(async () => '/tmp/qclaw-openclaw-home')
    const repair = vi.fn(async () => {
      throw new Error('repair exploded')
    })

    await expect(
      runPluginRepairPreflight({
        resolveHomeDir,
        repair,
      })
    ).resolves.toBeUndefined()

    expect(resolveHomeDir).toHaveBeenCalledTimes(1)
    expect(repair).toHaveBeenCalledWith('/tmp/qclaw-openclaw-home')
  })

  it('skips the repair step when no home directory is available', async () => {
    const resolveHomeDir = vi.fn(async () => null)
    const repair = vi.fn()

    await runPluginRepairPreflight({
      resolveHomeDir,
      repair,
    })

    expect(repair).not.toHaveBeenCalled()
  })
})
