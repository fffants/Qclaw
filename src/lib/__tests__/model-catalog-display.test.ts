import { describe, expect, it } from 'vitest'
import {
  buildModelCatalogDisplaySummary,
  filterCatalogForDisplay,
  isCatalogModelAvailable,
  reconcileCatalogAvailabilityWithStatus,
} from '../model-catalog-display'

const SAMPLE_CATALOG = [
  { key: 'openai/gpt-5.1-codex', available: true },
  { key: 'openai/gpt-4o', available: true },
  { key: 'google/gemini-2.5-pro', available: false },
]

describe('model catalog display helpers', () => {
  it('treats missing available flag as available by default', () => {
    expect(isCatalogModelAvailable({})).toBe(true)
    expect(isCatalogModelAvailable({ available: true })).toBe(true)
    expect(isCatalogModelAvailable({ available: false })).toBe(false)
  })

  it('filters catalog based on the selected display mode', () => {
    expect(filterCatalogForDisplay(SAMPLE_CATALOG, 'available').map((item) => item.key)).toEqual([
      'openai/gpt-5.1-codex',
      'openai/gpt-4o',
    ])
    expect(filterCatalogForDisplay(SAMPLE_CATALOG, 'all').map((item) => item.key)).toEqual([
      'openai/gpt-5.1-codex',
      'openai/gpt-4o',
      'google/gemini-2.5-pro',
    ])
  })

  it('reconciles provider alias mismatches with status.allowed when auth is ready', () => {
    const reconciled = reconcileCatalogAvailabilityWithStatus(
      [
        { key: 'minimax/MiniMax-M2.5', available: false },
        { key: 'minimax/MiniMax-M2.7', available: false },
        { key: 'openai/gpt-5', available: false },
      ],
      {
        allowed: [
          'minimax-portal/MiniMax-M2.5',
          'minimax-portal/MiniMax-M2.7',
        ],
        defaultModel: 'minimax-portal/MiniMax-M2.5',
        auth: {
          oauth: {
            providers: [{ provider: 'minimax-portal', status: 'ok' }],
          },
        },
      }
    )

    expect(reconciled).toEqual([
      { key: 'minimax/MiniMax-M2.5', available: true, verificationState: 'verified-available' },
      { key: 'minimax/MiniMax-M2.7', available: true, verificationState: 'verified-available' },
      { key: 'openai/gpt-5', available: false },
    ])
    expect(filterCatalogForDisplay(reconciled, 'available').map((item) => item.key)).toEqual([
      'minimax/MiniMax-M2.5',
      'minimax/MiniMax-M2.7',
    ])
  })

  it('keeps alias-mapped models available when a compatible auth provider is actually configured', () => {
    const reconciled = reconcileCatalogAvailabilityWithStatus(
      [
        { key: 'minimax/MiniMax-M2.5', available: false },
        { key: 'minimax/MiniMax-M2.7', available: false },
      ],
      {
        allowed: [
          'minimax-portal/MiniMax-M2.5',
          'minimax-portal/MiniMax-M2.7',
        ],
        defaultModel: 'minimax/MiniMax-M2.5',
        auth: {
          missingProvidersInUse: ['minimax'],
          oauth: {
            providers: [{ provider: 'minimax-portal', status: 'ok' }],
          },
        },
      }
    )

    expect(reconciled).toEqual([
      { key: 'minimax/MiniMax-M2.5', available: true, verificationState: 'verified-available' },
      { key: 'minimax/MiniMax-M2.7', available: true, verificationState: 'verified-available' },
    ])
  })

  it('marks locally scoped provider models unverified when runtime only confirms a subset of them', () => {
    const reconciled = reconcileCatalogAvailabilityWithStatus(
      [
        { key: 'google/gemini-3-pro-preview', available: true },
        { key: 'google/gemini-2.5-pro', available: true },
        { key: 'openai/gpt-5', available: true },
      ],
      {
        auth: {
          providers: [{ provider: 'google', status: 'ok' }],
        },
        allowed: ['google/gemini-3-pro-preview'],
        defaultModel: 'google/gemini-3-pro-preview',
      },
      ['google']
    )

    expect(reconciled).toEqual([
      { key: 'google/gemini-3-pro-preview', available: true, verificationState: 'verified-available' },
      { key: 'google/gemini-2.5-pro', available: false, verificationState: 'unverified' },
      { key: 'openai/gpt-5', available: true },
    ])
  })

  it('marks provider models as verified unavailable when runtime says the provider is missing in use', () => {
    const reconciled = reconcileCatalogAvailabilityWithStatus(
      [
        { key: 'openai/gpt-5', available: true },
        { key: 'openai/gpt-4.1', available: true },
      ],
      {
        auth: {
          missingProvidersInUse: ['openai'],
          providers: [],
        },
      },
      ['openai']
    )

    expect(reconciled).toEqual([
      { key: 'openai/gpt-5', available: false, verificationState: 'unverified' },
      { key: 'openai/gpt-4.1', available: false, verificationState: 'unverified' },
    ])
  })

  it('marks configured provider models as unverified by default when there is no runtime confirmation yet', () => {
    const reconciled = reconcileCatalogAvailabilityWithStatus(
      [
        { key: 'zai/glm-5', available: true },
        { key: 'zai/glm-4.5', available: true },
      ],
      null,
      ['zai']
    )

    expect(reconciled).toEqual([
      { key: 'zai/glm-5', available: false, verificationState: 'unverified' },
      { key: 'zai/glm-4.5', available: false, verificationState: 'unverified' },
    ])
  })

  it('uses persisted verification records for verified unavailable models and shares alias-equivalent states', () => {
    const reconciled = reconcileCatalogAvailabilityWithStatus(
      [
        { key: 'minimax/MiniMax-M2.5', available: true },
        { key: 'minimax/MiniMax-M2.7', available: true },
      ],
      {
        auth: {
          providers: [{ provider: 'minimax-portal', status: 'ok' }],
        },
        allowed: ['minimax-portal/MiniMax-M2.7'],
        defaultModel: 'minimax-portal/MiniMax-M2.7',
      },
      ['minimax'],
      [
        {
          modelKey: 'minimax-portal/MiniMax-M2.5',
          runtimeKey: 'minimax/minimax-m2.5',
          verificationState: 'verified-unavailable',
          source: 'switch-failed',
          updatedAt: '2026-03-26T00:00:00.000Z',
        },
      ]
    )

    expect(reconciled).toEqual([
      { key: 'minimax/MiniMax-M2.5', available: false, verificationState: 'verified-unavailable' },
      { key: 'minimax/MiniMax-M2.7', available: true, verificationState: 'verified-available' },
    ])
  })

  it('builds summary copy for available mode', () => {
    expect(buildModelCatalogDisplaySummary(SAMPLE_CATALOG, 'available')).toEqual({
      mode: 'available',
      totalCount: 3,
      availableCount: 2,
      visibleCount: 2,
      label: '当前显示：账号当前可用模型',
      detail: '共 2 个当前可用模型',
      pageEmptyText: '当前账号下没有检测到可用模型',
      providerEmptyText: '当前账号下没有检测到该提供商的可用模型',
    })
  })

  it('builds summary copy for all mode', () => {
    expect(buildModelCatalogDisplaySummary(SAMPLE_CATALOG, 'all')).toEqual({
      mode: 'all',
      totalCount: 3,
      availableCount: 2,
      visibleCount: 3,
      label: '当前显示：目录全量模型',
      detail: '共 3 个目录模型，其中 2 个已验证可用；其余模型可继续切换并等待验证',
      pageEmptyText: '当前目录里没有可识别的模型',
      providerEmptyText: '该提供商当前没有目录模型',
    })
  })
})
