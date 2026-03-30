import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

function fail(message) {
  throw new Error(`[mac-notarytool] ${message}`)
}

function readTrimmedEnv(name) {
  return String(process.env[name] || '').trim()
}

function makeOutput(stdout, stderr) {
  return [stdout, stderr].filter(Boolean).join('\n').trim()
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', reject)
    child.on('close', (code) => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr,
        output: makeOutput(stdout, stderr),
      })
    })
  })
}

function parseJsonOutput(result, description) {
  const output = String(result.output || '').trim()
  if (!output) {
    fail(`${description} 没有返回任何输出。`)
  }

  try {
    return JSON.parse(output)
  } catch {
    fail(`${description} 返回了非 JSON 输出：\n${output}`)
  }
}

export function resolveNotaryCredentials() {
  const appleId = readTrimmedEnv('APPLE_ID')
  const appleIdPassword = readTrimmedEnv('APPLE_APP_SPECIFIC_PASSWORD')
  const appleTeamId = readTrimmedEnv('APPLE_TEAM_ID')

  const appleApiKey = readTrimmedEnv('APPLE_API_KEY')
  const appleApiKeyId = readTrimmedEnv('APPLE_API_KEY_ID')
  const appleApiIssuer = readTrimmedEnv('APPLE_API_ISSUER')

  const keychain = readTrimmedEnv('APPLE_KEYCHAIN')
  const keychainProfile = readTrimmedEnv('APPLE_KEYCHAIN_PROFILE')

  if (keychainProfile) {
    return {
      kind: 'keychain',
      args: keychain ? ['--keychain', keychain, '--keychain-profile', keychainProfile] : ['--keychain-profile', keychainProfile],
      summary: `keychain profile ${JSON.stringify(keychainProfile)}`,
    }
  }

  if (appleApiKey || appleApiKeyId || appleApiIssuer) {
    if (!appleApiKey || !appleApiKeyId || !appleApiIssuer) {
      fail('APPLE_API_KEY / APPLE_API_KEY_ID / APPLE_API_ISSUER 需要同时设置。')
    }

    return {
      kind: 'api-key',
      args: ['--key', appleApiKey, '--key-id', appleApiKeyId, '--issuer', appleApiIssuer],
      summary: `App Store Connect API key ${JSON.stringify(appleApiKeyId)}`,
    }
  }

  if (appleId || appleIdPassword || appleTeamId) {
    if (!appleId || !appleIdPassword || !appleTeamId) {
      fail('APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID 需要同时设置。')
    }

    return {
      kind: 'apple-id',
      args: ['--apple-id', appleId, '--password', appleIdPassword, '--team-id', appleTeamId],
      summary: `Apple ID ${JSON.stringify(appleId)} + team ${JSON.stringify(appleTeamId)}`,
    }
  }

  fail('没有检测到可用的 notarytool 凭据。')
}

export async function validateNotaryCredentials() {
  const credentials = resolveNotaryCredentials()
  const result = await run('xcrun', ['notarytool', 'history', ...credentials.args, '--output-format', 'json'])
  const parsed = parseJsonOutput(result, 'notarytool 凭据校验')

  if (result.code !== 0) {
    fail(`notarytool 凭据校验失败：\n${result.output}`)
  }

  return {
    credentials,
    parsed,
  }
}

async function zipApp(appPath, destinationZipPath) {
  const result = await run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', path.basename(appPath), destinationZipPath], {
    cwd: path.dirname(appPath),
  })

  if (result.code !== 0) {
    fail(`打包待公证 zip 失败：\n${result.output}`)
  }
}

async function stapleApp(appPath) {
  const stapleResult = await run('xcrun', ['stapler', 'staple', '-v', appPath])
  if (stapleResult.code !== 0) {
    fail(`staple 失败：\n${stapleResult.output}`)
  }

  const validateResult = await run('xcrun', ['stapler', 'validate', '-v', appPath])
  if (validateResult.code !== 0) {
    fail(`staple 校验失败：\n${validateResult.output}`)
  }
}

async function fetchNotaryLog(submissionId, credentials) {
  const logResult = await run('xcrun', ['notarytool', 'log', submissionId, ...credentials.args])
  return logResult.output
}

export async function notarizeApp(appPath) {
  const credentials = resolveNotaryCredentials()
  const tempDir = await mkdtemp(path.join(tmpdir(), 'qclaw-notary-'))
  const zipPath = path.join(tempDir, `${path.parse(appPath).name}.zip`)

  try {
    await zipApp(appPath, zipPath)

    const submitResult = await run('xcrun', [
      'notarytool',
      'submit',
      zipPath,
      ...credentials.args,
      '--wait',
      '--output-format',
      'json',
    ])

    const parsed = parseJsonOutput(submitResult, 'notarytool submit')

    if (submitResult.code !== 0 || String(parsed.status || '').trim() !== 'Accepted') {
      const submissionId = String(parsed.id || '').trim()
      let notaryLog = ''

      if (submissionId) {
        try {
          notaryLog = await fetchNotaryLog(submissionId, credentials)
        } catch (error) {
          notaryLog = String(error instanceof Error ? error.message : error || '').trim()
        }
      }

      fail(
        [
          '公证失败。',
          submitResult.output && `Apple 返回：\n${submitResult.output}`,
          notaryLog && `notarytool log：\n${notaryLog}`,
        ]
          .filter(Boolean)
          .join('\n\n')
      )
    }

    await stapleApp(appPath)

    return {
      credentials,
      submission: parsed,
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}
