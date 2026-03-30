import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetOpenClawLegacyEnvWarningsForTests } from '../../openclaw-legacy-env-migration'
import { createGatewayStreamingChatTransport } from '../gateway-streaming-chat-transport'

class FakeWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readyState = FakeWebSocket.OPEN
  private readonly listeners = new Map<string, Set<(event: any) => void>>()

  constructor(private readonly handler: (frame: any, socket: FakeWebSocket) => void) {
    queueMicrotask(() => {
      this.emit('message', {
        data: JSON.stringify({
          type: 'event',
          event: 'connect.challenge',
          payload: {
            nonce: 'nonce-1',
          },
        }),
      })
    })
  }

  addEventListener(type: string, listener: (event: any) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set())
    }
    this.listeners.get(type)?.add(listener)
  }

  send(raw: string): void {
    this.handler(JSON.parse(raw), this)
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED
    this.emit('close', {})
  }

  emit(type: string, event: any): void {
    for (const listener of this.listeners.get(type) || []) {
      listener(event)
    }
  }
}

describe('gateway streaming chat transport', () => {
  beforeEach(() => {
    resetOpenClawLegacyEnvWarningsForTests()
  })

  it('streams assistant deltas from gateway chat events', async () => {
    const deltas: Array<{ text: string; delta: string; model?: string }> = []
    const sentPayloads: Array<Record<string, unknown>> = []
    const transport = createGatewayStreamingChatTransport({
      readConfig: async () => ({
        gateway: {
          port: 18789,
          auth: {
            token: 'gateway-token',
          },
        },
      }),
      readEnvFile: async () => ({}),
      loadGatewayRuntime: async () => null,
      createSocket: () =>
        new FakeWebSocket((frame, socket) => {
          if (frame.method === 'connect') {
            socket.emit('message', {
              data: JSON.stringify({
                type: 'res',
                id: frame.id,
                ok: true,
                payload: {
                  auth: { role: 'operator' },
                },
              }),
            })
            return
          }

          if (frame.method === 'chat.send') {
            sentPayloads.push((frame.params || {}) as Record<string, unknown>)
            socket.emit('message', {
              data: JSON.stringify({
                type: 'res',
                id: frame.id,
                ok: true,
                payload: {
                  runId: 'run-1',
                },
              }),
            })

            socket.emit('message', {
              data: JSON.stringify({
                type: 'event',
                event: 'chat.stream',
                payload: {
                  runId: 'run-1',
                  sessionKey: 'agent:main:session-1',
                  seq: 1,
                  state: 'delta',
                  message: {
                    delta: '你好，',
                    model: 'zai/glm-5',
                  },
                },
              }),
            })

            socket.emit('message', {
              data: JSON.stringify({
                type: 'event',
                event: 'chat.stream',
                payload: {
                  runId: 'run-1',
                  sessionKey: 'agent:main:session-1',
                  seq: 2,
                  state: 'final',
                  message: {
                    text: '你好，我在。',
                    model: 'zai/glm-5',
                    usage: {
                      inputTokens: 12,
                      outputTokens: 4,
                    },
                  },
                  usage: {
                    totalTokens: 16,
                  },
                },
              }),
            })
          }
        }) as unknown as WebSocket,
    })

    const result = await transport.run({
      transportSessionId: 'session-1',
      messageText: '你好',
      thinking: 'off',
      onAssistantDelta: (payload) => deltas.push(payload),
    })

    expect(result.ok).toBe(true)
    expect(result.streamedText).toBe('你好，我在。')
    expect(result.streamedModel).toBe('zai/glm-5')
    expect(sentPayloads[0]?.model).toBeUndefined()
    expect(result.streamedUsage).toEqual({
      totalTokens: 16,
    })
    expect(deltas).toEqual([
      {
        text: '你好，',
        delta: '你好，',
        model: 'zai/glm-5',
        usage: undefined,
      },
      {
        text: '你好，我在。',
        delta: '我在。',
        model: 'zai/glm-5',
        usage: {
          totalTokens: 16,
        },
      },
    ])
  })

  it('reuses an explicit external sessionKey when sending chat', async () => {
    const explicitSessionKey = 'agent:feishu-default:feishu:default:direct:ou_11ec143ee4079fad7afe9c5fa042404f'
    let sentSessionKey = ''
    const transport = createGatewayStreamingChatTransport({
      readConfig: async () => ({
        gateway: {
          port: 18789,
          auth: {
            token: 'gateway-token',
          },
        },
      }),
      readEnvFile: async () => ({}),
      loadGatewayRuntime: async () => null,
      createSocket: () =>
        new FakeWebSocket((frame, socket) => {
          if (frame.method === 'connect') {
            socket.emit('message', {
              data: JSON.stringify({
                type: 'res',
                id: frame.id,
                ok: true,
              }),
            })
            return
          }

          if (frame.method === 'chat.send') {
            sentSessionKey = String(frame.params?.sessionKey || '')
            socket.emit('message', {
              data: JSON.stringify({
                type: 'res',
                id: frame.id,
                ok: true,
                payload: {
                  runId: 'run-feishu',
                },
              }),
            })

            socket.emit('message', {
              data: JSON.stringify({
                type: 'event',
                event: 'chat.stream',
                payload: {
                  runId: 'run-feishu',
                  sessionKey: explicitSessionKey,
                  seq: 1,
                  state: 'final',
                  message: {
                    text: '已在外部会话里继续',
                    model: 'zai/glm-5',
                  },
                },
              }),
            })
          }
        }) as unknown as WebSocket,
    })

    const result = await transport.run({
      transportSessionId: 'local-session-id',
      sessionKey: explicitSessionKey,
      messageText: '继续这个会话',
      thinking: 'off',
    })

    expect(result.ok).toBe(true)
    expect(sentSessionKey).toBe(explicitSessionKey)
    expect(JSON.parse(result.stdout).sessionKey).toBe(explicitSessionKey)
  })

  it('ignores structured tool payloads from gateway chat events', async () => {
    const onAssistantDelta = vi.fn()
    const transport = createGatewayStreamingChatTransport({
      readConfig: async () => ({
        gateway: {
          port: 18789,
          auth: {
            token: 'gateway-token',
          },
        },
      }),
      readEnvFile: async () => ({}),
      loadGatewayRuntime: async () => null,
      createSocket: () =>
        new FakeWebSocket((frame, socket) => {
          if (frame.method === 'connect') {
            socket.emit('message', {
              data: JSON.stringify({
                type: 'res',
                id: frame.id,
                ok: true,
              }),
            })
            return
          }

          if (frame.method === 'chat.send') {
            socket.emit('message', {
              data: JSON.stringify({
                type: 'res',
                id: frame.id,
                ok: true,
                payload: {
                  runId: 'run-tool-envelope',
                },
              }),
            })

            socket.emit('message', {
              data: JSON.stringify({
                type: 'event',
                event: 'chat.stream',
                payload: {
                  runId: 'run-tool-envelope',
                  sessionKey: 'agent:main:session-tool-envelope',
                  seq: 1,
                  state: 'final',
                  message: {
                    command: 'curl -s "wttr.in/Shenzhen?format=%C"',
                    workdir: '/Users/test/.openclaw/workspace',
                    yieldMs: 10_000,
                    timeout: 20,
                  },
                },
              }),
            })
          }
        }) as unknown as WebSocket,
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

  it('ignores stringified tool payloads from gateway chat events', async () => {
    const onAssistantDelta = vi.fn()
    const transport = createGatewayStreamingChatTransport({
      readConfig: async () => ({
        gateway: {
          port: 18789,
          auth: {
            token: 'gateway-token',
          },
        },
      }),
      readEnvFile: async () => ({}),
      loadGatewayRuntime: async () => null,
      createSocket: () =>
        new FakeWebSocket((frame, socket) => {
          if (frame.method === 'connect') {
            socket.emit('message', {
              data: JSON.stringify({
                type: 'res',
                id: frame.id,
                ok: true,
              }),
            })
            return
          }

          if (frame.method === 'chat.send') {
            socket.emit('message', {
              data: JSON.stringify({
                type: 'res',
                id: frame.id,
                ok: true,
                payload: {
                  runId: 'run-tool-json-string',
                },
              }),
            })

            socket.emit('message', {
              data: JSON.stringify({
                type: 'event',
                event: 'chat.stream',
                payload: {
                  runId: 'run-tool-json-string',
                  sessionKey: 'agent:main:session-tool-json-string',
                  seq: 1,
                  state: 'final',
                  message: '{"path":"~/homebrew/lib/node_modules/openclaw/skills/weather/SKILL.md"}',
                },
              }),
            })
          }
        }) as unknown as WebSocket,
    })

    const result = await transport.run({
      transportSessionId: 'session-tool-json-string',
      messageText: '查天气',
      thinking: 'off',
      onAssistantDelta,
    })

    expect(result.ok).toBe(true)
    expect(result.streamedText).toBe('')
    expect(onAssistantDelta).not.toHaveBeenCalled()
  })

  it('treats string payloads in delta events as incremental updates', async () => {
    const deltas: Array<{ text: string; delta: string; model?: string }> = []
    const transport = createGatewayStreamingChatTransport({
      readConfig: async () => ({
        gateway: {
          port: 18789,
          auth: {
            token: 'gateway-token',
          },
        },
      }),
      readEnvFile: async () => ({}),
      loadGatewayRuntime: async () => null,
      createSocket: () =>
        new FakeWebSocket((frame, socket) => {
          if (frame.method === 'connect') {
            socket.emit('message', {
              data: JSON.stringify({
                type: 'res',
                id: frame.id,
                ok: true,
              }),
            })
            return
          }

          if (frame.method === 'chat.send') {
            socket.emit('message', {
              data: JSON.stringify({
                type: 'res',
                id: frame.id,
                ok: true,
                payload: {
                  runId: 'run-string-delta',
                },
              }),
            })

            socket.emit('message', {
              data: JSON.stringify({
                type: 'event',
                event: 'chat.stream',
                payload: {
                  runId: 'run-string-delta',
                  sessionKey: 'agent:main:session-string-delta',
                  seq: 1,
                  state: 'delta',
                  message: '你好，',
                },
              }),
            })

            socket.emit('message', {
              data: JSON.stringify({
                type: 'event',
                event: 'chat.stream',
                payload: {
                  runId: 'run-string-delta',
                  sessionKey: 'agent:main:session-string-delta',
                  seq: 2,
                  state: 'delta',
                  message: '我在。',
                },
              }),
            })

            socket.emit('message', {
              data: JSON.stringify({
                type: 'event',
                event: 'chat.stream',
                payload: {
                  runId: 'run-string-delta',
                  sessionKey: 'agent:main:session-string-delta',
                  seq: 3,
                  state: 'final',
                  message: {
                    text: '你好，我在。',
                    model: 'zai/glm-5',
                  },
                },
              }),
            })
          }
        }) as unknown as WebSocket,
    })

    const result = await transport.run({
      transportSessionId: 'session-string-delta',
      messageText: '你好',
      thinking: 'off',
      onAssistantDelta: (payload) => deltas.push(payload),
    })

    expect(result.ok).toBe(true)
    expect(result.streamedText).toBe('你好，我在。')
    expect(deltas).toEqual([
      {
        text: '你好，',
        delta: '你好，',
        model: undefined,
        usage: undefined,
      },
      {
        text: '你好，我在。',
        delta: '我在。',
        model: undefined,
        usage: undefined,
      },
    ])
  })

  it('falls back to the cli transport when gateway credentials are unavailable', async () => {
    const fallbackTransport = {
      run: vi.fn().mockResolvedValue({
        ok: true,
        stdout: '{"response":{"text":"fallback"}}',
        stderr: '',
        code: 0,
        streamedText: 'fallback',
      }),
    }

    const transport = createGatewayStreamingChatTransport({
      readConfig: async () => null,
      readEnvFile: async () => ({}),
      fallbackTransport,
      loadGatewayRuntime: async () => null,
    })

    const result = await transport.run({
      transportSessionId: 'session-2',
      messageText: 'fallback please',
      thinking: 'off',
    })

    expect(fallbackTransport.run).toHaveBeenCalledTimes(1)
    expect(result.streamedText).toBe('fallback')
  })

  it('does not fall back to CLI when the request targets an explicit external session key', async () => {
    const fallbackTransport = {
      run: vi.fn().mockResolvedValue({
        ok: true,
        stdout: '{"response":{"text":"should-not-run"}}',
        stderr: '',
        code: 0,
        streamedText: 'should-not-run',
      }),
    }

    const transport = createGatewayStreamingChatTransport({
      readConfig: async () => null,
      readEnvFile: async () => ({}),
      fallbackTransport,
      loadGatewayRuntime: async () => null,
    })

    const result = await transport.run({
      transportSessionId: 'external-openclaw-history',
      sessionKey: 'agent:main:history-direct-session',
      messageText: '继续这个外部 direct 会话',
      thinking: 'off',
    })

    expect(result.ok).toBe(false)
    expect(result.stderr).toContain('cannot safely continue an explicit external session key')
    expect(fallbackTransport.run).not.toHaveBeenCalled()
  })

  it('rejects runtime send-time model overrides before touching gateway transport state', async () => {
    const readConfig = vi.fn(async () => ({
      gateway: {
        port: 18789,
        auth: {
          token: 'gateway-token',
        },
      },
    }))
    const readEnvFile = vi.fn(async () => ({}))
    const fallbackTransport = {
      run: vi.fn(),
    }
    const transport = createGatewayStreamingChatTransport({
      readConfig,
      readEnvFile,
      fallbackTransport,
      loadGatewayRuntime: async () => null,
      createSocket: () => {
        throw new Error('socket should not be created')
      },
    })

    await expect(
      transport.run({
        transportSessionId: 'session-blocked',
        messageText: '不要偷偷带 model',
        thinking: 'off',
        model: 'openai/gpt-4.1-mini',
      } as any)
    ).rejects.toThrow('禁止在发送消息时携带 model')

    expect(readConfig).not.toHaveBeenCalled()
    expect(readEnvFile).not.toHaveBeenCalled()
    expect(fallbackTransport.run).not.toHaveBeenCalled()
  })

  it('ignores removed CLAWDBOT gateway aliases in steady-state mode and falls back', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fallbackTransport = {
      run: vi.fn().mockResolvedValue({
        ok: true,
        stdout: '{"response":{"text":"fallback"}}',
        stderr: '',
        code: 0,
        streamedText: 'fallback',
      }),
    }

    try {
      const transport = createGatewayStreamingChatTransport({
        readConfig: async () => ({
          gateway: {
            port: 18789,
          },
        }),
        readEnvFile: async () => ({
          CLAWDBOT_GATEWAY_URL: 'ws://127.0.0.1:18789',
          CLAWDBOT_GATEWAY_TOKEN: 'legacy-token',
        }),
        fallbackTransport,
        loadGatewayRuntime: async () => null,
      })

      const result = await transport.run({
        transportSessionId: 'session-legacy-alias',
        messageText: 'fallback please',
        thinking: 'off',
      })

      expect(result.ok).toBe(true)
      expect(result.streamedText).toBe('fallback')
      expect(fallbackTransport.run).toHaveBeenCalledTimes(1)
      expect(warnSpy).toHaveBeenCalledWith(
        '[openclaw] Ignoring removed legacy env alias CLAWDBOT_GATEWAY_URL; steady-state now reads OPENCLAW_GATEWAY_URL only.'
      )
      expect(warnSpy).toHaveBeenCalledWith(
        '[openclaw] Ignoring removed legacy env alias CLAWDBOT_GATEWAY_TOKEN; steady-state now reads OPENCLAW_GATEWAY_TOKEN only.'
      )
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('uses runtime environment gateway credentials before falling back to cli', async () => {
    const previousToken = process.env.OPENCLAW_GATEWAY_TOKEN
    process.env.OPENCLAW_GATEWAY_TOKEN = 'runtime-token'

    try {
      const transport = createGatewayStreamingChatTransport({
        readConfig: async () => ({
          gateway: {
            port: 18789,
          },
        }),
        readEnvFile: async () => ({}),
        loadGatewayRuntime: async () => null,
        createSocket: () =>
          new FakeWebSocket((frame, socket) => {
            if (frame.method === 'connect') {
              expect(frame.params.auth.token).toBe('runtime-token')
              socket.emit('message', {
                data: JSON.stringify({
                  type: 'res',
                  id: frame.id,
                  ok: true,
                }),
              })
              return
            }

            if (frame.method === 'chat.send') {
              socket.emit('message', {
                data: JSON.stringify({
                  type: 'res',
                  id: frame.id,
                  ok: true,
                  payload: {
                    runId: 'run-env',
                  },
                }),
              })

              socket.emit('message', {
                data: JSON.stringify({
                  type: 'event',
                  event: 'chat.stream',
                  payload: {
                    runId: 'run-env',
                    sessionKey: 'agent:main:session-env',
                    seq: 1,
                    state: 'final',
                    message: {
                      text: 'from env',
                    },
                  },
                }),
              })
            }
          }) as unknown as WebSocket,
      })

      const result = await transport.run({
        transportSessionId: 'session-env',
        messageText: 'hello',
        thinking: 'off',
      })

      expect(result.ok).toBe(true)
      expect(result.streamedText).toBe('from env')
    } finally {
      if (previousToken == null) delete process.env.OPENCLAW_GATEWAY_TOKEN
      else process.env.OPENCLAW_GATEWAY_TOKEN = previousToken
    }
  })

  it('sends chat.abort when the run is canceled', async () => {
    const abortFrames: any[] = []
    let readyToAbort!: () => void
    const readyToAbortPromise = new Promise<void>((resolve) => {
      readyToAbort = resolve
    })
    const transport = createGatewayStreamingChatTransport({
      readConfig: async () => ({
        gateway: {
          port: 18789,
          auth: {
            token: 'gateway-token',
          },
        },
      }),
      readEnvFile: async () => ({}),
      loadGatewayRuntime: async () => null,
      createSocket: () =>
        new FakeWebSocket((frame, socket) => {
          if (frame.method === 'connect') {
            socket.emit('message', {
              data: JSON.stringify({
                type: 'res',
                id: frame.id,
                ok: true,
              }),
            })
            return
          }

          if (frame.method === 'chat.send') {
            socket.emit('message', {
              data: JSON.stringify({
                type: 'res',
                id: frame.id,
                ok: true,
                payload: {
                  runId: 'run-cancel',
                },
              }),
            })
            readyToAbort()
            return
          }

          if (frame.method === 'chat.abort') {
            abortFrames.push(frame)
            socket.emit('message', {
              data: JSON.stringify({
                type: 'res',
                id: frame.id,
                ok: true,
                payload: {
                  aborted: true,
                },
              }),
            })

            socket.emit('message', {
              data: JSON.stringify({
                type: 'event',
                event: 'chat.stream',
                payload: {
                  runId: 'run-cancel',
                  sessionKey: 'agent:main:session-cancel',
                  seq: 1,
                  state: 'aborted',
                  stopReason: 'user stop',
                },
              }),
            })
          }
        }) as unknown as WebSocket,
    })

    const controller = new AbortController()
    const runPromise = transport.run({
      transportSessionId: 'session-cancel',
      messageText: 'cancel me',
      thinking: 'off',
      signal: controller.signal,
    })

    await readyToAbortPromise
    controller.abort()
    const result = await runPromise

    expect(result.ok).toBe(false)
    expect(result.canceled).toBe(true)
    expect(abortFrames).toHaveLength(1)
    expect(abortFrames[0].params.sessionKey).toBe('agent:main:session-cancel')
  })
})
