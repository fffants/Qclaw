const fs = process.getBuiltinModule('node:fs') as typeof import('node:fs')
const os = process.getBuiltinModule('node:os') as typeof import('node:os')
const path = process.getBuiltinModule('node:path') as typeof import('node:path')

const SAFE_WORK_DIR_ENV = 'QCLAW_SAFE_WORK_DIR'
const USER_DATA_DIR_ENV = 'QCLAW_USER_DATA_DIR'

export type WorkingDirectoryNormalizationReason =
  | 'cwd-unavailable'
  | 'unsafe-working-directory'

export interface ResolveSafeWorkingDirectoryOptions {
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  homeDir?: string
  tempDir?: string
  userDataDir?: string
  mkdirSync?: typeof fs.mkdirSync
  accessSync?: typeof fs.accessSync
  realpathSync?: typeof fs.realpathSync
}

export interface NormalizeProcessCwdOptions extends ResolveSafeWorkingDirectoryOptions {
  cwdGetter?: () => string
  chdir?: (directory: string) => void
}

export interface NormalizeProcessCwdResult {
  changed: boolean
  cwd: string
  originalCwd: string | null
  reason?: WorkingDirectoryNormalizationReason
}

let cachedSafeWorkingDirectory: { key: string; path: string } | null = null

function normalizePathValue(value: string): string {
  return String(value || '').trim()
}

function buildCacheKey(options: Required<ResolveSafeWorkingDirectoryOptions>): string {
  return [
    options.platform,
    normalizePathValue(options.env[SAFE_WORK_DIR_ENV] || ''),
    normalizePathValue(options.userDataDir || options.env[USER_DATA_DIR_ENV] || ''),
    normalizePathValue(options.homeDir),
    normalizePathValue(options.tempDir),
  ].join('\u0000')
}

function uniquePaths(values: string[], platform: NodeJS.Platform): string[] {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const value of values) {
    const normalized = normalizePathValue(value)
    if (!normalized) continue
    const key = platform === 'win32' ? normalized.toLowerCase() : normalized
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(normalized)
  }
  return unique
}

function normalizeRuntime(
  options: ResolveSafeWorkingDirectoryOptions = {}
): Required<ResolveSafeWorkingDirectoryOptions> {
  return {
    env: options.env || process.env,
    platform: options.platform || process.platform,
    homeDir: options.homeDir || os.homedir(),
    tempDir: options.tempDir || os.tmpdir(),
    userDataDir: options.userDataDir || '',
    mkdirSync: options.mkdirSync || fs.mkdirSync,
    accessSync: options.accessSync || fs.accessSync,
    realpathSync: options.realpathSync || fs.realpathSync,
  }
}

function isPathWithinDirectory(baseDir: string, candidatePath: string, platform: NodeJS.Platform): boolean {
  const normalizedBase = normalizePathValue(baseDir)
  const normalizedCandidate = normalizePathValue(candidatePath)
  if (!normalizedBase || !normalizedCandidate) return false

  const relativePath = path.relative(normalizedBase, normalizedCandidate)
  if (!relativePath) return true

  const normalizedRelative = platform === 'win32' ? relativePath.toLowerCase() : relativePath
  return !normalizedRelative.startsWith('..') && !path.isAbsolute(relativePath)
}

function buildSafeWorkingDirectoryCandidates(
  options: Required<ResolveSafeWorkingDirectoryOptions>
): string[] {
  const explicitSafeDir = normalizePathValue(options.env[SAFE_WORK_DIR_ENV] || '')
  const userDataDir = normalizePathValue(options.userDataDir || options.env[USER_DATA_DIR_ENV] || '')
  const appSupportDir =
    options.platform === 'darwin' && options.homeDir
      ? path.join(options.homeDir, 'Library', 'Application Support', 'Qclaw Lite', 'runtime')
      : ''
  const homeFallbackDir = options.homeDir ? path.join(options.homeDir, '.qclaw-lite', 'runtime') : ''
  const tempFallbackDir = options.tempDir ? path.join(options.tempDir, 'qclaw-lite', 'runtime') : ''

  return uniquePaths(
    [
      explicitSafeDir,
      userDataDir ? path.join(userDataDir, 'runtime') : '',
      appSupportDir,
      homeFallbackDir,
      tempFallbackDir,
    ],
    options.platform
  )
}

function ensureAccessibleDirectory(
  candidatePath: string,
  options: Required<ResolveSafeWorkingDirectoryOptions>
): string {
  options.mkdirSync(candidatePath, { recursive: true })
  options.accessSync(candidatePath, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK)
  try {
    return options.realpathSync(candidatePath)
  } catch {
    return candidatePath
  }
}

export function isUnsafeWorkingDirectory(
  directoryPath: string,
  options: Omit<ResolveSafeWorkingDirectoryOptions, 'mkdirSync' | 'accessSync' | 'realpathSync'> = {}
): boolean {
  const platform = options.platform || process.platform
  const homeDir = normalizePathValue(options.homeDir || os.homedir())
  const normalizedPath = normalizePathValue(directoryPath)

  if (!normalizedPath) return true

  const protectedHomeDirs = uniquePaths(
    [
      homeDir ? path.join(homeDir, 'Desktop') : '',
      homeDir ? path.join(homeDir, 'Documents') : '',
      homeDir ? path.join(homeDir, 'Downloads') : '',
      homeDir ? path.join(homeDir, 'Library', 'CloudStorage') : '',
      homeDir ? path.join(homeDir, 'Library', 'Mobile Documents') : '',
    ],
    platform
  )

  if (platform === 'darwin') {
    if (isPathWithinDirectory('/Volumes', normalizedPath, platform)) return true
    if (isPathWithinDirectory('/Network', normalizedPath, platform)) return true
  }

  return protectedHomeDirs.some((protectedDir) =>
    isPathWithinDirectory(protectedDir, normalizedPath, platform)
  )
}

export function resolveSafeWorkingDirectory(
  options: ResolveSafeWorkingDirectoryOptions = {}
): string {
  const runtime = normalizeRuntime(options)
  const cacheKey = buildCacheKey(runtime)

  if (cachedSafeWorkingDirectory?.key === cacheKey) {
    return cachedSafeWorkingDirectory.path
  }

  let lastError: Error | null = null
  for (const candidatePath of buildSafeWorkingDirectoryCandidates(runtime)) {
    try {
      const resolvedPath = ensureAccessibleDirectory(candidatePath, runtime)
      cachedSafeWorkingDirectory = {
        key: cacheKey,
        path: resolvedPath,
      }
      return resolvedPath
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error || 'Unknown error'))
    }
  }

  throw new Error(
    lastError?.message || 'Unable to resolve a safe working directory for Qclaw child processes'
  )
}

function tryReadCurrentWorkingDirectory(cwdGetter: () => string): string | null {
  try {
    const cwd = normalizePathValue(cwdGetter())
    return cwd || null
  } catch {
    return null
  }
}

export function tryNormalizeProcessCwd(
  options: NormalizeProcessCwdOptions = {}
): NormalizeProcessCwdResult {
  const runtime = normalizeRuntime(options)
  const cwdGetter = options.cwdGetter || (() => process.cwd())
  const chdir = options.chdir || ((directory: string) => process.chdir(directory))
  const originalCwd = tryReadCurrentWorkingDirectory(cwdGetter)

  if (originalCwd && !isUnsafeWorkingDirectory(originalCwd, runtime)) {
    return {
      changed: false,
      cwd: originalCwd,
      originalCwd,
    }
  }

  const safeWorkingDirectory = resolveSafeWorkingDirectory(runtime)
  chdir(safeWorkingDirectory)

  return {
    changed: originalCwd !== safeWorkingDirectory,
    cwd: safeWorkingDirectory,
    originalCwd,
    reason: originalCwd ? 'unsafe-working-directory' : 'cwd-unavailable',
  }
}
