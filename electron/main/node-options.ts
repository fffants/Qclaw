const ELECTRON_UNSUPPORTED_NODE_OPTIONS = new Set([
  '--use-bundled-ca',
  '--use-openssl-ca',
  '--use-system-ca',
])

function splitShellLikeArgs(raw: string): string[] {
  const input = String(raw || '')
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escaping = false

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    if (escaping) {
      current += char
      escaping = false
      continue
    }

    if (char === '\\') {
      const nextChar = input[index + 1] || ''
      const shouldEscapeNext =
        quote === '"'
          ? nextChar === '"' || nextChar === '\\'
          : quote === "'"
            ? false
            : nextChar === '"' || nextChar === "'" || nextChar === '\\' || /\s/.test(nextChar)
      if (shouldEscapeNext) {
        escaping = true
      } else {
        current += char
      }
      continue
    }

    if (quote) {
      if (char === quote) {
        quote = null
      } else {
        current += char
      }
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current)
        current = ''
      }
      continue
    }

    current += char
  }

  if (quote || escaping) {
    return []
  }

  if (current.length > 0) {
    tokens.push(current)
  }

  return tokens
}

function quoteShellToken(token: string): string {
  if (/^[A-Za-z0-9_@%+=:,./\\-]+$/.test(token)) {
    return token
  }
  return JSON.stringify(token)
}

export function sanitizeNodeOptionsForElectron(rawValue: string | undefined | null): string {
  const tokens = splitShellLikeArgs(String(rawValue || ''))
  const filtered = tokens.filter((token) => !ELECTRON_UNSUPPORTED_NODE_OPTIONS.has(token))
  return filtered.map((token) => quoteShellToken(token)).join(' ')
}
