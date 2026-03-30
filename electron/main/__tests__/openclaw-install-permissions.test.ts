import { describe, expect, it } from 'vitest'
import { resolveOpenClawGlobalInstallProbePath } from '../openclaw-install-permissions'

describe('resolveOpenClawGlobalInstallProbePath', () => {
  it('targets the actual global package parent on macOS and Linux', () => {
    expect(resolveOpenClawGlobalInstallProbePath('/usr/local', 'darwin')).toBe(
      '/usr/local/lib/node_modules/openclaw'
    )
    expect(resolveOpenClawGlobalInstallProbePath('/opt/homebrew', 'darwin')).toBe(
      '/opt/homebrew/lib/node_modules/openclaw'
    )
    expect(resolveOpenClawGlobalInstallProbePath('/usr', 'linux')).toBe(
      '/usr/lib/node_modules/openclaw'
    )
  })

  it('falls back to the prefix itself when the prefix is blank', () => {
    expect(resolveOpenClawGlobalInstallProbePath('', 'darwin')).toBe('')
  })
})
