import { describe, expect, it } from 'vitest'
import {
  extractOAuthChallenges,
  createOAuthOutputScanner,
  extractOpenExternalUrls,
  shouldAutoOpenBrowserForArgs,
} from '../oauth-browser'

describe('extractOpenExternalUrls', () => {
  it('extracts OAuth URL from OpenClaw output line', () => {
    const output = 'Open: https://auth.openai.com/oauth/authorize?state=abc123\n'
    expect(extractOpenExternalUrls(output)).toEqual([
      'https://auth.openai.com/oauth/authorize?state=abc123',
    ])
  })

  it('extracts URL from ANSI/spinner mixed output', () => {
    const output = '\u001b[1G\u001b[J◐  Complete sign-in in browser…Open: https://auth.openai.com/oauth/authorize?response_type=code&state=abc\n\u001b[1G\u001b[J◓  Complete sign-in in browser…'
    expect(extractOpenExternalUrls(output)).toEqual([
      'https://auth.openai.com/oauth/authorize?response_type=code&state=abc',
    ])
  })

  it('extracts oauth URL even when output does not use Open prefix', () => {
    const output =
      'Visit this URL in your browser: https://auth.openai.com/oauth/authorize?response_type=code&state=abc123&client_id=foo'
    expect(extractOpenExternalUrls(output)).toEqual([
      'https://auth.openai.com/oauth/authorize?response_type=code&state=abc123&client_id=foo',
    ])
  })

  it('extracts qwen authorize URL with user_code query from boxed oauth output', () => {
    const output = `
◇  Qwen OAuth ────────────────────────────────────────────────────────────╮
│                                                                         │
│  Open                                                                   │
│  https://chat.qwen.ai/authorize?user_code=BF0Q6UX9&client=qwen-code to  │
│  approve access.                                                        │
│  If prompted, enter the code BF0Q6UX9.                                  │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────╯
`

    expect(extractOpenExternalUrls(output)).toEqual([
      'https://chat.qwen.ai/authorize?user_code=BF0Q6UX9&client=qwen-code',
    ])
  })
})

describe('shouldAutoOpenBrowserForArgs', () => {
  it('enables auto-open for oauth-related commands', () => {
    expect(shouldAutoOpenBrowserForArgs(['onboard', '--flow', 'quickstart'])).toBe(true)
    expect(
      shouldAutoOpenBrowserForArgs(['models', 'auth', 'login', '--provider', 'openai', '--method', 'openai-codex'])
    ).toBe(true)
  })

  it('does not enable auto-open for unrelated commands', () => {
    expect(shouldAutoOpenBrowserForArgs(['gateway', 'start'])).toBe(false)
    expect(shouldAutoOpenBrowserForArgs(['status', '--json'])).toBe(false)
  })
})

describe('createOAuthOutputScanner', () => {
  it('opens url once when output arrives in chunks', () => {
    const opened: string[] = []
    const scan = createOAuthOutputScanner((url) => {
      opened.push(url)
    })

    scan('Open: https://auth.openai.com/oauth/')
    scan('authorize?state=abc')
    scan('\nOpen: https://auth.openai.com/oauth/authorize?state=abc\n')

    expect(opened).toEqual(['https://auth.openai.com/oauth/authorize?state=abc'])
  })

  it('does not open partial oauth state urls before the line is complete', () => {
    const opened: string[] = []
    const scan = createOAuthOutputScanner((url) => {
      opened.push(url)
    })

    scan('Open: https://auth.openai.com/oauth/authorize?response_type=code&client_id=app_x&state=abc')
    scan('123456789\n')

    expect(opened).toEqual([
      'https://auth.openai.com/oauth/authorize?response_type=code&client_id=app_x&state=abc123456789',
    ])
  })

  it('opens device-code oauth urls even when the final line has no trailing whitespace', () => {
    const opened: string[] = []
    const scan = createOAuthOutputScanner((url) => {
      opened.push(url)
    })

    scan('Open: https://platform.minimax.io/oauth-authorize?user_code=6NnnHF5TEe&client=OpenClaw')

    expect(opened).toEqual([
      'https://platform.minimax.io/oauth-authorize?user_code=6NnnHF5TEe&client=OpenClaw',
    ])
  })

  it('does not open partial device-code urls before the final chunk completes', () => {
    const opened: string[] = []
    const scan = createOAuthOutputScanner((url) => {
      opened.push(url)
    })

    scan('Open: https://platform.minimax.io/oauth-authorize?user_code=6NnnHF5TEe&client=Open')
    expect(opened).toEqual([])

    scan('Claw')
    expect(opened).toEqual([
      'https://platform.minimax.io/oauth-authorize?user_code=6NnnHF5TEe&client=OpenClaw',
    ])
  })
})

describe('extractOAuthChallenges', () => {
  it('extracts verification url and user code from qwen oauth output', () => {
    const output = `
◇  Qwen OAuth ────────────────────────────────────────────────────────────╮
│                                                                         │
│  Open                                                                   │
│  https://chat.qwen.ai/authorize?user_code=BF0Q6UX9&client=qwen-code to  │
│  approve access.                                                        │
│  If prompted, enter the code BF0Q6UX9.                                  │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────╯
`

    expect(extractOAuthChallenges(output)).toEqual([
      {
        verificationUri: 'https://chat.qwen.ai/authorize?user_code=BF0Q6UX9&client=qwen-code',
        userCode: 'BF0Q6UX9',
      },
    ])
  })
})
