import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CliCommandResult } from '../openclaw-capabilities'

function ok(stdout = ''): CliCommandResult {
  return { ok: true, stdout, stderr: '', code: 0 }
}

describe('scanLocalModels env sync', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('passes the default Ollama host via command env before scanning', async () => {
    const { scanLocalModels } = await import('../openclaw-model-config')
    const runCommandWithEnv = vi.fn(async () => ok(JSON.stringify({ models: [] })))
    const enablePluginCommand = vi.fn(async () => ok('Plugin "ollama" already enabled.'))

    await scanLocalModels(
      { provider: 'ollama' },
      {
        runCommandWithEnv,
        enablePluginCommand,
      }
    )

    expect(runCommandWithEnv).toHaveBeenCalledWith(
      ['models', 'list', '--all', '--local', '--json', '--provider', 'ollama'],
      expect.any(Number),
      {
        OLLAMA_HOST: 'http://127.0.0.1:11434',
        OLLAMA_API_KEY: undefined,
      }
    )
  })

  it('uses a transient env override for custom-openai without persisting the shared OpenAI key', async () => {
    const { scanLocalModels } = await import('../openclaw-model-config')
    const runCommandWithEnv = vi.fn(async () => ok(JSON.stringify({ models: [] })))

    await scanLocalModels(
      {
        provider: 'custom-openai',
        baseUrl: 'http://127.0.0.1:1234/v1',
      },
      {
        runCommandWithEnv,
      }
    )

    expect(runCommandWithEnv).toHaveBeenCalledWith(
      ['models', 'list', '--all', '--local', '--json', '--provider', 'custom-openai'],
      expect.any(Number),
      {
        OPENAI_BASE_URL: 'http://127.0.0.1:1234/v1',
        OPENAI_API_KEY: undefined,
      }
    )
  })
})
