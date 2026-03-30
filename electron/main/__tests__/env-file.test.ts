import { describe, expect, it } from 'vitest'
import { applyEnvFileUpdates } from '../env-file'

describe('applyEnvFileUpdates', () => {
  it('removes keys when the update value is undefined', () => {
    const next = applyEnvFileUpdates(
      ['OLLAMA_HOST=http://127.0.0.1:11434', 'OLLAMA_API_KEY=ollama-secret'].join('\n'),
      {
        OLLAMA_HOST: 'http://127.0.0.1:11434',
        OLLAMA_API_KEY: undefined,
      }
    )

    expect(next).toBe('OLLAMA_HOST=http://127.0.0.1:11434')
  })
})
