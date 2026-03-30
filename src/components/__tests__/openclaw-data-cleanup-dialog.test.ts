import { describe, expect, it } from 'vitest'

import {
  buildBackupDeleteConfirmMessage,
  buildDeleteAllBackupsConfirmMessage,
} from '../OpenClawDataCleanupDialog'

describe('openclaw data cleanup dialog helpers', () => {
  it('adds manual-backup-responsibility guidance when deleting a baseline backup', () => {
    expect(
      buildBackupDeleteConfirmMessage({
        type: 'baseline-backup',
        createdAt: '2026-03-13T08:00:00.000Z',
      } as any)
    ).toContain('系统会转为手动备份责任')
  })

  it('keeps normal backup delete copy unchanged for non-baseline backups', () => {
    expect(
      buildBackupDeleteConfirmMessage({
        type: 'manual-backup',
        createdAt: '2026-03-13T08:00:00.000Z',
      } as any)
    ).not.toContain('系统会转为手动备份责任')
  })

  it('adds manual-backup-responsibility guidance when deleting all backups including baseline', () => {
    expect(
      buildDeleteAllBackupsConfirmMessage([
        { type: 'manual-backup' } as any,
        { type: 'baseline-backup' } as any,
      ])
    ).toContain('其中包含基线备份')
  })

  it('keeps delete-all copy concise when no baseline backup exists', () => {
    expect(
      buildDeleteAllBackupsConfirmMessage([
        { type: 'manual-backup' } as any,
        { type: 'config-snapshot' } as any,
      ])
    ).toBe('将删除全部 OpenClaw 备份。此操作不可恢复。')
  })
})
