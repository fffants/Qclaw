import { afterEach, describe, expect, it } from 'vitest'

import { removeManagedSkillLocally, removeSkillDirectoryLocally } from '../skills-managed-uninstall'
import type { OpenClawSkillLocations } from '../skills-paths'

const { tmpdir } = process.getBuiltinModule('node:os') as typeof import('node:os')
const { join } = process.getBuiltinModule('node:path') as typeof import('node:path')
const { mkdtemp, mkdir, readFile, rm, symlink, writeFile } =
  process.getBuiltinModule('node:fs/promises') as typeof import('node:fs/promises')

const tempDirs: string[] = []

async function createLocations(): Promise<OpenClawSkillLocations & { homeDir: string; stateRoot: string }> {
  const root = await mkdtemp(join(tmpdir(), 'qclaw-skill-uninstall-'))
  const homeDir = join(root, 'home')
  const stateRoot = join(homeDir, '.openclaw')
  tempDirs.push(root)
  return {
    homeDir,
    stateRoot,
    workspaceDir: join(stateRoot, 'workspace-test'),
    workspaceSkillsDir: join(stateRoot, 'workspace-test', 'skills'),
    managedSkillsDir: join(stateRoot, 'skills'),
    clawhubWorkdir: stateRoot,
    clawhubDir: 'skills',
  }
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (!dir) continue
    await rm(dir, { recursive: true, force: true })
  }
})

describe('skills managed uninstall', () => {
  it('removes a workspace skill directory locally', async () => {
    const locations = await createLocations()
    await mkdir(join(locations.workspaceSkillsDir, 'token-manager', 'scripts'), { recursive: true })
    await writeFile(
      join(locations.workspaceSkillsDir, 'token-manager', 'SKILL.md'),
      '# Token Manager\n',
      'utf8'
    )

    const result = await removeSkillDirectoryLocally('token-manager', locations.workspaceSkillsDir, {
      homeDir: locations.homeDir,
      rootKind: 'workspace',
    })
    expect(result?.ok).toBe(true)
  })

  it('refuses to remove a symlinked workspace skill directory', async () => {
    const locations = await createLocations()
    await mkdir(join(locations.workspaceSkillsDir), { recursive: true })
    await mkdir(join(locations.stateRoot, 'outside-target'), { recursive: true })
    await symlink(
      join(locations.stateRoot, 'outside-target'),
      join(locations.workspaceSkillsDir, 'token-manager')
    )

    const result = await removeSkillDirectoryLocally('token-manager', locations.workspaceSkillsDir, {
      homeDir: locations.homeDir,
      rootKind: 'workspace',
    })
    expect(result?.ok).toBe(false)
    expect(result?.stderr).toContain('symlinked')
  })

  it('removes a managed skill directory and lock entry locally', async () => {
    const locations = await createLocations()
    await mkdir(join(locations.managedSkillsDir, 'prompt-injection-guard'), { recursive: true })
    await mkdir(join(locations.clawhubWorkdir, '.clawhub'), { recursive: true })
    await writeFile(
      join(locations.clawhubWorkdir, '.clawhub', 'lock.json'),
      JSON.stringify(
        {
          version: 1,
          skills: {
            'prompt-injection-guard': {
              version: '1.0.0',
            },
          },
        },
        null,
        2
      ),
      'utf8'
    )

    const result = await removeManagedSkillLocally('prompt-injection-guard', locations, {
      homeDir: locations.homeDir,
    })
    expect(result?.ok).toBe(true)

    const lock = JSON.parse(
      await readFile(join(locations.clawhubWorkdir, '.clawhub', 'lock.json'), 'utf8')
    ) as Record<string, any>
    expect(lock.skills).toEqual({})
  })

  it('returns null when neither lock entry nor directory exists', async () => {
    const locations = await createLocations()
    const result = await removeManagedSkillLocally('missing-skill', locations, {
      homeDir: locations.homeDir,
    })
    expect(result).toBeNull()
  })
})
