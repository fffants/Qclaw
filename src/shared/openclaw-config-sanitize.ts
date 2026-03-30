function cloneConfig(config: Record<string, any> | null | undefined): Record<string, any> {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return {}
  return JSON.parse(JSON.stringify(config)) as Record<string, any>
}

export function stripLegacyOpenClawRootKeys(
  config: Record<string, any> | null | undefined
): Record<string, any> {
  const nextConfig = cloneConfig(config)
  delete nextConfig.dmPolicy
  delete nextConfig.groupPolicy
  delete nextConfig.streaming
  return nextConfig
}
