import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  readTooltipEnabled,
  TOOLTIP_ENABLED_STORAGE_KEY,
  writeTooltipEnabled,
} from '../tooltip-preference'

function createStorageMock() {
  const storage = new Map<string, string>()

  return {
    getItem(key: string) {
      return storage.has(key) ? storage.get(key)! : null
    },
    setItem(key: string, value: string) {
      storage.set(key, value)
    },
    removeItem(key: string) {
      storage.delete(key)
    },
    clear() {
      storage.clear()
    },
  }
}

describe('tooltip-preference', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults to enabled when no value has been stored', () => {
    vi.stubGlobal('localStorage', createStorageMock())

    expect(readTooltipEnabled()).toBe(true)
  })

  it('persists disabled state as false', () => {
    const storage = createStorageMock()
    vi.stubGlobal('localStorage', storage)

    writeTooltipEnabled(false)

    expect(storage.getItem(TOOLTIP_ENABLED_STORAGE_KEY)).toBe('false')
    expect(readTooltipEnabled()).toBe(false)
  })

  it('persists enabled state as true', () => {
    const storage = createStorageMock()
    vi.stubGlobal('localStorage', storage)

    writeTooltipEnabled(true)

    expect(storage.getItem(TOOLTIP_ENABLED_STORAGE_KEY)).toBe('true')
    expect(readTooltipEnabled()).toBe(true)
  })
})
