import type { CombinedUpdateCheckResult, CombinedUpdateRunResult } from '../../src/shared/openclaw-phase4'
import { checkOpenClawUpgrade, runOpenClawUpgrade } from './openclaw-upgrade-service'
import {
  checkQClawUpdate,
  downloadQClawUpdate,
  getQClawUpdateStatus,
  installQClawUpdate,
} from './qclaw-update-service'

function canRunCombinedOpenClawUpgrade(check: CombinedUpdateCheckResult['openclaw']): boolean {
  return (
    check.policyState === 'supported_not_target' &&
    check.enforcement === 'optional_upgrade' &&
    check.targetAction === 'upgrade' &&
    Boolean(check.targetVersion)
  )
}

export async function checkCombinedUpdate(): Promise<CombinedUpdateCheckResult> {
  const openclaw = await checkOpenClawUpgrade()
  const qclawBase = await getQClawUpdateStatus()
  const qclaw =
    qclawBase.supported && qclawBase.configured && !qclawBase.downloaded
      ? await checkQClawUpdate()
      : qclawBase

  const warnings = [...openclaw.warnings]
  if (qclaw.message && (!qclaw.configured || qclaw.status === 'error')) {
    warnings.push(qclaw.message)
  }

  const qclawReady = qclaw.status === 'available' || qclaw.status === 'downloaded'

  return {
    ok: openclaw.ok && qclaw.ok,
    openclaw,
    qclaw,
    canRun: canRunCombinedOpenClawUpgrade(openclaw) && qclaw.supported && qclaw.configured && qclawReady,
    warnings,
  }
}

export async function runCombinedUpdate(): Promise<CombinedUpdateRunResult> {
  const check = await checkCombinedUpdate()
  if (!canRunCombinedOpenClawUpgrade(check.openclaw)) {
    return {
      ok: false,
      blocked: true,
      openclawResult: null,
      qclawStatus: check.qclaw,
      warnings: check.warnings,
      message: check.openclaw.manualHint || '当前 OpenClaw 不支持自动升级。',
      errorCode: 'openclaw_blocked',
    }
  }

  if (!check.qclaw.supported || !check.qclaw.configured) {
    return {
      ok: false,
      blocked: true,
      openclawResult: null,
      qclawStatus: check.qclaw,
      warnings: check.warnings,
      message: check.qclaw.message || 'Qclaw 自动更新当前不可用。',
      errorCode: 'qclaw_unavailable',
    }
  }

  let qclawStatus = check.qclaw
  if (qclawStatus.status !== 'downloaded') {
    const downloadResult = await downloadQClawUpdate()
    qclawStatus = downloadResult.status
    if (!downloadResult.ok || qclawStatus.status !== 'downloaded') {
      return {
        ok: false,
        blocked: false,
        openclawResult: null,
        qclawStatus,
        warnings: check.warnings,
        message: downloadResult.message || 'Qclaw Lite 更新包下载失败。',
        errorCode: 'qclaw_download_failed',
      }
    }
  }

  const openclawResult = await runOpenClawUpgrade()
  if (!openclawResult.ok) {
    return {
      ok: false,
      blocked: openclawResult.blocked,
      openclawResult,
      qclawStatus,
      warnings: [...check.warnings, ...(openclawResult.warnings || [])],
      message: openclawResult.message || 'OpenClaw 升级失败，Qclaw 更新不会继续安装。',
      errorCode: 'openclaw_upgrade_failed',
    }
  }

  const installResult = await installQClawUpdate()
  return {
    ok: installResult.ok,
    blocked: false,
    openclawResult,
    qclawStatus: installResult.status,
    warnings: [...check.warnings, ...(openclawResult.warnings || [])],
    message: installResult.message || 'Qclaw 即将安装更新。',
  }
}
