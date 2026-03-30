const MANAGED_INSTALLER_ENV_DROP_EXACT = new Set([
  'NODE_OPTIONS',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'NODE_EXTRA_CA_CERTS',
  'NPM_CONFIG_USERCONFIG',
  'npm_config_userconfig',
  'NPM_CONFIG_GLOBALCONFIG',
  'npm_config_globalconfig',
  'NPM_CONFIG_PREFIX',
  'npm_config_prefix',
  'NPM_CONFIG_REGISTRY',
  'npm_config_registry',
  'NPM_CONFIG_CACHE',
  'npm_config_cache',
  'NPM_CONFIG_CAFILE',
  'npm_config_cafile',
  'NPM_CONFIG_CA',
  'npm_config_ca',
]) as ReadonlySet<string>

const MANAGED_INSTALLER_ENV_DROP_PREFIXES = [
  'npm_config_',
  'NPM_CONFIG_',
  'YARN_',
  'yarn_',
  'PNPM_',
  'pnpm_',
  'COREPACK_',
  'corepack_',
  'NVM_',
  'nvm_',
  'VOLTA_',
  'volta_',
  'ASDF_',
  'asdf_',
] as const

export function shouldDropManagedInstallerEnvKey(key: string): boolean {
  if (MANAGED_INSTALLER_ENV_DROP_EXACT.has(key)) return true
  for (const prefix of MANAGED_INSTALLER_ENV_DROP_PREFIXES) {
    if (key.startsWith(prefix)) return true
  }
  return false
}

export function sanitizeManagedInstallerEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const cloned: NodeJS.ProcessEnv = { ...env }
  for (const key of Object.keys(cloned)) {
    if (shouldDropManagedInstallerEnvKey(key)) {
      delete cloned[key]
    }
  }
  return cloned
}
