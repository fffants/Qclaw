import { describe, expect, it } from 'vitest'
import { loadOpenClawAuthRegistry } from '../openclaw-auth-registry'

const fs = process.getBuiltinModule('fs') as typeof import('node:fs')
const os = process.getBuiltinModule('os') as typeof import('node:os')
const path = process.getBuiltinModule('path') as typeof import('node:path')

function createMinimalPackageRoot(input: {
  version?: string
  groups: Array<{
    value: string
    label: string
    hint?: string
    choices: string[]
  }>
  labels?: Record<string, string>
  hints?: Record<string, string>
  preferredProviders?: Record<string, string>
  onboardFlags?: Array<{
    optionKey: string
    authChoice: string
    cliFlag: string
    description: string
  }>
  pluginManifests?: Array<{
    dirName: string
    manifest: Record<string, unknown>
  }>
}): string {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qclaw-auth-registry-minimal-'))
  const distDir = path.join(tempRoot, 'dist')
  fs.mkdirSync(distDir, { recursive: true })
  const extensionsDir = path.join(tempRoot, 'extensions')
  fs.mkdirSync(extensionsDir, { recursive: true })

  fs.writeFileSync(
    path.join(tempRoot, 'package.json'),
    JSON.stringify(
      {
        name: 'openclaw',
        version: input.version || '2026.3.20-test',
      },
      null,
      2
    )
  )

  fs.writeFileSync(
    path.join(distDir, 'auth-choice-options-test.js'),
    [
      `const AUTH_CHOICE_GROUP_DEFS = ${JSON.stringify(input.groups, null, 2)};`,
      `const PROVIDER_AUTH_CHOICE_OPTION_HINTS = ${JSON.stringify(input.hints || {}, null, 2)};`,
      `const PROVIDER_AUTH_CHOICE_OPTION_LABELS = ${JSON.stringify(input.labels || {}, null, 2)};`,
      'const BASE_AUTH_CHOICE_OPTIONS = [];',
      'function formatAuthChoiceChoicesForCli(params) { return params; }',
      '',
    ].join('\n')
  )

  fs.writeFileSync(
    path.join(distDir, 'auth-choice-test.js'),
    [
      `const PREFERRED_PROVIDER_BY_AUTH_CHOICE = ${JSON.stringify(input.preferredProviders || {}, null, 2)};`,
      'function resolvePreferredProviderForAuthChoice(choice) {',
      '  return PREFERRED_PROVIDER_BY_AUTH_CHOICE[choice] || choice',
      '}',
      '',
    ].join('\n')
  )

  fs.writeFileSync(
    path.join(distDir, 'onboard-provider-auth-flags-test.js'),
    [
      'const AUTH_CHOICE_LEGACY_ALIASES_FOR_CLI = {};',
      `const ONBOARD_PROVIDER_AUTH_FLAGS = ${JSON.stringify(input.onboardFlags || [], null, 2)};`,
      'export { AUTH_CHOICE_LEGACY_ALIASES_FOR_CLI as n, ONBOARD_PROVIDER_AUTH_FLAGS as t };',
      '',
    ].join('\n')
  )

  for (const pluginManifest of input.pluginManifests || []) {
    const pluginDir = path.join(extensionsDir, pluginManifest.dirName)
    fs.mkdirSync(pluginDir, { recursive: true })
    fs.writeFileSync(
      path.join(pluginDir, 'openclaw.plugin.json'),
      JSON.stringify(pluginManifest.manifest, null, 2)
    )
  }

  return tempRoot
}

describe('loadOpenClawAuthRegistry onboard routes', () => {
  it('preserves preferred provider ids when onboard auth choices live under a different UI group', async () => {
    const root = createMinimalPackageRoot({
      groups: [
        {
          value: 'moonshot',
          label: 'Moonshot AI (Kimi K2.5)',
          hint: 'Kimi K2.5 + Kimi Coding',
          choices: ['kimi-code-api-key'],
        },
      ],
      labels: {
        'kimi-code-api-key': 'Kimi Code API key (subscription)',
      },
      preferredProviders: {
        'kimi-code-api-key': 'kimi-coding',
      },
      onboardFlags: [
        {
          optionKey: 'kimiCodeApiKey',
          authChoice: 'kimi-code-api-key',
          cliFlag: '--kimi-code-api-key',
          description: 'Kimi Coding API key',
        },
      ],
    })

    try {
      const registry = await loadOpenClawAuthRegistry({
        packageRoot: root,
        forceRefresh: true,
      })

      expect(registry.ok).toBe(true)
      expect(registry.providers).toEqual([
        {
          id: 'moonshot',
          label: 'Moonshot AI (Kimi K2.5)',
          hint: 'Kimi K2.5 + Kimi Coding',
          methods: [
            {
              authChoice: 'kimi-code-api-key',
              label: 'Kimi Code API key (subscription)',
              kind: 'apiKey',
              route: {
                kind: 'onboard',
                providerId: 'kimi-coding',
                cliFlag: '--kimi-code-api-key',
                requiresSecret: true,
              },
            },
          ],
        },
      ])
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('retains plugin ids for plugin-backed onboard api-key routes', async () => {
    const root = createMinimalPackageRoot({
      groups: [
        {
          value: 'moonshot',
          label: 'Moonshot AI (Kimi K2.5)',
          hint: 'Kimi K2.5 + Kimi',
          choices: ['kimi-code-api-key'],
        },
      ],
      labels: {
        'kimi-code-api-key': 'Kimi API key (subscription)',
      },
      pluginManifests: [
        {
          dirName: 'kimi',
          manifest: {
            id: 'kimi',
            providerAuthChoices: [
              {
                provider: 'kimi',
                choiceId: 'kimi-code-api-key',
                method: 'api-key',
                choiceLabel: 'Kimi API key (subscription)',
                groupId: 'moonshot',
                groupLabel: 'Moonshot AI (Kimi K2.5)',
                groupHint: 'Kimi K2.5 + Kimi',
                optionKey: 'kimiCodeApiKey',
                cliFlag: '--kimi-code-api-key',
                cliOption: '--kimi-code-api-key <key>',
                cliDescription: 'Kimi Coding API key',
              },
            ],
          },
        },
      ],
    })

    try {
      const registry = await loadOpenClawAuthRegistry({
        packageRoot: root,
        forceRefresh: true,
      })

      expect(registry.ok).toBe(true)
      expect(registry.providers).toEqual([
        {
          id: 'moonshot',
          label: 'Moonshot AI (Kimi K2.5)',
          hint: 'Kimi K2.5 + Kimi',
          methods: [
            {
              authChoice: 'kimi-code-api-key',
              label: 'Kimi API key (subscription)',
              kind: 'apiKey',
              route: {
                kind: 'onboard',
                providerId: 'kimi',
                pluginId: 'kimi',
                cliFlag: '--kimi-code-api-key',
                requiresSecret: true,
              },
            },
          ],
        },
      ])
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
