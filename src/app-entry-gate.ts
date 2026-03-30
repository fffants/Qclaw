export type AppState =
  | 'welcome'
  | 'env-check'
  | 'setup'
  | 'gateway-bootstrap'
  | 'dashboard'

export function canOpenExternalModelsPage(appState: AppState): boolean {
  return appState === 'dashboard'
}
