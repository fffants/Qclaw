import { describe, expect, it } from 'vitest'
import {
  isMacOpenClawAdminFallbackEnabledByPolicy,
  shouldAllowMacOpenClawAdminFallbackByProbe,
} from '../openclaw-admin-fallback-policy'

describe('isMacOpenClawAdminFallbackEnabledByPolicy', () => {
  it('treats empty and unknown values as disabled', () => {
    expect(isMacOpenClawAdminFallbackEnabledByPolicy(undefined)).toBe(false)
    expect(isMacOpenClawAdminFallbackEnabledByPolicy('')).toBe(false)
    expect(isMacOpenClawAdminFallbackEnabledByPolicy('0')).toBe(false)
    expect(isMacOpenClawAdminFallbackEnabledByPolicy('false')).toBe(false)
    expect(isMacOpenClawAdminFallbackEnabledByPolicy('random')).toBe(false)
  })

  it('accepts explicit enable flags', () => {
    expect(isMacOpenClawAdminFallbackEnabledByPolicy('1')).toBe(true)
    expect(isMacOpenClawAdminFallbackEnabledByPolicy('true')).toBe(true)
    expect(isMacOpenClawAdminFallbackEnabledByPolicy('yes')).toBe(true)
    expect(isMacOpenClawAdminFallbackEnabledByPolicy('on')).toBe(true)
    expect(isMacOpenClawAdminFallbackEnabledByPolicy(' YES ')).toBe(true)
  })
})

describe('shouldAllowMacOpenClawAdminFallbackByProbe', () => {
  it('fails closed when prefix is unresolved', () => {
    expect(
      shouldAllowMacOpenClawAdminFallbackByProbe({
        prefixResolved: false,
        writable: false,
        ownerMatchesCurrentUser: null,
        policyEnabled: true,
        prefixPath: '/usr/local',
      })
    ).toBe(false)
  })

  it('allows fallback for system-managed prefixes when install failed with a permission error', () => {
    expect(
      shouldAllowMacOpenClawAdminFallbackByProbe({
        policyEnabled: false,
        prefixResolved: true,
        writable: false,
        ownerMatchesCurrentUser: null,
        prefixPath: '/usr/local',
        userHome: '/Users/tester',
      })
    ).toBe(true)

    expect(
      shouldAllowMacOpenClawAdminFallbackByProbe({
        policyEnabled: false,
        prefixResolved: true,
        writable: true,
        ownerMatchesCurrentUser: false,
        prefixPath: '/opt/homebrew',
        userHome: '/Users/tester',
      })
    ).toBe(true)
  })

  it('keeps user-managed prefixes opt-in even when the install hit a permission error', () => {
    expect(
      shouldAllowMacOpenClawAdminFallbackByProbe({
        policyEnabled: false,
        prefixResolved: true,
        writable: false,
        ownerMatchesCurrentUser: null,
        prefixPath: '/Users/tester/.nvm/versions/node/v22.0.0',
        userHome: '/Users/tester',
      })
    ).toBe(false)

    expect(
      shouldAllowMacOpenClawAdminFallbackByProbe({
        policyEnabled: true,
        prefixResolved: true,
        writable: false,
        ownerMatchesCurrentUser: null,
        prefixPath: '/Users/tester/.nvm/versions/node/v22.0.0',
        userHome: '/Users/tester',
      })
    ).toBe(true)
  })

  it('does not fall back when the prefix is writable and owned by the current user', () => {
    expect(
      shouldAllowMacOpenClawAdminFallbackByProbe({
        policyEnabled: true,
        prefixResolved: true,
        writable: true,
        ownerMatchesCurrentUser: true,
        prefixPath: '/Users/tester/.nvm/versions/node/v22.0.0',
        userHome: '/Users/tester',
      })
    ).toBe(false)
  })
})
