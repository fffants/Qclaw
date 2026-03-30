import { describe, expect, it } from 'vitest'

import { resolveGatewayApplyAction } from '../gateway-apply-policy'

describe('gateway apply policy', () => {
  it('resolves restart for runtime topology paths', () => {
    const decision = resolveGatewayApplyAction({
      changedJsonPaths: ['$.channels.feishu.enabled'],
    })

    expect(decision.action).toBe('restart')
    expect(decision.reason).toBe('matched-runtime-topology-paths')
  })

  it('resolves hot-reload for secrets changes', () => {
    const decision = resolveGatewayApplyAction({
      changedJsonPaths: ['$.gateway.auth.token'],
      changedEnvKeys: ['OPENAI_API_KEY'],
    })

    expect(decision.action).toBe('hot-reload')
    expect(decision.reason).toBe('matched-secrets-paths')
    expect(decision.matched).toContain('env:OPENAI_API_KEY')
  })

  it('resolves none for non-runtime paths', () => {
    const decision = resolveGatewayApplyAction({
      changedJsonPaths: ['$.ui.panel.collapsed'],
    })

    expect(decision.action).toBe('none')
    expect(decision.reason).toBe('non-runtime-config-change')
  })
})

