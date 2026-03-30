import { loadOpenClawGatewayRuntime } from './openclaw-gateway-runtime'
import { buildOpenClawLegacyEnvPatch, resolveOpenClawEnvValue } from './openclaw-legacy-env-migration'

const { randomUUID } = process.getBuiltinModule('node:crypto') as typeof import('node:crypto')

const CONTROL_UI_LOAD_TIMEOUT_MS = 15_000
const CONTROL_UI_REQUEST_TIMEOUT_MS = 20_000

interface GatewayConnectionSettings {
  url: string
  token: string
  password?: string
}

interface BrowserWindowLike {
  loadURL: (url: string) => Promise<unknown>
  isDestroyed: () => boolean
  destroy: () => void
  webContents: {
    executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>
  }
}

interface BrowserWindowCreationOptions {
  show: boolean
  autoHideMenuBar: boolean
  webPreferences: {
    backgroundThrottling: boolean
    contextIsolation: boolean
    nodeIntegration: boolean
    partition: string
    sandbox: boolean
  }
}

interface ControlUiRpcDependencies {
  readConfig: () => Promise<Record<string, any> | null>
  readEnvFile: () => Promise<Record<string, string>>
  loadGatewayRuntime?: typeof loadOpenClawGatewayRuntime
  createBrowserWindow?: (options: BrowserWindowCreationOptions) => Promise<BrowserWindowLike> | BrowserWindowLike
}

interface ControlUiRpcCallOptions {
  timeoutMs?: number
  loadTimeoutMs?: number
}

interface ControlUiAppInspectOptions {
  timeoutMs?: number
  loadTimeoutMs?: number
}

interface ControlUiChatSendOptions {
  sessionKey: string
  message: string
  thinking?: string
  timeoutMs?: number
  loadTimeoutMs?: number
  runId?: string
}

export interface ControlUiAppInspectionResult {
  connected: boolean
  hasClient: boolean
  lastError?: string
  appKeys: string[]
  // These are projected browser snapshots for diagnostics and transition validation only.
  // Callers should normalize them in the main process instead of depending on page-private shape.
  helloSnapshot?: Record<string, unknown> | null
  healthResult?: Record<string, unknown> | null
  sessionsState?: Record<string, unknown> | null
  modelCatalogState?: Record<string, unknown> | null
  sessionsResult?: Record<string, unknown> | null
  chatModelCatalog?: unknown[] | null
  rpcStatus?: Record<string, unknown> | null
  rpcModels?: Record<string, unknown> | null
  rpcErrors?: string[]
}

function normalizeRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function toOptionalString(value: unknown): string | undefined {
  const normalized = String(value || '').trim()
  return normalized || undefined
}

function toProcessEnvRecord(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value
  }
  return env
}

function mergeGatewayEnv(envFile: Record<string, string>): Record<string, string> {
  const baseEnv: Record<string, string | undefined> = {
    ...envFile,
    ...toProcessEnvRecord(),
  }
  const mergedEnv: Record<string, string | undefined> = {
    ...baseEnv,
    ...buildOpenClawLegacyEnvPatch(baseEnv),
  }
  const normalizedEnv: Record<string, string> = {}
  for (const [key, value] of Object.entries(mergedEnv)) {
    if (typeof value === 'string') {
      normalizedEnv[key] = value
    }
  }
  return normalizedEnv
}

function resolveGatewayUrl(config: Record<string, any> | null, env: Record<string, string>): string | null {
  const envUrl = resolveOpenClawEnvValue(env, 'OPENCLAW_GATEWAY_URL').value
  if (envUrl) return envUrl

  const gateway = normalizeRecord(config?.gateway)
  const remote = normalizeRecord(gateway?.remote)
  const mode = String(gateway?.mode || '').trim().toLowerCase()
  if (mode === 'remote') {
    return toOptionalString(remote?.url) || null
  }

  const port = Number(gateway?.port)
  const normalizedPort = Number.isFinite(port) && port > 0 ? Math.floor(port) : 18789
  const tlsEnabled = gateway?.tls && typeof gateway.tls === 'object' && (gateway.tls as Record<string, unknown>).enabled === true
  return `${tlsEnabled ? 'wss' : 'ws'}://127.0.0.1:${normalizedPort}`
}

function resolveGatewayToken(config: Record<string, any> | null, env: Record<string, string>): string | null {
  const configGateway = normalizeRecord(config?.gateway)
  const auth = normalizeRecord(configGateway?.auth)
  const explicitToken = typeof auth?.token === 'string' ? auth.token.trim() : ''
  if (explicitToken) return explicitToken

  const envToken = resolveOpenClawEnvValue(env, 'OPENCLAW_GATEWAY_TOKEN').value
  return envToken || null
}

async function resolveGatewayConnectionSettings(
  config: Record<string, any> | null,
  envFile: Record<string, string>,
  loadGatewayRuntime: typeof loadOpenClawGatewayRuntime
): Promise<GatewayConnectionSettings | null> {
  const mergedEnv = mergeGatewayEnv(envFile)

  try {
    const runtime = await loadGatewayRuntime()
    if (runtime) {
      const details = runtime.buildGatewayConnectionDetails({
        config,
      })
      const auth = await runtime.resolveGatewayConnectionAuth({
        config,
        env: mergedEnv as NodeJS.ProcessEnv,
      })
      const url = toOptionalString(details?.url)
      const token = toOptionalString(auth?.token)
      if (url && token) {
        return {
          url,
          token,
          password: toOptionalString(auth?.password),
        }
      }
    }
  } catch {
    // Fall back to Qclaw's lightweight resolver when OpenClaw internals are unavailable.
  }

  const url = resolveGatewayUrl(config, mergedEnv)
  const token = resolveGatewayToken(config, mergedEnv)
  if (!url || !token) return null

  return {
    url,
    token,
  }
}

export function normalizeControlUiBasePath(basePath: unknown): string {
  const normalized = String(basePath || '').trim()
  if (!normalized) return ''
  let nextPath = normalized
  if (!nextPath.startsWith('/')) nextPath = `/${nextPath}`
  if (nextPath === '/') return ''
  if (nextPath.endsWith('/')) nextPath = nextPath.slice(0, -1)
  return nextPath
}

export function buildOpenClawControlUiUrl(params: {
  gatewayUrl: string
  token: string
  basePath?: unknown
}): string {
  const url = new URL(params.gatewayUrl)
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:'
  const configuredBasePath = normalizeControlUiBasePath(params.basePath)
  const inferredBasePath = normalizeControlUiBasePath(url.pathname)
  const resolvedBasePath = configuredBasePath || (inferredBasePath && inferredBasePath !== '/' ? inferredBasePath : '')
  url.pathname = resolvedBasePath ? `${resolvedBasePath}/` : '/'
  url.search = ''
  url.hash = `token=${encodeURIComponent(params.token)}`
  return url.toString()
}

async function defaultCreateBrowserWindow(options: BrowserWindowCreationOptions): Promise<BrowserWindowLike> {
  const electronModule = await import('electron')
  return new electronModule.BrowserWindow(options) as unknown as BrowserWindowLike
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  if (!(timeoutMs > 0)) return promise
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timeoutId)
        resolve(value)
      },
      (error) => {
        clearTimeout(timeoutId)
        reject(error)
      }
    )
  })
}

function buildControlUiRequestScript(method: string, params: unknown, timeoutMs: number): string {
  return `
    (async () => {
      const method = ${JSON.stringify(method)};
      const params = ${JSON.stringify(params ?? null)};
      const timeoutMs = ${JSON.stringify(timeoutMs)};
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const deadline = Date.now() + timeoutMs;

      await customElements.whenDefined('openclaw-app');

      let app = document.querySelector('openclaw-app');
      while (!app && Date.now() < deadline) {
        await sleep(50);
        app = document.querySelector('openclaw-app');
      }

      if (!app) {
        throw new Error('openclaw-app not found');
      }

      if ((!app.connected || !app.client) && typeof app.connect === 'function') {
        try {
          await app.connect();
        } catch {
          // Let the polling loop surface app.lastError or connection timeout below.
        }
      }

      while (Date.now() < deadline) {
        if (app.connected && app.client && typeof app.client.request === 'function') {
          return await app.client.request(method, params);
        }
        if (app.lastError) {
          throw new Error(String(app.lastError));
        }
        await sleep(100);
      }

      if (app.lastError) {
        throw new Error(String(app.lastError));
      }

      throw new Error('control ui connection timeout');
    })()
  `
}

function buildControlUiInspectScript(timeoutMs: number): string {
  return `
    (async () => {
      const timeoutMs = ${JSON.stringify(timeoutMs)};
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const deadline = Date.now() + timeoutMs;

      const project = (value, depth = 0) => {
        if (value == null) return value;
        if (depth >= 3) {
          if (Array.isArray(value)) return '[array]';
          if (typeof value === 'object') return '[object]';
          return value;
        }
        const valueType = typeof value;
        if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
          return value;
        }
        if (Array.isArray(value)) {
          return value.slice(0, 50).map((entry) => project(entry, depth + 1));
        }
        if (valueType !== 'object') {
          return String(value);
        }

        const output = {};
        for (const key of Object.keys(value).slice(0, 80)) {
          try {
            output[key] = project(value[key], depth + 1);
          } catch {
            output[key] = '[unserializable]';
          }
        }
        return output;
      };

      await customElements.whenDefined('openclaw-app');

      let app = document.querySelector('openclaw-app');
      while (!app && Date.now() < deadline) {
        await sleep(50);
        app = document.querySelector('openclaw-app');
      }

      if (!app) {
        throw new Error('openclaw-app not found');
      }

      if ((!app.connected || !app.client) && typeof app.connect === 'function') {
        try {
          await app.connect();
        } catch {
          // Surface via app.lastError / timeout below.
        }
      }

      while (Date.now() < deadline) {
        if (app.connected || app.lastError) {
          break;
        }
        await sleep(100);
      }

      let rpcStatus = null;
      let rpcModels = null;
      const rpcErrors = [];
      if (app.connected && app.client && typeof app.client.request === 'function') {
        try {
          rpcStatus = await app.client.request('status', {});
        } catch (error) {
          rpcErrors.push('status:' + String(error));
        }

        try {
          rpcModels = await app.client.request('models.list', {});
        } catch (error) {
          rpcErrors.push('models.list:' + String(error));
        }
      }

      return {
        connected: Boolean(app.connected),
        hasClient: Boolean(app.client),
        lastError: app.lastError ? String(app.lastError) : '',
        appKeys: Object.keys(app).sort(),
        helloSnapshot: project(app.hello?.snapshot ?? null),
        healthResult: project(app.healthResult ?? null),
        sessionsState: project(app.sessionsState ?? null),
        modelCatalogState: project(app.modelCatalogState ?? null),
        sessionsResult: project(app.sessionsResult ?? null),
        chatModelCatalog: project(Array.isArray(app.chatModelCatalog) ? app.chatModelCatalog : null),
        rpcStatus: project(rpcStatus),
        rpcModels: project(rpcModels),
        rpcErrors,
      };
    })()
  `
}

function buildControlUiChatSendScript(options: ControlUiChatSendOptions): string {
  return `
    (async () => {
      const sessionKey = ${JSON.stringify(options.sessionKey)};
      const message = ${JSON.stringify(options.message)};
      const thinking = ${JSON.stringify(options.thinking || 'off')};
      const timeoutMs = ${JSON.stringify(options.timeoutMs ?? CONTROL_UI_REQUEST_TIMEOUT_MS)};
      const requestedRunId = ${JSON.stringify(options.runId || randomUUID())};
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const deadline = Date.now() + timeoutMs;

      await customElements.whenDefined('openclaw-app');

      let app = document.querySelector('openclaw-app');
      while (!app && Date.now() < deadline) {
        await sleep(50);
        app = document.querySelector('openclaw-app');
      }

      if (!app) {
        throw new Error('openclaw-app not found');
      }

      if ((!app.connected || !app.client) && typeof app.connect === 'function') {
        try {
          await app.connect();
        } catch {
          // Surface app.lastError or timeout below.
        }
      }

      while (Date.now() < deadline) {
        if (app.connected && app.client && typeof app.client.request === 'function') {
          break;
        }
        if (app.lastError) {
          throw new Error(String(app.lastError));
        }
        await sleep(100);
      }

      if (!app.connected || !app.client || typeof app.client.request !== 'function') {
        throw new Error(app.lastError ? String(app.lastError) : 'control ui connection timeout');
      }

      const client = app.client;
      const normalizeEventEntries = () => Array.isArray(app.eventLogBuffer) ? app.eventLogBuffer : [];
      const normalizeChatMessages = () => Array.isArray(app.chatMessages) ? app.chatMessages : [];
      const findTerminalChatPayload = (acceptedRunIds, currentRunId) => {
        const entries = normalizeEventEntries();
        for (const entry of entries) {
          if (!entry || entry.event !== 'chat') continue;
          const payload = entry.payload || {};
          if (String(payload.sessionKey || '').trim() !== sessionKey) continue;
          const incomingRunId = String(payload.runId || '').trim();
          if (currentRunId && incomingRunId && incomingRunId !== currentRunId && !acceptedRunIds.has(incomingRunId)) {
            continue;
          }
          if (payload.state === 'final' || payload.state === 'error' || payload.state === 'aborted') {
            return {
              payload,
              incomingRunId,
            };
          }
        }
        return null;
      };
      const findLastAssistantMessage = (baselineMessageCount) => {
        const newMessages = normalizeChatMessages().slice(baselineMessageCount);
        for (let index = newMessages.length - 1; index >= 0; index -= 1) {
          const candidate = newMessages[index];
          if (candidate && candidate.role === 'assistant') {
            return candidate;
          }
        }
        return null;
      };

      if (typeof app.sessionKey === 'string') {
        app.sessionKey = sessionKey;
      }
      app.chatRunId = requestedRunId;
      app.chatSending = true;
      app.chatStream = '';
      app.chatStreamStartedAt = Date.now();
      app.lastError = null;
      if (typeof app.requestUpdate === 'function') {
        try {
          app.requestUpdate();
        } catch {
          // Best-effort state sync only.
        }
      }

      const baselineMessageCount = normalizeChatMessages().length;

      try {
        await client.request('sessions.subscribe', {});
      } catch {
        // Chat events broadcast globally today; keep this as a best-effort parity step with Control UI.
      }

      const response = await client.request('chat.send', {
        sessionKey,
        message,
        thinking,
        deliver: false,
        timeoutMs,
        idempotencyKey: requestedRunId,
      });

      let runId = String(response?.runId || requestedRunId || '').trim() || requestedRunId;
      const acceptedRunIds = new Set([requestedRunId, runId].filter(Boolean));
      app.chatRunId = runId;

      while (Date.now() < deadline) {
        if (!app.connected) {
          throw new Error(String(app.lastError || 'control ui disconnected'));
        }

        const terminalMatch = findTerminalChatPayload(acceptedRunIds, runId);
        if (terminalMatch) {
          if (terminalMatch.incomingRunId) {
            acceptedRunIds.add(terminalMatch.incomingRunId);
            runId = terminalMatch.incomingRunId;
          }

          if (terminalMatch.payload.state === 'final') {
            return {
              runId: runId || requestedRunId,
              sessionKey,
              payload: terminalMatch.payload,
            };
          }

          throw new Error(String(terminalMatch.payload.errorMessage || terminalMatch.payload.stopReason || terminalMatch.payload.state));
        }

        if (!app.chatSending && !String(app.chatRunId || '').trim()) {
          const lastAssistantMessage = findLastAssistantMessage(baselineMessageCount);
          if (lastAssistantMessage) {
            return {
              runId: runId || requestedRunId,
              sessionKey,
              payload: {
                state: 'final',
                message: lastAssistantMessage,
              },
            };
          }
          if (app.lastError) {
            throw new Error(String(app.lastError));
          }
        }

        await sleep(100);
      }

      throw new Error('control ui chat.send timeout');
    })()
  `
}

async function withControlUiBrowser<T>(
  deps: ControlUiRpcDependencies,
  options: {
    loadTimeoutMs?: number
    timeoutMs?: number
    execute: (browserWindow: BrowserWindowLike) => Promise<T>
  }
): Promise<T> {
  const loadGatewayRuntime = deps.loadGatewayRuntime || loadOpenClawGatewayRuntime
  const createBrowserWindow = deps.createBrowserWindow || defaultCreateBrowserWindow
  const [config, envFile] = await Promise.all([deps.readConfig(), deps.readEnvFile()])
  const settings = await resolveGatewayConnectionSettings(config, envFile, loadGatewayRuntime)
  if (!settings) {
    throw new Error('gateway control ui config unavailable')
  }

  const basePath = normalizeRecord(config?.gateway)?.controlUi
  const controlUiUrl = buildOpenClawControlUiUrl({
    gatewayUrl: settings.url,
    token: settings.token,
    basePath: normalizeRecord(basePath)?.basePath,
  })
  const browserWindow = await createBrowserWindow({
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      partition: `qclaw-control-ui-rpc:${randomUUID()}`,
      sandbox: true,
    },
  })

  try {
    await withTimeout(
      browserWindow.loadURL(controlUiUrl) as Promise<unknown>,
      options.loadTimeoutMs ?? CONTROL_UI_LOAD_TIMEOUT_MS,
      'control ui page load timeout'
    )
    return await options.execute(browserWindow)
  } finally {
    try {
      if (!browserWindow.isDestroyed()) {
        browserWindow.destroy()
      }
    } catch {
      // Ignore cleanup failures from a hidden helper window.
    }
  }
}

export async function callGatewayRpcViaControlUiBrowser(
  deps: ControlUiRpcDependencies,
  method: string,
  params: unknown,
  options: ControlUiRpcCallOptions = {}
): Promise<unknown> {
  return withControlUiBrowser(deps, {
    loadTimeoutMs: options.loadTimeoutMs,
    timeoutMs: options.timeoutMs,
    execute: (browserWindow) =>
      withTimeout(
        browserWindow.webContents.executeJavaScript(
          buildControlUiRequestScript(method, params, options.timeoutMs ?? CONTROL_UI_REQUEST_TIMEOUT_MS),
          true
        ),
        options.timeoutMs ?? CONTROL_UI_REQUEST_TIMEOUT_MS,
        `control ui request timeout for ${method}`
      ),
  })
}

export async function inspectControlUiAppViaBrowser(
  deps: ControlUiRpcDependencies,
  options: ControlUiAppInspectOptions = {}
): Promise<ControlUiAppInspectionResult> {
  return withControlUiBrowser(deps, {
    loadTimeoutMs: options.loadTimeoutMs,
    timeoutMs: options.timeoutMs,
    execute: (browserWindow) =>
      withTimeout(
        browserWindow.webContents.executeJavaScript(
          buildControlUiInspectScript(options.timeoutMs ?? CONTROL_UI_REQUEST_TIMEOUT_MS),
          true
        ) as Promise<ControlUiAppInspectionResult>,
        options.timeoutMs ?? CONTROL_UI_REQUEST_TIMEOUT_MS,
        'control ui inspect timeout'
      ),
  })
}

export async function runGatewayChatViaControlUiBrowser(
  deps: ControlUiRpcDependencies,
  options: ControlUiChatSendOptions
): Promise<Record<string, unknown>> {
  return withControlUiBrowser(deps, {
    loadTimeoutMs: options.loadTimeoutMs,
    timeoutMs: options.timeoutMs,
    execute: (browserWindow) =>
      withTimeout(
        browserWindow.webContents.executeJavaScript(
          buildControlUiChatSendScript(options),
          true
        ),
        options.timeoutMs ?? CONTROL_UI_REQUEST_TIMEOUT_MS,
        `control ui chat.send timeout for ${options.sessionKey}`
      ) as Promise<Record<string, unknown>>,
  })
}
