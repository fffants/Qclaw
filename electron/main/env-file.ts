export function applyEnvFileUpdates(
  existing: string,
  updates: Record<string, string | null | undefined>
): string {
  const normalizedUpdates = new Map(
    Object.entries(updates)
      .map(([key, value]) => [String(key || '').trim(), value == null ? undefined : String(value)] as const)
      .filter(([key]) => Boolean(key))
  )
  const lines = existing.split('\n')
  const updatedKeys = new Set<string>()

  const nextLines = lines.flatMap((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return [line]

    const eqIndex = trimmed.indexOf('=')
    if (eqIndex <= 0) return [line]

    const key = trimmed.slice(0, eqIndex)
    if (!normalizedUpdates.has(key)) return [line]

    updatedKeys.add(key)
    const nextValue = normalizedUpdates.get(key)
    return nextValue == null ? [] : [`${key}=${nextValue}`]
  })

  for (const [key, value] of normalizedUpdates.entries()) {
    if (!updatedKeys.has(key) && value != null) {
      nextLines.push(`${key}=${value}`)
    }
  }

  return nextLines.join('\n')
}
