import { describe, expect, it } from 'vitest'

import { cleanupIsolatedNpmCacheEnv, createIsolatedNpmCacheEnv } from '../npm-cache-env'

const { mkdtemp } = process.getBuiltinModule('node:fs/promises') as typeof import('node:fs/promises')
const { tmpdir } = process.getBuiltinModule('node:os') as typeof import('node:os')
const { join } = process.getBuiltinModule('node:path') as typeof import('node:path')

describe('createIsolatedNpmCacheEnv', () => {
  it('creates a unique npm cache directory for each install attempt', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'qclaw-npm-cache-root-'))

    const first = await createIsolatedNpmCacheEnv(rootDir)
    const second = await createIsolatedNpmCacheEnv(rootDir)

    expect(first.cacheDir).not.toBe(second.cacheDir)
    expect(first.env.npm_config_cache).toBe(first.cacheDir)
    expect(first.env.NPM_CONFIG_CACHE).toBe(first.cacheDir)
    expect(second.env.npm_config_cache).toBe(second.cacheDir)
    expect(second.env.NPM_CONFIG_CACHE).toBe(second.cacheDir)

    await cleanupIsolatedNpmCacheEnv(first.cacheDir)
    await cleanupIsolatedNpmCacheEnv(second.cacheDir)
    await cleanupIsolatedNpmCacheEnv(rootDir)
  })
})
