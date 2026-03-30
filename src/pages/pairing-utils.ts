import {
  PAIRING_CODE_MIN_LENGTH,
  PAIRING_CODE_MAX_LENGTH,
  PAIRING_CODE_PATTERN,
  PAIRING_CODE_TOKEN_SOURCE,
  isPairingCodeReady,
  isPairingApproveConfirmed,
  resolvePairingApproveErrorCode,
  type PairingApproveResultLike,
} from '../shared/pairing-protocol'
import { toUserFacingCliFailureMessage } from '../lib/user-facing-cli-feedback'

export { PAIRING_CODE_MAX_LENGTH, PAIRING_CODE_MIN_LENGTH, isPairingCodeReady } from '../shared/pairing-protocol'

const PAIRING_CODE_LABEL_PATTERN = new RegExp(`pairing\\s*code\\s*[:：]\\s*(${PAIRING_CODE_TOKEN_SOURCE})`, 'i')
const PAIRING_COMMAND_PATTERN = new RegExp(
  `openclaw\\s+pairing\\s+approve(?:\\s+--channel\\s+\\S+)?\\s+\\S+\\s+(${PAIRING_CODE_TOKEN_SOURCE})`,
  'i'
)
const PAIRING_CODE_TOKEN_PATTERN = new RegExp(PAIRING_CODE_PATTERN.source, 'i')

export interface ParsedPairingInput {
  code: string
  feishuOpenId?: string
}

function normalizePairingCode(raw: string): string {
  return raw.trim().toUpperCase()
}

function extractCodeFromPairingCommand(text: string): string | undefined {
  const commandMatch = text.match(PAIRING_COMMAND_PATTERN)
  if (!commandMatch?.[1]) return undefined
  return normalizePairingCode(commandMatch[1])
}

function extractPairingCode(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''

  const labelMatch = trimmed.match(PAIRING_CODE_LABEL_PATTERN)
  if (labelMatch?.[1]) return normalizePairingCode(labelMatch[1])

  const commandCode = extractCodeFromPairingCommand(trimmed)
  if (commandCode) return commandCode

  if (PAIRING_CODE_PATTERN.test(trimmed) && trimmed.length <= PAIRING_CODE_MAX_LENGTH) {
    return normalizePairingCode(trimmed)
  }

  const tokenMatch = trimmed.match(PAIRING_CODE_TOKEN_PATTERN)
  if (tokenMatch?.[0]) return normalizePairingCode(tokenMatch[0])

  return ''
}

function extractFeishuOpenId(text: string): string | undefined {
  const matched = text.match(/\bou_[a-z0-9]{8,}\b/i)
  return matched?.[0]?.toLowerCase()
}

export function parsePairingInput(rawInput: string): ParsedPairingInput {
  const input = rawInput || ''
  return {
    code: extractPairingCode(input),
    feishuOpenId: extractFeishuOpenId(input),
  }
}

export function shouldUseAllowFromFallback(
  channel: string,
  result: PairingApproveResultLike | string,
  feishuOpenId?: string
): boolean {
  if (channel !== 'feishu') return false
  if (!feishuOpenId) return false
  return resolvePairingApproveErrorCode(result) === 'no_pending_request'
}

export interface PairingApprovalFeedback {
  tone: 'success' | 'error'
  message: string
}

function extractPairingApproveFailureDetail(result: PairingApproveResultLike | string): string {
  if (typeof result === 'string') return result.trim()
  return String(result.stderr || result.stdout || '').trim()
}

export function buildPairingApprovalFeedback({
  channelName,
  result,
  surface = 'wizard',
}: {
  channelName: string
  result: PairingApproveResultLike | string
  surface?: 'wizard' | 'dashboard'
}): PairingApprovalFeedback {
  if (isPairingApproveConfirmed(result)) {
    return {
      tone: 'success',
      message:
        surface === 'dashboard'
          ? '配对已成功。如飞书里继续弹出授权卡片，请先完成授权，再发送消息开始对话。'
          : '配对已成功，现在可以开始对话了。',
    }
  }

  const errorCode = resolvePairingApproveErrorCode(result)

  switch (errorCode) {
    case 'already_paired':
      return {
        tone: 'success',
        message: surface === 'dashboard' ? '该账号已配对' : '该用户已完成配对，无需重复操作。',
      }
    case 'expired':
      return {
        tone: 'error',
        message:
          surface === 'dashboard'
            ? `配对码已过期，请重新在${channelName}中获取`
            : `配对码已过期，请在${channelName}中重新给机器人发送消息获取新的配对码。`,
      }
    case 'no_pending_request':
      return {
        tone: 'error',
        message:
          surface === 'dashboard'
            ? '未找到待审批请求，请粘贴机器人完整回复（含用户 ID）后重试'
            : `未找到该配对码对应的请求。请确认：\n1. 配对码是否输入正确\n2. 是否已在${channelName}中给机器人发送过消息\n3. 若使用了多个 OpenClaw 实例，请粘贴机器人完整回复（包含用户 ID）以便自动兜底授权\n4. 配对码是否已过期（请重新发送消息获取新码）`,
      }
    default: {
      const detail = extractPairingApproveFailureDetail(result)
      return {
        tone: 'error',
        message: toUserFacingCliFailureMessage({
          stderr: detail,
          fallback: '配对失败，请检查配对码是否正确，或稍后重试。',
        }),
      }
    }
  }
}
