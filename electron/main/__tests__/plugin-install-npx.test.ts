import { describe, expect, it } from 'vitest'
import {
  FEISHU_PLUGIN_NPX_SPECIFIER,
  isSkipConfigUnsupportedError,
  shouldTryLegacySkipConfig,
} from '../plugin-install-npx'

describe('shouldTryLegacySkipConfig', () => {
  it('skips the legacy --skip-config probe for Feishu plugin installs', () => {
    expect(shouldTryLegacySkipConfig(FEISHU_PLUGIN_NPX_SPECIFIER)).toBe(false)
  })

  it('keeps legacy compatibility for other npx-based plugin installers', () => {
    expect(shouldTryLegacySkipConfig('@wecom/wecom-openclaw-cli')).toBe(true)
  })
})

describe('isSkipConfigUnsupportedError', () => {
  it('detects CLI failures caused by removed --skip-config support', () => {
    expect(
      isSkipConfigUnsupportedError({
        stdout: '',
        stderr: "error: unknown option '--skip-config'",
      })
    ).toBe(true)
  })

  it('ignores unrelated install failures', () => {
    expect(
      isSkipConfigUnsupportedError({
        stdout: '',
        stderr: 'network timeout',
      })
    ).toBe(false)
  })
})
