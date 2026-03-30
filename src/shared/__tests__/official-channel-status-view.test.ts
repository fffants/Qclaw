import { describe, expect, it } from 'vitest'
import {
  getOfficialChannelStageColor,
  getOfficialChannelStageLabel,
  getOfficialChannelStageStateLabel,
} from '../official-channel-status-view'

describe('official channel status view helpers', () => {
  it('maps the shared stage ids to user-facing labels', () => {
    expect(getOfficialChannelStageLabel('installed')).toBe('已安装')
    expect(getOfficialChannelStageLabel('registered')).toBe('已注册')
    expect(getOfficialChannelStageLabel('loaded')).toBe('已加载')
    expect(getOfficialChannelStageLabel('ready')).toBe('已就绪')
  })

  it('keeps unknown state explicit instead of pretending ready exists', () => {
    expect(getOfficialChannelStageStateLabel('verified')).toBe('已证实')
    expect(getOfficialChannelStageStateLabel('missing')).toBe('缺失')
    expect(getOfficialChannelStageStateLabel('unknown')).toBe('unknown / 未证实')
    expect(getOfficialChannelStageColor('verified')).toBe('teal')
    expect(getOfficialChannelStageColor('missing')).toBe('red')
    expect(getOfficialChannelStageColor('unknown')).toBe('gray')
  })
})
