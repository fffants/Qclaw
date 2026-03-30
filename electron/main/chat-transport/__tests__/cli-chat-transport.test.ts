import { describe, expect, it, vi } from 'vitest'
import { createCliChatTransport } from '../cli-chat-transport'

describe('cli chat transport', () => {
  it('emits incremental assistant deltas from streamed stdout events', async () => {
    const deltas: Array<{ text: string; delta: string; model?: string }> = []
    const transport = createCliChatTransport({
      runStreamingCommand: async (_args, options) => {
        options?.onStdout?.(`${JSON.stringify({ type: 'response.delta', delta: '你好，' })}\n`)
        options?.onStdout?.(
          `${JSON.stringify({ type: 'response.delta', delta: '我在。', model: 'openai/gpt-5.1-codex' })}\n`
        )
        return {
          ok: true,
          stdout: JSON.stringify({
            response: {
              text: '你好，我在。',
            },
            model: 'openai/gpt-5.1-codex',
          }),
          stderr: '',
          code: 0,
        }
      },
    })

    const result = await transport.run({
      transportSessionId: 'session-1',
      messageText: '你好',
      thinking: 'off',
      onAssistantDelta: (payload) => {
        deltas.push(payload)
      },
    })

    expect(result.ok).toBe(true)
    expect(result.streamedText).toBe('你好，我在。')
    expect(result.streamedModel).toBe('openai/gpt-5.1-codex')
    expect(deltas).toEqual([
      { text: '你好，', delta: '你好，', model: undefined, usage: undefined },
      { text: '你好，我在。', delta: '我在。', model: 'openai/gpt-5.1-codex', usage: undefined },
    ])
  })

  it('surfaces a snapshot delta when stdout only reveals a partial JSON body', async () => {
    const onAssistantDelta = vi.fn()
    const transport = createCliChatTransport({
      runStreamingCommand: async (_args, options) => {
        options?.onStdout?.('{\n')
        options?.onStdout?.('  "response": {\n')
        options?.onStdout?.('    "text": "最终回退成功"\n')
        options?.onStdout?.('  },\n')
        options?.onStdout?.('  "model": "openai/gpt-5.1-codex"\n')
        options?.onStdout?.('}\n')
        return {
          ok: true,
          stdout: JSON.stringify({
            response: {
              text: '最终回退成功',
            },
            model: 'openai/gpt-5.1-codex',
          }),
          stderr: '',
          code: 0,
        }
      },
    })

    const result = await transport.run({
      transportSessionId: 'session-2',
      messageText: '测试回退',
      thinking: 'off',
      onAssistantDelta,
    })

    expect(result.ok).toBe(true)
    expect(result.streamedText).toBe('最终回退成功')
    expect(onAssistantDelta).toHaveBeenCalledTimes(1)
    expect(onAssistantDelta).toHaveBeenCalledWith({
      text: '最终回退成功',
      delta: '最终回退成功',
      model: undefined,
      usage: undefined,
    })
  })

  it('ignores structured tool payloads in streamed stdout events', async () => {
    const onAssistantDelta = vi.fn()
    const transport = createCliChatTransport({
      runStreamingCommand: async (_args, options) => {
        options?.onStdout?.(
          `${JSON.stringify({
            command: 'curl -s "wttr.in/Shenzhen?format=%C"',
            workdir: '/Users/test/.openclaw/workspace',
            yieldMs: 10_000,
            timeout: 20,
          })}\n`
        )
        return {
          ok: true,
          stdout: JSON.stringify({
            command: 'curl -s "wttr.in/Shenzhen?format=%C"',
            workdir: '/Users/test/.openclaw/workspace',
            yieldMs: 10_000,
            timeout: 20,
          }),
          stderr: '',
          code: 0,
        }
      },
    })

    const result = await transport.run({
      transportSessionId: 'session-tool-envelope',
      messageText: '查天气',
      thinking: 'off',
      onAssistantDelta,
    })

    expect(result.ok).toBe(true)
    expect(result.streamedText).toBe('')
    expect(onAssistantDelta).not.toHaveBeenCalled()
  })

  it('never appends a send-time --model override to the OpenClaw agent command', async () => {
    const capturedArgs: string[][] = []
    const transport = createCliChatTransport({
      runStreamingCommand: async (args) => {
        capturedArgs.push(args)
        return {
          ok: true,
          stdout: JSON.stringify({
            response: {
              text: '模型切换成功',
            },
            model: 'minimax/MiniMax-M2.5-highspeed',
          }),
          stderr: '',
          code: 0,
        }
      },
    })

    await transport.run({
      transportSessionId: 'session-3',
      messageText: '切到 MiniMax',
      thinking: 'off',
    })

    expect(capturedArgs[0]).toEqual([
      'agent',
      '--json',
      '--session-id',
      'session-3',
      '--message',
      '切到 MiniMax',
      '--thinking',
      'off',
    ])
  })

  it('rejects runtime send-time model overrides before spawning openclaw agent', async () => {
    const runStreamingCommand = vi.fn()
    const transport = createCliChatTransport({
      runStreamingCommand,
    })

    await expect(
      transport.run({
        transportSessionId: 'session-4',
        messageText: '不要偷偷带 model',
        thinking: 'off',
        model: 'openai/gpt-4.1-mini',
      } as any)
    ).rejects.toThrow('禁止在发送消息时携带 model')

    expect(runStreamingCommand).not.toHaveBeenCalled()
  })
})
