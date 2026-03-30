import { describe, expect, it } from 'vitest'
import {
  resetManagedOperationLocksForTests,
  withManagedOperationLock,
} from '../managed-operation-lock'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('managed-operation-lock', () => {
  it('serializes operations that share the same lock key', async () => {
    resetManagedOperationLocksForTests()
    const trace: string[] = []

    const first = withManagedOperationLock('runtime-install', async () => {
      trace.push('first:start')
      await delay(30)
      trace.push('first:end')
    })
    const second = withManagedOperationLock('runtime-install', async () => {
      trace.push('second:start')
      trace.push('second:end')
    })

    await Promise.all([first, second])
    expect(trace).toEqual(['first:start', 'first:end', 'second:start', 'second:end'])
  })

  it('allows operations with different lock keys to run in parallel', async () => {
    resetManagedOperationLocksForTests()
    let active = 0
    let maxActive = 0

    const runWithKey = (key: string) =>
      withManagedOperationLock(key, async () => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await delay(30)
        active -= 1
      })

    await Promise.all([runWithKey('runtime-install'), runWithKey('oauth-install')])
    expect(maxActive).toBe(2)
  })
})
