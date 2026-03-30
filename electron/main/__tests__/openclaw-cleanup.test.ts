import { describe, expect, it } from 'vitest'
import {
  QCLAW_OPENCLAW_SHELL_BLOCK_END,
  QCLAW_OPENCLAW_SHELL_BLOCK_START,
  buildOpenClawGatewayUninstallArgs,
  buildOpenClawStateUninstallArgs,
  resolveLaunchAgentCleanupPlan,
  resolveShellInitFiles,
  stripManagedShellBlocks,
} from '../openclaw-cleanup'
import { buildTestEnv } from './test-env'

describe('stripManagedShellBlocks', () => {
  it('removes only the managed block and preserves unrelated openclaw references', () => {
    const content = [
      'export PATH="$HOME/bin:$PATH"',
      '# keep my openclaw helper comment',
      QCLAW_OPENCLAW_SHELL_BLOCK_START,
      'export PATH="$HOME/.openclaw/bin:$PATH"',
      QCLAW_OPENCLAW_SHELL_BLOCK_END,
      'alias openclaw-dev="openclaw --dev"',
    ].join('\n')

    const result = stripManagedShellBlocks(content)

    expect(result.changed).toBe(true)
    expect(result.content).toContain('export PATH="$HOME/bin:$PATH"')
    expect(result.content).toContain('# keep my openclaw helper comment')
    expect(result.content).toContain('alias openclaw-dev="openclaw --dev"')
    expect(result.content).not.toContain('export PATH="$HOME/.openclaw/bin:$PATH"')
  })

  it('keeps the file unchanged when the marker block is incomplete', () => {
    const content = [
      'export PATH="$HOME/bin:$PATH"',
      QCLAW_OPENCLAW_SHELL_BLOCK_START,
      'export PATH="$HOME/.openclaw/bin:$PATH"',
    ].join('\n')

    const result = stripManagedShellBlocks(content)

    expect(result.changed).toBe(false)
    expect(result.content).toBe(content)
  })
})

describe('resolveShellInitFiles', () => {
  it('expands to common init files and the detected shell config without duplicates', () => {
    const files = resolveShellInitFiles({
      homeDir: '/Users/alice',
      platform: 'darwin',
      shellPath: '/opt/homebrew/bin/fish',
    })

    expect(files).toEqual([
      '/Users/alice/.config/fish/config.fish',
      '/Users/alice/.zshrc',
      '/Users/alice/.zprofile',
      '/Users/alice/.bashrc',
      '/Users/alice/.bash_profile',
      '/Users/alice/.profile',
    ])
  })
})

describe('resolveLaunchAgentCleanupPlan', () => {
  it('derives candidate plist paths from centralized labels and respects env overrides', () => {
    const plan = resolveLaunchAgentCleanupPlan({
      homeDir: '/Users/alice',
      platform: 'darwin',
      env: buildTestEnv({
        QCLAW_OPENCLAW_LAUNCHD_LABELS: 'com.openclaw.gateway,com.openclaw.gateway.beta',
      }),
    })

    expect(plan.labels).toEqual(['com.openclaw.gateway', 'com.openclaw.gateway.beta'])
    expect(plan.plistPaths).toEqual([
      '/Users/alice/Library/LaunchAgents/com.openclaw.gateway.plist',
      '/Users/alice/Library/LaunchAgents/com.openclaw.gateway.beta.plist',
    ])
  })
})

describe('official uninstall args', () => {
  it('prefers OpenClaw official state uninstall over local path guessing', () => {
    expect(buildOpenClawStateUninstallArgs()).toEqual([
      'uninstall',
      '--service',
      '--state',
      '--workspace',
      '--yes',
      '--non-interactive',
    ])
  })

  it('falls back to the official gateway uninstall command for service-only cleanup', () => {
    expect(buildOpenClawGatewayUninstallArgs()).toEqual(['gateway', 'uninstall'])
  })
})
