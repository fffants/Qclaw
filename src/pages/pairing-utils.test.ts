import { describe, expect, it } from 'vitest'
import {
  buildPairingApprovalFeedback,
  isPairingCodeReady,
  parsePairingInput,
  shouldUseAllowFromFallback,
} from './pairing-utils'

describe('parsePairingInput', () => {
  it('parses plain code input', () => {
    const parsed = parsePairingInput('6dr6pdy4')
    expect(parsed.code).toBe('6DR6PDY4')
    expect(parsed.feishuOpenId).toBeUndefined()
  })

  it('parses full bot message with code and feishu user id', () => {
    const parsed = parsePairingInput(`
OpenClaw: access not configured.
Your Feishu user id: ou_3a4eaf1a296900b76bbcf0f0c10086a4
Pairing code: 6DR6PDY4
Ask the bot owner to approve with:
openclaw pairing approve feishu 6DR6PDY4
`)

    expect(parsed.code).toBe('6DR6PDY4')
    expect(parsed.feishuOpenId).toBe('ou_3a4eaf1a296900b76bbcf0f0c10086a4')
  })
})

describe('shouldUseAllowFromFallback', () => {
  it('returns true for feishu when pending request is missing and open id exists', () => {
    expect(
      shouldUseAllowFromFallback(
        'feishu',
        { errorCode: 'no_pending_request', stderr: 'different stderr text' },
        'ou_3a4eaf1a296900b76bbcf0f0c10086a4'
      )
    ).toBe(true)
  })

  it('returns false without open id', () => {
    expect(
      shouldUseAllowFromFallback(
        'feishu',
        'Error: No pending pairing request found for code: 6DR6PDY4',
        ''
      )
    ).toBe(false)
  })
})

describe('pairing feedback helpers', () => {
  it('uses shared protocol constants for readiness checks', () => {
    expect(isPairingCodeReady('ABCD')).toBe(true)
    expect(isPairingCodeReady('ABC')).toBe(false)
  })

  it('maps already-paired responses to success feedback per UI surface', () => {
    expect(
      buildPairingApprovalFeedback({
        channelName: '飞书',
        result: { errorCode: 'already_paired', stderr: 'old stderr' },
        surface: 'dashboard',
      })
    ).toEqual({
      tone: 'success',
      message: '该账号已配对',
    })

    expect(
      buildPairingApprovalFeedback({
        channelName: '飞书',
        result: { errorCode: 'already_paired' },
      })
    ).toEqual({
      tone: 'success',
      message: '该用户已完成配对，无需重复操作。',
    })
  })

  it('treats explicit approval markers as success even when the cli exits non-zero', () => {
    expect(
      buildPairingApprovalFeedback({
        channelName: '飞书',
        result: {
          ok: false,
          stdout: `
[plugins] feishu_doc: Registered feishu_fetch_doc
Approved feishu sender ou_1b2c13277636a59ecf5eb185b6b0b90f.
[info]: [ 'client ready' ]
`,
        },
        surface: 'dashboard',
      })
    ).toEqual({
      tone: 'success',
      message: '配对已成功。如飞书里继续弹出授权卡片，请先完成授权，再发送消息开始对话。',
    })
  })
})
