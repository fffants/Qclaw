import { afterEach, describe, expect, it, vi } from 'vitest'

const OVERRIDE_KEYS = [
  'QCLAW_RUNTIME_AUTH_LOGIN_TIMEOUT_MS',
  'QCLAW_RUNTIME_COMMAND_AVAILABILITY_TIMEOUT_MS',
  'QCLAW_RUNTIME_COMMAND_AVAILABILITY_BACKOFF_FACTOR',
] as const

describe('MAIN_RUNTIME_POLICY', () => {
  afterEach(() => {
    for (const key of OVERRIDE_KEYS) {
      delete process.env[key]
    }
    vi.resetModules()
  })

  it('reads env overrides for runtime-sensitive auth timeouts', async () => {
    process.env.QCLAW_RUNTIME_AUTH_LOGIN_TIMEOUT_MS = '420000'

    const { MAIN_RUNTIME_POLICY } = await import('../runtime-policy')

    expect(MAIN_RUNTIME_POLICY.auth.loginTimeoutMs).toBe(420_000)
  })

  it('falls back to defaults for invalid override values', async () => {
    process.env.QCLAW_RUNTIME_COMMAND_AVAILABILITY_TIMEOUT_MS = 'not-a-number'
    process.env.QCLAW_RUNTIME_COMMAND_AVAILABILITY_BACKOFF_FACTOR = 'bad-value'

    const { MAIN_RUNTIME_POLICY } = await import('../runtime-policy')

    expect(MAIN_RUNTIME_POLICY.commandAvailability.timeoutMs).toBe(45_000)
    expect(MAIN_RUNTIME_POLICY.commandAvailability.backoffFactor).toBe(1.5)
  })
})
