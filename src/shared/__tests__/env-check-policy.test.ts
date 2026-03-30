import { describe, expect, it } from 'vitest'
import { ENV_CHECK_UI_POLICY, getEnvCheckSupportActionsForIssueKind } from '../env-check-policy'

describe('ENV_CHECK_UI_POLICY', () => {
  it('keeps loading tips centralized for EnvCheck', () => {
    expect(ENV_CHECK_UI_POLICY.loadingTips).toContain('正在检查系统环境...')
    expect(ENV_CHECK_UI_POLICY.loadingTips).toContain('请确保网络连接正常')
  })

  it('returns Node manual download action for supported issue kinds', () => {
    expect(getEnvCheckSupportActionsForIssueKind('download-failed')).toEqual([
      {
        kind: 'external-link',
        label: '打开 Node 官网',
        href: 'https://nodejs.org/',
      },
    ])
    expect(getEnvCheckSupportActionsForIssueKind('blocked-by-policy')).toHaveLength(1)
  })

  it('does not expose Node manual download action for unrelated issue kinds', () => {
    expect(getEnvCheckSupportActionsForIssueKind('permission-denied')).toEqual([])
    expect(getEnvCheckSupportActionsForIssueKind(undefined)).toEqual([])
  })
})
