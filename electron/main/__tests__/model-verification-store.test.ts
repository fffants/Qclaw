import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const fs = process.getBuiltinModule('node:fs') as typeof import('node:fs')
const os = process.getBuiltinModule('node:os') as typeof import('node:os')
const path = process.getBuiltinModule('node:path') as typeof import('node:path')

const { mkdtemp, rm, readFile } = fs.promises

describe('model verification store', () => {
  let userDataDir = ''

  beforeEach(async () => {
    userDataDir = await mkdtemp(path.join(os.tmpdir(), 'qclaw-model-verification-'))
    process.env.QCLAW_USER_DATA_DIR = userDataDir
  })

  afterEach(async () => {
    delete process.env.QCLAW_USER_DATA_DIR
    if (userDataDir) {
      await rm(userDataDir, { recursive: true, force: true })
      userDataDir = ''
    }
  })

  it('persists automatic verified-available records from runtime status', async () => {
    const module = await import('../model-verification-store')

    const snapshot = await module.syncModelVerificationState({
      statusData: {
        allowed: ['minimax-portal/MiniMax-M2.7'],
        defaultModel: 'minimax-portal/MiniMax-M2.7',
      },
    })

    expect(snapshot.records).toEqual([
      expect.objectContaining({
        runtimeKey: 'minimax/minimax-m2.7',
        modelKey: 'minimax-portal/MiniMax-M2.7',
        verificationState: 'verified-available',
      }),
    ])

    const storePath = path.join(userDataDir, 'models', 'verification-state.json')
    const persisted = JSON.parse(await readFile(storePath, 'utf8'))
    expect(persisted.records).toEqual([
      expect.objectContaining({
        runtimeKey: 'minimax/minimax-m2.7',
        verificationState: 'verified-available',
      }),
    ])
  })

  it('shares persisted verification state across alias-equivalent model keys', async () => {
    const module = await import('../model-verification-store')

    await module.recordModelVerification({
      modelKey: 'minimax-portal/MiniMax-M2.5',
      verificationState: 'verified-unavailable',
    })

    const snapshot = await module.recordModelVerification({
      modelKey: 'minimax/MiniMax-M2.5',
      verificationState: 'verified-available',
    })

    expect(snapshot.records).toEqual([
      expect.objectContaining({
        runtimeKey: 'minimax/minimax-m2.5',
        modelKey: 'minimax/MiniMax-M2.5',
        verificationState: 'verified-available',
      }),
    ])
  })
})
