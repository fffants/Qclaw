import type { BackoffPollingPolicy } from './runtime-policies'

export interface PollWithBackoffContext {
  attempt: number
  elapsedMs: number
}

export interface PollWithBackoffResult<T> {
  ok: boolean
  attempts: number
  elapsedMs: number
  value?: T
  aborted: boolean
}

interface PollWithBackoffOptions<T> {
  policy: BackoffPollingPolicy
  execute: (context: PollWithBackoffContext) => Promise<T>
  isSuccess: (value: T, context: PollWithBackoffContext) => boolean
  shouldAbort?: () => boolean
  onAttempt?: (context: PollWithBackoffContext) => void
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

export async function pollWithBackoff<T>(
  options: PollWithBackoffOptions<T>
): Promise<PollWithBackoffResult<T>> {
  const sleep =
    options.sleep ||
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const now = options.now || (() => Date.now())
  const startedAt = now()
  const timeoutMs = Math.max(1, options.policy.timeoutMs)
  let nextIntervalMs = Math.max(1, options.policy.initialIntervalMs)
  let attempts = 0
  let lastValue: T | undefined

  while (now() - startedAt <= timeoutMs) {
    if (options.shouldAbort?.()) {
      return {
        ok: false,
        attempts,
        elapsedMs: now() - startedAt,
        value: lastValue,
        aborted: true,
      }
    }

    attempts += 1
    const context = {
      attempt: attempts,
      elapsedMs: now() - startedAt,
    }
    options.onAttempt?.(context)
    const value = await options.execute(context)
    lastValue = value

    if (options.shouldAbort?.()) {
      return {
        ok: false,
        attempts,
        elapsedMs: now() - startedAt,
        value,
        aborted: true,
      }
    }

    if (options.isSuccess(value, context)) {
      return {
        ok: true,
        attempts,
        elapsedMs: now() - startedAt,
        value,
        aborted: false,
      }
    }

    const elapsedAfterAttempt = now() - startedAt
    if (elapsedAfterAttempt >= timeoutMs) {
      break
    }

    const remainingMs = timeoutMs - elapsedAfterAttempt
    await sleep(Math.min(nextIntervalMs, remainingMs))
    nextIntervalMs = Math.min(
      options.policy.maxIntervalMs,
      Math.max(1, Math.round(nextIntervalMs * options.policy.backoffFactor))
    )
  }

  return {
    ok: false,
    attempts,
    elapsedMs: now() - startedAt,
    value: lastValue,
    aborted: false,
  }
}
