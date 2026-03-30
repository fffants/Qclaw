import { describe, expect, it } from 'vitest'
import {
  PAIRING_CODE_PATTERN,
  PAIRING_CODE_MAX_LENGTH,
  PAIRING_CODE_MIN_LENGTH,
  isPairingApproveConfirmed,
  isPairingCodeReady,
  resolvePairingApproveErrorCode,
} from '../pairing-protocol'

describe('pairing-protocol', () => {
  it('centralizes pairing code bounds and token matching', () => {
    expect(PAIRING_CODE_MIN_LENGTH).toBe(4)
    expect(PAIRING_CODE_MAX_LENGTH).toBe(16)
    expect(PAIRING_CODE_PATTERN.test('6DR6PDY4')).toBe(true)
  })

  it('resolves structured pairing approval error codes', () => {
    expect(
      resolvePairingApproveErrorCode({
        stderr: 'Error: No pending pairing request found for code: 6DR6PDY4',
      })
    ).toBe('no_pending_request')
    expect(
      resolvePairingApproveErrorCode({
        errorCode: 'expired',
        stderr: 'some other stderr',
      })
    ).toBe('expired')
    expect(resolvePairingApproveErrorCode({ stderr: 'unknown failure' })).toBe('unknown')
  })

  it('uses the shared protocol bounds when checking readiness', () => {
    expect(isPairingCodeReady('ABCD')).toBe(true)
    expect(isPairingCodeReady('ABC')).toBe(false)
    expect(isPairingCodeReady('A'.repeat(17))).toBe(false)
  })

  it('detects confirmed pairing success from noisy cli output', () => {
    expect(
      isPairingApproveConfirmed({
        ok: false,
        stdout: `
[plugins] feishu_im: Registered feishu_im_user_message
◇ Doctor changes
feishu configured, enabled automatically.
Approved feishu sender ou_1b2c13277636a59ecf5eb185b6b0b90f.
[info]: [ 'client ready' ]
`,
      })
    ).toBe(true)
  })
})
