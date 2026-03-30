export async function runPluginRepairPreflight(options: {
  resolveHomeDir: () => Promise<string | null>
  repair: (homeDir: string) => Promise<unknown>
}): Promise<void> {
  // Startup/command preflight is intentionally best-effort. A repair failure should
  // not become a new global CLI hard-stop; later explicit repair surfaces can still
  // report the failure with richer UI/context.
  const homeDir = String((await options.resolveHomeDir().catch(() => null)) || '').trim()
  if (!homeDir) return

  await options.repair(homeDir).catch(() => undefined)
}
