export interface QclawProviderAuthRouteLike {
  kind?: string | null
  providerId?: string | null
  pluginId?: string | null
  requiresBrowser?: boolean
  requiresSecret?: boolean
}

export interface QclawProviderAuthMethodLike {
  id?: string | null
  kind?: string | null
  route?: QclawProviderAuthRouteLike | null
}

export type QclawProviderAuthPersistenceStrategy =
  | {
      kind: 'openclaw-auth-route'
    }

export function resolveQclawProviderAuthPersistenceStrategy(
  _providerId: string,
  _method?: QclawProviderAuthMethodLike | null
): QclawProviderAuthPersistenceStrategy {
  return { kind: 'openclaw-auth-route' }
}

export function usesEnvBackedApiKeyPersistence(
  _providerId: string,
  _method?: QclawProviderAuthMethodLike | null
): boolean {
  return false
}
