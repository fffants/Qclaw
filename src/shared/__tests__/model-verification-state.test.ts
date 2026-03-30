import { describe, expect, it } from 'vitest'
import { resolveRecordedModelVerificationStateFromSwitchResult } from '../model-verification-state'

describe('resolveRecordedModelVerificationStateFromSwitchResult', () => {
  it('records verified available for confirmed successful model switches', () => {
    expect(resolveRecordedModelVerificationStateFromSwitchResult({
      ok: true,
      modelApplied: true,
      gatewayReloaded: false,
    })).toBe('verified-available')
  })

  it('records verified unavailable only after the model was applied and a gateway reload still did not confirm it', () => {
    expect(resolveRecordedModelVerificationStateFromSwitchResult({
      ok: false,
      modelApplied: true,
      gatewayReloaded: true,
    })).toBe('verified-unavailable')
  })

  it('keeps ambiguous failures unrecorded', () => {
    expect(resolveRecordedModelVerificationStateFromSwitchResult({
      ok: false,
      modelApplied: false,
      gatewayReloaded: false,
    })).toBeNull()

    expect(resolveRecordedModelVerificationStateFromSwitchResult({
      ok: false,
      modelApplied: true,
      gatewayReloaded: false,
    })).toBeNull()
  })
})
