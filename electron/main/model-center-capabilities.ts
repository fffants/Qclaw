import {
  discoverOpenClawCapabilities,
  loadOpenClawCapabilities,
  resetOpenClawCapabilitiesCache,
  type OpenClawCapabilities,
} from './openclaw-capabilities'
import type { ModelCatalogQuery, ModelCatalogResult } from './openclaw-model-catalog'
import type { ModelConfigCommandResult, ModelStatusOptions } from './openclaw-model-config'

interface GetModelCenterCapabilitiesOptions {
  forceRefresh?: boolean
}

interface GetModelCenterCapabilitiesDeps {
  loadCapabilities?: () => Promise<OpenClawCapabilities>
  discoverCapabilities?: (options?: { refreshAuthRegistry?: boolean }) => Promise<OpenClawCapabilities>
}

interface ModelCenterCapabilitiesInvalidationDeps {
  resetCapabilitiesCache?: () => void
}

interface OkResultLike {
  ok?: boolean
}

export interface RefreshModelDataOptions {
  forceCapabilitiesRefresh?: boolean
  includeCapabilities?: boolean
  includeStatus?: boolean
  includeCatalog?: boolean
  fullCatalog?: boolean
  catalogQuery?: ModelCatalogQuery
  statusOptions?: ModelStatusOptions
}

type RefreshModelStatusResult = ModelConfigCommandResult<Record<string, any>>

interface ModelCommandResult {
  ok: boolean
  stdout: string
  stderr: string
  code: number | null
}

type ModelStatusLoader = (
  statusOptions?: ModelStatusOptions,
  options?: {
    loadCapabilities?: () => Promise<OpenClawCapabilities>
    runCommand?: (args: string[], timeout?: number) => Promise<ModelCommandResult>
    runCommandWithEnv?: (
      args: string[],
      timeout: number | undefined,
      env: Partial<NodeJS.ProcessEnv>
    ) => Promise<ModelCommandResult>
  }
) => Promise<RefreshModelStatusResult>

type ModelCatalogLoader = (options?: {
  query?: ModelCatalogQuery
  loadCapabilities?: () => Promise<OpenClawCapabilities>
  runCommand?: (args: string[], timeout?: number) => Promise<ModelCommandResult>
}) => Promise<ModelCatalogResult>

export interface RefreshModelDataResult {
  capabilities?: OpenClawCapabilities
  catalog?: ModelCatalogResult
  status?: RefreshModelStatusResult
}

interface RefreshModelDataDeps extends GetModelCenterCapabilitiesDeps {
  getStatus?: ModelStatusLoader
  getCatalog?: ModelCatalogLoader
  getAllCatalog?: ModelCatalogLoader
  runCommand?: (args: string[], timeout?: number) => Promise<ModelCommandResult>
  runCommandWithEnv?: (
    args: string[],
    timeout: number | undefined,
    env: Partial<NodeJS.ProcessEnv>
  ) => Promise<ModelCommandResult>
}

export async function getModelCenterCapabilities(
  options: GetModelCenterCapabilitiesOptions = {},
  deps: GetModelCenterCapabilitiesDeps = {}
): Promise<OpenClawCapabilities> {
  if (options.forceRefresh) {
    return (deps.discoverCapabilities ?? discoverOpenClawCapabilities)({
      refreshAuthRegistry: true,
    })
  }

  return (deps.loadCapabilities ?? loadOpenClawCapabilities)()
}

export function invalidateModelCenterCapabilitiesCache(
  deps: ModelCenterCapabilitiesInvalidationDeps = {}
): void {
  ;(deps.resetCapabilitiesCache ?? resetOpenClawCapabilitiesCache)()
}

export async function withModelCenterCapabilitiesInvalidatedOnSuccess<T extends OkResultLike>(
  runOperation: () => Promise<T>,
  deps: ModelCenterCapabilitiesInvalidationDeps = {}
): Promise<T> {
  const result = await runOperation()
  if (result?.ok) {
    invalidateModelCenterCapabilitiesCache(deps)
  }
  return result
}

function buildFastModelCommandDeps(
  deps: RefreshModelDataDeps
): Pick<RefreshModelDataDeps, 'runCommand' | 'runCommandWithEnv'> {
  return {
    runCommand:
      deps.runCommand ??
      (async (args: string[], timeout?: number) => {
        const { runCli } = await import('./cli')
        return runCli(args, timeout, 'models')
      }),
    runCommandWithEnv:
      deps.runCommandWithEnv ??
      (async (args: string[], timeout: number | undefined, env: Partial<NodeJS.ProcessEnv>) => {
        const { runCliStreaming } = await import('./cli')
        return runCliStreaming(args, {
          timeout,
          controlDomain: 'models',
          env,
        })
      }),
  }
}

export async function refreshModelData(
  options: RefreshModelDataOptions = {},
  deps: RefreshModelDataDeps = {}
): Promise<RefreshModelDataResult> {
  const includeCapabilities = options.includeCapabilities !== false
  const includeStatus = options.includeStatus !== false
  const includeCatalog = options.includeCatalog === true
  const catalogQuery = options.catalogQuery || {}
  const fastCommandDeps = buildFastModelCommandDeps(deps)

  const capabilitiesPromise = includeCapabilities
    ? getModelCenterCapabilities(
        { forceRefresh: options.forceCapabilitiesRefresh === true },
        deps
      )
    : null

  const statusPromise = includeStatus
    ? (async () => {
        const getStatus =
          deps.getStatus ??
          ((await import('./openclaw-model-config')).getModelStatus as ModelStatusLoader)

        if (includeCapabilities) {
          return getStatus(options.statusOptions || {}, {
            loadCapabilities: () => capabilitiesPromise as Promise<OpenClawCapabilities>,
          })
        }

        return getStatus(options.statusOptions || {}, fastCommandDeps)
      })()
    : Promise.resolve(undefined)

  const catalogPromise = includeCatalog
    ? (async () => {
        const catalogModule =
          deps.getCatalog && deps.getAllCatalog ? null : await import('./openclaw-model-catalog')
        const getCatalog = (
          options.fullCatalog
            ? deps.getAllCatalog ?? catalogModule?.getAllModelCatalogItems
            : deps.getCatalog ?? catalogModule?.getModelCatalog
        ) as ModelCatalogLoader

        return getCatalog({
          query: catalogQuery,
          ...(includeCapabilities
            ? {
                loadCapabilities: () => capabilitiesPromise as Promise<OpenClawCapabilities>,
              }
            : {
                runCommand: fastCommandDeps.runCommand,
              }),
        })
      })()
    : Promise.resolve(undefined)

  const [capabilities, status, catalog] = await Promise.all([
    capabilitiesPromise ?? Promise.resolve(undefined),
    statusPromise,
    catalogPromise,
  ])

  return {
    ...(capabilities ? { capabilities } : {}),
    ...(status ? { status } : {}),
    ...(catalog ? { catalog } : {}),
  }
}
