import { describe, expect, it } from 'vitest'
import { sanitizeNodeOptionsForElectron } from '../node-options'

describe('sanitizeNodeOptionsForElectron', () => {
  it('removes unsupported electron node options and keeps supported flags', () => {
    const result = sanitizeNodeOptionsForElectron(
      '--use-bundled-ca --trace-warnings --max-old-space-size=4096'
    )
    expect(result).toBe('--trace-warnings --max-old-space-size=4096')
  })

  it('preserves quoted arguments with spaces', () => {
    const result = sanitizeNodeOptionsForElectron(
      '--require "/Users/test/path with spaces/bootstrap.js" --use-system-ca'
    )
    expect(result).toBe('--require "/Users/test/path with spaces/bootstrap.js"')
  })

  it('falls back safely when node options contains unmatched quotes', () => {
    const raw = '--trace-warnings "--invalid'
    expect(sanitizeNodeOptionsForElectron(raw)).toBe('')
  })

  it('preserves windows-style paths while filtering unsupported flags', () => {
    const result = sanitizeNodeOptionsForElectron(
      '--require C:\\Users\\test\\bootstrap.js --use-system-ca --trace-warnings'
    )
    expect(result).toBe('--require C:\\Users\\test\\bootstrap.js --trace-warnings')
  })
})
