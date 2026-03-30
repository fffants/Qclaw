const { mkdir, mkdtemp, rm } = process.getBuiltinModule('node:fs/promises') as typeof import('node:fs/promises')
const { join } = process.getBuiltinModule('node:path') as typeof import('node:path')

export interface IsolatedNpmCacheEnv {
  cacheDir: string
  env: Partial<NodeJS.ProcessEnv>
}

export async function createIsolatedNpmCacheEnv(cacheRootDir: string): Promise<IsolatedNpmCacheEnv> {
  const normalizedRootDir = String(cacheRootDir || '').trim()
  if (!normalizedRootDir) {
    throw new Error('npm cache root directory is required')
  }

  await mkdir(normalizedRootDir, { recursive: true })
  const cacheDir = await mkdtemp(join(normalizedRootDir, 'run-'))
  return {
    cacheDir,
    env: {
      npm_config_cache: cacheDir,
      NPM_CONFIG_CACHE: cacheDir,
    },
  }
}

export async function cleanupIsolatedNpmCacheEnv(cacheDir: string | null | undefined): Promise<void> {
  const normalizedCacheDir = String(cacheDir || '').trim()
  if (!normalizedCacheDir) return

  await rm(normalizedCacheDir, { recursive: true, force: true }).catch(() => {
    // Best effort only; install failures should not be masked by cleanup errors.
  })
}
