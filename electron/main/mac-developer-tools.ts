export function buildMacDeveloperToolsProbeEnv(
  baseEnv: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  // Keep an explicit undefined marker so downstream env merges can strip stale values.
  const nextEnv = { ...baseEnv, DEVELOPER_DIR: undefined }
  return nextEnv
}
