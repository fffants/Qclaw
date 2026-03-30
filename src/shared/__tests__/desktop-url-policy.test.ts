import { describe, expect, it } from 'vitest'
import {
  DESKTOP_URL_POLICY,
  buildOpenAICodexCallbackProbeUrls,
  isAllowedExternalOpenUrl,
  isLoopbackHost,
  resolveDevServerUrl,
  resolveOpenAICodexCallbackUrl,
} from '../desktop-url-policy'

describe('desktop-url-policy', () => {
  it('allows https and parsed loopback http URLs instead of string-prefix checks', () => {
    expect(isAllowedExternalOpenUrl('https://openclaw.ai/docs')).toBe(true)
    expect(isAllowedExternalOpenUrl('http://localhost:18789')).toBe(true)
    expect(isAllowedExternalOpenUrl('http://127.0.0.1:18789')).toBe(true)
    expect(isAllowedExternalOpenUrl('http://[::1]:18789')).toBe(true)
    expect(isAllowedExternalOpenUrl('http://example.com')).toBe(false)
    expect(isAllowedExternalOpenUrl('mailto:support@openclaw.ai')).toBe(false)
  })

  it('recognizes loopback hosts beyond a single localhost literal', () => {
    expect(isLoopbackHost('localhost')).toBe(true)
    expect(isLoopbackHost('127.0.0.42')).toBe(true)
    expect(isLoopbackHost('::1')).toBe(true)
    expect(isLoopbackHost('::ffff:127.0.0.1')).toBe(true)
    expect(isLoopbackHost('openclaw.ai')).toBe(false)
  })

  it('resolves the dev server URL from env override or manifest default', () => {
    expect(resolveDevServerUrl({})).toBe(DESKTOP_URL_POLICY.devServerDefaultUrl)
    expect(resolveDevServerUrl({ VITE_DEV_SERVER_URL: 'http://localhost:7788/' })).toBe('http://localhost:7788/')
  })

  it('builds openai callback probe URLs from manifest defaults and env overrides', () => {
    expect(resolveOpenAICodexCallbackUrl({}).toString()).toBe('http://127.0.0.1:1455/auth/callback')
    expect(
      resolveOpenAICodexCallbackUrl({
        QCLAW_OPENAI_CALLBACK_URL: 'http://localhost:2455/custom/callback',
      }).toString()
    ).toBe('http://localhost:2455/custom/callback')
    expect(
      resolveOpenAICodexCallbackUrl({
        QCLAW_OPENAI_CALLBACK_PORT: '3456',
      }).toString()
    ).toBe('http://127.0.0.1:3456/auth/callback')

    expect(
      buildOpenAICodexCallbackProbeUrls({
        QCLAW_OPENAI_CALLBACK_PORT: '2455',
      })
    ).toEqual([
      'http://127.0.0.1:2455/auth/callback?code=qclaw_probe&state=qclaw_probe',
      'http://localhost:2455/auth/callback?code=qclaw_probe&state=qclaw_probe',
    ])
  })
})
