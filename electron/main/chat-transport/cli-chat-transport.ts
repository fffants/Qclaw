import type { ChatUsage } from '../../../src/shared/chat-panel'
import {
  CHAT_REPLY_REJECTED_PATH_PATTERN,
  sanitizeAssistantVisibleText,
} from '../../../src/shared/chat-visible-text'
import type { ChatTransport, ChatTransportRunParams, ChatTransportRunResult, RunStreamingCommand } from './chat-transport-types'
import { assertNoSendTimeModelOverride } from '../chat-model-switching-invariant'

interface StringLeaf {
  path: string
  value: string
}

interface ParsedAgentStreamEvent {
  text: string | null
  mode: AgentStreamTextMode
  model?: string
  usage?: ChatUsage
}

interface PartialAgentStreamPreview {
  text: string
  model?: string
}

type AgentStreamTextMode = 'delta' | 'snapshot'

function collectStringLeaves(value: unknown, path: string, depth = 0): StringLeaf[] {
  if (depth > 4 || value == null) return []
  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized ? [{ path, value: normalized }] : []
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectStringLeaves(item, `${path}[${index}]`, depth + 1))
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) =>
      collectStringLeaves(nested, path ? `${path}.${key}` : key, depth + 1)
    )
  }
  return []
}

function selectPreferredLeaf(leaves: StringLeaf[], matcher: RegExp, rejectedPath?: RegExp): string | undefined {
  for (const leaf of leaves) {
    if (!matcher.test(leaf.path)) continue
    if (rejectedPath?.test(leaf.path)) continue
    return leaf.value
  }
  return undefined
}

function selectBestReplyLeaf(leaves: StringLeaf[]): string | undefined {
  const preferredPath =
    /\b(response\.text|reply\.text|result\.text|message\.content|message\.text|assistant\.text|content|text)\b/i
  return (
    selectPreferredLeaf(leaves, preferredPath, CHAT_REPLY_REJECTED_PATH_PATTERN) ||
    leaves.find((leaf) => !CHAT_REPLY_REJECTED_PATH_PATTERN.test(leaf.path))?.value
  )
}

function findFirstStringField(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== 'object') return undefined
  for (const key of keys) {
    const nested = (value as Record<string, unknown>)[key]
    if (typeof nested === 'string' && nested.trim()) return nested.trim()
  }
  return undefined
}

function toOptionalTokenCount(value: unknown): number | undefined {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return undefined
  return parsed
}

function parseUsageCandidate(value: unknown): ChatUsage | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const usage: ChatUsage = {}

  usage.inputTokens = [
    record.inputTokens,
    record.input_tokens,
    record.promptTokens,
    record.prompt_tokens,
  ]
    .map(toOptionalTokenCount)
    .find((candidate): candidate is number => candidate != null)

  usage.outputTokens = [
    record.outputTokens,
    record.output_tokens,
    record.completionTokens,
    record.completion_tokens,
    record.replyTokens,
  ]
    .map(toOptionalTokenCount)
    .find((candidate): candidate is number => candidate != null)

  usage.totalTokens = [record.totalTokens, record.total_tokens]
    .map(toOptionalTokenCount)
    .find((candidate): candidate is number => candidate != null)

  usage.reasoningTokens = [record.reasoningTokens, record.reasoning_tokens, record.thinkingTokens]
    .map(toOptionalTokenCount)
    .find((candidate): candidate is number => candidate != null)

  return Object.values(usage).some((candidate) => candidate != null) ? usage : undefined
}

function parseUsageFromPayload(value: unknown): ChatUsage | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const candidates: unknown[] = [
    record,
    record.usage,
    record.message,
    record.response,
    record.result,
    record.result && typeof record.result === 'object' ? (record.result as Record<string, unknown>).usage : null,
    record.result && typeof record.result === 'object' ? (record.result as Record<string, unknown>).response : null,
    record.message && typeof record.message === 'object' ? (record.message as Record<string, unknown>).usage : null,
    record.response && typeof record.response === 'object' ? (record.response as Record<string, unknown>).usage : null,
  ]

  for (const candidate of candidates) {
    const usage = parseUsageCandidate(candidate)
    if (usage) return usage
  }
  return undefined
}

function extractLatestJsonStringField(raw: string, fieldNames: string[]): string | undefined {
  const normalized = String(raw || '')
  if (!normalized) return undefined

  let latestMatch: { index: number; value: string } | null = null
  for (const fieldName of fieldNames) {
    const escapedField = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`"${escapedField}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'g')
    for (const match of normalized.matchAll(pattern)) {
      const rawValue = match[1]
      if (!rawValue) continue
      const normalizedValue = rawValue
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .trim()
      if (!normalizedValue) continue
      if (!latestMatch || match.index > latestMatch.index) {
        latestMatch = {
          index: match.index,
          value: normalizedValue,
        }
      }
    }
  }

  return latestMatch?.value
}

function parsePartialAgentStreamPreview(raw: string): PartialAgentStreamPreview | null {
  const normalized = String(raw || '')
  if (!normalized.trim()) return null

  const text = extractLatestJsonStringField(normalized, [
    'text',
    'content',
    'reply',
    'answer',
    'output',
    'final',
  ])
  const sanitizedText = sanitizeAssistantVisibleText(text || '')
  if (!sanitizedText) return null

  return {
    text: sanitizedText,
    model: extractLatestJsonStringField(normalized, ['model', 'modelName']),
  }
}

function parseAgentStreamEvent(line: string): ParsedAgentStreamEvent | null {
  const normalizedLine = String(line || '').trim()
  if (!normalizedLine) return null
  const payloadLine = normalizedLine.startsWith('data:') ? normalizedLine.slice(5).trim() : normalizedLine
  if (!payloadLine || payloadLine === '[DONE]') return null

  try {
    const parsed = JSON.parse(payloadLine) as unknown
    if (typeof parsed === 'string') {
      const sanitizedText = sanitizeAssistantVisibleText(parsed)
      return {
        text: sanitizedText || null,
        mode: 'snapshot',
      }
    }

    const leaves = collectStringLeaves(parsed, '')
    const eventType = findFirstStringField(parsed, ['type', 'event'])
    const deltaHint = /\b(delta|chunk|partial|token)\b/i.test(String(eventType || ''))
    const deltaText =
      selectPreferredLeaf(leaves, /\b(delta|chunk|partial|token)\b/i, CHAT_REPLY_REJECTED_PATH_PATTERN) ||
      selectPreferredLeaf(leaves, /\b(textDelta|contentDelta|replyDelta)\b/i, CHAT_REPLY_REJECTED_PATH_PATTERN)
    const snapshotText = sanitizeAssistantVisibleText(selectBestReplyLeaf(leaves) || '') || undefined

    return {
      text: sanitizeAssistantVisibleText(deltaText || snapshotText || '') || null,
      mode: deltaText || deltaHint ? 'delta' : 'snapshot',
      model:
        findFirstStringField(parsed, ['model', 'modelName']) ||
        (parsed && typeof parsed === 'object'
          ? findFirstStringField((parsed as Record<string, unknown>).message, ['model', 'modelName'])
          : undefined),
      usage: parseUsageFromPayload(parsed),
    }
  } catch {
    return null
  }
}

function applyStreamTextUpdate(
  currentText: string,
  incomingText: string,
  mode: AgentStreamTextMode
): { nextText: string; delta: string } {
  const normalizedCurrent = String(currentText || '')
  const normalizedIncoming = String(incomingText || '')
  if (!normalizedIncoming) {
    return {
      nextText: normalizedCurrent,
      delta: '',
    }
  }

  if (mode === 'delta') {
    if (normalizedCurrent.endsWith(normalizedIncoming)) {
      return {
        nextText: normalizedCurrent,
        delta: '',
      }
    }
    return {
      nextText: `${normalizedCurrent}${normalizedIncoming}`,
      delta: normalizedIncoming,
    }
  }

  if (normalizedIncoming === normalizedCurrent) {
    return {
      nextText: normalizedCurrent,
      delta: '',
    }
  }

  if (normalizedIncoming.startsWith(normalizedCurrent)) {
    return {
      nextText: normalizedIncoming,
      delta: normalizedIncoming.slice(normalizedCurrent.length),
    }
  }

  if (!normalizedCurrent) {
    return {
      nextText: normalizedIncoming,
      delta: normalizedIncoming,
    }
  }

  return {
    nextText: normalizedIncoming,
    delta: '',
  }
}

export function createCliChatTransport(params: { runStreamingCommand: RunStreamingCommand }): ChatTransport {
  const { runStreamingCommand } = params

  return {
    async run(input: ChatTransportRunParams): Promise<ChatTransportRunResult> {
      assertNoSendTimeModelOverride(input, 'CLI 聊天 transport')
      let streamBuffer = ''
      let rawStreamStdout = ''
      let streamedText = ''
      let streamedModel: string | undefined
      let streamedUsage: ChatUsage | undefined

      const flushStreamBuffer = (flushRemainder = false) => {
        const normalized = flushRemainder ? `${streamBuffer}\n` : streamBuffer
        const lines = normalized.split('\n')
        if (!flushRemainder) {
          streamBuffer = lines.pop() || ''
        } else {
          streamBuffer = ''
        }

        for (const line of lines) {
          const parsed = parseAgentStreamEvent(line)
          if (!parsed) continue
          streamedModel = parsed.model || streamedModel
          streamedUsage = parsed.usage || streamedUsage
          if (!parsed.text) continue

          const update = applyStreamTextUpdate(streamedText, parsed.text, parsed.mode)
          streamedText = update.nextText
          if (!update.delta) continue

          input.onAssistantDelta?.({
            text: streamedText,
            delta: update.delta,
            model: streamedModel,
            usage: streamedUsage,
          })
        }
      }

      const syncPartialStreamPreview = () => {
        const preview = parsePartialAgentStreamPreview(rawStreamStdout)
        if (!preview?.text) return

        streamedModel = preview.model || streamedModel
        const update = applyStreamTextUpdate(streamedText, preview.text, 'snapshot')
        streamedText = update.nextText
        if (!update.delta) return

        input.onAssistantDelta?.({
          text: streamedText,
          delta: update.delta,
          model: streamedModel,
          usage: streamedUsage,
        })
      }

      const command = [
        'agent',
        '--json',
        '--session-id',
        input.transportSessionId,
        '--message',
        input.messageText,
        '--thinking',
        input.thinking,
      ]

      const result = await runStreamingCommand(command, {
        controlDomain: 'chat',
        onStdout: (chunk) => {
          rawStreamStdout = `${rawStreamStdout}${chunk}`
          streamBuffer = `${streamBuffer}${chunk}`
          flushStreamBuffer(false)
          syncPartialStreamPreview()
        },
      })
      flushStreamBuffer(true)

      return {
        ...result,
        streamedText,
        streamedModel,
        streamedUsage,
      }
    },
  }
}
