import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  rerunReadOnlyCommandAfterStalePluginRepairMock,
} = vi.hoisted(() => ({
  rerunReadOnlyCommandAfterStalePluginRepairMock: vi.fn(),
}))

vi.mock('../openclaw-readonly-stale-plugin-repair', () => ({
  rerunReadOnlyCommandAfterStalePluginRepair: rerunReadOnlyCommandAfterStalePluginRepairMock,
}))

function ok(stdout = '') {
  return { ok: true, stdout, stderr: '', code: 0 }
}

describe('openclaw model config isolation boundaries', () => {
  beforeEach(() => {
    vi.resetModules()
    rerunReadOnlyCommandAfterStalePluginRepairMock.mockReset()
    rerunReadOnlyCommandAfterStalePluginRepairMock.mockImplementation(async (runCommand, options) => {
      return runCommand(options)
    })
  })

  it('passes a no-op stale repair callback when credential validation runs status through a custom executor', async () => {
    let capturedRepair:
      | ((result: { stdout?: string; stderr?: string }) => Promise<{
          stalePluginIds: string[]
          changed: boolean
          removedPluginIds: string[]
        }>)
      | undefined

    rerunReadOnlyCommandAfterStalePluginRepairMock.mockImplementation(async (runCommand, options) => {
      capturedRepair = options?.repairStalePluginConfigFromCommandResult
      return runCommand()
    })

    const { validateProviderCredential } = await import('../openclaw-model-config')
    const runCommandWithEnv = vi.fn(async () =>
      ok(
        JSON.stringify({
          probe: {
            openai: {
              ok: true,
              status: 'ok',
            },
          },
        })
      )
    )

    const result = await validateProviderCredential(
      {
        providerId: 'openai',
        methodId: 'openai-api-key',
        secret: 'sk-openai-test',
      },
      {
        runCommandWithEnv,
        createTempDir: vi.fn(async () => '/tmp/qclaw-provider-validate-isolation-test'),
        removeTempDir: vi.fn(async () => {}),
      }
    )

    expect(result.ok).toBe(true)
    expect(typeof capturedRepair).toBe('function')
    await expect(
      capturedRepair?.({
        stdout:
          'Config warnings:\n- plugins.allow: plugin not found: fake-stale-plugin (stale config entry ignored; remove it from plugins config)',
        stderr: '',
      })
    ).resolves.toEqual({
      stalePluginIds: [],
      changed: false,
      removedPluginIds: [],
    })
  })
})
