import { MODEL_CATALOG_LIMITS } from '../shared/runtime-policies'

export interface ModelCatalogPaginationQuery {
  page?: number
  pageSize?: number
  bypassCache?: boolean
  [key: string]: unknown
}

export interface ModelCatalogPaginationResult<T> {
  total: number
  items: T[]
}

interface KeyedCatalogItem {
  key: string
}

const MAX_PAGE_FETCHES = 1_000

function normalizePageSize(pageSize: number): number {
  if (!Number.isFinite(pageSize)) return MODEL_CATALOG_LIMITS.dashboardPageSize
  return Math.min(MODEL_CATALOG_LIMITS.maxPageSize, Math.max(1, Math.floor(pageSize)))
}

function normalizeTotal(value: unknown, seenCount: number, pageItemCount: number): number {
  const numericTotal = Number(value)
  if (!Number.isFinite(numericTotal)) {
    return seenCount + pageItemCount
  }
  return Math.max(0, Math.floor(numericTotal), seenCount + pageItemCount)
}

export async function listAllModelCatalogItems<T extends KeyedCatalogItem>(
  listCatalog: (query?: ModelCatalogPaginationQuery) => Promise<ModelCatalogPaginationResult<T>>,
  baseQuery: ModelCatalogPaginationQuery = {},
  pageSize: number = MODEL_CATALOG_LIMITS.dashboardPageSize
): Promise<T[]> {
  const normalizedPageSize = normalizePageSize(pageSize)
  const collected = new Map<string, T>()
  const { bypassCache: _bypassCache, ...stableBaseQuery } = baseQuery
  let page = 1
  let total = Number.POSITIVE_INFINITY
  let useBypassCache = baseQuery.bypassCache === true

  while (page <= MAX_PAGE_FETCHES && collected.size < total) {
    const result = await listCatalog({
      ...stableBaseQuery,
      page,
      pageSize: normalizedPageSize,
      ...(useBypassCache ? { bypassCache: true } : {}),
    })

    const pageItems = Array.isArray(result?.items) ? result.items : []
    const seenBeforePage = collected.size
    total = normalizeTotal(result?.total, seenBeforePage, pageItems.length)

    for (const item of pageItems) {
      const key = String(item?.key || '').trim()
      if (!key || collected.has(key)) continue
      collected.set(key, item)
    }

    if (pageItems.length === 0) break

    page += 1
    useBypassCache = false
  }

  return Array.from(collected.values())
}
