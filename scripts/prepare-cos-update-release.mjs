import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { resolve, join, basename } from 'node:path'
import { LOCAL_CONFIG_PATH, readLocalCosBaseUrl } from './electron-builder-local-config.mjs'

function fail(message) {
  console.error(`[prepare-cos-update-release] ${message}`)
  process.exit(1)
}

function info(message) {
  console.log(`[prepare-cos-update-release] ${message}`)
}

function stripQuotes(value) {
  const normalized = String(value || '').trim()
  if (!normalized) return ''
  if ((normalized.startsWith('"') && normalized.endsWith('"')) || (normalized.startsWith("'") && normalized.endsWith("'"))) {
    return normalized.slice(1, -1).trim()
  }
  return normalized
}

function parseArgs(argv) {
  const options = {
    releaseDir: '',
    channel: 'beta',
    baseUrl: '',
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--release-dir') {
      options.releaseDir = String(argv[i + 1] || '').trim()
      i += 1
      continue
    }
    if (arg === '--channel') {
      options.channel = String(argv[i + 1] || '').trim() || 'beta'
      i += 1
      continue
    }
    if (arg === '--base-url') {
      options.baseUrl = String(argv[i + 1] || '').trim() || options.baseUrl
      i += 1
      continue
    }
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/prepare-cos-update-release.mjs --release-dir release/<version> [--channel beta] [--base-url https://...]')
      process.exit(0)
    }
  }

  if (!options.releaseDir) {
    fail('缺少 --release-dir，例如 `--release-dir release/2026.3.19`。')
  }

  return options
}

function parseUpdateYml(raw) {
  const lines = String(raw || '').split(/\r?\n/)
  const urls = []
  let version = ''

  for (const line of lines) {
    const versionMatch = line.match(/^\s*version:\s*(.+?)\s*$/)
    if (versionMatch) {
      version = stripQuotes(versionMatch[1])
      continue
    }

    const listUrlMatch = line.match(/^\s*-\s*url:\s*(.+?)\s*$/)
    if (listUrlMatch) {
      const url = stripQuotes(listUrlMatch[1])
      if (url) urls.push(url)
      continue
    }

    const pathMatch = line.match(/^\s*path:\s*(.+?)\s*$/)
    if (pathMatch) {
      const path = stripQuotes(pathMatch[1])
      if (path) urls.push(path)
    }
  }

  return {
    version,
    urls: Array.from(new Set(urls)),
  }
}

async function ensureDirectoryExists(targetDir) {
  try {
    const fileStat = await stat(targetDir)
    if (!fileStat.isDirectory()) {
      fail(`${targetDir} 不是目录。`)
    }
  } catch {
    fail(`目录不存在：${targetDir}`)
  }
}

function normalizeBaseUrl(baseUrl) {
  const normalized = String(baseUrl || '').trim()
  if (!normalized) return ''
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const releaseDir = resolve(options.releaseDir)
  await ensureDirectoryExists(releaseDir)

  const entries = await readdir(releaseDir, { withFileTypes: true })
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name)

  const metadataFiles = files.filter((name) => /^latest(?:-[^.]+)?\.yml$/i.test(name))
  if (metadataFiles.length === 0) {
    fail(`在 ${releaseDir} 没有找到 latest*.yml，无法生成发布清单。`)
  }

  const referencedFiles = new Set()
  let detectedVersion = ''

  for (const metadataFile of metadataFiles) {
    const metadataPath = join(releaseDir, metadataFile)
    const raw = await readFile(metadataPath, 'utf8')
    const parsed = parseUpdateYml(raw)

    if (parsed.version && !detectedVersion) detectedVersion = parsed.version
    for (const url of parsed.urls) {
      const normalized = String(url || '').trim()
      if (!normalized) continue
      if (normalized.includes('://')) {
        const urlObj = new URL(normalized)
        const fileName = basename(urlObj.pathname)
        if (fileName) referencedFiles.add(fileName)
      } else {
        referencedFiles.add(basename(normalized))
      }
    }
  }

  const version = detectedVersion || basename(releaseDir)
  if (!version) {
    fail('无法识别版本号，请检查 latest*.yml 或 release 目录名。')
  }

  const stage1Files = new Set()
  for (const fileName of referencedFiles) {
    if (!fileName) continue
    stage1Files.add(fileName)
    const blockMap = `${fileName}.blockmap`
    if (files.includes(blockMap)) stage1Files.add(blockMap)
  }

  if (stage1Files.size === 0) {
    fail('latest*.yml 没有解析出任何安装包文件。')
  }

  const missingFiles = Array.from(stage1Files).filter((fileName) => !files.includes(fileName))
  if (missingFiles.length > 0) {
    fail(`以下文件在 release 目录不存在：${missingFiles.join(', ')}`)
  }

  const stage2Files = metadataFiles.sort()

  const channel = String(options.channel || 'beta').trim() || 'beta'
  const currentPrefix = `${channel}/current`
  const archivePrefix = `${channel}/releases/${version}`
  const localBaseUrl = await readLocalCosBaseUrl()
  const baseUrl = normalizeBaseUrl(options.baseUrl || localBaseUrl)
  if (!baseUrl) {
    fail(`缺少 COS baseUrl。请在 ${LOCAL_CONFIG_PATH} 中配置 cos.baseUrl，或在命令里传入 --base-url。`)
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    releaseDir,
    version,
    channel,
    currentPrefix,
    archivePrefix,
    stage1Files: Array.from(stage1Files).sort(),
    stage2Files,
    currentUrls: {
      stage1: Array.from(stage1Files).sort().map((name) => `${baseUrl}/${currentPrefix}/${name}`),
      stage2: stage2Files.map((name) => `${baseUrl}/${currentPrefix}/${name}`),
    },
    archiveUrls: {
      stage1: Array.from(stage1Files).sort().map((name) => `${baseUrl}/${archivePrefix}/${name}`),
      stage2: stage2Files.map((name) => `${baseUrl}/${archivePrefix}/${name}`),
    },
    cacheControlRecommendation: {
      metadata: 'no-cache, no-store, must-revalidate',
      artifacts: 'public, max-age=31536000, immutable',
    },
  }

  const manifestPath = join(releaseDir, 'cos-upload-manifest.json')
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  info(`版本 ${version} 校验通过。`)
  info(`清单已生成：${manifestPath}`)
  info(`上传顺序（current）:`)
  info(`  1) 先上传 ${manifest.stage1Files.length} 个安装包/增量文件到 ${currentPrefix}`)
  info(`  2) 最后上传 ${manifest.stage2Files.join(', ')} 到 ${currentPrefix}`)
  info(`建议同步归档到 ${archivePrefix}`)
}

await main()
