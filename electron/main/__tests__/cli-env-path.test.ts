import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildAppleScriptDoShellScript,
  buildMacNpmCommand,
  buildNodePathWithCandidates,
  extractNodeBinDir,
  isNodeVersionAtLeast,
} from '../node-runtime'

const ORIGINAL_HOME = process.env.HOME

beforeEach(() => {
  process.env.HOME = '/Users/alice'
})

afterEach(() => {
  if (ORIGINAL_HOME === undefined) {
    delete process.env.HOME
    return
  }
  process.env.HOME = ORIGINAL_HOME
})

describe('extractNodeBinDir', () => {
  it('returns the binary directory from node execPath output', () => {
    expect(extractNodeBinDir('/opt/homebrew/Cellar/node/25.8.0/bin/node\n')).toBe(
      '/opt/homebrew/Cellar/node/25.8.0/bin'
    )
  })

  it('returns null when execPath output is empty', () => {
    expect(extractNodeBinDir(' \n')).toBeNull()
  })
})

describe('buildNodePathWithCandidates', () => {
  it('prepends the detected node bin directory ahead of macOS fallbacks', () => {
    const pathValue = buildNodePathWithCandidates(
      'darwin',
      '/bin:/usr/sbin',
      '/opt/homebrew/Cellar/node/25.8.0/bin'
    )
    const entries = pathValue.split(':')

    expect(entries[0]).toBe('/opt/homebrew/Cellar/node/25.8.0/bin')
    expect(entries).toContain('/Users/alice/homebrew/bin')
    expect(entries).toContain('/opt/homebrew/bin')
    expect(entries).toContain('/usr/local/bin')
    expect(entries).toContain('/usr/bin')
    expect(entries).toContain('/bin')
    expect(entries).toContain('/usr/sbin')
  })

  it('deduplicates fallback candidates when the detected directory already matches one', () => {
    const pathValue = buildNodePathWithCandidates('darwin', '', '/opt/homebrew/bin')
    const entries = pathValue.split(':')

    expect(entries[0]).toBe('/opt/homebrew/bin')
    expect(entries.filter((entry) => entry === '/opt/homebrew/bin')).toHaveLength(1)
    expect(entries).toContain('/Users/alice/homebrew/bin')
    expect(entries).toContain('/usr/local/bin')
    expect(entries).toContain('/usr/bin')
  })
})

describe('buildMacNpmCommand', () => {
  it('uses PATH-based npm resolution instead of hardcoding /usr/local/bin/npm', () => {
    const command = buildMacNpmCommand(['install', '-g', 'openclaw@latest'], {
      detectedBinDir: '/opt/homebrew/Cellar/node/25.8.0/bin',
      user: 'alice',
      npmCacheDir: '/Users/alice/.npm',
    })

    expect(command).toContain("export PATH='/opt/homebrew/Cellar/node/25.8.0/bin:")
    expect(command).toContain('/Users/alice/homebrew/bin')
    expect(command).toContain('/opt/homebrew/bin')
    expect(command).toContain('/usr/local/bin')
    expect(command).toContain('/usr/bin')
    expect(command).toContain("export GIT_CONFIG_COUNT='2'")
    expect(command).toContain("export GIT_CONFIG_VALUE_0='ssh://git@github.com/'")
    expect(command).toContain("export GIT_CONFIG_VALUE_1='git@github.com:'")
    expect(command).toContain('unset NODE_OPTIONS')
    expect(command).toContain('qclaw_npm_log="$(mktemp -t qclaw-npm-log.XXXXXX)"')
    expect(command).toContain('grep -Eiq')
    expect(command).toContain('unset npm_config_cafile NPM_CONFIG_CAFILE npm_config_ca NPM_CONFIG_CA')
    expect(command).toContain("if [ -f '/etc/ssl/cert.pem' ]; then export SSL_CERT_FILE='/etc/ssl/cert.pem'; fi")
    expect(command).not.toContain('then;')
    expect(command).toContain("npm 'install' '-g' 'openclaw@latest'")
    expect(command).toContain("chown -R 'alice' '/Users/alice/.npm'")
    expect(command).not.toContain('/usr/local/bin/npm')
  })

  it('can pin macOS npm commands to a safe working directory', () => {
    const command = buildMacNpmCommand(['install', '-g', 'openclaw@latest'], {
      detectedBinDir: '/opt/homebrew/bin',
      workingDirectory: '/Users/alice/Library/Application Support/Qclaw Lite/runtime',
    })

    expect(command).toContain(
      "cd '/Users/alice/Library/Application Support/Qclaw Lite/runtime' &&"
    )
    expect(command).toContain("npm 'install' '-g' 'openclaw@latest'")
  })

  it('can skip cache ownership repair for uninstall commands', () => {
    const command = buildMacNpmCommand(['uninstall', '-g', 'openclaw'], {
      detectedBinDir: '/opt/homebrew/bin',
      fixCacheOwnership: false,
    })

    expect(command).toContain("npm 'uninstall' '-g' 'openclaw'")
    expect(command).not.toContain('chown -R')
  })
})

describe('buildAppleScriptDoShellScript', () => {
  it('escapes embedded double quotes and keeps script executable', () => {
    const script = buildAppleScriptDoShellScript('echo "hello" && echo done', {
      prompt: 'Say "hello" please',
    })

    expect(script).toContain('do shell script "echo \\"hello\\" && echo done"')
    expect(script).toContain('with administrator privileges')
    expect(script).toContain('with prompt "Say \\"hello\\" please"')
  })
})

describe('isNodeVersionAtLeast', () => {
  it('accepts versions that satisfy the minimum requirement', () => {
    expect(isNodeVersionAtLeast('v18.0.0', '18.0.0')).toBe(true)
    expect(isNodeVersionAtLeast('v18.19.1', '18.0.0')).toBe(true)
    expect(isNodeVersionAtLeast('22.14.0', '18.0.0')).toBe(true)
  })

  it('rejects versions that are below the requirement or unparsable', () => {
    expect(isNodeVersionAtLeast('v16.20.2', '18.0.0')).toBe(false)
    expect(isNodeVersionAtLeast('unknown', '18.0.0')).toBe(false)
  })
})
