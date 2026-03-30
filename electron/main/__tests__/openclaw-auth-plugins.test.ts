import { describe, expect, it, vi } from 'vitest'
import { createOpenClawAuthRegistry } from '../openclaw-auth-registry'
import { collectBundledAuthPluginIds, enableBundledAuthPlugins } from '../openclaw-auth-plugins'

const RAW_STALE_PLUGIN_WARNING =
  'Config warnings:\n- plugins.entries.MiniMax-M2.5: plugin not found: MiniMax-M2.5 (stale config entry ignored; remove it from plugins config)'

function createCapabilities() {
  return {
    version: 'OpenClaw 2026.3.12',
    discoveredAt: '2026-03-13T00:00:00.000Z',
    authRegistry: createOpenClawAuthRegistry({
      source: 'openclaw-internal-registry',
      providers: [],
    }),
    authRegistrySource: 'openclaw-internal-registry' as const,
    authChoices: [],
    rootCommands: ['plugins', 'models'],
    onboardFlags: [],
    modelsCommands: ['auth'],
    modelsAuthCommands: ['login'],
    pluginsCommands: ['enable'],
    commandFlags: {
      'models auth login': ['--provider', '--method'],
    },
    supports: {
      onboard: false,
      plugins: true,
      pluginsInstall: true,
      pluginsEnable: true,
      chatAgentModelFlag: false,
      chatGatewaySendModel: false,
      chatInThreadModelSwitch: false,
      modelsListAllJson: false,
      modelsStatusJson: false,
      modelsAuthLogin: true,
      modelsAuthAdd: false,
      modelsAuthPasteToken: false,
      modelsAuthSetupToken: false,
      modelsAuthOrder: false,
      modelsAuthLoginGitHubCopilot: false,
      aliases: false,
      fallbacks: false,
      imageFallbacks: false,
      modelsScan: false,
    },
  }
}

describe('openclaw auth plugin bootstrap', () => {
  it('collects unique bundled auth plugin ids from registry routes', () => {
    const registry = createOpenClawAuthRegistry({
      source: 'openclaw-internal-registry',
      providers: [
        {
          id: 'google',
          label: 'Google',
          methods: [
            {
              authChoice: 'google-gemini-cli',
              label: 'Google Gemini CLI OAuth',
              kind: 'oauth',
              route: {
                kind: 'models-auth-login',
                providerId: 'google-gemini-cli',
                pluginId: 'google-gemini-cli-auth',
              },
            },
          ],
        },
        {
          id: 'qwen',
          label: 'Qwen',
          methods: [
            {
              authChoice: 'qwen-portal',
              label: 'Qwen OAuth',
              kind: 'oauth',
              route: {
                kind: 'models-auth-login',
                providerId: 'qwen-portal',
                pluginId: 'qwen-portal-auth',
              },
            },
            {
              authChoice: 'qwen-portal-alias',
              label: 'Qwen OAuth Alias',
              kind: 'oauth',
              route: {
                kind: 'models-auth-login',
                providerId: 'qwen-portal',
                pluginId: 'qwen-portal-auth',
              },
            },
          ],
        },
      ],
    })

    expect(collectBundledAuthPluginIds(registry)).toEqual([
      'google-gemini-cli-auth',
      'qwen-portal-auth',
    ])
  })

  it('also collects bundled auth plugin ids from specialized login routes', () => {
    const registry = createOpenClawAuthRegistry({
      source: 'openclaw-internal-registry',
      providers: [
        {
          id: 'openai',
          label: 'OpenAI',
          methods: [
            {
              authChoice: 'openai-codex',
              label: 'OpenAI Codex (ChatGPT OAuth)',
              kind: 'oauth',
              route: {
                kind: 'models-auth-login',
                providerId: 'openai-codex',
                methodId: 'oauth',
                pluginId: 'openai',
              },
            },
          ],
        },
        {
          id: 'copilot',
          label: 'Copilot',
          methods: [
            {
              authChoice: 'github-copilot',
              label: 'GitHub Copilot',
              kind: 'oauth',
              route: {
                kind: 'models-auth-login-github-copilot',
                providerId: 'github-copilot',
                methodId: 'device',
                pluginId: 'github-copilot',
              },
            },
          ],
        },
      ],
    })

    expect(collectBundledAuthPluginIds(registry)).toEqual(['openai', 'github-copilot'])
  })

  it('enables discovered bundled auth plugins through plugins enable', async () => {
    const registry = createOpenClawAuthRegistry({
      source: 'openclaw-internal-registry',
      providers: [
        {
          id: 'google',
          label: 'Google',
          methods: [
            {
              authChoice: 'google-gemini-cli',
              label: 'Google Gemini CLI OAuth',
              kind: 'oauth',
              route: {
                kind: 'models-auth-login',
                providerId: 'google-gemini-cli',
                pluginId: 'google-gemini-cli-auth',
              },
            },
          ],
        },
        {
          id: 'qwen',
          label: 'Qwen',
          methods: [
            {
              authChoice: 'qwen-portal',
              label: 'Qwen OAuth',
              kind: 'oauth',
              route: {
                kind: 'models-auth-login',
                providerId: 'qwen-portal',
                pluginId: 'qwen-portal-auth',
              },
            },
          ],
        },
      ],
    })
    const runCommand = vi.fn(async () => ({ ok: true, stdout: 'Enabled plugin', stderr: '', code: 0 }))

    const result = await enableBundledAuthPlugins({
      registry,
      capabilities: createCapabilities(),
      runCommand,
    })

    expect(runCommand).toHaveBeenNthCalledWith(
      1,
      ['plugins', 'enable', 'google-gemini-cli-auth'],
      expect.any(Number)
    )
    expect(runCommand).toHaveBeenNthCalledWith(
      2,
      ['plugins', 'enable', 'qwen-portal-auth'],
      expect.any(Number)
    )
    expect(result.enabledPluginIds).toEqual(['google-gemini-cli-auth', 'qwen-portal-auth'])
    expect(result.failedPluginIds).toEqual([])
  })

  it('prunes stale plugin config entries surfaced during plugin enable', async () => {
    const registry = createOpenClawAuthRegistry({
      source: 'openclaw-internal-registry',
      providers: [
        {
          id: 'google',
          label: 'Google',
          methods: [
            {
              authChoice: 'google-gemini-cli',
              label: 'Google Gemini CLI OAuth',
              kind: 'oauth',
              route: {
                kind: 'models-auth-login',
                providerId: 'google-gemini-cli',
                pluginId: 'google-gemini-cli-auth',
              },
            },
          ],
        },
      ],
    })
    const pruneStalePluginEntries = vi.fn(async () => ({
      changed: true,
      removedPluginIds: ['MiniMax-M2.5'],
    }))
    const runCommand = vi.fn(async () => ({
      ok: true,
      stdout: 'Enabled plugin',
      stderr: RAW_STALE_PLUGIN_WARNING,
      code: 0,
    }))

    await enableBundledAuthPlugins({
      registry,
      capabilities: createCapabilities(),
      runCommand,
      pruneStalePluginEntries,
    })

    expect(pruneStalePluginEntries).toHaveBeenCalledWith(['MiniMax-M2.5'])
  })
})
