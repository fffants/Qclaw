import { describe, expect, it } from 'vitest'
import { pollWithBackoff } from '../../shared/polling'

describe('pollWithBackoff', () => {
  it('keeps polling until success within the total timeout budget', async () => {
    let nowMs = 0
    let invocationCount = 0

    const result = await pollWithBackoff({
      policy: {
        timeoutMs: 10_000,
        initialIntervalMs: 1_000,
        maxIntervalMs: 4_000,
        backoffFactor: 1.5,
      },
      now: () => nowMs,
      sleep: async (ms) => {
        nowMs += ms
      },
      execute: async () => {
        invocationCount += 1
        return invocationCount >= 3
      },
      isSuccess: (value) => value,
    })

    expect(result.ok).toBe(true)
    expect(result.attempts).toBe(3)
    expect(result.aborted).toBe(false)
    expect(nowMs).toBe(2_500)
  })

  it('stops immediately when the caller aborts polling', async () => {
    let aborted = false

    const result = await pollWithBackoff({
      policy: {
        timeoutMs: 10_000,
        initialIntervalMs: 1_000,
        maxIntervalMs: 4_000,
        backoffFactor: 2,
      },
      shouldAbort: () => aborted,
      sleep: async () => {
        aborted = true
      },
      execute: async () => false,
      isSuccess: (value) => value,
    })

    expect(result.ok).toBe(false)
    expect(result.aborted).toBe(true)
    expect(result.attempts).toBe(1)
  })
})
