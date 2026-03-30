export type ChatSessionSourceType = 'webchat' | 'channel' | 'external-unknown'

export interface ParsedChatSessionSource {
  sourceType: ChatSessionSourceType
  sourceChannel?: string
  sourceAccountId?: string
  sourcePeerId?: string
}

function toOptionalString(value: unknown): string | undefined {
  const normalized = String(value || '').trim()
  return normalized || undefined
}

export function parseChatSessionSourceFromKey(sessionKey: string | undefined): ParsedChatSessionSource {
  const normalizedKey = toOptionalString(sessionKey)
  if (!normalizedKey) {
    return { sourceType: 'external-unknown' }
  }

  const parts = normalizedKey.split(':')
  if (parts.length < 3 || parts[0] !== 'agent') {
    return { sourceType: 'external-unknown' }
  }

  if (parts.length === 3 && parts[2] === 'main') {
    return { sourceType: 'webchat' }
  }

  if (parts.length >= 6 && parts[4] === 'direct') {
    const sourceChannel = toOptionalString(parts[2])?.toLowerCase()
    if (!sourceChannel || sourceChannel === 'main') {
      return { sourceType: 'external-unknown' }
    }
    return {
      sourceType: 'channel',
      sourceChannel,
      sourceAccountId: toOptionalString(parts[3]),
      sourcePeerId: toOptionalString(parts.slice(5).join(':')),
    }
  }

  return { sourceType: 'external-unknown' }
}

export function getChannelDisplayName(channel: string | undefined): string {
  const normalized = String(channel || '').trim().toLowerCase()
  if (normalized === 'feishu') return '飞书'
  if (normalized === 'wecom') return '企微'
  if (normalized === 'dingtalk') return '钉钉'
  if (normalized === 'telegram') return 'Telegram'
  if (normalized === 'slack') return 'Slack'
  if (normalized === 'whatsapp') return 'WhatsApp'
  if (!normalized) return '渠道'
  return normalized
}
