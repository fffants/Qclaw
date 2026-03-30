import { describe, expect, it } from 'vitest'
import {
  buildManagedSkillNameSet,
  extractSkillEntriesFromPayload,
  findVisibleInstalledSkillName,
  resolveInstalledSkillVerificationState,
} from '../skills-visibility'

describe('skills visibility helpers', () => {
  it('extracts only valid skill entries from payload', () => {
    expect(
      extractSkillEntriesFromPayload({
        skills: [
          { name: 'token-optimizer', source: 'openclaw-managed' },
          { name: '  ', source: 'openclaw-managed' },
          null,
          { source: 'openclaw-managed' },
        ],
      })
    ).toEqual([{ name: 'token-optimizer', source: 'openclaw-managed' }])
  })

  it('tracks managed skill names case-insensitively', () => {
    expect(
      buildManagedSkillNameSet({
        skills: [
          { name: 'Token-Optimizer', source: 'openclaw-managed' },
          { name: 'workspace-copy', source: 'openclaw-workspace' },
        ],
      })
    ).toEqual(new Set(['token-optimizer']))
  })

  it('accepts an exact managed slug match as visible', () => {
    expect(
      findVisibleInstalledSkillName({
        slug: 'token-optimizer',
        beforeManagedSkillNames: new Set(),
        allowDiffDetection: false,
        payload: {
          skills: [{ name: 'Token-Optimizer', source: 'openclaw-managed' }],
        },
      })
    ).toBe('Token-Optimizer')
  })

  it('accepts a newly added managed skill even when slug and visible name differ', () => {
    expect(
      findVisibleInstalledSkillName({
        slug: 'my-skill-pack',
        beforeManagedSkillNames: new Set(['existing-skill']),
        allowDiffDetection: true,
        payload: {
          skills: [
            { name: 'existing-skill', source: 'openclaw-managed' },
            { name: 'My Skill', source: 'openclaw-managed' },
          ],
        },
      })
    ).toBe('My Skill')
  })

  it('does not treat a workspace-only same-name skill as a successful install', () => {
    expect(
      findVisibleInstalledSkillName({
        slug: 'token-optimizer',
        beforeManagedSkillNames: new Set(['existing-skill']),
        allowDiffDetection: true,
        payload: {
          skills: [
            { name: 'existing-skill', source: 'openclaw-managed' },
            { name: 'token-optimizer', source: 'openclaw-workspace' },
          ],
        },
      })
    ).toBeNull()
  })

  it('does not report a pre-existing managed skill with case-only changes as newly installed', () => {
    expect(
      findVisibleInstalledSkillName({
        slug: 'another-skill',
        beforeManagedSkillNames: new Set(['token-optimizer']),
        allowDiffDetection: true,
        payload: {
          skills: [{ name: 'Token-Optimizer', source: 'openclaw-managed' }],
        },
      })
    ).toBeNull()
  })

  it('treats a visible skill as verified immediately', () => {
    expect(
      resolveInstalledSkillVerificationState({
        hasBeforePayload: false,
        visibility: {
          visibleName: 'Token-Optimizer',
          payload: {
            skills: [{ name: 'Token-Optimizer', source: 'openclaw-managed' }],
          },
        },
      })
    ).toBe('visible')
  })

  it('only allows auto-rollback when both baseline and after-state payload are reliable', () => {
    expect(
      resolveInstalledSkillVerificationState({
        hasBeforePayload: true,
        visibility: {
          visibleName: '',
          payload: {
            skills: [{ name: 'workspace-copy', source: 'openclaw-workspace' }],
          },
        },
      })
    ).toBe('invisible-reliable')

    expect(
      resolveInstalledSkillVerificationState({
        hasBeforePayload: false,
        visibility: {
          visibleName: '',
          payload: {
            skills: [{ name: 'My Skill', source: 'openclaw-managed' }],
          },
        },
      })
    ).toBe('uncertain')

    expect(
      resolveInstalledSkillVerificationState({
        hasBeforePayload: true,
        visibility: null,
      })
    ).toBe('uncertain')
  })
})
