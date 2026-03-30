export interface PageDataCacheEntry<T> {
  data: T
  updatedAt: number
}

export interface PageDataCacheOptions {
  ttlMs?: number
}

export interface PageDataCache<T> {
  get: () => PageDataCacheEntry<T> | null
  set: (data: T) => PageDataCacheEntry<T>
  clear: () => void
}

export function createPageDataCache<T>(options: PageDataCacheOptions = {}): PageDataCache<T> {
  let cache: PageDataCacheEntry<T> | null = null
  const ttlMs = Number.isFinite(options.ttlMs ?? Number.POSITIVE_INFINITY)
    ? Math.max(0, Number(options.ttlMs))
    : Number.POSITIVE_INFINITY

  return {
    get: () => {
      if (!cache) return null
      if (Date.now() - cache.updatedAt > ttlMs) {
        cache = null
        return null
      }
      return cache
    },
    set: (data: T) => {
      cache = {
        data,
        updatedAt: Date.now(),
      }
      return cache
    },
    clear: () => {
      cache = null
    },
  }
}
