import { afterEach, describe, expect, it } from 'vitest'
import {
  isUnsafeWorkingDirectory,
  resolveSafeWorkingDirectory,
  tryNormalizeProcessCwd,
} from '../runtime-working-directory'
import { buildTestEnv } from './test-env'

const fs = process.getBuiltinModule('node:fs') as typeof import('node:fs')
const os = process.getBuiltinModule('node:os') as typeof import('node:os')
const path = process.getBuiltinModule('node:path') as typeof import('node:path')

const tempDirs: string[] = []

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qclaw-runtime-cwd-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe('isUnsafeWorkingDirectory', () => {
  it('treats Desktop and cloud-backed folders as unsafe on macOS', () => {
    const tempDir = makeTempDir()
    const homeDir = path.join(tempDir, 'home')

    expect(
      isUnsafeWorkingDirectory(path.join(homeDir, 'Desktop', 'Qlite'), {
        platform: 'darwin',
        homeDir,
      })
    ).toBe(true)
    expect(
      isUnsafeWorkingDirectory(path.join(homeDir, 'Library', 'CloudStorage', 'OneDrive', 'Qlite'), {
        platform: 'darwin',
        homeDir,
      })
    ).toBe(true)
    expect(
      isUnsafeWorkingDirectory('/Volumes/Qclaw Lite/Qclaw Lite.app', {
        platform: 'darwin',
        homeDir,
      })
    ).toBe(true)
  })

  it('allows application support style runtime directories', () => {
    const tempDir = makeTempDir()
    const homeDir = path.join(tempDir, 'home')

    expect(
      isUnsafeWorkingDirectory(
        path.join(homeDir, 'Library', 'Application Support', 'Qclaw Lite', 'runtime'),
        {
          platform: 'darwin',
          homeDir,
        }
      )
    ).toBe(false)
  })
})

describe('resolveSafeWorkingDirectory', () => {
  it('prefers the configured userData runtime directory and creates it on demand', () => {
    const tempDir = makeTempDir()
    const userDataDir = path.join(tempDir, 'user-data')

    const resolved = resolveSafeWorkingDirectory({
      platform: 'darwin',
      homeDir: path.join(tempDir, 'home'),
      tempDir: path.join(tempDir, 'tmp'),
      env: buildTestEnv({
        QCLAW_USER_DATA_DIR: userDataDir,
      }),
    })

    expect(resolved).toBe(fs.realpathSync(path.join(userDataDir, 'runtime')))
    expect(fs.existsSync(resolved)).toBe(true)
  })
})

describe('tryNormalizeProcessCwd', () => {
  it('moves unsafe macOS working directories to the managed runtime dir', () => {
    const tempDir = makeTempDir()
    const homeDir = path.join(tempDir, 'home')
    const userDataDir = path.join(tempDir, 'user-data')
    let changedTo = ''

    const result = tryNormalizeProcessCwd({
      platform: 'darwin',
      homeDir,
      tempDir: path.join(tempDir, 'tmp'),
      env: buildTestEnv({
        QCLAW_USER_DATA_DIR: userDataDir,
      }),
      cwdGetter: () => path.join(homeDir, 'Desktop', 'Qlite'),
      chdir: (directory) => {
        changedTo = directory
      },
    })

    expect(result.changed).toBe(true)
    expect(result.reason).toBe('unsafe-working-directory')
    expect(result.originalCwd).toBe(path.join(homeDir, 'Desktop', 'Qlite'))
    expect(result.cwd).toBe(fs.realpathSync(path.join(userDataDir, 'runtime')))
    expect(changedTo).toBe(fs.realpathSync(path.join(userDataDir, 'runtime')))
  })

  it('recovers when reading process.cwd throws', () => {
    const tempDir = makeTempDir()
    const userDataDir = path.join(tempDir, 'user-data')
    let changedTo = ''

    const result = tryNormalizeProcessCwd({
      platform: 'darwin',
      homeDir: path.join(tempDir, 'home'),
      tempDir: path.join(tempDir, 'tmp'),
      env: buildTestEnv({
        QCLAW_USER_DATA_DIR: userDataDir,
      }),
      cwdGetter: () => {
        throw new Error('EPERM: operation not permitted, uv_cwd')
      },
      chdir: (directory) => {
        changedTo = directory
      },
    })

    expect(result.changed).toBe(true)
    expect(result.reason).toBe('cwd-unavailable')
    expect(result.originalCwd).toBeNull()
    expect(result.cwd).toBe(fs.realpathSync(path.join(userDataDir, 'runtime')))
    expect(changedTo).toBe(fs.realpathSync(path.join(userDataDir, 'runtime')))
  })
})
