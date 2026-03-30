import { describe, expect, it } from 'vitest'
import { runDashboardInitialLoad } from '../dashboard-initial-load'

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('runDashboardInitialLoad', () => {
  it('marks loading false without waiting for provider refresh completion', async () => {
    const refreshDeferred = createDeferred<void>()
    const callOrder: string[] = []
    const config = { models: { openai: { enabled: true } } }
    let receivedConfig: Record<string, any> | null | undefined

    await runDashboardInitialLoad({
      fetchGatewayStatus: async () => {
        callOrder.push('gateway')
      },
      fetchConfigSnapshot: async () => {
        callOrder.push('config')
        return config
      },
      refreshProvidersWithModelStatus: async (value) => {
        receivedConfig = value
        callOrder.push('refresh:start')
        await refreshDeferred.promise
        callOrder.push('refresh:done')
      },
      setLoading: (value) => {
        callOrder.push(`loading:${value}`)
      },
    })

    expect(receivedConfig).toBe(config)
    expect(callOrder).toContain('loading:false')
    expect(callOrder).not.toContain('refresh:done')

    refreshDeferred.resolve()
    await Promise.resolve()
    expect(callOrder).toContain('refresh:done')
  })
})
