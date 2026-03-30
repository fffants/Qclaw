/**
 * WeChat Work (企业微信) QR code binding API.
 *
 * Uses the same endpoints as @wecom/wecom-openclaw-cli's qrcode flow:
 *   - Generate: GET /ai/qc/generate?source=wecom-cli&plat=<1|2|3>
 *   - Poll:     GET /ai/qc/query_result?scode=<scode>
 */
import https from 'node:https'

const BASE = 'https://work.weixin.qq.com'

export interface WecomQrGenerateResult {
  ok: boolean
  scode?: string
  authUrl?: string
  error?: string
}

export interface WecomQrCheckResult {
  ok: boolean
  status: 'pending' | 'success' | 'error'
  botId?: string
  secret?: string
  error?: string
}

function getPlatCode(): number {
  switch (process.platform) {
    case 'darwin':
      return 1
    case 'win32':
      return 2
    default:
      return 3
  }
}

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = ''
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString()
        })
        res.on('end', () => resolve(data))
      })
      .on('error', reject)
  })
}

export async function wecomQrGenerate(): Promise<WecomQrGenerateResult> {
  try {
    const plat = getPlatCode()
    const url = `${BASE}/ai/qc/generate?source=wecom-cli&plat=${plat}`
    const raw = await httpsGet(url)
    const json = JSON.parse(raw)
    const data = json?.data
    if (!data?.scode || !data?.auth_url) {
      return { ok: false, error: json?.errmsg || 'Failed to generate QR code' }
    }
    return { ok: true, scode: data.scode, authUrl: data.auth_url }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Network error' }
  }
}

export async function wecomQrCheckResult(scode: string): Promise<WecomQrCheckResult> {
  try {
    const url = `${BASE}/ai/qc/query_result?scode=${encodeURIComponent(scode)}`
    const raw = await httpsGet(url)
    const json = JSON.parse(raw)
    const data = json?.data
    if (data?.status === 'success' && data?.bot_info) {
      return {
        ok: true,
        status: 'success',
        botId: data.bot_info.botid,
        secret: data.bot_info.secret,
      }
    }
    // "init" or any other non-success status means still waiting
    return { ok: true, status: 'pending' }
  } catch (err: any) {
    return { ok: false, status: 'error', error: err?.message || 'Network error' }
  }
}
