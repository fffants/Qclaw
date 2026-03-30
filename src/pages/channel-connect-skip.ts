export interface FeishuPairingStatus {
  pairedCount?: number
  pairedUsers?: string[]
}

export function shouldShowSkipButtonForFeishuPairing(
  pairingStatusByBot: Record<string, FeishuPairingStatus> | null | undefined
): boolean {
  if (!pairingStatusByBot || typeof pairingStatusByBot !== 'object') {
    return false
  }

  return Object.values(pairingStatusByBot).some(status => Number(status?.pairedCount) > 0)
}
