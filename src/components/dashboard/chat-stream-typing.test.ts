import { describe, expect, it } from 'vitest'
import { advanceStreamingText } from './chat-stream-typing'

describe('chat stream typing helper', () => {
  it('advances toward the target text in small chunks', () => {
    expect(advanceStreamingText('', '你好，世界')).not.toBe('你好，世界')
    expect(advanceStreamingText('你', '你好，世界').startsWith('你')).toBe(true)
  })

  it('flushes immediately when the target no longer extends the current text', () => {
    expect(advanceStreamingText('你好，世界', '你好')).toBe('你好')
    expect(advanceStreamingText('abc', 'xyz')).toBe('xyz')
  })

  it('returns the full target once the remaining tail is short', () => {
    expect(advanceStreamingText('你好，世', '你好，世界')).toBe('你好，世界')
  })
})
