import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { atomicWriteJson } from '../atomic-write'

const fs = (process.getBuiltinModule('node:fs') as typeof import('node:fs')).promises
const os = process.getBuiltinModule('node:os') as typeof import('node:os')
const path = process.getBuiltinModule('node:path') as typeof import('node:path')

describe('atomicWriteJson', () => {
  let tempDir = ''

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qclaw-atomic-write-'))
  })

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('replaces the target file with the new JSON payload', async () => {
    const targetPath = path.join(tempDir, 'openclaw.json')

    await atomicWriteJson(targetPath, {
      version: 1,
      provider: 'openai',
    })

    const content = await fs.readFile(targetPath, 'utf8')
    expect(JSON.parse(content)).toEqual({
      version: 1,
      provider: 'openai',
    })
  })

  it('keeps the old file when temporary write fails and returns a retry hint', async () => {
    const targetPath = path.join(tempDir, 'openclaw.json')
    await fs.writeFile(targetPath, JSON.stringify({ version: 1, provider: 'old' }, null, 2), 'utf8')

    await expect(
      atomicWriteJson(
        targetPath,
        {
          version: 2,
          provider: 'new',
        },
        {
          description: 'OpenClaw 主配置',
          openFn: async () => {
            throw new Error('disk full')
          },
        }
      )
    ).rejects.toThrow(/请重试/)

    const content = await fs.readFile(targetPath, 'utf8')
    expect(JSON.parse(content)).toEqual({
      version: 1,
      provider: 'old',
    })
  })

  it('returns a retry hint when preparing the temporary directory fails', async () => {
    const targetPath = path.join(tempDir, 'nested', 'openclaw.json')

    await expect(
      atomicWriteJson(
        targetPath,
        {
          version: 1,
        },
        {
          description: 'OpenClaw 主配置',
          mkdirFn: async () => {
            throw new Error('permission denied')
          },
        }
      )
    ).rejects.toThrow(/请重试/)

    await expect(fs.access(targetPath)).rejects.toBeTruthy()
  })
})
