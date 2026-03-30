import { describe, expect, it, vi } from 'vitest'
import { getLiveWindow, revealWindow, showOrCreateWindow } from '../window-lifecycle'

function createWindowMock(overrides: Partial<{
  destroyed: boolean
  minimized: boolean
}> = {}) {
  let destroyed = Boolean(overrides.destroyed)
  let minimized = Boolean(overrides.minimized)

  return {
    isDestroyed: vi.fn(() => destroyed),
    isMinimized: vi.fn(() => minimized),
    restore: vi.fn(() => {
      minimized = false
    }),
    show: vi.fn(),
    focus: vi.fn(),
    destroy: () => {
      destroyed = true
    },
  }
}

describe('getLiveWindow', () => {
  it('returns null for destroyed windows', () => {
    const browserWindow = createWindowMock({ destroyed: true })

    expect(getLiveWindow(browserWindow)).toBeNull()
  })

  it('keeps active windows intact', () => {
    const browserWindow = createWindowMock()

    expect(getLiveWindow(browserWindow)).toBe(browserWindow)
  })
})

describe('revealWindow', () => {
  it('restores minimized windows before showing them', () => {
    const browserWindow = createWindowMock({ minimized: true })
    const focusApp = vi.fn()

    revealWindow(browserWindow, focusApp)

    expect(browserWindow.restore).toHaveBeenCalledTimes(1)
    expect(browserWindow.show).toHaveBeenCalledTimes(1)
    expect(browserWindow.focus).toHaveBeenCalledTimes(1)
    expect(focusApp).toHaveBeenCalledWith({ steal: true })
  })

  it('does not restore windows that are already expanded', () => {
    const browserWindow = createWindowMock()

    revealWindow(browserWindow)

    expect(browserWindow.restore).not.toHaveBeenCalled()
    expect(browserWindow.show).toHaveBeenCalledTimes(1)
    expect(browserWindow.focus).toHaveBeenCalledTimes(1)
  })
})

describe('showOrCreateWindow', () => {
  it('creates a new window when there is no live window to reveal', () => {
    const createdWindow = createWindowMock()
    const createWindow = vi.fn(() => createdWindow)

    const result = showOrCreateWindow({
      browserWindow: null,
      createWindow,
    })

    expect(createWindow).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      window: createdWindow,
      created: true,
    })
    expect(createdWindow.show).not.toHaveBeenCalled()
  })

  it('reuses and reveals the existing window when it is still alive', () => {
    const browserWindow = createWindowMock({ minimized: true })
    const createWindow = vi.fn(() => createWindowMock())
    const focusApp = vi.fn()

    const result = showOrCreateWindow({
      browserWindow,
      createWindow,
      focusApp,
    })

    expect(createWindow).not.toHaveBeenCalled()
    expect(browserWindow.restore).toHaveBeenCalledTimes(1)
    expect(browserWindow.show).toHaveBeenCalledTimes(1)
    expect(browserWindow.focus).toHaveBeenCalledTimes(1)
    expect(focusApp).toHaveBeenCalledWith({ steal: true })
    expect(result).toEqual({
      window: browserWindow,
      created: false,
    })
  })
})
