import type { ChildProcess } from 'node:child_process'
import { MAIN_RUNTIME_POLICY } from './runtime-policy'

export type CommandControlDomain =
  | 'global'
  | 'gateway'
  | 'config-write'
  | 'chat'
  | 'oauth'
  | 'capabilities'
  | 'env'
  | 'env-setup'
  | 'models'
  | 'plugin-install'
  | 'feishu-installer'
  | 'weixin-installer'
  | 'upgrade'
  | (string & {})

export interface CancelActiveProcessesResult {
  canceledDomains: CommandControlDomain[]
  failedDomains: CommandControlDomain[]
  untouchedDomains: CommandControlDomain[]
}

interface CommandControlState {
  processes: Set<ChildProcess>
  canceledProcesses: Set<ChildProcess>
  abortController: AbortController | null
  cancelRequested: boolean
}

const controlState = new Map<CommandControlDomain, CommandControlState>()
const cancelInFlight = new Map<CommandControlDomain, Promise<boolean>>()

function getDomainState(domain: CommandControlDomain): CommandControlState {
  const existing = controlState.get(domain)
  if (existing) return existing

  const created: CommandControlState = {
    processes: new Set<ChildProcess>(),
    canceledProcesses: new Set<ChildProcess>(),
    abortController: null,
    cancelRequested: false,
  }
  controlState.set(domain, created)
  return created
}

function markProcessCanceledAndTerminate(proc: ChildProcess, waitMs: number, state: CommandControlState): void {
  state.canceledProcesses.add(proc)
  try {
    proc.kill('SIGTERM')
  } catch {
    // Ignore process-kill errors and continue best-effort cancellation.
  }
  setTimeout(() => {
    if (!proc.pid) return
    try {
      process.kill(proc.pid, 'SIGKILL')
    } catch {
      // ignore if process already exited
    }
  }, waitMs)
}

export function setActiveProcess(proc: ChildProcess | null, domain: CommandControlDomain = 'global'): void {
  const state = getDomainState(domain)
  if (!proc) {
    state.processes.clear()
    state.canceledProcesses.clear()
    state.cancelRequested = false
    return
  }
  if (state.cancelRequested) {
    markProcessCanceledAndTerminate(proc, MAIN_RUNTIME_POLICY.processControl.cancelGracePeriodMs, state)
    return
  }
  state.processes.add(proc)
}

export function clearActiveProcessIfMatch(
  proc: ChildProcess | null,
  domain: CommandControlDomain = 'global'
): void {
  const state = getDomainState(domain)
  if (!proc) return
  state.processes.delete(proc)
}

export function setActiveAbortController(
  controller: AbortController | null,
  domain: CommandControlDomain = 'global'
): void {
  const state = getDomainState(domain)
  state.abortController = controller
}

export function consumeCanceledProcess(
  proc: ChildProcess | null,
  domain: CommandControlDomain = 'global'
): boolean {
  const state = getDomainState(domain)
  if (!proc || !state.canceledProcesses.has(proc)) return false
  state.canceledProcesses.delete(proc)
  return true
}

async function cancelActiveProcessImpl(
  domain: CommandControlDomain = 'global',
  waitMs = MAIN_RUNTIME_POLICY.processControl.cancelGracePeriodMs
): Promise<boolean> {
  const state = getDomainState(domain)
  state.cancelRequested = true
  try {
    const hasAbortController = Boolean(state.abortController)
    const activeProcesses = [...state.processes]
    if (activeProcesses.length === 0 && !hasAbortController) return false

    state.processes.clear()
    if (state.abortController) {
      state.abortController.abort()
      state.abortController = null
    }

    if (activeProcesses.length === 0) return true
    for (const proc of activeProcesses) {
      state.canceledProcesses.add(proc)
      try {
        proc.kill('SIGTERM')
      } catch {
        // Ignore process-kill errors and continue best-effort cancellation.
      }
    }

    await new Promise((resolve) => setTimeout(resolve, waitMs))
    for (const proc of activeProcesses) {
      if (!proc.pid) continue
      try {
        process.kill(proc.pid, 'SIGKILL')
      } catch {
        // ignore if process already exited
      }
    }
    return true
  } finally {
    state.cancelRequested = false
  }
}

function normalizeDomains(domains: CommandControlDomain[]): CommandControlDomain[] {
  const deduped = new Set<CommandControlDomain>()
  for (const domain of domains || []) {
    const normalized = String(domain || '').trim() as CommandControlDomain
    if (!normalized) continue
    deduped.add(normalized)
  }
  return Array.from(deduped)
}

export async function cancelActiveProcess(
  domain: CommandControlDomain = 'global',
  waitMs = MAIN_RUNTIME_POLICY.processControl.cancelGracePeriodMs
): Promise<boolean> {
  const inFlight = cancelInFlight.get(domain)
  if (inFlight) {
    return inFlight
  }

  const cancelTask = cancelActiveProcessImpl(domain, waitMs).finally(() => {
    if (cancelInFlight.get(domain) === cancelTask) {
      cancelInFlight.delete(domain)
    }
  })
  cancelInFlight.set(domain, cancelTask)
  return cancelTask
}

export async function cancelActiveProcesses(
  domains: CommandControlDomain[],
  waitMs = MAIN_RUNTIME_POLICY.processControl.cancelGracePeriodMs
): Promise<CancelActiveProcessesResult> {
  const normalizedDomains = normalizeDomains(domains)
  const canceledDomains: CommandControlDomain[] = []
  const failedDomains: CommandControlDomain[] = []
  const untouchedDomains: CommandControlDomain[] = []

  const results = await Promise.all(
    normalizedDomains.map(async (domain) => {
      try {
        const canceled = await cancelActiveProcess(domain, waitMs)
        return { domain, canceled, failed: false }
      } catch {
        return { domain, canceled: false, failed: true }
      }
    })
  )

  for (const result of results) {
    if (result.failed) {
      failedDomains.push(result.domain)
      continue
    }
    if (result.canceled) {
      canceledDomains.push(result.domain)
      continue
    }
    untouchedDomains.push(result.domain)
  }

  return {
    canceledDomains,
    failedDomains,
    untouchedDomains,
  }
}
