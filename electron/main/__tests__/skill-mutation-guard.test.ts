import { afterEach, describe, expect, it } from 'vitest'
import {
  getActiveSkillMutationForTests,
  resetSkillMutationGuardForTests,
  SKILL_MUTATION_BUSY_MARKER,
  withExclusiveSkillMutation,
} from '../skill-mutation-guard'

describe('skill-mutation-guard', () => {
  afterEach(() => {
    resetSkillMutationGuardForTests()
  })

  it('rejects concurrent skill mutations instead of queueing them', async () => {
    let releaseFirst!: () => void
    const first = withExclusiveSkillMutation('install', 'token-optimizer', async () => {
      await new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
      return {
        ok: true,
        stdout: 'installed',
        stderr: '',
        code: 0,
      }
    })

    expect(getActiveSkillMutationForTests()).toEqual({
      kind: 'install',
      target: 'token-optimizer',
    })

    const second = await withExclusiveSkillMutation('uninstall', 'prompt-injection-guard', async () => ({
      ok: true,
      stdout: 'removed',
      stderr: '',
      code: 0,
    }))

    expect(second.ok).toBe(false)
    expect(second.stderr).toContain(SKILL_MUTATION_BUSY_MARKER)
    expect(second.stderr).toContain('当前正在安装 Skill：token-optimizer')

    releaseFirst()
    await expect(first).resolves.toMatchObject({ ok: true })
    expect(getActiveSkillMutationForTests()).toBeNull()
  })

  it('releases the guard after the active mutation completes', async () => {
    await withExclusiveSkillMutation('install', 'token-optimizer', async () => ({
      ok: true,
      stdout: '',
      stderr: '',
      code: 0,
    }))

    const next = await withExclusiveSkillMutation('uninstall', 'token-optimizer', async () => ({
      ok: true,
      stdout: '',
      stderr: '',
      code: 0,
    }))

    expect(next.ok).toBe(true)
    expect(getActiveSkillMutationForTests()).toBeNull()
  })
})
