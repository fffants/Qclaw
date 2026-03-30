import { cancelActiveCommands } from './cli'
import { stopFeishuInstallerSession } from './feishu-installer-session'
import { stopWeixinInstallerSession } from './weixin-installer-session'

const EXIT_CANCEL_DOMAINS = [
  'gateway',
  'config-write',
  'chat',
  'oauth',
  'capabilities',
  'models',
  'env',
  'plugin-install',
  'feishu-installer',
  'weixin-installer',
  'upgrade',
  'env-setup',
  'global',
] as const

export interface AppExitCleanupResult {
  canceledDomains: string[]
  failedDomains: string[]
  installerStopped: boolean
}

function shouldLogCleanupSummary(): boolean {
  return process.env.NODE_ENV !== 'test'
}

export async function runAppExitCleanup(): Promise<AppExitCleanupResult> {
  const domainCancelResult = await cancelActiveCommands([...EXIT_CANCEL_DOMAINS])
    .catch(() => ({
      canceledDomains: [] as string[],
      failedDomains: [...EXIT_CANCEL_DOMAINS] as string[],
      untouchedDomains: [] as string[],
    }))
  const canceledDomains = [...domainCancelResult.canceledDomains]
  const failedDomains = [...domainCancelResult.failedDomains]

  let installerStopped = false
  try {
    const [feishuStopResult, weixinStopResult] = await Promise.all([
      stopFeishuInstallerSession(),
      stopWeixinInstallerSession(),
    ])
    installerStopped = Boolean(feishuStopResult?.ok) && Boolean(weixinStopResult?.ok)
  } catch {
    installerStopped = false
  }

  if (shouldLogCleanupSummary()) {
    console.info(
      `[app-exit-cleanup] canceledDomains=${canceledDomains.join(',') || '-'} failedDomains=${failedDomains.join(',') || '-'} installerStopped=${installerStopped}`
    )
  }

  return {
    canceledDomains,
    failedDomains,
    installerStopped,
  }
}
