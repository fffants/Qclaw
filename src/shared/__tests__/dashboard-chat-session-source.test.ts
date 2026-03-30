import { describe, expect, it } from 'vitest'
import { getChannelDisplayName, parseChatSessionSourceFromKey } from '../dashboard-chat-session-source'

describe('dashboard chat session source', () => {
  it('parses webchat main session key', () => {
    const parsed = parseChatSessionSourceFromKey('agent:main:main')
    expect(parsed).toEqual({
      sourceType: 'webchat',
    })
  })

  it('parses feishu direct channel session key', () => {
    const parsed = parseChatSessionSourceFromKey(
      'agent:feishu-default:feishu:default:direct:ou_11ec143ee4079fad7afe9c5fa042404f'
    )
    expect(parsed.sourceType).toBe('channel')
    expect(parsed.sourceChannel).toBe('feishu')
    expect(parsed.sourceAccountId).toBe('default')
    expect(parsed.sourcePeerId).toBe('ou_11ec143ee4079fad7afe9c5fa042404f')
  })

  it('falls back to external-unknown for unsupported key format', () => {
    expect(parseChatSessionSourceFromKey('something-else')).toEqual({
      sourceType: 'external-unknown',
    })
  })

  it('maps channel display names', () => {
    expect(getChannelDisplayName('feishu')).toBe('飞书')
    expect(getChannelDisplayName('wecom')).toBe('企微')
    expect(getChannelDisplayName('dingtalk')).toBe('钉钉')
  })
})
