import { describe, expect, it } from 'vitest'
import {
  resolveAppStateAfterSetupCompletion,
  resolveAppStateForPhase1Target,
} from '../dashboard-gateway-gate'

describe('dashboard gateway gate routing', () => {
  it('routes dashboard phase-1 target through gateway bootstrap', () => {
    expect(resolveAppStateForPhase1Target('dashboard')).toBe('gateway-bootstrap')
  })

  it('keeps setup target on setup', () => {
    expect(resolveAppStateForPhase1Target('setup')).toBe('setup')
  })

  it('routes setup completion through gateway bootstrap before dashboard', () => {
    expect(resolveAppStateAfterSetupCompletion()).toBe('gateway-bootstrap')
  })
})
