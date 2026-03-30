const os = process.getBuiltinModule('node:os') as typeof import('node:os')
const path = process.getBuiltinModule('node:path') as typeof import('node:path')

export const QCLAW_OPENCLAW_SHELL_BLOCK_START = '# >>> qclaw-lite openclaw managed block >>>'
export const QCLAW_OPENCLAW_SHELL_BLOCK_END = '# <<< qclaw-lite openclaw managed block <<<'

const DEFAULT_LAUNCHD_LABELS = ['com.openclaw.gateway']
const SHELL_INIT_OVERRIDE_ENV = 'QCLAW_OPENCLAW_SHELL_INIT_FILES'
const LAUNCHD_LABEL_OVERRIDE_ENV = 'QCLAW_OPENCLAW_LAUNCHD_LABELS'
const LAUNCHD_PLIST_OVERRIDE_ENV = 'QCLAW_OPENCLAW_LAUNCHD_PLISTS'

interface ResolveCleanupOptions {
  homeDir?: string
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
}

interface ResolveShellInitFilesOptions extends ResolveCleanupOptions {
  shellPath?: string
}

export interface ManagedShellBlockCleanupResult {
  changed: boolean
  content: string
}

export interface LaunchAgentCleanupPlan {
  labels: string[]
  plistPaths: string[]
}

function resolvePlatform(options?: ResolveCleanupOptions): NodeJS.Platform {
  return options?.platform || process.platform
}

function resolveHomeDir(options?: ResolveCleanupOptions): string {
  const platform = resolvePlatform(options)
  const env = options?.env || process.env
  return String(
    options?.homeDir ||
      (platform === 'win32'
        ? env.USERPROFILE || env.HOME || os.homedir()
        : env.HOME || env.USERPROFILE || os.homedir())
  ).trim()
}

function joinForPlatform(platform: NodeJS.Platform, ...parts: string[]): string {
  return (platform === 'win32' ? path.win32 : path.posix).join(...parts)
}

function basenameFromShellPath(shellPath: string): string {
  const value = String(shellPath || '').trim()
  if (!value) return ''
  return path.posix.basename(value).toLowerCase() || path.win32.basename(value).toLowerCase()
}

function normalizeList(value: string | undefined, extraSeparators: string[] = []): string[] {
  const raw = String(value || '')
  if (!raw.trim()) return []

  const pattern = new RegExp(
    `[${[',', '\n', '\r', ...extraSeparators]
      .map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('')}]`
  )

  return raw
    .split(pattern)
    .map((item) => item.trim())
    .filter(Boolean)
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.map((item) => String(item || '').trim()).filter(Boolean)))
}

export function stripManagedShellBlocks(content: string): ManagedShellBlockCleanupResult {
  const input = String(content || '')
  if (!input.includes(QCLAW_OPENCLAW_SHELL_BLOCK_START)) {
    return { changed: false, content: input }
  }

  const newline = input.includes('\r\n') ? '\r\n' : '\n'
  const lines = input.split(/\r?\n/)
  const nextLines: string[] = []
  let changed = false

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() !== QCLAW_OPENCLAW_SHELL_BLOCK_START) {
      nextLines.push(line)
      continue
    }

    let endIndex = index + 1
    while (endIndex < lines.length && lines[endIndex].trim() !== QCLAW_OPENCLAW_SHELL_BLOCK_END) {
      endIndex += 1
    }

    if (endIndex >= lines.length) {
      return { changed: false, content: input }
    }

    changed = true
    index = endIndex
  }

  return {
    changed,
    content: changed ? nextLines.join(newline) : input,
  }
}

export function resolveShellInitFiles(options: ResolveShellInitFilesOptions = {}): string[] {
  const platform = resolvePlatform(options)
  if (platform === 'win32') return []

  const homeDir = resolveHomeDir(options)
  const env = options.env || process.env
  const shellName = basenameFromShellPath(options.shellPath || env.SHELL || '')

  const detected: string[] = []
  if (shellName === 'fish') {
    detected.push(joinForPlatform(platform, homeDir, '.config', 'fish', 'config.fish'))
  } else if (shellName === 'zsh') {
    detected.push(
      joinForPlatform(platform, homeDir, '.zshrc'),
      joinForPlatform(platform, homeDir, '.zprofile')
    )
  } else if (shellName === 'bash') {
    detected.push(
      joinForPlatform(platform, homeDir, '.bashrc'),
      joinForPlatform(platform, homeDir, '.bash_profile')
    )
  } else if (shellName === 'sh' || shellName === 'ksh') {
    detected.push(joinForPlatform(platform, homeDir, '.profile'))
  }

  const common = [
    joinForPlatform(platform, homeDir, '.zshrc'),
    joinForPlatform(platform, homeDir, '.zprofile'),
    joinForPlatform(platform, homeDir, '.bashrc'),
    joinForPlatform(platform, homeDir, '.bash_profile'),
    joinForPlatform(platform, homeDir, '.profile'),
  ]

  const overrides = normalizeList(env[SHELL_INIT_OVERRIDE_ENV], [path.delimiter]).map((item) =>
    path.isAbsolute(item) ? item : joinForPlatform(platform, homeDir, item)
  )

  return dedupe([...detected, ...common, ...overrides])
}

export function resolveLaunchAgentCleanupPlan(
  options: ResolveCleanupOptions = {}
): LaunchAgentCleanupPlan {
  const platform = resolvePlatform(options)
  if (platform !== 'darwin') {
    return { labels: [], plistPaths: [] }
  }

  const env = options.env || process.env
  const homeDir = resolveHomeDir(options)
  const launchAgentsDir = joinForPlatform(platform, homeDir, 'Library', 'LaunchAgents')
  const labels = dedupe(
    normalizeList(env[LAUNCHD_LABEL_OVERRIDE_ENV]).length > 0
      ? normalizeList(env[LAUNCHD_LABEL_OVERRIDE_ENV])
      : DEFAULT_LAUNCHD_LABELS
  )
  const explicitPlists = normalizeList(env[LAUNCHD_PLIST_OVERRIDE_ENV], [path.delimiter]).map((item) =>
    path.isAbsolute(item) ? item : joinForPlatform(platform, launchAgentsDir, item)
  )
  const derivedPlists = labels.map((label) => joinForPlatform(platform, launchAgentsDir, `${label}.plist`))

  return {
    labels,
    plistPaths: dedupe([...derivedPlists, ...explicitPlists]),
  }
}

export function buildOpenClawStateUninstallArgs(): string[] {
  return ['uninstall', '--service', '--state', '--workspace', '--yes', '--non-interactive']
}

export function buildOpenClawGatewayUninstallArgs(): string[] {
  return ['gateway', 'uninstall']
}
