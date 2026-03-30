import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const path = process.getBuiltinModule('node:path') as typeof import('node:path')
const fs = process.getBuiltinModule('node:fs') as typeof import('node:fs')

const { runCliMock, discoverOpenClawInstallationsMock } = vi.hoisted(() => ({
  runCliMock: vi.fn(),
  discoverOpenClawInstallationsMock: vi.fn(),
}))

vi.mock('../cli', () => ({
  runCli: runCliMock,
}))

vi.mock('../openclaw-install-discovery', () => ({
  discoverOpenClawInstallations: discoverOpenClawInstallationsMock,
}))

import { runOpenClawDataCleanup } from '../openclaw-data-cleanup-service'

describe('openclaw data cleanup service', () => {
  const tempDirs: string[] = []
  const originalBackupDir = process.env.QCLAW_BACKUP_DIR

  beforeEach(() => {
    runCliMock.mockReset()
    discoverOpenClawInstallationsMock.mockReset()
    runCliMock.mockResolvedValue({ ok: true, stdout: '', stderr: '', code: 0 })
    process.env.QCLAW_BACKUP_DIR = makeTempDir('backups')
  })

  afterEach(() => {
    if (originalBackupDir === undefined) {
      delete process.env.QCLAW_BACKUP_DIR
    } else {
      process.env.QCLAW_BACKUP_DIR = originalBackupDir
    }
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  function makeTempDir(name: string): string {
    const dir = path.join('/tmp', `qclaw-data-cleanup-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    fs.mkdirSync(dir, { recursive: true })
    tempDirs.push(dir)
    return dir
  }

  it('deletes an allowed candidate state root without uninstalling the program', async () => {
    const stateRoot = makeTempDir('candidate')
    fs.writeFileSync(path.join(stateRoot, 'openclaw.json'), '{}')

    discoverOpenClawInstallationsMock.mockResolvedValue({
      candidates: [
        {
          stateRoot,
          displayStateRoot: stateRoot,
          isPathActive: true,
        },
      ],
      historyDataCandidates: [],
    })

    const result = await runOpenClawDataCleanup({ targetPath: stateRoot })

    expect(result.ok).toBe(true)
    expect(result.deletedPath).toBe(stateRoot)
    expect(result.backupCreated).toBeTruthy()
    expect(fs.existsSync(stateRoot)).toBe(false)
    expect(runCliMock).toHaveBeenCalledWith(['gateway', 'stop'])
  })

  it('allows deleting history-only data roots', async () => {
    const historyRoot = makeTempDir('history')
    fs.writeFileSync(path.join(historyRoot, 'openclaw.json'), '{}')

    discoverOpenClawInstallationsMock.mockResolvedValue({
      candidates: [],
      historyDataCandidates: [
        {
          path: historyRoot,
          displayPath: historyRoot,
          reason: 'runtime-state-root',
        },
      ],
    })

    const result = await runOpenClawDataCleanup({ targetPath: historyRoot })

    expect(result.ok).toBe(true)
    expect(result.backupCreated).toBeTruthy()
    expect(fs.existsSync(historyRoot)).toBe(false)
    expect(runCliMock).not.toHaveBeenCalled()
  })

  it('does not stop the gateway when deleting an inactive candidate state root', async () => {
    const activeRoot = makeTempDir('active')
    const inactiveRoot = makeTempDir('inactive')
    fs.writeFileSync(path.join(activeRoot, 'openclaw.json'), '{}')
    fs.writeFileSync(path.join(inactiveRoot, 'openclaw.json'), '{}')

    discoverOpenClawInstallationsMock.mockResolvedValue({
      candidates: [
        {
          stateRoot: activeRoot,
          displayStateRoot: activeRoot,
          isPathActive: true,
        },
        {
          stateRoot: inactiveRoot,
          displayStateRoot: inactiveRoot,
          isPathActive: false,
        },
      ],
      historyDataCandidates: [],
    })

    const result = await runOpenClawDataCleanup({ targetPath: inactiveRoot })

    expect(result.ok).toBe(true)
    expect(fs.existsSync(inactiveRoot)).toBe(false)
    expect(runCliMock).not.toHaveBeenCalled()
  })

  it('rejects arbitrary paths outside discovered openclaw data roots', async () => {
    const stateRoot = makeTempDir('allowed')
    const blockedPath = makeTempDir('blocked')

    discoverOpenClawInstallationsMock.mockResolvedValue({
      candidates: [
        {
          stateRoot,
          displayStateRoot: stateRoot,
          isPathActive: true,
        },
      ],
      historyDataCandidates: [],
    })

    const result = await runOpenClawDataCleanup({ targetPath: blockedPath })

    expect(result.ok).toBe(false)
    expect(result.errorCode).toBe('invalid_target')
    expect(fs.existsSync(blockedPath)).toBe(true)
  })
})
