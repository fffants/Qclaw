import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getOpenClawEffectiveBackupRootInfo } from '../openclaw-backup-roots'

const fs = (process.getBuiltinModule('node:fs') as typeof import('node:fs')).promises
const path = process.getBuiltinModule('node:path') as typeof import('node:path')

describe('openclaw backup roots', () => {
  const originalBackupDir = process.env.QCLAW_BACKUP_DIR
  const originalUserDataDir = process.env.QCLAW_USER_DATA_DIR
  let blockedRoot = ''
  let userDataDir = ''

  beforeEach(async () => {
    blockedRoot = path.join('/tmp', `qclaw-backup-root-blocked-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    userDataDir = path.join('/tmp', `qclaw-backup-root-user-data-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    process.env.QCLAW_BACKUP_DIR = blockedRoot
    process.env.QCLAW_USER_DATA_DIR = userDataDir
    await fs.rm(blockedRoot, { recursive: true, force: true }).catch(() => undefined)
    await fs.rm(userDataDir, { recursive: true, force: true })
    await fs.writeFile(blockedRoot, 'not-a-directory', 'utf8')
  })

  afterEach(async () => {
    await fs.rm(blockedRoot, { recursive: true, force: true }).catch(() => undefined)
    await fs.rm(userDataDir, { recursive: true, force: true })
    if (originalBackupDir === undefined) {
      delete process.env.QCLAW_BACKUP_DIR
    } else {
      process.env.QCLAW_BACKUP_DIR = originalBackupDir
    }

    if (originalUserDataDir === undefined) {
      delete process.env.QCLAW_USER_DATA_DIR
    } else {
      process.env.QCLAW_USER_DATA_DIR = originalUserDataDir
    }
  })

  it('returns the current effective backup root info without needing the backup index', async () => {
    await expect(getOpenClawEffectiveBackupRootInfo()).resolves.toEqual({
      rootDirectory: path.join(userDataDir, 'backups'),
      displayRootDirectory: path.join(userDataDir, 'backups'),
    })
  })
})
