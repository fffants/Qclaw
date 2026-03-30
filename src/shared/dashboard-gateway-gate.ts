export type DashboardPhase1Target = 'setup' | 'dashboard'
export type DashboardEntryAppState = 'setup' | 'gateway-bootstrap'

export function resolveAppStateForPhase1Target(target: DashboardPhase1Target): DashboardEntryAppState {
  return target === 'dashboard' ? 'gateway-bootstrap' : 'setup'
}

export function resolveAppStateAfterSetupCompletion(): 'gateway-bootstrap' {
  return 'gateway-bootstrap'
}
