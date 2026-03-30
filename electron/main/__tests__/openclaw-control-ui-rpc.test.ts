import { describe, expect, it, vi } from 'vitest'
import {
  buildOpenClawControlUiUrl,
  callGatewayRpcViaControlUiBrowser,
  inspectControlUiAppViaBrowser,
  normalizeControlUiBasePath,
  runGatewayChatViaControlUiBrowser,
} from '../openclaw-control-ui-rpc'

describe('openclaw control ui rpc', () => {
  it('normalizes control ui base paths', () => {
    expect(normalizeControlUiBasePath('')).toBe('')
    expect(normalizeControlUiBasePath('/')).toBe('')
    expect(normalizeControlUiBasePath('gateway-ui/')).toBe('/gateway-ui')
    expect(normalizeControlUiBasePath('/gateway-ui/')).toBe('/gateway-ui')
  })

  it('builds the hidden control ui url from the gateway url, base path, and token hash', () => {
    expect(
      buildOpenClawControlUiUrl({
        gatewayUrl: 'wss://example.com:4443/ws',
        token: 'token-123',
        basePath: '/control-ui/',
      })
    ).toBe('https://example.com:4443/control-ui/#token=token-123')
  })

  it('loads the control ui page in a hidden browser window and executes the request in page context', async () => {
    let loadedUrl = ''
    let executedScript = ''
    let destroyed = false
    const executeJavaScript = vi.fn(async <T>(code: string) => {
      executedScript = code
      return {
        ok: true,
        applied: true,
      } as T
    })

    const result = await callGatewayRpcViaControlUiBrowser(
      {
        readConfig: async () => ({
          gateway: {
            port: 18789,
            auth: {
              token: 'gateway-token',
            },
            controlUi: {
              basePath: '/ops',
            },
          },
        }),
        readEnvFile: async () => ({}),
        loadGatewayRuntime: async () => null,
        createBrowserWindow: async () => ({
          loadURL: async (url: string) => {
            loadedUrl = url
          },
          isDestroyed: () => destroyed,
          destroy: () => {
            destroyed = true
          },
          webContents: {
            executeJavaScript,
          },
        }),
      },
      'sessions.patch',
      {
        key: 'agent:main:transport-123',
        model: 'openai/gpt-5.4-pro',
      },
      {
        timeoutMs: 20_000,
      }
    )

    expect(loadedUrl).toBe('http://127.0.0.1:18789/ops/#token=gateway-token')
    expect(executeJavaScript).toHaveBeenCalledTimes(1)
    expect(executedScript).toContain('openclaw-app')
    expect(executedScript).toContain('"sessions.patch"')
    expect(executedScript).toContain('"agent:main:transport-123"')
    expect(result).toEqual({
      ok: true,
      applied: true,
    })
    expect(destroyed).toBe(true)
  })

  it('fails fast when gateway connection details are unavailable', async () => {
    await expect(
      callGatewayRpcViaControlUiBrowser(
        {
          readConfig: async () => null,
          readEnvFile: async () => ({}),
          loadGatewayRuntime: async () => null,
          createBrowserWindow: async () => {
            throw new Error('should not create window')
          },
        },
        'sessions.patch',
        {
          key: 'agent:main:transport-123',
          model: 'openai/gpt-5.4-pro',
        }
      )
    ).rejects.toThrow('gateway control ui config unavailable')
  })

  it('can inspect control ui app state in a hidden browser window', async () => {
    const result = await inspectControlUiAppViaBrowser(
      {
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
        createBrowserWindow: async () => ({
          loadURL: async () => undefined,
          isDestroyed: () => false,
          destroy: () => undefined,
          webContents: {
            executeJavaScript: async () => ({
              connected: true,
              hasClient: true,
              lastError: '',
              appKeys: ['client', 'connected', 'hello', 'healthResult'],
              helloSnapshot: {
                health: {
                  status: 'ok',
                },
              },
              healthResult: {
                status: 'ok',
              },
              sessionsState: {
                count: 1,
              },
              modelCatalogState: {
                total: 2,
              },
            }),
          },
        }),
      },
      {
        timeoutMs: 5_000,
      }
    )

    expect(result).toEqual({
      connected: true,
      hasClient: true,
      lastError: '',
      appKeys: ['client', 'connected', 'hello', 'healthResult'],
      helloSnapshot: {
        health: {
          status: 'ok',
        },
      },
      healthResult: {
        status: 'ok',
      },
      sessionsState: {
        count: 1,
      },
      modelCatalogState: {
        total: 2,
      },
    })
  })

  it('can send chat via the hidden control ui browser channel', async () => {
    let loadedUrl = ''
    let executedScript = ''

    const result = await runGatewayChatViaControlUiBrowser(
      {
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
        createBrowserWindow: async () => ({
          loadURL: async (url: string) => {
            loadedUrl = url
          },
          isDestroyed: () => false,
          destroy: () => undefined,
          webContents: {
            executeJavaScript: async (code: string) => {
              executedScript = code
              return {
                runId: 'run-123',
                sessionKey: 'agent:main:trusted-session',
                payload: {
                  state: 'final',
                  message: {
                    text: '来自 control ui 的最终回答',
                  },
                },
              }
            },
          },
        }),
      },
      {
        sessionKey: 'agent:main:trusted-session',
        message: '继续会话',
        thinking: 'off',
        timeoutMs: 10_000,
      }
    )

    expect(loadedUrl).toBe('http://127.0.0.1:18789/#token=gateway-token')
    expect(executedScript).toContain(`"agent:main:trusted-session"`)
    expect(executedScript).toContain(`'chat.send'`)
    expect(executedScript).toContain(`"继续会话"`)
    expect(result).toEqual({
      runId: 'run-123',
      sessionKey: 'agent:main:trusted-session',
      payload: {
        state: 'final',
        message: {
          text: '来自 control ui 的最终回答',
        },
      },
    })
  })
})
