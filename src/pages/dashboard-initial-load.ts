export interface DashboardInitialLoadRunner {
  fetchGatewayStatus: () => Promise<void>
  fetchConfigSnapshot: () => Promise<Record<string, any> | null>
  refreshProvidersWithModelStatus: (config: Record<string, any> | null) => Promise<void>
  setLoading: (loading: boolean) => void
}

export async function runDashboardInitialLoad(runner: DashboardInitialLoadRunner): Promise<void> {
  try {
    const [, config] = await Promise.all([
      runner.fetchGatewayStatus(),
      runner.fetchConfigSnapshot(),
    ])
    runner.setLoading(false)
    void runner.refreshProvidersWithModelStatus(config).catch(() => {})
    return
  } catch {
    runner.setLoading(false)
  }
}
