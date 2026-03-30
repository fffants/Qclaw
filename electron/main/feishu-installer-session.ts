import type { ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import {
  cancelActiveProcess,
  clearActiveProcessIfMatch,
  consumeCanceledProcess,
  setActiveProcess,
} from './command-control'
import { getOpenClawPaths, readConfig } from './cli'
import { probePlatformCommandCapability } from './command-capabilities'
import { applyConfigPatchGuarded } from './openclaw-config-coordinator'
import {
  FEISHU_OFFICIAL_PLUGIN_ID,
  prepareFeishuInstallerConfig,
} from './feishu-installer-config'
import { MAIN_RUNTIME_POLICY } from './runtime-policy'
import { buildCliPathWithCandidates } from './runtime-path-discovery'
import { resolveSafeWorkingDirectory } from './runtime-working-directory'
import { cleanupIsolatedNpmCacheEnv, createIsolatedNpmCacheEnv } from './npm-cache-env'

const childProcess = process.getBuiltinModule('node:child_process') as typeof import('node:child_process')
const { spawn } = childProcess

const FEISHU_INSTALLER_CONTROL_DOMAIN = 'feishu-installer'
const FEISHU_INSTALLER_PACKAGE = '@larksuite/openclaw-lark-tools'
const FEISHU_OFFICIAL_PLUGIN_MANIFEST = 'openclaw.plugin.json'

function resolveFeishuInstallerNpmCacheDir(): string {
  return path.join(app.getPath('userData'), 'npm-cache')
}

function resolveFeishuOfficialPluginManifestPath(homeDir: string): string {
  return path.join(homeDir, 'extensions', FEISHU_OFFICIAL_PLUGIN_ID, FEISHU_OFFICIAL_PLUGIN_MANIFEST)
}

export async function isFeishuOfficialPluginInstalledOnDisk(): Promise<boolean> {
  const openClawPaths = await getOpenClawPaths().catch(() => null)
  const homeDir = String(openClawPaths?.homeDir || '').trim()
  if (!homeDir) return false

  try {
    await fs.promises.access(resolveFeishuOfficialPluginManifestPath(homeDir))
    return true
  } catch {
    return false
  }
}

async function prepareConfigForFeishuInstaller(): Promise<void> {
  const config = await readConfig().catch(() => null)
  const openClawPaths = await getOpenClawPaths().catch(() => null)
  const homeDir = String(openClawPaths?.homeDir || '').trim()
  const pluginInstallPath = homeDir ? path.join(homeDir, 'extensions', FEISHU_OFFICIAL_PLUGIN_ID) : ''
  const pluginInstalledOnDisk = homeDir
    ? await isFeishuOfficialPluginInstalledOnDisk().catch(() => false)
    : false

  const result = prepareFeishuInstallerConfig(config, {
    pluginInstalledOnDisk,
    installPath: pluginInstallPath,
  })

  if (result.changed) {
    const writeResult = await applyConfigPatchGuarded({
      beforeConfig: config,
      afterConfig: result.config,
      reason: 'unknown',
    })
    if (!writeResult.ok) {
      throw new Error(writeResult.message || '准备飞书安装器配置失败')
    }
  }
}

function resolveBundledFeishuInstallerPackage(): string | null {
  const envOverride = String(process.env.QCLAW_FEISHU_INSTALLER_TGZ || '').trim()
  if (envOverride && fs.existsSync(envOverride)) {
    return envOverride
  }

  return null
}

function buildFeishuInstallerCommand() {
  const bundledPackagePath = resolveBundledFeishuInstallerPackage()
  const packageSpecifier = bundledPackagePath || FEISHU_INSTALLER_PACKAGE
  const command = ['npx', '-y', packageSpecifier, 'install']
  return {
    command,
    bundledPackagePath,
  }
}

export interface FeishuInstallerSessionSnapshot {
  active: boolean
  sessionId: string | null
  phase: 'idle' | 'running' | 'exited'
  output: string
  code: number | null
  ok: boolean
  canceled: boolean
  command: string[]
}

export interface FeishuInstallerSessionEvent {
  sessionId: string
  type: 'started' | 'output' | 'exit'
  stream?: 'stdout' | 'stderr'
  chunk?: string
  phase?: FeishuInstallerSessionSnapshot['phase']
  code?: number | null
  ok?: boolean
  canceled?: boolean
  command?: string[]
}

interface ActiveFeishuInstallerSession {
  id: string
  process: ChildProcess
  phase: FeishuInstallerSessionSnapshot['phase']
  output: string
  code: number | null
  ok: boolean
  canceled: boolean
  command: string[]
  npmCacheDir: string
}

let activeSession: ActiveFeishuInstallerSession | null = null

function buildSnapshot(): FeishuInstallerSessionSnapshot {
  const commandResolution = buildFeishuInstallerCommand()
  if (!activeSession) {
    return {
      active: false,
      sessionId: null,
      phase: 'idle',
      output: '',
      code: null,
      ok: false,
      canceled: false,
      command: [...commandResolution.command],
    }
  }

  return {
    active: activeSession.phase === 'running',
    sessionId: activeSession.id,
    phase: activeSession.phase,
    output: activeSession.output,
    code: activeSession.code,
    ok: activeSession.ok,
    canceled: activeSession.canceled,
    command: activeSession.command,
  }
}

function appendOutput(stream: 'stdout' | 'stderr', chunk: string, emit: (event: FeishuInstallerSessionEvent) => void) {
  if (!activeSession) return
  activeSession.output += chunk
  emit({
    sessionId: activeSession.id,
    type: 'output',
    stream,
    chunk,
  })
}

export async function getFeishuInstallerSessionSnapshot(): Promise<FeishuInstallerSessionSnapshot> {
  return buildSnapshot()
}

export async function startFeishuInstallerSession(
  emit: (event: FeishuInstallerSessionEvent) => void
): Promise<FeishuInstallerSessionSnapshot> {
  if (activeSession?.phase === 'running') {
    return buildSnapshot()
  }

  const capability = await probePlatformCommandCapability('npx', {
    platform: process.platform,
    env: process.env,
  })
  if (!capability.available) {
    const errorSessionId = activeSession?.id || randomUUID()
    const commandResolution = buildFeishuInstallerCommand()
    return {
      active: false,
      sessionId: errorSessionId,
      phase: 'exited',
      output: capability.message || 'npx 命令不可用，无法启动飞书官方安装器。',
      code: 1,
      ok: false,
      canceled: false,
      command: [...commandResolution.command],
    }
  }

  await prepareConfigForFeishuInstaller().catch(() => {
    // Best effort only; installer startup should still proceed if config cleanup fails.
  })

  const npmCacheDir = resolveFeishuInstallerNpmCacheDir()
  const isolatedNpmCache = await createIsolatedNpmCacheEnv(npmCacheDir)

  const commandResolution = buildFeishuInstallerCommand()
  const sessionId = randomUUID()
  const proc = spawn(commandResolution.command[0], commandResolution.command.slice(1), {
    cwd: resolveSafeWorkingDirectory({
      env: process.env,
      platform: process.platform,
    }),
    env: {
      ...process.env,
      PATH: buildCliPathWithCandidates({
        platform: process.platform,
        currentPath: process.env.PATH || '',
        env: process.env,
      }),
      NO_COLOR: '1',
      FORCE_COLOR: '0',
      ...isolatedNpmCache.env,
    },
    shell: process.platform === 'win32',
    timeout: MAIN_RUNTIME_POLICY.cli.pluginInstallNpxTimeoutMs,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  activeSession = {
    id: sessionId,
    process: proc,
    phase: 'running',
    output: commandResolution.bundledPackagePath
      ? `[Qclaw] 使用应用内预置飞书安装器包: ${commandResolution.bundledPackagePath}\n`
      : '',
    code: null,
    ok: false,
    canceled: false,
    command: [...commandResolution.command],
    npmCacheDir: isolatedNpmCache.cacheDir,
  }
  setActiveProcess(proc, FEISHU_INSTALLER_CONTROL_DOMAIN)

  emit({
    sessionId,
    type: 'started',
    phase: 'running',
    command: [...commandResolution.command],
  })

  proc.stdout?.on('data', (chunk) => {
    appendOutput('stdout', String(chunk), emit)
  })

  proc.stderr?.on('data', (chunk) => {
    appendOutput('stderr', String(chunk), emit)
  })

  proc.on('close', (code) => {
    if (!activeSession || activeSession.id !== sessionId) return
    const npmCacheDirForCleanup = activeSession.npmCacheDir
    clearActiveProcessIfMatch(proc, FEISHU_INSTALLER_CONTROL_DOMAIN)
    const canceled = consumeCanceledProcess(proc, FEISHU_INSTALLER_CONTROL_DOMAIN)
    activeSession.phase = 'exited'
    activeSession.code = canceled ? null : code
    activeSession.ok = code === 0 && !canceled
    activeSession.canceled = canceled
    emit({
      sessionId,
      type: 'exit',
      phase: 'exited',
      code: activeSession.code,
      ok: activeSession.ok,
      canceled,
    })
    void cleanupIsolatedNpmCacheEnv(npmCacheDirForCleanup)
  })

  proc.on('error', (error) => {
    if (!activeSession || activeSession.id !== sessionId) return
    const npmCacheDirForCleanup = activeSession.npmCacheDir
    clearActiveProcessIfMatch(proc, FEISHU_INSTALLER_CONTROL_DOMAIN)
    const canceled = consumeCanceledProcess(proc, FEISHU_INSTALLER_CONTROL_DOMAIN)
    activeSession.output += `\n${error instanceof Error ? error.message : String(error)}`
    activeSession.phase = 'exited'
    activeSession.code = canceled ? null : 1
    activeSession.ok = false
    activeSession.canceled = canceled
    emit({
      sessionId,
      type: 'exit',
      phase: 'exited',
      code: activeSession.code,
      ok: false,
      canceled,
    })
    void cleanupIsolatedNpmCacheEnv(npmCacheDirForCleanup)
  })

  return buildSnapshot()
}

export async function writeFeishuInstallerSessionInput(
  sessionId: string,
  input: string
): Promise<{ ok: boolean; message?: string }> {
  if (!activeSession || activeSession.id !== sessionId || activeSession.phase !== 'running') {
    return { ok: false, message: '飞书官方安装器当前未运行。' }
  }

  const normalizedInput = String(input || '')
  if (!normalizedInput) {
    return { ok: false, message: '输入内容不能为空。' }
  }

  const stdin = activeSession.process.stdin
  if (!stdin || stdin.destroyed || !stdin.writable) {
    return { ok: false, message: '安装器当前不可写入，请重新启动。' }
  }

  return new Promise((resolve) => {
    stdin.write(normalizedInput, (error) => {
      if (error) {
        resolve({ ok: false, message: error.message })
        return
      }
      resolve({ ok: true })
    })
  })
}

export async function stopFeishuInstallerSession(): Promise<{ ok: boolean }> {
  if (!activeSession || activeSession.phase !== 'running') {
    return { ok: true }
  }
  const ok = await cancelActiveProcess(FEISHU_INSTALLER_CONTROL_DOMAIN)
  return { ok }
}
