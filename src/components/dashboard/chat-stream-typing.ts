export function advanceStreamingText(currentText: string, targetText: string): string {
  const current = String(currentText || '')
  const target = String(targetText || '')

  if (!target || current === target) return target
  if (!target.startsWith(current)) return target

  const remaining = target.length - current.length
  if (remaining <= 0) return target

  const step = Math.max(1, Math.min(8, Math.ceil(remaining / 24)))
  return target.slice(0, current.length + step)
}
