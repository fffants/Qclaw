import type { OpenClawBackupRootInfo } from '../../src/shared/openclaw-phase3'
import { formatDisplayPath } from './openclaw-paths'

const fs = process.getBuiltinModule('node:fs') as typeof import('node:fs')
const os = process.getBuiltinModule('node:os') as typeof import('node:os')
const path = process.getBuiltinModule('node:path') as typeof import('node:path')
const { mkdir, rm, writeFile } = fs.promises
const { homedir } = os

export interface OpenClawBackupRootResolution {
  preferredRootDirectory: string
  fallbackRootDirectory: string | null
  effectiveRootDirectory: string
  usedFallbackRoot: boolean
  warnings: string[]
}

function uniquePaths(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)))
}

function buildBackupWriteProbePath(rootDirectory: string): string {
  return path.join(
    rootDirectory,
    `.qclaw-backup-write-probe-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  )
}

async function probeWritableDirectory(rootDirectory: string): Promise<void> {
  await mkdir(rootDirectory, { recursive: true })
  const probePath = buildBackupWriteProbePath(rootDirectory)
  await writeFile(probePath, 'ok', 'utf8')
  await rm(probePath, { force: true }).catch(() => undefined)
}

function formatRootFailure(rootDirectory: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return `${rootDirectory}（${message}）`
}

export function resolveOpenClawUserDataDirectory(): string {
  return String(process.env.QCLAW_USER_DATA_DIR || path.join(homedir(), '.qclaw-lite')).trim()
}

export function resolvePreferredOpenClawBackupDirectory(): string {
  return String(
    process.env.QCLAW_BACKUP_DIR || path.join(homedir(), 'Documents', 'Qclaw Lite Backups')
  ).trim()
}

export function resolveFallbackOpenClawBackupDirectory(): string {
  const explicitFallback = String(process.env.QCLAW_FALLBACK_BACKUP_DIR || '').trim()
  if (explicitFallback) return explicitFallback

  const configuredUserDataDirectory = String(process.env.QCLAW_USER_DATA_DIR || '').trim()
  if (configuredUserDataDirectory) {
    return path.join(configuredUserDataDirectory, 'backups')
  }

  if (process.platform === 'darwin') {
    return path.join(homedir(), 'Library', 'Application Support', 'Qclaw Lite', 'Backups')
  }

  return path.join(resolveOpenClawUserDataDirectory(), 'backups')
}

export function listKnownOpenClawBackupRootDirectories(): string[] {
  return uniquePaths([
    resolvePreferredOpenClawBackupDirectory(),
    resolveFallbackOpenClawBackupDirectory(),
  ])
}

export async function ensureWritableOpenClawBackupRootDirectory(): Promise<OpenClawBackupRootResolution> {
  const preferredRootDirectory = resolvePreferredOpenClawBackupDirectory()
  const fallbackRootDirectory = resolveFallbackOpenClawBackupDirectory()

  try {
    await probeWritableDirectory(preferredRootDirectory)
    return {
      preferredRootDirectory,
      fallbackRootDirectory:
        fallbackRootDirectory && fallbackRootDirectory !== preferredRootDirectory
          ? fallbackRootDirectory
          : null,
      effectiveRootDirectory: preferredRootDirectory,
      usedFallbackRoot: false,
      warnings: [],
    }
  } catch (preferredError) {
    if (!fallbackRootDirectory || fallbackRootDirectory === preferredRootDirectory) {
      throw new Error(`OpenClaw 备份目录不可写：${formatRootFailure(preferredRootDirectory, preferredError)}`)
    }

    try {
      await probeWritableDirectory(fallbackRootDirectory)
      return {
        preferredRootDirectory,
        fallbackRootDirectory,
        effectiveRootDirectory: fallbackRootDirectory,
        usedFallbackRoot: true,
        warnings: [
          `首选备份目录不可写，已自动改用 ${fallbackRootDirectory}。`,
        ],
      }
    } catch (fallbackError) {
      throw new Error(
        [
          'OpenClaw 备份目录不可写。',
          `首选目录失败：${formatRootFailure(preferredRootDirectory, preferredError)}`,
          `备用目录失败：${formatRootFailure(fallbackRootDirectory, fallbackError)}`,
        ].join(' ')
      )
    }
  }
}

export async function getOpenClawEffectiveBackupRootInfo(): Promise<OpenClawBackupRootInfo> {
  const resolution = await ensureWritableOpenClawBackupRootDirectory()
  return {
    rootDirectory: resolution.effectiveRootDirectory,
    displayRootDirectory: formatDisplayPath(resolution.effectiveRootDirectory, homedir()),
  }
}
