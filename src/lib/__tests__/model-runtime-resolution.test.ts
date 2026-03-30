import { describe, expect, it } from 'vitest'
import {
  areRuntimeModelsEquivalent,
  collectRuntimeConnectedModelKeys,
  extractRuntimeDefaultModelKey,
  findEquivalentCatalogModelKey,
  resolvePreferredRuntimeDefaultModelKey,
  resolveRuntimeActiveModelKey,
  resolveRuntimeWritableModelKey,
  toRuntimeModelEquivalenceKey,
} from '../model-runtime-resolution'

describe('model runtime resolution', () => {
  it('treats provider-alias model keys as the same runtime model', () => {
    expect(
      areRuntimeModelsEquivalent('minimax/MiniMax-M2.5', 'minimax-portal/MiniMax-M2.5')
    ).toBe(true)
    expect(
      areRuntimeModelsEquivalent('openai/gpt-5.4-pro', 'openai-codex/gpt-5.4-pro')
    ).toBe(true)
    expect(
      areRuntimeModelsEquivalent('minimax/MiniMax-M2.5', 'minimax-portal/MiniMax-M2.1')
    ).toBe(false)
  })

  it('builds a stable runtime equivalence key across provider aliases', () => {
    expect(toRuntimeModelEquivalenceKey('openai-codex/gpt-5.4')).toBe('openai/gpt-5.4')
    expect(toRuntimeModelEquivalenceKey('minimax-portal/MiniMax-M2.5')).toBe('minimax/minimax-m2.5')
  })

  it('maps an alias-reported active model back to the visible catalog key', () => {
    expect(
      findEquivalentCatalogModelKey('minimax-portal/MiniMax-M2.5', [
        { key: 'minimax/MiniMax-M2.5' },
        { key: 'minimax/MiniMax-M2.1' },
      ])
    ).toBe('minimax/MiniMax-M2.5')
  })

  it('prefers active runtime matches before falling back to writable candidates', () => {
    const statusData = {
      defaultModel: 'minimax-portal/MiniMax-M2.5',
      allowed: ['minimax-portal/MiniMax-M2.5', 'minimax-portal/MiniMax-M2.1'],
    }

    expect(
      resolveRuntimeActiveModelKey('minimax/MiniMax-M2.5', statusData)
    ).toBe('minimax-portal/MiniMax-M2.5')
    expect(
      resolveRuntimeWritableModelKey('minimax/MiniMax-M2.1', statusData)
    ).toBe('minimax-portal/MiniMax-M2.1')
  })

  it('reconciles a stale default model onto the connected alias-equivalent runtime key', () => {
    const statusData = {
      defaultModel: 'minimax/MiniMax-M2.7-highspeed',
      allowed: ['minimax-portal/MiniMax-M2.7-highspeed', 'minimax-portal/MiniMax-M2.5'],
      auth: {
        oauth: {
          providers: [{ provider: 'minimax-portal', status: 'ok' }],
        },
        missingProvidersInUse: ['minimax'],
      },
    }

    expect(extractRuntimeDefaultModelKey(statusData)).toBe('minimax/MiniMax-M2.7-highspeed')
    expect(collectRuntimeConnectedModelKeys(statusData)).toEqual([
      'minimax-portal/MiniMax-M2.5',
      'minimax-portal/MiniMax-M2.7-highspeed',
    ])
    expect(resolvePreferredRuntimeDefaultModelKey(statusData)).toBe('minimax-portal/MiniMax-M2.7-highspeed')
  })

  it('falls back to the first connected runtime model when no explicit default exists', () => {
    const statusData = {
      allowed: ['openai/gpt-5.4-pro', 'openai/gpt-5.4-mini'],
      auth: {
        providers: [{ provider: 'openai', status: 'ok' }],
      },
    }

    expect(resolvePreferredRuntimeDefaultModelKey(statusData)).toBe('openai/gpt-5.4-mini')
  })
})
