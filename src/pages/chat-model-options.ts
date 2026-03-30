function normalizeModelKey(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeModelList(list: unknown): string[] {
  if (!Array.isArray(list)) return []
  return Array.from(
    new Set(
      list
        .map((item) => normalizeModelKey(item))
        .filter(Boolean)
    )
  )
}

export function resolveChatSelectableModels(params: {
  connectedModels?: unknown
  defaultModel?: unknown
}): string[] {
  return normalizeModelList(params.connectedModels)
}
