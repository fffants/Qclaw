export interface PluginInstallNpxOutputLike {
  stdout?: string
  stderr?: string
}

export const FEISHU_PLUGIN_NPX_SPECIFIER = '@larksuite/openclaw-lark-tools'

export function shouldTryLegacySkipConfig(url: string): boolean {
  return String(url || '').trim() !== FEISHU_PLUGIN_NPX_SPECIFIER
}

export function isSkipConfigUnsupportedError(result: PluginInstallNpxOutputLike | string): boolean {
  const text =
    typeof result === 'string'
      ? result
      : `${String(result.stderr || '')}\n${String(result.stdout || '')}`
  return /unknown option ['"`]?--skip-config/i.test(text) || /unknown argument ['"`]?--skip-config/i.test(text)
}
