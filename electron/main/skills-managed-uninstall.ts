const { lstat, readFile, realpath, rm, stat, writeFile } =
  process.getBuiltinModule('node:fs/promises') as typeof import('node:fs/promises')
const path = process.getBuiltinModule('node:path') as typeof import('node:path')

import type { CliResult } from './cli'
import type { OpenClawSkillLocations } from './skills-paths'
import { resolveClawHubLockFilePath } from './skills-paths'
import {
  findExactSafeSkillSlugMatch,
  resolveManagedSkillFallbackPath,
  resolveSkillPathUnderRoot,
} from './skills-uninstall-safety'

export async function removeSkillDirectoryLocally(
  safeName: string,
  skillsRootDir: string,
  options: {
    homeDir?: string
    rootKind?: 'managed' | 'workspace'
  } = {}
): Promise<CliResult | null> {
  const resolvedSkillPath = resolveSkillPathUnderRoot(skillsRootDir, safeName, options)
  if (!resolvedSkillPath.ok) {
    return {
      ok: false,
      stdout: '',
      stderr: `Refusing to remove skill from unsafe path (${resolvedSkillPath.error}).`,
      code: 1,
    }
  }

  const skillEntry = await stat(resolvedSkillPath.targetPath, { bigint: false }).catch(() => null)
  if (!skillEntry) {
    return null
  }
  const skillLinkEntry = await lstat(resolvedSkillPath.targetPath).catch(() => null)
  if (skillLinkEntry?.isSymbolicLink()) {
    return {
      ok: false,
      stdout: '',
      stderr: `Refusing to remove symlinked skill path: ${resolvedSkillPath.targetPath}`,
      code: 1,
    }
  }
  if (!skillEntry.isDirectory()) {
    return {
      ok: false,
      stdout: '',
      stderr: `Refusing to remove non-directory skill path: ${resolvedSkillPath.targetPath}`,
      code: 1,
    }
  }

  const realRoot = await realpath(resolvedSkillPath.skillsRoot).catch(() => resolvedSkillPath.skillsRoot)
  const realTarget = await realpath(resolvedSkillPath.targetPath).catch(() => resolvedSkillPath.targetPath)
  const relativeRealTarget = path.relative(realRoot, realTarget)
  if (!relativeRealTarget || relativeRealTarget.startsWith('..') || path.isAbsolute(relativeRealTarget)) {
    return {
      ok: false,
      stdout: '',
      stderr: `Refusing to remove skill whose real path escapes the skills root: ${resolvedSkillPath.targetPath}`,
      code: 1,
    }
  }

  try {
    await rm(resolvedSkillPath.targetPath, { recursive: true, force: true })
  } catch (error: any) {
    return {
      ok: false,
      stdout: '',
      stderr: error?.message || `Failed to remove skill path: ${resolvedSkillPath.targetPath}`,
      code: 1,
    }
  }
  return {
    ok: true,
    stdout: `Removed ${resolvedSkillPath.targetPath}`,
    stderr: '',
    code: 0,
  }
}

export async function removeManagedSkillLocally(
  safeName: string,
  locations: OpenClawSkillLocations,
  options: {
    homeDir?: string
  } = {}
): Promise<CliResult | null> {
  const lockPath = resolveClawHubLockFilePath(locations)
  let lock: Record<string, any> | null = null
  let matchedSlug = safeName

  try {
    lock = JSON.parse(await readFile(lockPath, 'utf8')) as Record<string, any>
    const slugs = Object.keys(lock.skills || {})
    const exactMatch = findExactSafeSkillSlugMatch(safeName, slugs)
    if (exactMatch) {
      matchedSlug = exactMatch
    }
  } catch {
    // Ignore lock read failures; local directory uninstall can still work.
  }

  const resolvedFallbackPath = resolveManagedSkillFallbackPath(locations.managedSkillsDir, matchedSlug, options)
  if (!resolvedFallbackPath.ok) {
    return {
      ok: false,
      stdout: '',
      stderr: `Refusing to remove managed skill from unsafe path (${resolvedFallbackPath.error}).`,
      code: 1,
    }
  }

  let targetExists = false
  try {
    await stat(resolvedFallbackPath.targetPath)
    targetExists = true
  } catch {
    targetExists = false
  }
  const targetLinkEntry = targetExists
    ? await lstat(resolvedFallbackPath.targetPath).catch(() => null)
    : null
  if (targetLinkEntry?.isSymbolicLink()) {
    return {
      ok: false,
      stdout: '',
      stderr: `Refusing to remove symlinked managed skill path: ${resolvedFallbackPath.targetPath}`,
      code: 1,
    }
  }

  const lockHasSkill = Boolean(lock?.skills && typeof lock.skills === 'object' && matchedSlug in lock.skills)
  if (!targetExists && !lockHasSkill) {
    return null
  }

  const realRoot = await realpath(resolvedFallbackPath.skillsRoot).catch(() => resolvedFallbackPath.skillsRoot)
  const realTarget = targetExists
    ? await realpath(resolvedFallbackPath.targetPath).catch(() => resolvedFallbackPath.targetPath)
    : resolvedFallbackPath.targetPath
  const relativeRealTarget = path.relative(realRoot, realTarget)
  if (targetExists && (!relativeRealTarget || relativeRealTarget.startsWith('..') || path.isAbsolute(relativeRealTarget))) {
    return {
      ok: false,
      stdout: '',
      stderr: `Refusing to remove managed skill whose real path escapes the skills root: ${resolvedFallbackPath.targetPath}`,
      code: 1,
    }
  }

  try {
    await rm(resolvedFallbackPath.targetPath, { recursive: true, force: true })
  } catch (error: any) {
    return {
      ok: false,
      stdout: '',
      stderr: error?.message || `Failed to remove managed skill path: ${resolvedFallbackPath.targetPath}`,
      code: 1,
    }
  }

  if (lockHasSkill && lock?.skills && typeof lock.skills === 'object') {
    delete lock.skills[matchedSlug]
    await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8').catch(() => {})
  }

  return {
    ok: true,
    stdout: `Removed ${resolvedFallbackPath.targetPath}`,
    stderr: '',
    code: 0,
  }
}
