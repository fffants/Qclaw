import { describe, expect, it, vi } from 'vitest'
import { listAllModelCatalogItems } from '../model-catalog-pagination'

describe('listAllModelCatalogItems', () => {
  it('paginates through catalog until total is exhausted', async () => {
    const calls: Array<Record<string, unknown>> = []
    const items = await listAllModelCatalogItems(async (query) => {
      calls.push({ ...(query || {}) })
      if (query?.page === 1) {
        return {
          total: 3,
          items: [
            { key: 'openai/gpt-5.1-codex', provider: 'openai' },
            { key: 'openai/gpt-4o', provider: 'openai' },
          ],
        }
      }

      return {
        total: 3,
        items: [{ key: 'google/gemini-2.5-pro', provider: 'google' }],
      }
    }, {}, 2)

    expect(calls).toEqual([
      { page: 1, pageSize: 2 },
      { page: 2, pageSize: 2 },
    ])
    expect(items).toEqual([
      { key: 'openai/gpt-5.1-codex', provider: 'openai' },
      { key: 'openai/gpt-4o', provider: 'openai' },
      { key: 'google/gemini-2.5-pro', provider: 'google' },
    ])
  })

  it('preserves scoped query fields across page requests', async () => {
    const calls: Array<Record<string, unknown>> = []
    await listAllModelCatalogItems(async (query) => {
      calls.push({ ...(query || {}) })
      return {
        total: query?.page === 1 ? 3 : 3,
        items: query?.page === 1
          ? [
              { key: 'openai/gpt-5.1-codex' },
              { key: 'openai/gpt-4o' },
            ]
          : [{ key: 'openai/gpt-4.1-mini' }],
      }
    }, { provider: 'openai', includeUnavailable: false }, 2)

    expect(calls).toEqual([
      { provider: 'openai', includeUnavailable: false, page: 1, pageSize: 2 },
      { provider: 'openai', includeUnavailable: false, page: 2, pageSize: 2 },
    ])
  })

  it('uses bypassCache only on the first request and deduplicates repeated keys', async () => {
    const listCatalog = vi.fn(async (query?: Record<string, unknown>) => {
      if (query?.page === 1) {
        return {
          total: 3,
          items: [
            { key: 'openai/gpt-5.1-codex' },
            { key: 'openai/gpt-4o' },
          ],
        }
      }

      return {
        total: 3,
        items: [
          { key: 'openai/gpt-4o' },
          { key: 'openai/gpt-4.1-mini' },
        ],
      }
    })

    const items = await listAllModelCatalogItems(listCatalog, { bypassCache: true }, 2)

    expect(listCatalog).toHaveBeenNthCalledWith(1, { bypassCache: true, page: 1, pageSize: 2 })
    expect(listCatalog).toHaveBeenNthCalledWith(2, { page: 2, pageSize: 2 })
    expect(items.map((item) => item.key)).toEqual([
      'openai/gpt-5.1-codex',
      'openai/gpt-4o',
      'openai/gpt-4.1-mini',
    ])
  })

  it('stops when a page returns no items even if total is inconsistent', async () => {
    const calls: number[] = []
    const items = await listAllModelCatalogItems(async (query) => {
      calls.push(Number(query?.page || 1))
      if (query?.page === 1) {
        return {
          total: 100,
          items: [{ key: 'openai/gpt-5.1-codex' }],
        }
      }
      return {
        total: 100,
        items: [],
      }
    }, {}, 1)

    expect(calls).toEqual([1, 2])
    expect(items.map((item) => item.key)).toEqual(['openai/gpt-5.1-codex'])
  })
})
