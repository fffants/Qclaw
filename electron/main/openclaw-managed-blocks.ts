import type { OpenClawShellManagedBlockRecord } from '../../src/shared/openclaw-phase2'
import {
  QCLAW_OPENCLAW_SHELL_BLOCK_END,
  QCLAW_OPENCLAW_SHELL_BLOCK_START,
  resolveShellInitFiles,
} from './openclaw-cleanup'

export function resolveManagedShellBlockTargets(
  now: string = new Date().toISOString()
): OpenClawShellManagedBlockRecord[] {
  return resolveShellInitFiles().map((filePath) => ({
    filePath,
    blockId: `shell-init:${filePath}`,
    blockType: 'openclaw-shell-init',
    startMarker: QCLAW_OPENCLAW_SHELL_BLOCK_START,
    endMarker: QCLAW_OPENCLAW_SHELL_BLOCK_END,
    source: 'qclaw-lite',
    firstManagedAt: now,
    lastManagedAt: now,
  }))
}

export function describeManagedShellBlockScopes(): string[] {
  const targets = resolveManagedShellBlockTargets()
  if (targets.length === 0) {
    return ['如后续接管 shell 初始化，仅会操作 Qclaw 自己写入的 managed block。']
  }

  return targets.map(
    (target) => `如后续接管 shell 初始化，仅会操作 ${target.filePath} 中由 Qclaw 写入的 managed block。`
  )
}
