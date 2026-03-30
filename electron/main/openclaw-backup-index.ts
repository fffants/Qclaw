import type { OpenClawInstallCandidate } from '../../src/shared/openclaw-phase1'
import type {
  OpenClawBackupEntry,
  OpenClawBackupDeleteResult,
  OpenClawBackupListResult,
  OpenClawBackupScopeAvailability,
  OpenClawBackupType,
} from '../../src/shared/openclaw-phase3'
import { atomicWriteJson } from './atomic-write'
import {
  recordBaselineBackupDeletionBypass,
} from './openclaw-baseline-backup-gate'
import {
  ensureWritableOpenClawBackupRootDirectory,
  listKnownOpenClawBackupRootDirectories,
  resolvePreferredOpenClawBackupDirectory,
  type OpenClawBackupRootResolution,
} from './openclaw-backup-roots'
import { resolveOpenClawPathsFromStateRoot } from './openclaw-paths'

const fs = process.getBuiltinModule('node:fs') as typeof import('node:fs')
const path = process.getBuiltinModule('node:path') as typeof import('node:path')
const { createHash } = process.getBuiltinModule('node:crypto') as typeof import('node:crypto')
const { access, cp, mkdir, readFile, readdir, rm } = fs.promises

interface BackupManifestCandidate {
  backupId?: string
  snapshotId?: string
  createdAt?: string
  archivePath?: string
  backupType?: string
  snapshotType?: string
  installFingerprint?: string
  candidate?: {
    version?: string
    configPath?: string
    stateRoot?: string
  }
  scopeAvailability?: OpenClawBackupScopeAvailability
}

function toIsoTimestamp(value?: string): string {
  const normalized = String(value || '').trim()
  if (!normalized) return new Date(0).toISOString()
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString()
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath)
    return true
  } catch {
    return false
  }
}

function resolveBackupType(manifest: BackupManifestCandidate): OpenClawBackupType {
  const rawType = String(manifest.backupType || manifest.snapshotType || '').trim()
  if (
    rawType === 'baseline-backup' ||
    rawType === 'manual-backup' ||
    rawType === 'config-snapshot' ||
    rawType === 'cleanup-backup' ||
    rawType === 'restore-preflight' ||
    rawType === 'upgrade-preflight'
  ) {
    return rawType
  }
  return 'unknown'
}

async function resolveBackupScopeAvailability(archivePath: string): Promise<OpenClawBackupScopeAvailability> {
  const homeDirArchive = path.join(archivePath, 'openclaw-home')
  const configRootPath = path.join(archivePath, 'openclaw.json')
  const envRootPath = path.join(archivePath, '.env')
  const credentialsRootPath = path.join(archivePath, 'credentials')

  const configHomePath = path.join(homeDirArchive, 'openclaw.json')
  const envHomePath = path.join(homeDirArchive, '.env')
  const credentialsHomePath = path.join(homeDirArchive, 'credentials')

  const hasHomeDir = await pathExists(homeDirArchive)
  const hasConfigData =
    (await pathExists(configRootPath)) || (hasHomeDir && (await pathExists(configHomePath)))
  const hasEnvData =
    (await pathExists(envRootPath)) || (hasHomeDir && (await pathExists(envHomePath)))
  const hasCredentialsData =
    (await pathExists(credentialsRootPath)) || (hasHomeDir && (await pathExists(credentialsHomePath)))

  return {
    hasConfigData,
    hasMemoryData: hasHomeDir,
    hasEnvData,
    hasCredentialsData,
  }
}

async function parseBackupEntry(archivePath: string): Promise<OpenClawBackupEntry | null> {
  const manifestPath = path.join(archivePath, 'manifest.json')
  if (!(await pathExists(manifestPath))) return null

  try {
    const raw = await readFile(manifestPath, 'utf8')
    const manifest = JSON.parse(raw) as BackupManifestCandidate
    const backupId = String(manifest.backupId || manifest.snapshotId || path.basename(archivePath)).trim()
    if (!backupId) return null

    return {
      backupId,
      createdAt: toIsoTimestamp(manifest.createdAt),
      archivePath,
      manifestPath,
      type: resolveBackupType(manifest),
      installFingerprint: String(manifest.installFingerprint || '').trim() || null,
      sourceVersion: String(manifest.candidate?.version || '').trim() || null,
      sourceConfigPath: String(manifest.candidate?.configPath || '').trim() || null,
      sourceStateRoot: String(manifest.candidate?.stateRoot || '').trim() || null,
      scopeAvailability: await resolveBackupScopeAvailability(archivePath),
    }
  } catch {
    return null
  }
}

function buildManagedBackupId(
  type: Exclude<OpenClawBackupType, 'baseline-backup' | 'config-snapshot' | 'unknown'>,
  identitySeed: string
): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const shortFingerprint = createHash('sha256')
    .update(String(identitySeed || 'unknown'))
    .digest('hex')
    .slice(0, 10)
  return `${type}-${stamp}-${shortFingerprint}`
}

function buildManagedBackupManifest(params: {
  backupId: string
  createdAt: string
  archivePath: string
  backupType: OpenClawBackupType
  installFingerprint: string
  candidate: OpenClawInstallCandidate
  scopeAvailability: OpenClawBackupScopeAvailability
}): Record<string, unknown> {
  return {
    backupId: params.backupId,
    createdAt: params.createdAt,
    archivePath: params.archivePath,
    backupType: params.backupType,
    installFingerprint: params.installFingerprint,
    scopeAvailability: params.scopeAvailability,
    candidate: {
      candidateId: params.candidate.candidateId,
      version: params.candidate.version,
      binaryPath: params.candidate.binaryPath,
      resolvedBinaryPath: params.candidate.resolvedBinaryPath,
      packageRoot: params.candidate.packageRoot,
      installSource: params.candidate.installSource,
      configPath: params.candidate.configPath,
      stateRoot: params.candidate.stateRoot,
    },
  }
}

function buildStateRootBackupManifest(params: {
  backupId: string
  createdAt: string
  archivePath: string
  backupType: OpenClawBackupType
  scopeAvailability: OpenClawBackupScopeAvailability
  stateRoot: string
}): Record<string, unknown> {
  return {
    backupId: params.backupId,
    createdAt: params.createdAt,
    archivePath: params.archivePath,
    backupType: params.backupType,
    installFingerprint: null,
    scopeAvailability: params.scopeAvailability,
    candidate: {
      version: null,
      stateRoot: params.stateRoot,
    },
  }
}

async function copyIfExists(sourcePath: string, targetPath: string): Promise<void> {
  if (!(await pathExists(sourcePath))) return
  await cp(sourcePath, targetPath, { recursive: true, force: true })
}

function normalizePathForCompare(targetPath: string): string {
  const normalized = path.resolve(String(targetPath || '').trim())
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function isPathWithinParent(targetPath: string, parentPath: string): boolean {
  const normalizedTarget = normalizePathForCompare(targetPath)
  const normalizedParent = normalizePathForCompare(parentPath)
  if (!normalizedTarget || !normalizedParent) return false
  if (normalizedTarget === normalizedParent) return true
  return normalizedTarget.startsWith(`${normalizedParent}${path.sep}`)
}

export function resolveBackupRootDirectory(): string {
  return resolvePreferredOpenClawBackupDirectory()
}

export async function ensureBackupRootDirectoryExists(): Promise<OpenClawBackupRootResolution> {
  return ensureWritableOpenClawBackupRootDirectory()
}

export async function resolveOpenClawBackupDirectoryToOpen(requestedPath?: string): Promise<string> {
  const normalizedRequestedPath = String(requestedPath || '').trim()
  if (normalizedRequestedPath) {
    const { entries } = await listOpenClawBackups()
    const matchedEntry = entries.find((entry) => entry.archivePath === normalizedRequestedPath)
    if (matchedEntry) {
      return matchedEntry.archivePath
    }
  }

  return (await ensureBackupRootDirectoryExists()).effectiveRootDirectory
}

async function scanBackupEntriesFromRoot(rootDirectory: string): Promise<OpenClawBackupEntry[]> {
  if (!(await pathExists(rootDirectory))) return []

  let children
  try {
    children = await readdir(rootDirectory, { withFileTypes: true })
  } catch {
    return []
  }

  return (
    await Promise.all(
      children
        .filter((entry) => entry.isDirectory())
        .map((entry) => parseBackupEntry(path.join(rootDirectory, entry.name)))
    )
  ).filter((entry): entry is OpenClawBackupEntry => Boolean(entry))
}

export async function listOpenClawBackups(): Promise<OpenClawBackupListResult> {
  const preferredRootDirectory = resolvePreferredOpenClawBackupDirectory()
  const searchedRootDirectories = listKnownOpenClawBackupRootDirectories()
  const rootResolution = await ensureWritableOpenClawBackupRootDirectory().catch(() => null)
  const warnings = [...(rootResolution?.warnings || [])]
  const entries = (
    await Promise.all(searchedRootDirectories.map((rootDirectory) => scanBackupEntriesFromRoot(rootDirectory)))
  )
    .flat()
    .filter((entry, index, allEntries) =>
      allEntries.findIndex((candidate) => candidate.archivePath === entry.archivePath) === index
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))

  return {
    rootDirectory: rootResolution?.effectiveRootDirectory || preferredRootDirectory,
    preferredRootDirectory,
    fallbackRootDirectory: rootResolution?.fallbackRootDirectory || null,
    usedFallbackRoot: Boolean(rootResolution?.usedFallbackRoot),
    searchedRootDirectories,
    warnings,
    entries,
  }
}

export async function getOpenClawBackupEntry(backupId: string): Promise<OpenClawBackupEntry | null> {
  const normalizedBackupId = String(backupId || '').trim()
  if (!normalizedBackupId) return null
  const { entries } = await listOpenClawBackups()
  return entries.find((entry) => entry.backupId === normalizedBackupId) || null
}

async function recordBaselineDeletionWarning(entry: OpenClawBackupEntry): Promise<string | null> {
  if (entry.type !== 'baseline-backup' || !String(entry.installFingerprint || '').trim()) {
    return null
  }

  try {
    await recordBaselineBackupDeletionBypass({
      installFingerprint: String(entry.installFingerprint || '').trim(),
      sourcePath: String(entry.sourceStateRoot || '').trim(),
    })
    return null
  } catch (error) {
    return `备份已删除，但未能记录手动备份责任：${error instanceof Error ? error.message : String(error)}`
  }
}

export async function deleteOpenClawBackup(backupId: string): Promise<OpenClawBackupDeleteResult> {
  const entry = await getOpenClawBackupEntry(backupId)
  if (!entry) {
    return {
      ok: false,
      deletedBackupIds: [],
      deletedCount: 0,
      warnings: [],
      errors: ['未找到指定备份。'],
      message: '未找到指定备份。',
      errorCode: 'backup_not_found',
    }
  }

  try {
    await rm(entry.archivePath, { recursive: true, force: true })
    const warning = await recordBaselineDeletionWarning(entry)
    return {
      ok: true,
      deletedBackupIds: [entry.backupId],
      deletedCount: 1,
      warnings: warning ? [warning] : [],
      errors: [],
      message: '备份已删除。',
    }
  } catch (error) {
    return {
      ok: false,
      deletedBackupIds: [],
      deletedCount: 0,
      warnings: [],
      errors: [error instanceof Error ? error.message : String(error)],
      message: '删除备份失败。',
      errorCode: 'delete_failed',
    }
  }
}

export async function deleteAllOpenClawBackups(): Promise<OpenClawBackupDeleteResult> {
  const { entries } = await listOpenClawBackups()
  if (entries.length === 0) {
    return {
      ok: true,
      deletedBackupIds: [],
      deletedCount: 0,
      warnings: [],
      errors: [],
      message: '当前没有可删除的备份。',
    }
  }

  const deletedBackupIds: string[] = []
  const warnings: string[] = []
  const errors: string[] = []
  for (const entry of entries) {
    try {
      await rm(entry.archivePath, { recursive: true, force: true })
      deletedBackupIds.push(entry.backupId)
      const warning = await recordBaselineDeletionWarning(entry)
      if (warning) warnings.push(`[${entry.backupId}] ${warning}`)
    } catch (error) {
      errors.push(`[${entry.backupId}] ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return {
    ok: errors.length === 0,
    deletedBackupIds,
    deletedCount: deletedBackupIds.length,
    warnings,
    errors,
    message:
      errors.length === 0
        ? `已删除 ${deletedBackupIds.length} 个备份。`
        : `已删除 ${deletedBackupIds.length} 个备份，但有 ${errors.length} 个失败。`,
    errorCode: errors.length === 0 ? undefined : 'delete_failed',
  }
}

export async function createManagedBackupArchive(params: {
  candidate: OpenClawInstallCandidate
  backupType: 'manual-backup' | 'cleanup-backup' | 'restore-preflight' | 'upgrade-preflight'
  copyMode: 'full-state' | 'config-only'
  rootResolution?: OpenClawBackupRootResolution
}): Promise<OpenClawBackupEntry> {
  const rootResolution = params.rootResolution || await ensureWritableOpenClawBackupRootDirectory()
  const backupId = buildManagedBackupId(params.backupType, params.candidate.installFingerprint)
  const archivePath = path.join(rootResolution.effectiveRootDirectory, backupId)
  const createdAt = new Date().toISOString()
  const openClawPaths = resolveOpenClawPathsFromStateRoot({
    stateRoot: params.candidate.stateRoot,
    configFile: params.candidate.configPath,
  })

  await mkdir(archivePath, { recursive: true })
  if (params.copyMode === 'full-state') {
    await copyIfExists(params.candidate.stateRoot, path.join(archivePath, 'openclaw-home'))
    if (!isPathWithinParent(params.candidate.configPath, params.candidate.stateRoot)) {
      await copyIfExists(params.candidate.configPath, path.join(archivePath, 'openclaw.json'))
    }
  } else {
    await copyIfExists(params.candidate.configPath, path.join(archivePath, 'openclaw.json'))
    await copyIfExists(openClawPaths.envFile, path.join(archivePath, '.env'))
    await copyIfExists(openClawPaths.credentialsDir, path.join(archivePath, 'credentials'))
  }

  const scopeAvailability = await resolveBackupScopeAvailability(archivePath)
  await atomicWriteJson(
    path.join(archivePath, 'manifest.json'),
    buildManagedBackupManifest({
      backupId,
      createdAt,
      archivePath,
      backupType: params.backupType,
      installFingerprint: params.candidate.installFingerprint,
      candidate: params.candidate,
      scopeAvailability,
    }),
    {
      description: '备份 manifest',
    }
  )

  return {
    backupId,
    createdAt,
    archivePath,
    manifestPath: path.join(archivePath, 'manifest.json'),
    type: params.backupType,
    installFingerprint: params.candidate.installFingerprint,
    sourceVersion: params.candidate.version || null,
    sourceConfigPath: params.candidate.configPath || null,
    sourceStateRoot: params.candidate.stateRoot || null,
    scopeAvailability,
  }
}

export async function createStateRootBackupArchive(params: {
  stateRoot: string
  backupType: 'cleanup-backup' | 'restore-preflight'
  rootResolution?: OpenClawBackupRootResolution
}): Promise<OpenClawBackupEntry> {
  const rootResolution = params.rootResolution || await ensureWritableOpenClawBackupRootDirectory()
  const backupId = buildManagedBackupId(params.backupType, String(params.stateRoot || 'state-root'))
  const archivePath = path.join(rootResolution.effectiveRootDirectory, backupId)
  const createdAt = new Date().toISOString()

  await mkdir(archivePath, { recursive: true })
  await copyIfExists(params.stateRoot, path.join(archivePath, 'openclaw-home'))

  const scopeAvailability = await resolveBackupScopeAvailability(archivePath)
  await atomicWriteJson(
    path.join(archivePath, 'manifest.json'),
    buildStateRootBackupManifest({
      backupId,
      createdAt,
      archivePath,
      backupType: params.backupType,
      scopeAvailability,
      stateRoot: params.stateRoot,
    }),
    {
      description: '状态备份 manifest',
    }
  )

  return {
    backupId,
    createdAt,
    archivePath,
    manifestPath: path.join(archivePath, 'manifest.json'),
    type: params.backupType,
    installFingerprint: null,
    sourceVersion: null,
    sourceConfigPath: null,
    sourceStateRoot: params.stateRoot,
    scopeAvailability,
  }
}
