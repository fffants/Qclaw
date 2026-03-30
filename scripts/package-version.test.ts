import { afterEach, describe, expect, it } from 'vitest'
import {
  claimPackageVersion,
  persistPackageVersionState,
  releasePackageVersionClaim,
  resolvePackageVersion,
} from './package-version.mjs'

const fs = process.getBuiltinModule('node:fs') as typeof import('node:fs')
const os = process.getBuiltinModule('node:os') as typeof import('node:os')
const path = process.getBuiltinModule('node:path') as typeof import('node:path')

const tempDirs: string[] = []

function makeStatePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qclaw-package-version-'))
  tempDirs.push(dir)
  return path.join(dir, 'package-version-state.json')
}

function compareStableVersions(left: string, right: string): number {
  const leftParts = left.split('.').map((part) => Number(part))
  const rightParts = right.split('.').map((part) => Number(part))

  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const delta = (leftParts[index] || 0) - (rightParts[index] || 0)
    if (delta !== 0) return delta
  }

  return 0
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('resolvePackageVersion', () => {
  it('starts each day at v0 while keeping the internal semver stable', () => {
    const statePath = makeStatePath()

    const result = resolvePackageVersion({
      date: new Date('2026-03-27T08:00:00+08:00'),
      timeZone: 'Asia/Shanghai',
      statePath,
      env: {},
    })

    expect(result.baseVersion).toBe('2026.3.27')
    expect(result.sequence).toBe(0)
    expect(result.displayVersion).toBe('2026.3.27-v0')
    expect(result.version).toBe('2026.3.2700')
  })

  it('keeps upgrading older plain-date builds to the first suffixed build of the same day', () => {
    const statePath = makeStatePath()

    const result = resolvePackageVersion({
      date: new Date('2026-03-27T08:00:00+08:00'),
      timeZone: 'Asia/Shanghai',
      statePath,
      env: {},
    })

    expect(compareStableVersions(result.version, '2026.3.27')).toBeGreaterThan(0)
  })

  it('increments the numeric semver and display suffix when the same day already has builds', () => {
    const statePath = makeStatePath()
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        dateKey: '2026.3.27',
        lastSequence: 0,
        version: '2026.3.2700',
        displayVersion: '2026.3.27-v0',
      })
    )

    const result = resolvePackageVersion({
      date: new Date('2026-03-27T17:30:00+08:00'),
      timeZone: 'Asia/Shanghai',
      statePath,
      env: {},
    })

    expect(result.sequence).toBe(1)
    expect(result.displayVersion).toBe('2026.3.27-v1')
    expect(result.version).toBe('2026.3.2701')
  })

  it('resets the suffix to v0 when the build date changes', () => {
    const statePath = makeStatePath()
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        dateKey: '2026.3.26',
        lastSequence: 7,
        version: '2026.3.2607',
        displayVersion: '2026.3.26-v7',
      })
    )

    const result = resolvePackageVersion({
      date: new Date('2026-03-27T09:00:00+08:00'),
      timeZone: 'Asia/Shanghai',
      statePath,
      env: {},
    })

    expect(result.sequence).toBe(0)
    expect(result.displayVersion).toBe('2026.3.27-v0')
    expect(result.version).toBe('2026.3.2700')
  })

  it('keeps semver ordering correct after the tenth build of the day', () => {
    const statePath = makeStatePath()
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        dateKey: '2026.3.27',
        lastSequence: 9,
        version: '2026.3.2709',
        displayVersion: '2026.3.27-v9',
      })
    )

    const result = resolvePackageVersion({
      date: new Date('2026-03-27T19:00:00+08:00'),
      timeZone: 'Asia/Shanghai',
      statePath,
      env: {},
    })

    expect(result.sequence).toBe(10)
    expect(result.displayVersion).toBe('2026.3.27-v10')
    expect(result.version).toBe('2026.3.2710')
    expect(compareStableVersions(result.version, '2026.3.2702')).toBeGreaterThan(0)
  })

  it('keeps honoring an explicit QCLAW_PACKAGE_VERSION override', () => {
    const statePath = makeStatePath()

    const result = resolvePackageVersion({
      date: new Date('2026-03-27T09:00:00+08:00'),
      timeZone: 'Asia/Shanghai',
      statePath,
      env: {
        QCLAW_PACKAGE_VERSION: '2026.3.2709',
        QCLAW_DISPLAY_VERSION: '2026.3.27-v9',
      },
    })

    expect(result.fromOverride).toBe(true)
    expect(result.version).toBe('2026.3.2709')
    expect(result.displayVersion).toBe('2026.3.27-v9')
  })
})

describe('claimPackageVersion', () => {
  it('reserves unique versions for parallel build starts on the same day', () => {
    const statePath = makeStatePath()
    const firstClaim = claimPackageVersion({
      date: new Date('2026-03-27T08:00:00+08:00'),
      timeZone: 'Asia/Shanghai',
      statePath,
      env: {},
    })
    const secondClaim = claimPackageVersion({
      date: new Date('2026-03-27T08:01:00+08:00'),
      timeZone: 'Asia/Shanghai',
      statePath,
      env: {},
    })

    expect(firstClaim.displayVersion).toBe('2026.3.27-v0')
    expect(secondClaim.displayVersion).toBe('2026.3.27-v1')
    expect(firstClaim.version).toBe('2026.3.2700')
    expect(secondClaim.version).toBe('2026.3.2701')
  })
})

describe('persistPackageVersionState', () => {
  it('writes the last successful build metadata to disk', () => {
    const statePath = makeStatePath()
    const claim = claimPackageVersion({
      date: new Date('2026-03-27T08:00:00+08:00'),
      timeZone: 'Asia/Shanghai',
      statePath,
      env: {},
    })

    persistPackageVersionState(claim, { statePath })

    expect(JSON.parse(fs.readFileSync(statePath, 'utf8'))).toMatchObject({
      dateKey: '2026.3.27',
      lastAllocatedSequence: 0,
      lastCompletedSequence: 0,
      version: '2026.3.2700',
      displayVersion: '2026.3.27-v0',
    })
  })

  it('rolls back the latest failed claim when no later build has claimed a newer number', () => {
    const statePath = makeStatePath()
    const claim = claimPackageVersion({
      date: new Date('2026-03-27T08:00:00+08:00'),
      timeZone: 'Asia/Shanghai',
      statePath,
      env: {},
    })

    releasePackageVersionClaim(claim, { statePath })

    const next = resolvePackageVersion({
      date: new Date('2026-03-27T08:10:00+08:00'),
      timeZone: 'Asia/Shanghai',
      statePath,
      env: {},
    })

    expect(next.displayVersion).toBe('2026.3.27-v0')
    expect(next.version).toBe('2026.3.2700')
  })

  it('does not persist local counters when the version is fully overridden', () => {
    const statePath = makeStatePath()
    const resolved = claimPackageVersion({
      date: new Date('2026-03-27T08:00:00+08:00'),
      timeZone: 'Asia/Shanghai',
      statePath,
      env: {
        QCLAW_PACKAGE_VERSION: '2026.3.2709',
        QCLAW_DISPLAY_VERSION: '2026.3.27-v9',
      },
    })

    persistPackageVersionState(resolved, { statePath })

    expect(fs.existsSync(statePath)).toBe(false)
  })

  it('fully rolls back the daily counter when parallel failed claims all release without any successful build', () => {
    const statePath = makeStatePath()
    const firstClaim = claimPackageVersion({
      date: new Date('2026-03-27T08:00:00+08:00'),
      timeZone: 'Asia/Shanghai',
      statePath,
      env: {},
    })
    const secondClaim = claimPackageVersion({
      date: new Date('2026-03-27T08:01:00+08:00'),
      timeZone: 'Asia/Shanghai',
      statePath,
      env: {},
    })

    releasePackageVersionClaim(firstClaim, { statePath })
    releasePackageVersionClaim(secondClaim, { statePath })

    const next = resolvePackageVersion({
      date: new Date('2026-03-27T08:10:00+08:00'),
      timeZone: 'Asia/Shanghai',
      statePath,
      env: {},
    })

    expect(next.displayVersion).toBe('2026.3.27-v0')
    expect(next.version).toBe('2026.3.2700')
    expect(fs.existsSync(statePath)).toBe(false)
  })
})
