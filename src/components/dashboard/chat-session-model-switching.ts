import { findEquivalentRuntimeModelKey } from '../../lib/model-runtime-resolution'

function normalizeValue(value: unknown): string {
  return String(value || '').trim()
}

function areModelsEquivalent(left: string, right: string): boolean {
  if (!left || !right) return false
  if (left === right) return true
  return Boolean(findEquivalentRuntimeModelKey(left, [right]) || findEquivalentRuntimeModelKey(right, [left]))
}

export type SessionModelPresentationTone = 'brand' | 'gray' | 'teal' | 'orange'

export interface SessionModelIntentState {
  pendingTargetModel: string
  unconfirmedSelectionModel: string
}

export interface SessionModelPresentation {
  modeLabel: string
  modeTone: SessionModelPresentationTone
  targetLabel: string
  helperText: string
}

function normalizeConnectedModels(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return Array.from(new Set(input.map((item) => normalizeValue(item)).filter(Boolean)))
}

function resolveSelectableConnectedModel(targetModel: unknown, connectedModels: string[]): string {
  const normalizedTargetModel = normalizeValue(targetModel)
  if (!normalizedTargetModel) return ''

  const exactMatch = connectedModels.find((model) => model === normalizedTargetModel)
  if (exactMatch) return exactMatch

  return findEquivalentRuntimeModelKey(normalizedTargetModel, connectedModels)
}

export function resolveSessionModelSelection(params: {
  selectedModel?: string
  sessionModel?: string
  defaultModel?: string
  connectedModels?: string[]
}): string {
  const selectedModel = normalizeValue(params.selectedModel)
  const sessionModel = normalizeValue(params.sessionModel)
  const defaultModel = normalizeValue(params.defaultModel)
  const connectedModels = normalizeConnectedModels(params.connectedModels)

  const allowed = new Set<string>(connectedModels)
  if (selectedModel && allowed.has(selectedModel)) return selectedModel
  if (selectedModel) {
    const equivalentSelected = findEquivalentRuntimeModelKey(selectedModel, connectedModels)
    if (equivalentSelected) return equivalentSelected
  }
  if (sessionModel && allowed.has(sessionModel)) return sessionModel
  if (sessionModel) {
    const equivalentSession = findEquivalentRuntimeModelKey(sessionModel, connectedModels)
    if (equivalentSession) return equivalentSession
  }
  if (defaultModel && allowed.has(defaultModel)) return defaultModel
  if (defaultModel) {
    const equivalentDefault = findEquivalentRuntimeModelKey(defaultModel, connectedModels)
    if (equivalentDefault) return equivalentDefault
  }
  return connectedModels[0] || ''
}

export function buildSessionModelOptions(params: {
  selectedModel?: string
  sessionModel?: string
  defaultModel?: string
  connectedModels?: string[]
}): Array<{ value: string; label: string }> {
  const connectedModels = normalizeConnectedModels(params.connectedModels)

  return connectedModels.map((model) => ({
    value: model,
    label: model,
  }))
}

export function resolveSessionModelSelectValue(params: {
  selectedModel?: string
  confirmedModel?: string
  pendingTargetModel?: string
  unconfirmedSelectionModel?: string
  connectedModels?: string[]
  selectionOwnedByUser?: boolean
}): string {
  const connectedModels = normalizeConnectedModels(params.connectedModels)
  const pendingTargetModel = resolveSelectableConnectedModel(params.pendingTargetModel, connectedModels)
  if (pendingTargetModel) return pendingTargetModel

  const selectedModel = resolveSelectableConnectedModel(params.selectedModel, connectedModels)
  const confirmedModel = resolveSelectableConnectedModel(params.confirmedModel, connectedModels)
  const unconfirmedSelectionModel = normalizeValue(params.unconfirmedSelectionModel)
  const selectionOwnedByUser = params.selectionOwnedByUser !== false

  if (unconfirmedSelectionModel && confirmedModel) {
    return confirmedModel
  }

  if (!selectionOwnedByUser && confirmedModel) {
    return confirmedModel
  }

  return selectedModel || confirmedModel || connectedModels[0] || ''
}

export function resolveSessionModelIntentState(params: {
  hasSession: boolean
  canPatchModel: boolean
  inFlightTargetModel?: string
  selectedModel?: string
  confirmedModel?: string
  selectionOwnedByUser?: boolean
}): SessionModelIntentState {
  const inFlightTargetModel = normalizeValue(params.inFlightTargetModel)
  const selectedModel = normalizeValue(params.selectedModel)
  const confirmedModel = normalizeValue(params.confirmedModel)
  const selectionOwnedByUser = params.selectionOwnedByUser !== false

  if (params.hasSession && params.canPatchModel && inFlightTargetModel) {
    return {
      pendingTargetModel: inFlightTargetModel,
      unconfirmedSelectionModel: '',
    }
  }

  if (
    !params.hasSession ||
    !params.canPatchModel ||
    !selectionOwnedByUser ||
    !selectedModel ||
    !confirmedModel ||
    areModelsEquivalent(selectedModel, confirmedModel)
  ) {
    return {
      pendingTargetModel: '',
      unconfirmedSelectionModel: '',
    }
  }

  return {
    pendingTargetModel: '',
    unconfirmedSelectionModel: selectedModel,
  }
}

export function resolveSessionModelPresentation(params: {
  hasSession: boolean
  pendingTargetModel?: string
  unconfirmedSelectionModel?: string
  canPatchModel: boolean
  blockedReason?: string
}): SessionModelPresentation {
  const pendingTargetModel = normalizeValue(params.pendingTargetModel)
  const unconfirmedSelectionModel = normalizeValue(params.unconfirmedSelectionModel)
  const blockedReason = normalizeValue(params.blockedReason)

  if (!params.hasSession) {
    return {
      modeLabel: '先选择会话',
      modeTone: 'gray',
      targetLabel: '待切换目标',
      helperText: '先选择一个会话，再设置它后续要使用的模型。',
    }
  }

  if (!params.canPatchModel) {
    return {
      modeLabel: '发送首条消息后可切换',
      modeTone: 'gray',
      targetLabel: '待切换目标',
      helperText: blockedReason || '当前会话还没有可切换的 OpenClaw session，请先发送一条消息后再试。',
    }
  }

  if (unconfirmedSelectionModel) {
    return {
      modeLabel: '以确认态为准',
      modeTone: 'gray',
      targetLabel: '最近选择',
      helperText: `当前选择过 ${unconfirmedSelectionModel}，但尚未确认应用；界面仍以当前会话确认态为准。`,
    }
  }

  return {
    modeLabel: pendingTargetModel ? '立即切换当前会话' : '沿用当前会话模型',
    modeTone: 'teal',
    targetLabel: '待切换目标',
    helperText: pendingTargetModel
      ? `正在把当前会话切到 ${pendingTargetModel}。`
      : '仅影响当前会话，不会修改默认模型。',
  }
}
