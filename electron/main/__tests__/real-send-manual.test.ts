import { describe, expect, it } from 'vitest'

const itWithRealSendEnvironment =
  process.env.QCLAW_ENABLE_REAL_SEND_MANUAL_TEST === '1' ? it : it.skip

describe('real send manual verification', () => {
  itWithRealSendEnvironment('can enumerate live chat sessions and send to a trusted upstream session', async () => {
    const { getChatTranscript, listChatSessions, sendChatMessage } = await import('../openclaw-chat-service')
    const sessions = await listChatSessions()
    const candidate = sessions.find(
      (session) =>
        session.canContinue === true &&
        session.localOnly !== true &&
        typeof session.sessionKey === 'string' &&
        session.sessionKey.trim().length > 0
    )

    expect(candidate, 'expected at least one live continue-able upstream chat session').toBeTruthy()

    const transcript = await getChatTranscript(candidate!.sessionId)
    expect(transcript.sessionId).toBe(candidate!.sessionId)

    const result = await sendChatMessage({
      sessionId: candidate!.sessionId,
      text: 'Reply with exactly: QCLAW_REAL_SEND_OK',
    })

    expect(result.ok).toBe(true)
    expect(String(result.message?.text || '')).toContain('QCLAW_REAL_SEND_OK')
  }, 180_000)
})
