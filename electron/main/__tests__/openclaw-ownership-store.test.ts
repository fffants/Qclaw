import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { OpenClawInstallCandidate } from '../../../src/shared/openclaw-phase1'
import {
  getOwnershipEntry,
  recordManagedConfigWrite,
  recordManagedEnvWrite,
  recordManagedShellBlocks,
  setFirstManagedWriteSnapshot,
  summarizeOwnershipEntry,
  upsertOwnershipCandidate,
} from '../openclaw-ownership-store'

const fs = (process.getBuiltinModule('node:fs') as typeof import('node:fs')).promises
const path = process.getBuiltinModule('node:path') as typeof import('node:path')

function createCandidate(): OpenClawInstallCandidate {
  return {
    candidateId: 'candidate-1',
    binaryPath: '/usr/local/bin/openclaw',
    resolvedBinaryPath: '/usr/local/bin/openclaw',
    packageRoot: '/usr/local/lib/node_modules/openclaw',
    version: '1.2.3',
    installSource: 'npm-global',
    isPathActive: true,
    configPath: '/Users/test/.openclaw/openclaw.json',
    stateRoot: '/Users/test/.openclaw',
    displayConfigPath: '~/.openclaw/openclaw.json',
    displayStateRoot: '~/.openclaw',
    ownershipState: 'mixed-managed',
    installFingerprint: 'fingerprint-1',
    baselineBackup: {
      backupId: 'baseline-1',
      createdAt: '2026-03-13T08:00:00.000Z',
      archivePath: '/Users/test/Documents/Qclaw Lite Backups/baseline-1',
      installFingerprint: 'fingerprint-1',
    },
    baselineBackupBypass: null,
  }
}

describe('openclaw ownership store', () => {
  const originalUserDataDir = process.env.QCLAW_USER_DATA_DIR
  let userDataDir = ''

  beforeEach(async () => {
    userDataDir = path.join(
      '/tmp',
      `qclaw-ownership-store-${Date.now()}-${Math.random().toString(16).slice(2)}`
    )
    process.env.QCLAW_USER_DATA_DIR = userDataDir
    await fs.rm(userDataDir, { recursive: true, force: true })
  })

  afterEach(async () => {
    await fs.rm(userDataDir, { recursive: true, force: true })
    if (originalUserDataDir === undefined) {
      delete process.env.QCLAW_USER_DATA_DIR
      return
    }
    process.env.QCLAW_USER_DATA_DIR = originalUserDataDir
  })

  it('records file, json path, snapshot, and shell block ownership for an install fingerprint', async () => {
    const candidate = createCandidate()
    await upsertOwnershipCandidate(candidate)
    await setFirstManagedWriteSnapshot(candidate, {
      snapshotId: 'config-snapshot-1',
      createdAt: '2026-03-13T09:00:00.000Z',
      archivePath: '/Users/test/Documents/Qclaw Lite Backups/config-snapshot-1',
      installFingerprint: candidate.installFingerprint,
      snapshotType: 'config-snapshot',
    })
    await recordManagedConfigWrite(candidate, {
      filePath: candidate.configPath,
      jsonPaths: ['$.channels.feishu.appId', '$.channels.feishu.appSecret'],
    })
    await recordManagedEnvWrite(candidate, {
      filePath: '/Users/test/.openclaw/.env',
    })
    await recordManagedShellBlocks(candidate, [
      {
        filePath: '/Users/test/.zshrc',
        blockId: 'shell-init:/Users/test/.zshrc',
        blockType: 'openclaw-shell-init',
        startMarker: '# >>> qclaw-lite openclaw managed block >>>',
        endMarker: '# <<< qclaw-lite openclaw managed block <<<',
        source: 'qclaw-lite',
        firstManagedAt: '2026-03-13T09:10:00.000Z',
        lastManagedAt: '2026-03-13T09:10:00.000Z',
      },
    ])

    const entry = await getOwnershipEntry(candidate.installFingerprint)
    const summary = summarizeOwnershipEntry(entry)

    expect(entry?.files.map((record) => record.kind)).toEqual(['env', 'config'])
    expect(entry?.jsonPaths.map((record) => record.jsonPath)).toEqual([
      '$.channels.feishu.appId',
      '$.channels.feishu.appSecret',
    ])
    expect(entry?.shellBlocks.map((record) => record.filePath)).toEqual(['/Users/test/.zshrc'])
    expect(entry?.firstManagedWriteSnapshot?.snapshotId).toBe('config-snapshot-1')
    expect(summary).toEqual(
      expect.objectContaining({
        fileCount: 2,
        jsonPathCount: 2,
        shellBlockCount: 1,
      })
    )
  })
})
