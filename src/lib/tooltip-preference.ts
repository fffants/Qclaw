const TOOLTIP_ENABLED_STORAGE_KEY = 'qclaw-tooltip-enabled'

function getLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function readTooltipEnabled(): boolean {
  const storage = getLocalStorage()
  if (!storage) return true

  try {
    return storage.getItem(TOOLTIP_ENABLED_STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

export function writeTooltipEnabled(enabled: boolean): void {
  const storage = getLocalStorage()
  if (!storage) return

  try {
    storage.setItem(TOOLTIP_ENABLED_STORAGE_KEY, enabled ? 'true' : 'false')
  } catch {}
}

export { TOOLTIP_ENABLED_STORAGE_KEY }
