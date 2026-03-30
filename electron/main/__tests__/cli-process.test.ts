import { describe, expect, it } from 'vitest'
import { resolveStdioForCommand } from '../cli-process'

describe('resolveStdioForCommand', () => {
  it('uses ignored stdin for script wrapper commands', () => {
    expect(resolveStdioForCommand('script')).toEqual(['ignore', 'pipe', 'pipe'])
  })

  it('does not override stdio for non-script commands', () => {
    expect(resolveStdioForCommand('openclaw')).toBeUndefined()
    expect(resolveStdioForCommand('npm')).toBeUndefined()
  })
})
