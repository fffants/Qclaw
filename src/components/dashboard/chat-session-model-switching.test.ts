import { describe, expect, it } from 'vitest'
import {
  buildSessionModelOptions,
  resolveSessionModelIntentState,
  resolveSessionModelSelectValue,
  resolveSessionModelPresentation,
  resolveSessionModelSelection,
} from './chat-session-model-switching'

describe('chat session model switching helper', () => {
  it('falls back to the current default when the selected and session models are no longer connected', () => {
    expect(
      resolveSessionModelSelection({
        selectedModel: 'openai/gpt-5',
        sessionModel: 'minimax/MiniMax-M2.5',
        defaultModel: 'openai/gpt-5.4',
        connectedModels: ['openai/gpt-5.4', 'zai/glm-5'],
      })
    ).toBe('openai/gpt-5.4')
  })

  it('prefers a connected session model before falling back to the first connected model', () => {
    expect(
      resolveSessionModelSelection({
        sessionModel: 'zai/glm-4.7',
        defaultModel: 'moonshot/kimi-k2.5',
        connectedModels: ['moonshot/kimi-k2.5', 'zai/glm-4.7'],
      })
    ).toBe('zai/glm-4.7')
  })

  it('prefers a connected default model even when it is not the first connected option', () => {
    expect(
      resolveSessionModelSelection({
        defaultModel: 'zai/glm-4.7',
        connectedModels: ['moonshot/kimi-k2.5', 'zai/glm-4.7'],
      })
    ).toBe('zai/glm-4.7')
  })

  it('does not keep disconnected stale session models in the picker options', () => {
    expect(
      buildSessionModelOptions({
        selectedModel: 'openai/gpt-5',
        sessionModel: 'minimax/MiniMax-M2.5',
        defaultModel: 'openai/gpt-5.4',
        connectedModels: ['openai/gpt-5.4', 'zai/glm-5'],
      }).map((item) => item.value)
    ).toEqual(['openai/gpt-5.4', 'zai/glm-5'])
  })

  it('does not re-add a stale default model when connected models are already known', () => {
    expect(
      buildSessionModelOptions({
        defaultModel: 'minimax/MiniMax-M2.5',
        connectedModels: ['openai/gpt-5.4', 'zai/glm-5'],
      }).map((item) => item.value)
    ).toEqual(['openai/gpt-5.4', 'zai/glm-5'])
  })

  it('does not expose the default model as a selectable option when no connected models are available', () => {
    expect(
      buildSessionModelOptions({
        defaultModel: 'openai/gpt-5.4',
        connectedModels: [],
      }).map((item) => item.value)
    ).toEqual([])
  })

  it('does not auto-select the default model when no connected models are available', () => {
    expect(
      resolveSessionModelSelection({
        selectedModel: 'openai/gpt-5.4',
        sessionModel: 'openai/gpt-5.4',
        defaultModel: 'openai/gpt-5.4',
        connectedModels: [],
      })
    ).toBe('')
  })

  it('keeps an equivalent connected MiniMax alias selected after refresh', () => {
    expect(
      resolveSessionModelSelection({
        selectedModel: 'minimax/MiniMax-M2.5',
        defaultModel: 'minimax/MiniMax-M2.5',
        connectedModels: ['minimax-portal/MiniMax-M2.5', 'openai/gpt-5.4'],
      })
    ).toBe('minimax-portal/MiniMax-M2.5')
  })

  it('describes immediate in-session switching for patchable conversations', () => {
    expect(
      resolveSessionModelPresentation({
        hasSession: true,
        pendingTargetModel: 'openai/gpt-5.4-pro',
        canPatchModel: true,
      })
    ).toEqual({
      modeLabel: '立即切换当前会话',
      modeTone: 'teal',
      targetLabel: '待切换目标',
      helperText: '正在把当前会话切到 openai/gpt-5.4-pro。',
    })
  })

  it('treats an already confirmed patchable session as ready instead of blocked by first-send wording', () => {
    expect(
      resolveSessionModelPresentation({
        hasSession: true,
        canPatchModel: true,
      })
    ).toEqual({
      modeLabel: '沿用当前会话模型',
      modeTone: 'teal',
      targetLabel: '待切换目标',
      helperText: '仅影响当前会话，不会修改默认模型。',
    })
  })

  it('surfaces the blocked state until the first OpenClaw session exists', () => {
    expect(
      resolveSessionModelPresentation({
        hasSession: true,
        canPatchModel: false,
      })
    ).toEqual({
      modeLabel: '发送首条消息后可切换',
      modeTone: 'gray',
      targetLabel: '待切换目标',
      helperText: '当前会话还没有可切换的 OpenClaw session，请先发送一条消息后再试。',
    })
  })

  it('surfaces the concrete blocked reason when the session cannot switch models', () => {
    expect(
      resolveSessionModelPresentation({
        hasSession: true,
        canPatchModel: false,
        blockedReason: '当前会话缺少 session key',
      })
    ).toEqual({
      modeLabel: '发送首条消息后可切换',
      modeTone: 'gray',
      targetLabel: '待切换目标',
      helperText: '当前会话缺少 session key',
    })
  })

  it('treats pending target as an in-flight patch state instead of a pure value difference', () => {
    expect(
      resolveSessionModelIntentState({
        hasSession: true,
        canPatchModel: true,
        inFlightTargetModel: 'openai/gpt-5.4-pro',
        selectedModel: 'openai/gpt-5.4-pro',
        confirmedModel: 'openai/gpt-5.4',
      })
    ).toEqual({
      pendingTargetModel: 'openai/gpt-5.4-pro',
      unconfirmedSelectionModel: '',
    })
  })

  it('downgrades a stale selection mismatch to a weak unconfirmed hint', () => {
    expect(
      resolveSessionModelIntentState({
        hasSession: true,
        canPatchModel: true,
        selectedModel: 'openai/gpt-5.4-pro',
        confirmedModel: 'openai/gpt-5.4',
      })
    ).toEqual({
      pendingTargetModel: '',
      unconfirmedSelectionModel: 'openai/gpt-5.4-pro',
    })

    expect(
      resolveSessionModelPresentation({
        hasSession: true,
        canPatchModel: true,
        unconfirmedSelectionModel: 'openai/gpt-5.4-pro',
      })
    ).toEqual({
      modeLabel: '以确认态为准',
      modeTone: 'gray',
      targetLabel: '最近选择',
      helperText: '当前选择过 openai/gpt-5.4-pro，但尚未确认应用；界面仍以当前会话确认态为准。',
    })
  })

  it('suppresses the weak mismatch hint when the selection is not user-owned in this view', () => {
    expect(
      resolveSessionModelIntentState({
        hasSession: true,
        canPatchModel: true,
        selectedModel: 'openai/gpt-5.4-pro',
        confirmedModel: 'openai/gpt-5.4',
        selectionOwnedByUser: false,
      })
    ).toEqual({
      pendingTargetModel: '',
      unconfirmedSelectionModel: '',
    })
  })

  it('does not report a weak mismatch when two model keys are alias-equivalent', () => {
    expect(
      resolveSessionModelIntentState({
        hasSession: true,
        canPatchModel: true,
        selectedModel: 'minimax/MiniMax-M2.5',
        confirmedModel: 'minimax-portal/MiniMax-M2.5',
      })
    ).toEqual({
      pendingTargetModel: '',
      unconfirmedSelectionModel: '',
    })
  })

  it('shows the confirmed model in the select when only a stale previous selection remains', () => {
    expect(
      resolveSessionModelSelectValue({
        selectedModel: 'moonshot/kimi-k2.5',
        confirmedModel: 'zai/glm-4.7',
        unconfirmedSelectionModel: 'moonshot/kimi-k2.5',
        connectedModels: ['moonshot/kimi-k2.5', 'zai/glm-4.7'],
      })
    ).toBe('zai/glm-4.7')
  })

  it('prefers the confirmed model in the select when the stale selection is not user-owned', () => {
    expect(
      resolveSessionModelSelectValue({
        selectedModel: 'moonshot/kimi-k2.5',
        confirmedModel: 'zai/glm-4.7',
        connectedModels: ['moonshot/kimi-k2.5', 'zai/glm-4.7'],
        selectionOwnedByUser: false,
      })
    ).toBe('zai/glm-4.7')
  })

  it('keeps showing the pending target in the select while a session patch is in flight', () => {
    expect(
      resolveSessionModelSelectValue({
        selectedModel: 'openai/gpt-5.4-pro',
        confirmedModel: 'openai/gpt-5.4',
        pendingTargetModel: 'openai/gpt-5.4-pro',
        connectedModels: ['openai/gpt-5.4', 'openai/gpt-5.4-pro'],
      })
    ).toBe('openai/gpt-5.4-pro')
  })
})
