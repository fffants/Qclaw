import { describe, expect, it } from 'vitest'
import { resolveChatSelectableModels } from '../chat-model-options'

describe('resolveChatSelectableModels', () => {
  it('only keeps currently connected models for chat switching', () => {
    expect(
      resolveChatSelectableModels({
        connectedModels: ['openai/gpt-5', 'zai/glm-4.5v', 'openai/gpt-5'],
        defaultModel: 'openai/gpt-5',
      })
    ).toEqual([
      'openai/gpt-5',
      'zai/glm-4.5v',
    ])
  })

  it('does not re-add the default model when the unified backend reports no connected models', () => {
    expect(
      resolveChatSelectableModels({
        connectedModels: null,
        defaultModel: ' openai/gpt-5.1-codex ',
      })
    ).toEqual([])
  })

  it('returns an empty list for invalid inputs', () => {
    expect(
      resolveChatSelectableModels({
        connectedModels: ['   ', ''],
        defaultModel: { key: 'openai/gpt-5.1-codex' },
      })
    ).toEqual([])
  })
})
