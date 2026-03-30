import type { CliResult } from './cli'

export type SkillMutationKind = 'install' | 'uninstall'

interface ActiveSkillMutation {
  kind: SkillMutationKind
  target: string
}

export const SKILL_MUTATION_BUSY_MARKER = 'QCLAW_SKILL_MUTATION_BUSY'

let activeSkillMutation: ActiveSkillMutation | null = null

function normalizeMutationTarget(target: string): string {
  const normalized = String(target || '').trim()
  return normalized || 'unknown'
}

function getSkillMutationActionLabel(kind: SkillMutationKind): string {
  return kind === 'install' ? '安装' : '删除'
}

export function buildSkillMutationBusyResult(
  activeMutation: ActiveSkillMutation | null = activeSkillMutation
): CliResult {
  const action = activeMutation ? getSkillMutationActionLabel(activeMutation.kind) : '处理'
  const target = normalizeMutationTarget(activeMutation?.target || '')

  return {
    ok: false,
    stdout: '',
    stderr: [
      SKILL_MUTATION_BUSY_MARKER,
      `当前正在${action} Skill：${target}`,
      '请等待当前 Skill 操作完成，或先取消后再试。',
    ].join('\n'),
    code: 1,
  }
}

export async function withExclusiveSkillMutation<T extends CliResult>(
  kind: SkillMutationKind,
  target: string,
  operation: () => Promise<T>
): Promise<T | CliResult> {
  if (activeSkillMutation) {
    return buildSkillMutationBusyResult(activeSkillMutation)
  }

  activeSkillMutation = {
    kind,
    target: normalizeMutationTarget(target),
  }

  try {
    return await operation()
  } finally {
    activeSkillMutation = null
  }
}

export function getActiveSkillMutationForTests(): { kind: SkillMutationKind; target: string } | null {
  if (!activeSkillMutation) return null
  return { ...activeSkillMutation }
}

export function resetSkillMutationGuardForTests(): void {
  activeSkillMutation = null
}
