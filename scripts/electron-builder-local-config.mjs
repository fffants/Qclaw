import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const LOCAL_CONFIG_PATH = resolve('electron-builder.local.json')

function normalizeText(value) {
  return String(value || '').trim()
}

async function readLocalConfig() {
  try {
    const raw = await readFile(LOCAL_CONFIG_PATH, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function deriveBaseUrlFromPublishUrl(publishUrl) {
  const normalized = normalizeText(publishUrl)
  if (!normalized) return ''

  try {
    const parsed = new URL(normalized)
    parsed.pathname = parsed.pathname.replace(/\/[^/]+\/current\/?$/i, '') || '/'
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return normalized.replace(/\/[^/]+\/current\/?$/i, '')
  }
}

export async function readLocalPublishUrl() {
  const config = await readLocalConfig()
  if (!config) return ''

  const publishUrl =
    typeof config.publish === 'string'
      ? config.publish
      : normalizeText(config.publish?.url)
  return publishUrl || ''
}

export async function readLocalCosBaseUrl() {
  const config = await readLocalConfig()
  if (!config) return ''

  const explicitBaseUrl =
    typeof config.cos === 'string'
      ? config.cos
      : normalizeText(config.cos?.baseUrl)
  if (explicitBaseUrl) return explicitBaseUrl

  const publishUrl = await readLocalPublishUrl()
  return deriveBaseUrlFromPublishUrl(publishUrl)
}

export { LOCAL_CONFIG_PATH }
