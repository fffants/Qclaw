import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { markManagedOpenClawInstall } from '../openclaw-install-discovery'

const fs = (process.getBuiltinModule('node:fs') as typeof import('node:fs')).promises
const os = process.getBuiltinModule('node:os') as typeof import('node:os')
const path = process.getBuiltinModule('node:path') as typeof import('node:path')

describe('markManagedOpenClawInstall', () => {
  const originalUserDataDir = process.env.QCLAW_USER_DATA_DIR
  let userDataDir = ''

  beforeEach(async () => {
    userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qclaw-managed-install-store-'))
    process.env.QCLAW_USER_DATA_DIR = userDataDir
  })

  afterEach(async () => {
    await fs.rm(userDataDir, { recursive: true, force: true })
    if (originalUserDataDir === undefined) {
      delete process.env.QCLAW_USER_DATA_DIR
    } else {
      process.env.QCLAW_USER_DATA_DIR = originalUserDataDir
    }
  })

  it('persists the managed install store through the atomic writer', async () => {
    await expect(markManagedOpenClawInstall('fingerprint-1')).resolves.toBe(true)

    const storePath = path.join(userDataDir, 'data-guard', 'managed-openclaw-installs.json')
    const content = await fs.readFile(storePath, 'utf8')
    const parsed = JSON.parse(content)

    expect(parsed).toEqual(
      expect.objectContaining({
        version: 2,
        entries: [
          expect.objectContaining({
            installFingerprint: 'fingerprint-1',
            verified: true,
          }),
        ],
      })
    )
  })
})
