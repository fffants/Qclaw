import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  net: {
    fetch: vi.fn(),
  },
}))

vi.mock('../cli', () => ({
  runShell: vi.fn(),
}))

import { checkOpenClawLatestVersion } from '../openclaw-latest-version-service'

describe('checkOpenClawLatestVersion', () => {
  it('returns the latest version from registry metadata when the primary request succeeds', async () => {
    const result = await checkOpenClawLatestVersion({
      now: () => new Date('2026-03-14T08:00:00.000Z'),
      requestMetadataText: async () =>
        JSON.stringify({
          version: '2026.3.13',
        }),
      requestLatestVersionFromNpm: vi.fn(),
    })

    expect(result).toEqual({
      ok: true,
      latestVersion: '2026.3.13',
      checkedAt: '2026-03-14T08:00:00.000Z',
      source: 'npm-registry',
    })
  })

  it('accepts package metadata responses that expose dist-tags.latest', async () => {
    const result = await checkOpenClawLatestVersion({
      requestMetadataText: async () =>
        JSON.stringify({
          'dist-tags': {
            latest: '2026.3.13',
          },
        }),
      requestLatestVersionFromNpm: vi.fn(),
    })

    expect(result.ok).toBe(true)
    expect(result.latestVersion).toBe('2026.3.13')
  })

  it('falls back to npm view when the primary metadata request fails', async () => {
    const requestLatestVersionFromNpm = vi.fn(async () => '2026.3.13')

    const result = await checkOpenClawLatestVersion({
      now: () => new Date('2026-03-14T08:05:00.000Z'),
      requestMetadataText: async () => {
        throw new Error('Client network socket disconnected before secure TLS connection was established')
      },
      requestLatestVersionFromNpm,
    })

    expect(result).toEqual({
      ok: true,
      latestVersion: '2026.3.13',
      checkedAt: '2026-03-14T08:05:00.000Z',
      source: 'npm-registry',
    })
    expect(requestLatestVersionFromNpm).toHaveBeenCalledTimes(1)
  })

  it('falls back to npm view when metadata returns an invalid version tag', async () => {
    const requestLatestVersionFromNpm = vi.fn(async () => '2026.3.13')
    const result = await checkOpenClawLatestVersion({
      requestMetadataText: async () => JSON.stringify({ version: '2026.3.13;rm -rf /' }),
      requestLatestVersionFromNpm,
    })

    expect(result.ok).toBe(true)
    expect(result.latestVersion).toBe('2026.3.13')
    expect(requestLatestVersionFromNpm).toHaveBeenCalledTimes(1)
  })

  it('reports the original network failure when every lookup path fails', async () => {
    const result = await checkOpenClawLatestVersion({
      now: () => new Date('2026-03-14T08:10:00.000Z'),
      requestMetadataText: async () => {
        throw new Error('Client network socket disconnected before secure TLS connection was established')
      },
      requestLatestVersionFromNpm: async () => {
        throw new Error('spawn npm ENOENT')
      },
    })

    expect(result).toEqual({
      ok: false,
      latestVersion: '',
      checkedAt: '2026-03-14T08:10:00.000Z',
      source: 'npm-registry',
      error: 'Client network socket disconnected before secure TLS connection was established',
    })
  })
})
