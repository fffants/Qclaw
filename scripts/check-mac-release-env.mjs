import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { LOCAL_CONFIG_PATH, readLocalPublishUrl } from './electron-builder-local-config.mjs'
import { validateNotaryCredentials } from './mac-notarytool.mjs'
import { resolvePackageVersion } from './package-version.mjs'

const args = new Set(process.argv.slice(2))
const allowPlaceholderPublish = args.has('--allow-placeholder-publish')
const skipNotarize = args.has('--skip-notarize')

function fail(message) {
  console.error(`[mac-release-preflight] ${message}`)
  process.exit(1)
}

function warn(message) {
  console.warn(`[mac-release-preflight] ${message}`)
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  return {
    ok: result.status === 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status ?? -1,
    error: result.error,
  }
}

function readTrimmedEnv(name) {
  return String(process.env[name] || '').trim()
}

function isPlaceholderPublishUrl(value) {
  const normalized = String(value || '').trim()
  return (
    !normalized ||
    /example\.invalid/i.test(normalized) ||
    /example\.com/i.test(normalized) ||
    /electron-vite-react/i.test(normalized) ||
    /releases\/download\/v0\.9\.9/i.test(normalized)
  )
}

function collectDeveloperIdIdentities(output) {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes('Developer ID Application:'))
}

async function main() {
  if (process.platform !== 'darwin') {
    fail('`package:mac` 只能在 macOS 上运行。')
  }

  const builderConfigPath = resolve('electron-builder.json')
  const rawConfig = await readFile(builderConfigPath, 'utf8')
  const config = JSON.parse(rawConfig)

  const appId = String(config.appId || '').trim()
  if (!appId || appId === 'YourAppID') {
    fail('请先把 electron-builder.json 里的 appId 改成正式的 macOS bundle id，不能继续使用 `YourAppID`。')
  }

  if (config.forceCodeSigning !== true) {
    fail('electron-builder.json 必须开启 `forceCodeSigning: true`，否则打包仍可能退化成未签名产物。')
  }

  if (String(config.afterAllArtifactBuild || '').trim() !== 'scripts/after-all-artifact-build.cjs') {
    fail('electron-builder.json 必须配置 `afterAllArtifactBuild` 验签钩子。')
  }

  const mac = config.mac || {}
  if (String(config.afterSign || '').trim() !== 'scripts/after-sign-notarize.cjs') {
    fail('electron-builder.json 必须配置顶层 `afterSign = scripts/after-sign-notarize.cjs`，否则不会执行自定义公证。')
  }

  const localPublishUrl = await readLocalPublishUrl()
  const publishUrl =
    localPublishUrl ||
    readTrimmedEnv('QCLAW_UPDATE_PUBLISH_URL') ||
    (typeof config.publish === 'string'
      ? config.publish
      : String(config.publish?.url || '').trim())
  if (isPlaceholderPublishUrl(publishUrl)) {
    const message = `当前自动更新源仍是占位值。继续打本地签名包可以，但正式发布前必须在 ${LOCAL_CONFIG_PATH} 或 QCLAW_UPDATE_PUBLISH_URL 中提供真实更新源。`
    if (allowPlaceholderPublish) {
      warn(message)
    } else {
      fail(`${message} 如只做本地签名烟雾测试，请改用 \`npm run package:mac\`。`)
    }
  }

  const identityResult = run('security', ['find-identity', '-v', '-p', 'codesigning'])
  if (!identityResult.ok) {
    fail(`无法读取本机 codesigning identity：${identityResult.stderr || identityResult.stdout}`.trim())
  }

  const developerIdIdentities = collectDeveloperIdIdentities(`${identityResult.stdout}\n${identityResult.stderr}`)
  if (developerIdIdentities.length === 0) {
    fail('没有找到可用的 `Developer ID Application` 证书。electron-builder 会退化成 adhoc/unsigned。')
  }

  const cscName = readTrimmedEnv('CSC_NAME')
  if (cscName) {
    const matched = developerIdIdentities.some((line) => line.includes(cscName))
    if (!matched) {
      fail(`CSC_NAME=${JSON.stringify(cscName)} 没有匹配到任何本机 Developer ID Application 证书。`)
    }
  } else if (developerIdIdentities.length > 1) {
    fail('检测到多个 `Developer ID Application` 证书。请显式设置 `CSC_NAME`，避免误用错误证书。')
  }

  const hasAppleIdPair = Boolean(
    readTrimmedEnv('APPLE_ID') && readTrimmedEnv('APPLE_APP_SPECIFIC_PASSWORD') && readTrimmedEnv('APPLE_TEAM_ID')
  )
  const hasApiKeyTriple = Boolean(
    readTrimmedEnv('APPLE_API_KEY') &&
      readTrimmedEnv('APPLE_API_KEY_ID') &&
      readTrimmedEnv('APPLE_API_ISSUER')
  )
  const hasKeychainProfile = Boolean(readTrimmedEnv('APPLE_KEYCHAIN_PROFILE'))

  const hasAnyLegacy = Boolean(
    readTrimmedEnv('APPLE_ID') || readTrimmedEnv('APPLE_APP_SPECIFIC_PASSWORD') || readTrimmedEnv('APPLE_TEAM_ID')
  )
  const hasAnyApiKey = Boolean(
    readTrimmedEnv('APPLE_API_KEY') ||
      readTrimmedEnv('APPLE_API_KEY_ID') ||
      readTrimmedEnv('APPLE_API_ISSUER')
  )

  if (hasAnyLegacy && !hasAppleIdPair) {
    fail('APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID 需要同时设置，否则公证会被跳过。')
  }

  if (hasAnyApiKey && !hasApiKeyTriple) {
    fail('APPLE_API_KEY / APPLE_API_KEY_ID / APPLE_API_ISSUER 需要同时设置，否则公证会被跳过。')
  }

  if (!skipNotarize && !hasAppleIdPair && !hasApiKeyTriple && !hasKeychainProfile) {
    fail(
      '没有检测到可用的公证凭据。请设置 APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID，或 APPLE_API_KEY 三件套，或 APPLE_KEYCHAIN_PROFILE。'
    )
  }

  const xcodeSelectResult = run('xcode-select', ['-p'])
  if (!xcodeSelectResult.ok) {
    fail('当前系统没有可用的 Xcode Command Line Tools，请先执行 `xcode-select --install`。')
  }

  const codesignResult = run('xcrun', ['--find', 'codesign'])
  if (!codesignResult.ok) {
    fail('当前系统无法定位 `codesign`，请先确认 Xcode Command Line Tools 已安装。')
  }

  const packageVersion = resolvePackageVersion()
  if (skipNotarize) {
    console.log(
      `[mac-release-preflight] 检查通过：${developerIdIdentities.length} 个 Developer ID Application identity，本次仅做签名，不执行公证，打包版本号将使用 ${packageVersion.displayVersion}（内部 semver ${packageVersion.version}）。`
    )
    return
  }

  const notarytoolResult = run('xcrun', ['--find', 'notarytool'])
  if (!notarytoolResult.ok) {
    fail('当前系统无法找到 `notarytool`，请升级或安装 Xcode Command Line Tools。')
  }

  const notaryValidation = await validateNotaryCredentials()
  console.log(
    `[mac-release-preflight] 检查通过：${developerIdIdentities.length} 个 Developer ID Application identity，公证凭据 ${notaryValidation.credentials.summary} 可用，本次打包版本号将使用 ${packageVersion.displayVersion}（内部 semver ${packageVersion.version}）。`
  )
}

await main()
