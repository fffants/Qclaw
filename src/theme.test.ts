import { describe, expect, it } from 'vitest'

import { shouldClearStoredColorScheme } from './theme'

describe('shouldClearStoredColorScheme', () => {
  it('keeps valid persisted color scheme values', () => {
    expect(shouldClearStoredColorScheme('light')).toBe(false)
    expect(shouldClearStoredColorScheme('dark')).toBe(false)
    expect(shouldClearStoredColorScheme('auto')).toBe(false)
  })

  it('clears unknown persisted color scheme values', () => {
    expect(shouldClearStoredColorScheme('sepia')).toBe(true)
  })
})
