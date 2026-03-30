import { shouldAutoOpenBrowserForArgs } from './oauth-browser'

export interface ResolvedCliCommand {
  command: string
  args: string[]
  shell: boolean
  capabilityWarning?: string
}

interface ResolveOpenClawRuntime {
  platform?: NodeJS.Platform
  expectAvailable?: boolean
  expectWarning?: string
  scriptAvailable?: boolean
  scriptWarning?: string
  commandPath?: string
}

const DEPRECATED_AUTH_CHOICE_ALIASES: Record<string, string> = {
  'codex-cli': 'openai-codex',
}

export function normalizeAuthChoice(choice: string): string {
  const normalized = choice.trim().toLowerCase()
  return DEPRECATED_AUTH_CHOICE_ALIASES[normalized] || normalized
}

function quotePosixArg(arg: string): string {
  if (arg === '') return "''"
  return `'${arg.replace(/'/g, `'\\''`)}'`
}

function escapeTclDoubleQuoted(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/\[/g, '\\[')
}

function isGeminiCliOAuthLoginArgs(args: string[]): boolean {
  if (!Array.isArray(args) || args.length < 5) return false
  if (args[0] !== 'models' || args[1] !== 'auth' || args[2] !== 'login') return false

  const providerIndex = args.findIndex((item) => item === '--provider')
  if (providerIndex < 0 || providerIndex + 1 >= args.length) return false
  return normalizeAuthChoice(String(args[providerIndex + 1] || '').trim()) === 'google-gemini-cli'
}

function buildWhitespaceTolerantExpectRegex(phrase: string): string {
  return phrase
    .replace(/\s+/g, '')
    .split('')
    .map((char) => char.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&'))
    .join('\\s*')
}

function buildGeminiExpectWrapperScript(commandPath: string, args: string[]): string {
  const spawnArgs = [commandPath, ...args]
    .map((item) => `"${escapeTclDoubleQuoted(item)}"`)
    .join(' ')
  const continuePromptPattern = buildWhitespaceTolerantExpectRegex('Continue with Google Gemini CLI OAuth?')

  return [
    'set timeout -1',
    'match_max 100000',
    `spawn -noecho ${spawnArgs}`,
    'expect {',
    `  -re {${continuePromptPattern}} {`,
    '    send "\\033\\[D\\r"',
    '    exp_continue',
    '  }',
    '  eof',
    '}',
    'set exit_code 0',
    'if {[catch wait wait_status] == 0 && [llength $wait_status] >= 4} {',
    '  set exit_code [lindex $wait_status 3]',
    '}',
    'exit $exit_code',
  ].join('\n')
}

export function resolveOpenClawCommand(
  args: string[],
  platformOrRuntime: NodeJS.Platform | ResolveOpenClawRuntime = process.platform
): ResolvedCliCommand {
  const runtime =
    typeof platformOrRuntime === 'string'
      ? { platform: platformOrRuntime }
      : (platformOrRuntime || {})
  const platform = runtime.platform || process.platform
  const isWin = platform === 'win32'
  const commandPath = String(runtime.commandPath || '').trim() || 'openclaw'
  const shouldUsePty = shouldAutoOpenBrowserForArgs(args)
  const shouldUseGeminiExpectWrapper = isGeminiCliOAuthLoginArgs(args) && !isWin
  const geminiExpectWarning =
    shouldUseGeminiExpectWrapper && runtime.expectAvailable === false ? runtime.expectWarning : undefined
  if (!shouldUsePty || isWin) {
    return { command: commandPath, args, shell: isWin }
  }

  if (shouldUseGeminiExpectWrapper && runtime.expectAvailable !== false) {
    return {
      command: 'expect',
      args: ['-c', buildGeminiExpectWrapperScript(commandPath, args)],
      shell: false,
    }
  }

  if (runtime.scriptAvailable === false) {
    return {
      command: commandPath,
      args,
      shell: false,
      capabilityWarning:
        runtime.expectWarning ||
        runtime.scriptWarning ||
        'Interactive OAuth requires the script command on this platform. Falling back to direct OpenClaw execution without PTY.',
    }
  }

  if (platform === 'darwin') {
    // BSD script: script -q /dev/null <command> [args...]
    return {
      command: 'script',
      args: ['-q', '/dev/null', commandPath, ...args],
      shell: false,
      ...(geminiExpectWarning ? { capabilityWarning: geminiExpectWarning } : {}),
    }
  }

  // util-linux script: script -q -e -c "<command>" /dev/null
  const commandLine = [commandPath, ...args].map((item) => quotePosixArg(item)).join(' ')
  return {
    command: 'script',
    args: ['-q', '-e', '-c', commandLine, '/dev/null'],
    shell: false,
    ...(geminiExpectWarning ? { capabilityWarning: geminiExpectWarning } : {}),
  }
}
