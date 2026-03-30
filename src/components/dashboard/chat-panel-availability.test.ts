import { describe, expect, it } from 'vitest'
import { deriveChatPanelAvailabilityView } from './chat-panel-availability'

describe('deriveChatPanelAvailabilityView', () => {
  it('shows a degraded banner instead of an empty state when conversation should be preserved', () => {
    const view = deriveChatPanelAvailabilityView({
      availabilityState: 'degraded',
      canSend: true,
      connectedModels: ['openai/gpt-5.4-pro'],
      availabilityMessage: '网关连接不稳定，正在自动恢复',
      preserveConversation: true,
    })

    expect(view.isDegraded).toBe(true)
    expect(view.showAvailabilityBanner).toBe(true)
    expect(view.showAvailabilityEmptyState).toBe(false)
    expect(view.headerBadgeLabel).toBe('连接波动')
    expect(view.statusDetail).toContain('当前聊天记录已保留')
  })

  it('shows the empty state for no-model when there is no conversation to preserve', () => {
    const view = deriveChatPanelAvailabilityView({
      availabilityState: 'no-model',
      canSend: false,
      connectedModels: [],
      availabilityMessage: '',
      preserveConversation: false,
    })

    expect(view.isModelUnavailable).toBe(true)
    expect(view.showAvailabilityBanner).toBe(false)
    expect(view.showAvailabilityEmptyState).toBe(true)
    expect(view.resolvedAvailabilityMessage).toBe('当前还没有可直接对话的模型')
    expect(view.headerBadgeLabel).toBe('待连接模型')
  })

  it('shows an offline banner and preserves transcript context when sending state is retained', () => {
    const view = deriveChatPanelAvailabilityView({
      availabilityState: 'offline',
      canSend: false,
      connectedModels: ['openai/gpt-5.4-pro'],
      availabilityMessage: '模型已配置，但网关当前未运行',
      preserveConversation: true,
    })

    expect(view.showAvailabilityBanner).toBe(true)
    expect(view.showAvailabilityEmptyState).toBe(false)
    expect(view.headerBadgeLabel).toBe('网关离线')
    expect(view.statusDetail).toContain('恢复后可继续查看或发送')
  })
})
