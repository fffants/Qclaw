import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cancelActiveProcess,
  cancelActiveProcesses,
  clearActiveProcessIfMatch,
  setActiveAbortController,
  setActiveProcess,
} from '../command-control'

class FakeProcess {
  pid: number
  kill = vi.fn(() => true)

  constructor(pid = 43210) {
    this.pid = pid
  }
}

afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  setActiveProcess(null, 'global')
  setActiveProcess(null, 'chat')
  setActiveProcess(null, 'oauth')
  setActiveProcess(null, 'capabilities')
  setActiveAbortController(null, 'global')
  setActiveAbortController(null, 'chat')
  setActiveAbortController(null, 'oauth')
  setActiveAbortController(null, 'capabilities')
  await cancelActiveProcess('global')
  await cancelActiveProcess('chat')
  await cancelActiveProcess('oauth')
  await cancelActiveProcess('capabilities')
})

describe('command-control', () => {
  it('cancels registered process with TERM then KILL', async () => {
    vi.useFakeTimers()
    const fake = new FakeProcess()
    const processKillSpy = vi.spyOn(process, 'kill').mockImplementation(() => true as any)

    setActiveProcess(fake as any, 'global')
    const pendingCancel = cancelActiveProcess('global')
    await vi.advanceTimersByTimeAsync(1_000)
    const canceled = await pendingCancel

    expect(canceled).toBe(true)
    expect(fake.kill).toHaveBeenCalledWith('SIGTERM')
    expect(processKillSpy).toHaveBeenCalledWith(fake.pid, 'SIGKILL')
  })

  it('returns false when there is no active process', async () => {
    const canceled = await cancelActiveProcess('global')
    expect(canceled).toBe(false)
  })

  it('clears process only when it matches the active one', async () => {
    const active = new FakeProcess()
    const other = new FakeProcess()
    setActiveProcess(active as any, 'global')
    clearActiveProcessIfMatch(other as any, 'global')
    expect(await cancelActiveProcess('global', 0)).toBe(true)

    setActiveProcess(active as any, 'global')
    clearActiveProcessIfMatch(active as any, 'global')
    expect(await cancelActiveProcess('global')).toBe(false)
  })

  it('cancels only the requested domain', async () => {
    vi.useFakeTimers()
    const globalProcess = new FakeProcess()
    const chatProcess = new FakeProcess()

    setActiveProcess(globalProcess as any, 'global')
    setActiveProcess(chatProcess as any, 'chat')

    const pendingCancel = cancelActiveProcess('chat')
    await vi.advanceTimersByTimeAsync(1_000)
    const canceled = await pendingCancel

    expect(canceled).toBe(true)
    expect(chatProcess.kill).toHaveBeenCalledWith('SIGTERM')
    expect(globalProcess.kill).not.toHaveBeenCalled()

    const pendingGlobalCancel = cancelActiveProcess('global', 0)
    await vi.advanceTimersByTimeAsync(0)
    expect(await pendingGlobalCancel).toBe(true)
  })

  it('aborts only the requested domain controller when no process exists', async () => {
    const globalAbort = new AbortController()
    const chatAbort = new AbortController()

    setActiveAbortController(globalAbort, 'global')
    setActiveAbortController(chatAbort, 'chat')

    expect(await cancelActiveProcess('chat', 0)).toBe(true)
    expect(chatAbort.signal.aborted).toBe(true)
    expect(globalAbort.signal.aborted).toBe(false)
  })

  it('deduplicates same-domain concurrent cancel calls (singleflight)', async () => {
    vi.useFakeTimers()
    const fake = new FakeProcess()
    const processKillSpy = vi.spyOn(process, 'kill').mockImplementation(() => true as any)
    setActiveProcess(fake as any, 'global')

    const firstCancel = cancelActiveProcess('global')
    const secondCancel = cancelActiveProcess('global')
    await vi.advanceTimersByTimeAsync(1_000)
    const [firstResult, secondResult] = await Promise.all([firstCancel, secondCancel])

    expect(firstResult).toBe(true)
    expect(secondResult).toBe(true)
    expect(fake.kill).toHaveBeenCalledTimes(1)
    expect(processKillSpy).toHaveBeenCalledTimes(1)
  })

  it('supports batch cancel for multiple domains', async () => {
    vi.useFakeTimers()
    const globalProcess = new FakeProcess()
    const oauthProcess = new FakeProcess()
    setActiveProcess(globalProcess as any, 'global')
    setActiveProcess(oauthProcess as any, 'oauth')

    const pending = cancelActiveProcesses(['global', 'oauth', 'chat', 'global'])
    await vi.advanceTimersByTimeAsync(1_000)
    const result = await pending

    expect(result.canceledDomains).toEqual(['global', 'oauth'])
    expect(result.failedDomains).toEqual([])
    expect(result.untouchedDomains).toEqual(['chat'])
  })

  it('cancels processes registered while cancellation is in flight', async () => {
    vi.useFakeTimers()
    const first = new FakeProcess(22001)
    const second = new FakeProcess(22002)
    const processKillSpy = vi.spyOn(process, 'kill').mockImplementation(() => true as any)

    setActiveProcess(first as any, 'oauth')
    const pendingCancel = cancelActiveProcess('oauth')
    setActiveProcess(second as any, 'oauth')
    await vi.advanceTimersByTimeAsync(1_000)
    const canceled = await pendingCancel

    expect(canceled).toBe(true)
    expect(first.kill).toHaveBeenCalledWith('SIGTERM')
    expect(second.kill).toHaveBeenCalledWith('SIGTERM')
    expect(processKillSpy).toHaveBeenCalledWith(22001, 'SIGKILL')
    expect(processKillSpy).toHaveBeenCalledWith(22002, 'SIGKILL')
    expect(await cancelActiveProcess('oauth', 0)).toBe(false)
  })

  it('cancels all tracked processes in the same domain', async () => {
    vi.useFakeTimers()
    const first = new FakeProcess(10001)
    const second = new FakeProcess(10002)
    const processKillSpy = vi.spyOn(process, 'kill').mockImplementation(() => true as any)

    setActiveProcess(first as any, 'capabilities')
    setActiveProcess(second as any, 'capabilities')

    const pendingCancel = cancelActiveProcess('capabilities')
    await vi.advanceTimersByTimeAsync(1_000)
    const canceled = await pendingCancel

    expect(canceled).toBe(true)
    expect(first.kill).toHaveBeenCalledWith('SIGTERM')
    expect(second.kill).toHaveBeenCalledWith('SIGTERM')
    expect(processKillSpy).toHaveBeenCalledWith(10001, 'SIGKILL')
    expect(processKillSpy).toHaveBeenCalledWith(10002, 'SIGKILL')
  })
})
