const fs = process.getBuiltinModule('node:fs') as typeof import('node:fs')
const path = process.getBuiltinModule('node:path') as typeof import('node:path')
const crypto = process.getBuiltinModule('node:crypto') as typeof import('node:crypto')

const { mkdir, open, readFile, rename, rm } = fs.promises
const { randomBytes } = crypto

type OpenFileHandle = Awaited<ReturnType<typeof open>>

export interface AtomicWriteFileOptions {
  description?: string
  encoding?: BufferEncoding
  mode?: number
  mkdirFn?: typeof mkdir
  openFn?: typeof open
  renameFn?: typeof rename
  rmFn?: typeof rm
}

export interface AtomicCopyFileOptions extends AtomicWriteFileOptions {
  readFileFn?: typeof readFile
}

function buildAtomicTempPath(targetPath: string): string {
  const directory = path.dirname(targetPath)
  const baseName = path.basename(targetPath)
  const suffix = randomBytes(6).toString('hex')
  return path.join(directory, `.${baseName}.${process.pid}.${Date.now()}.${suffix}.tmp`)
}

function describeTarget(targetPath: string, description?: string): string {
  const normalizedDescription = String(description || '').trim()
  if (normalizedDescription) return normalizedDescription

  const baseName = path.basename(String(targetPath || '').trim())
  return baseName || '目标文件'
}

function toRetryErrorMessage(action: 'temp-write' | 'replace', targetLabel: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error || 'unknown error')
  if (action === 'temp-write') {
    return `写入 ${targetLabel} 的临时文件失败，请重试。${detail ? ` 原因: ${detail}` : ''}`
  }
  return `原子替换 ${targetLabel} 失败，请重试。${detail ? ` 原因: ${detail}` : ''}`
}

async function cleanupTempFile(tempPath: string, rmFn: typeof rm): Promise<void> {
  try {
    await rmFn(tempPath, { force: true })
  } catch {
    // Best-effort cleanup only.
  }
}

async function closeHandle(handle: OpenFileHandle | null): Promise<void> {
  if (!handle) return
  try {
    await handle.close()
  } catch {
    // Ignore close failures during cleanup.
  }
}

async function syncParentDirectory(targetPath: string, openFn: typeof open): Promise<void> {
  if (process.platform === 'win32') return

  let directoryHandle: OpenFileHandle | null = null
  try {
    directoryHandle = await openFn(path.dirname(targetPath), 'r')
    await directoryHandle.sync()
  } catch {
    // Best-effort durability hint only.
  } finally {
    await closeHandle(directoryHandle)
  }
}

export async function atomicWriteFile(
  targetPath: string,
  content: string | Uint8Array,
  options: AtomicWriteFileOptions = {}
): Promise<void> {
  const mkdirFn = options.mkdirFn ?? mkdir
  const openFn = options.openFn ?? open
  const renameFn = options.renameFn ?? rename
  const rmFn = options.rmFn ?? rm
  const tempPath = buildAtomicTempPath(targetPath)
  const targetLabel = describeTarget(targetPath, options.description)
  let handle: OpenFileHandle | null = null

  try {
    await mkdirFn(path.dirname(targetPath), { recursive: true })
  } catch (error) {
    throw new Error(toRetryErrorMessage('temp-write', targetLabel, error))
  }

  try {
    handle = await openFn(tempPath, 'w', options.mode)
    if (typeof content === 'string') {
      await handle.writeFile(content, { encoding: options.encoding ?? 'utf8' })
    } else {
      await handle.writeFile(content)
    }
    await handle.sync()
  } catch (error) {
    await closeHandle(handle)
    await cleanupTempFile(tempPath, rmFn)
    throw new Error(toRetryErrorMessage('temp-write', targetLabel, error))
  }

  await closeHandle(handle)

  try {
    await renameFn(tempPath, targetPath)
    await syncParentDirectory(targetPath, openFn)
  } catch (error) {
    await cleanupTempFile(tempPath, rmFn)
    throw new Error(toRetryErrorMessage('replace', targetLabel, error))
  }
}

export async function atomicWriteJson(
  targetPath: string,
  value: unknown,
  options: AtomicWriteFileOptions = {}
): Promise<void> {
  await atomicWriteFile(targetPath, JSON.stringify(value, null, 2), options)
}

export async function atomicCopyFile(
  sourcePath: string,
  targetPath: string,
  options: AtomicCopyFileOptions = {}
): Promise<void> {
  const readFileFn = options.readFileFn ?? readFile
  const content = await readFileFn(sourcePath)
  await atomicWriteFile(targetPath, content, options)
}
