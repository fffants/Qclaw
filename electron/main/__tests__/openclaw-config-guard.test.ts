import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenClawInstallCandidate } from '../../../src/shared/openclaw-phase1'

const {
  discoverOpenClawInstallationsMock,
  getBaselineBackupStatusMock,
  getBaselineBackupBypassStatusMock,
  upsertOwnershipCandidateMock,
  getOwnershipEntryMock,
  summarizeOwnershipEntryMock,
} = vi.hoisted(() => ({
  discoverOpenClawInstallationsMock: vi.fn(),
  getBaselineBackupStatusMock: vi.fn(),
  getBaselineBackupBypassStatusMock: vi.fn(),
  upsertOwnershipCandidateMock: vi.fn(),
  getOwnershipEntryMock: vi.fn(),
  summarizeOwnershipEntryMock: vi.fn(),
}))

vi.mock('../openclaw-install-discovery', () => ({
  discoverOpenClawInstallations: discoverOpenClawInstallationsMock,
}))

vi.mock('../cli', () => ({
  readConfig: vi.fn(),
  readEnvFile: vi.fn(),
  writeConfig: vi.fn(),
  writeEnvFile: vi.fn(),
}))

vi.mock('../openclaw-baseline-backup-gate', async () => {
  const actual = await vi.importActual('../openclaw-baseline-backup-gate')
  return {
    ...(actual as object),
    getBaselineBackupStatus: getBaselineBackupStatusMock,
    getBaselineBackupBypassStatus: getBaselineBackupBypassStatusMock,
  }
})

vi.mock('../openclaw-ownership-store', () => ({
  getOwnershipEntry: getOwnershipEntryMock,
  listOwnershipChanges: vi.fn(),
  recordManagedConfigWrite: vi.fn(),
  recordManagedEnvWrite: vi.fn(),
  setFirstManagedWriteSnapshot: vi.fn(),
  summarizeOwnershipEntry: summarizeOwnershipEntryMock,
  upsertOwnershipCandidate: upsertOwnershipCandidateMock,
}))

import { getDataGuardSummary, prepareManagedConfigWrite } from '../openclaw-config-guard'

function createCandidate(): OpenClawInstallCandidate {
  return {
    candidateId: 'candidate-1',
    binaryPath: '/usr/local/bin/openclaw',
    resolvedBinaryPath: '/usr/local/bin/openclaw',
    packageRoot: '/usr/local/lib/node_modules/openclaw',
    version: '2026.3.12',
    installSource: 'npm-global',
    isPathActive: true,
    configPath: '/Users/test/.openclaw/openclaw.json',
    stateRoot: '/Users/test/.openclaw',
    displayConfigPath: '~/.openclaw/openclaw.json',
    displayStateRoot: '~/.openclaw',
    ownershipState: 'external-preexisting',
    installFingerprint: 'fingerprint-1',
    baselineBackup: null,
    baselineBackupBypass: null,
  }
}

describe('openclaw config guard', () => {
  beforeEach(() => {
    discoverOpenClawInstallationsMock.mockReset()
    getBaselineBackupStatusMock.mockReset()
    getBaselineBackupBypassStatusMock.mockReset()
    upsertOwnershipCandidateMock.mockReset()
    getOwnershipEntryMock.mockReset()
    summarizeOwnershipEntryMock.mockReset()
  })

  it('does not block managed config preparation after the user accepts manual backup responsibility', async () => {
    const candidate = createCandidate()
    const bypass = {
      installFingerprint: candidate.installFingerprint,
      skippedAt: '2026-03-14T06:00:00.000Z',
      reason: 'manual-backup-required' as const,
      sourcePath: candidate.stateRoot,
      displaySourcePath: candidate.displayStateRoot,
      suggestedArchivePath: '/Users/test/Documents/Qclaw Lite Backups/manual-baseline',
      displaySuggestedArchivePath: '~/Documents/Qclaw Lite Backups/manual-baseline',
    }

    discoverOpenClawInstallationsMock.mockResolvedValue({
      candidates: [candidate],
    })
    getBaselineBackupStatusMock.mockResolvedValue(null)
    getBaselineBackupBypassStatusMock.mockResolvedValue(bypass)
    upsertOwnershipCandidateMock.mockResolvedValue({
      firstManagedWriteSnapshot: {
        snapshotId: 'config-snapshot-1',
        createdAt: '2026-03-14T06:10:00.000Z',
        archivePath: '/tmp/config-snapshot-1',
        installFingerprint: candidate.installFingerprint,
        snapshotType: 'config-snapshot',
      },
    })
    getOwnershipEntryMock.mockResolvedValue(null)

    const result = await prepareManagedConfigWrite(candidate)

    expect(result.ok).toBe(true)
    expect(result.blocked).toBe(false)
    expect(result.errorCode).toBeUndefined()
  })

  it('surfaces a manual backup warning in DataGuard when auto-backup was skipped after failure', async () => {
    const candidate = createCandidate()
    const bypass = {
      installFingerprint: candidate.installFingerprint,
      skippedAt: '2026-03-14T06:00:00.000Z',
      reason: 'manual-backup-required' as const,
      sourcePath: candidate.stateRoot,
      displaySourcePath: candidate.displayStateRoot,
      suggestedArchivePath: '/Users/test/Documents/Qclaw Lite Backups/manual-baseline',
      displaySuggestedArchivePath: '~/Documents/Qclaw Lite Backups/manual-baseline',
    }

    discoverOpenClawInstallationsMock.mockResolvedValue({
      candidates: [candidate],
    })
    getBaselineBackupStatusMock.mockResolvedValue(null)
    getBaselineBackupBypassStatusMock.mockResolvedValue(bypass)
    upsertOwnershipCandidateMock.mockResolvedValue({
      firstManagedWriteSnapshot: null,
    })
    summarizeOwnershipEntryMock.mockReturnValue({
      fileCount: 0,
      jsonPathCount: 0,
      shellBlockCount: 0,
      managedFiles: [],
      managedJsonPaths: [],
      managedShellBlockFiles: [],
      firstManagedWriteSnapshot: null,
      updatedAt: '2026-03-14T06:20:00.000Z',
    })

    const result = await getDataGuardSummary(candidate)

    expect(result.activeCandidate?.baselineBackupBypass).toMatchObject({
      installFingerprint: candidate.installFingerprint,
    })
    expect(result.warnings[0]).toContain('自动备份失败，请手动备份')
    expect(result.warnings[0]).toContain('~/Documents/Qclaw Lite Backups/manual-baseline')
  })
})
