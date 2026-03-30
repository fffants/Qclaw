export interface RevealableWindow {
  isDestroyed(): boolean
  isMinimized(): boolean
  restore(): void
  show(): void
  focus(): void
}

export interface AppFocusOptions {
  steal: boolean
}

export type FocusApp = (options: AppFocusOptions) => void

export function getLiveWindow<T extends Pick<RevealableWindow, 'isDestroyed'>>(
  browserWindow: T | null
): T | null {
  if (!browserWindow || browserWindow.isDestroyed()) {
    return null
  }

  return browserWindow
}

export function revealWindow(
  browserWindow: RevealableWindow,
  focusApp?: FocusApp
) {
  if (browserWindow.isMinimized()) browserWindow.restore()
  browserWindow.show()
  browserWindow.focus()
  focusApp?.({ steal: true })
}

export function showOrCreateWindow<T extends RevealableWindow>(options: {
  browserWindow: T | null
  createWindow: () => T
  focusApp?: FocusApp
}) {
  const existingWindow = getLiveWindow(options.browserWindow)
  if (!existingWindow) {
    return {
      window: options.createWindow(),
      created: true,
    }
  }

  revealWindow(existingWindow, options.focusApp)
  return {
    window: existingWindow,
    created: false,
  }
}
