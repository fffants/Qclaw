import { describe, expect, it } from 'vitest'
import { createNextRequestId, shouldApplyRequestResult } from './chat-request-guards'

describe('chat request guards', () => {
  it('increments request ids monotonically', () => {
    expect(createNextRequestId(0)).toBe(1)
    expect(createNextRequestId(1)).toBe(2)
    expect(createNextRequestId(41)).toBe(42)
  })

  it('only applies the latest request result', () => {
    expect(shouldApplyRequestResult(2, 2)).toBe(true)
    expect(shouldApplyRequestResult(1, 2)).toBe(false)
    expect(shouldApplyRequestResult(2, 3)).toBe(false)
  })
})
