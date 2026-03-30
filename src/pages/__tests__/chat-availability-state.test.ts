import { describe, expect, it, vi } from 'vitest'
import { resolveChatPageAvailabilityState } from '../chat-availability-state'
import type { DashboardChatAvailability } from '../../shared/chat-panel'

function buildAvailability(overrides: Partial<DashboardChatAvailability> = {}): DashboardChatAvailability {
  return {
    state: 'no-model',
    ready: false,
    canSend: false,
    reason: 'no-configured-model',
    gatewayRunning: false,
    connectedModels: [],
    defaultModel: undefined,
    agentId: 'main',
    message: '当前还没有可直接对话的模型',
    ...overrides,
  }
}

describe('resolveChatPageAvailabilityState', () => {
  it('does not infer connected models from default model when availability reports none', async () => {
    const getChatAvailability = vi.fn(async () =>
      buildAvailability({
        ready: false,
        reason: 'no-configured-model',
        gatewayRunning: true,
        connectedModels: [],
        defaultModel: 'openai/gpt-5.1-codex',
        message: '当前还没有可直接对话的模型',
      })
    )
    const gatewayHealth = vi.fn(async () => ({ running: true }))
    const readConfig = vi.fn(async () => null)

    const result = await resolveChatPageAvailabilityState({
      getChatAvailability,
      gatewayHealth,
      readConfig,
    })

    expect(result.gatewayRunning).toBe(true)
    expect(result.availabilityState).toBe('no-model')
    expect(result.canSend).toBe(false)
    expect(result.connectedModels).toEqual([])
    expect(result.defaultModel).toBe('openai/gpt-5.1-codex')
    expect(result.availabilityMessage).toBe('当前还没有可直接对话的模型')
  })

  it('prefers unified chat availability and skips legacy fallback probes', async () => {
    const getChatAvailability = vi.fn(async () =>
      buildAvailability({
        ready: true,
        state: 'ready',
        canSend: true,
        reason: 'ready',
        gatewayRunning: true,
        connectedModels: ['openai/gpt-5.1-codex'],
        defaultModel: 'openai/gpt-5.1-codex',
      })
    )
    const gatewayHealth = vi.fn(async () => ({ running: false }))
    const readConfig = vi.fn(async () => null)

    const result = await resolveChatPageAvailabilityState({
      getChatAvailability,
      gatewayHealth,
      readConfig,
    })

    expect(result.gatewayRunning).toBe(true)
    expect(result.availabilityState).toBe('ready')
    expect(result.canSend).toBe(true)
    expect(result.connectedModels).toEqual(['openai/gpt-5.1-codex'])
    expect(result.defaultModel).toBe('openai/gpt-5.1-codex')
    expect(result.availabilityMessage).toBe('')
    expect(gatewayHealth).not.toHaveBeenCalled()
    expect(readConfig).not.toHaveBeenCalled()
  })

  it('falls back to gateway/config snapshot when chat availability API fails', async () => {
    const getChatAvailability = vi.fn(async () => {
      throw new Error('chat availability unavailable')
    })
    const gatewayHealth = vi.fn(async () => ({ running: true }))
    const readConfig = vi.fn(async () => ({
      agents: {
        defaults: {
          model: {
            primary: 'openai/gpt-5.1-codex',
          },
        },
      },
    }))

    const result = await resolveChatPageAvailabilityState({
      getChatAvailability,
      gatewayHealth,
      readConfig,
    })

    expect(result.availabilityState).toBe('error')
    expect(result.canSend).toBe(false)
    expect(result.gatewayRunning).toBe(true)
    expect(result.connectedModels).toEqual([])
    expect(result.defaultModel).toBe('openai/gpt-5.1-codex')
    expect(result.availabilityMessage).toBe('聊天状态读取失败，请稍后重试')
  })

  it('supports top-level defaultModel in config fallback snapshots', async () => {
    const getChatAvailability = vi.fn(async () => {
      throw new Error('chat availability unavailable')
    })
    const gatewayHealth = vi.fn(async () => ({ running: true }))
    const readConfig = vi.fn(async () => ({
      defaultModel: 'openai/gpt-5',
    }))

    const result = await resolveChatPageAvailabilityState({
      getChatAvailability,
      gatewayHealth,
      readConfig,
    })

    expect(result.availabilityState).toBe('error')
    expect(result.canSend).toBe(false)
    expect(result.gatewayRunning).toBe(true)
    expect(result.connectedModels).toEqual([])
    expect(result.defaultModel).toBe('openai/gpt-5')
  })
})
