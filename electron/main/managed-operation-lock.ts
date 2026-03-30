const lockTails = new Map<string, Promise<void>>()

export async function withManagedOperationLock<T>(
  key: string,
  operation: () => Promise<T>
): Promise<T> {
  const normalizedKey = String(key || '').trim() || 'default'
  const previousTail = lockTails.get(normalizedKey) || Promise.resolve()

  let releaseCurrent: () => void = () => {}
  const currentTail = new Promise<void>((resolve) => {
    releaseCurrent = resolve
  })
  const chainedTail = previousTail.then(() => currentTail)
  lockTails.set(normalizedKey, chainedTail)

  await previousTail
  try {
    return await operation()
  } finally {
    releaseCurrent()
    if (lockTails.get(normalizedKey) === chainedTail) {
      lockTails.delete(normalizedKey)
    }
  }
}

export function resetManagedOperationLocksForTests(): void {
  lockTails.clear()
}
