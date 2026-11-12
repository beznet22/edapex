// codex-rs/wasm/ts/runtime-core/src/host-values.ts
function normalizeHostValue(value) {
  return normalizeHostValueInternal(value, true);
}
function normalizeHostValuePreservingStrings(value) {
  return normalizeHostValueInternal(value, false);
}
function normalizeHostValueInternal(value, parseStrings) {
  if (typeof value === "string") {
    if (parseStrings) {
      try {
        return normalizeHostValueInternal(JSON.parse(value), parseStrings);
      } catch {
        return value;
      }
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeHostValueInternal(item, parseStrings));
  }
  if (value instanceof Map) {
    return Object.fromEntries(
      [...value.entries()].map(([key, nested]) => [
        key,
        normalizeHostValueInternal(nested, parseStrings)
      ])
    );
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        normalizeHostValueInternal(nested, parseStrings)
      ])
    );
  }
  return value;
}

// codex-rs/wasm/ts/runtime-core/src/app-server-client.ts
var DEFAULT_CHANNEL_CAPACITY = 128;
var TypedRequestError = class extends Error {
  kind;
  method;
  causeValue;
  constructor(kind, method, message, causeValue) {
    super(message);
    this.name = "TypedRequestError";
    this.kind = kind;
    this.method = method;
    this.causeValue = causeValue;
  }
};
var AppServerJsonRpcError = class extends Error {
  code;
  data;
  constructor(error) {
    super(error.message);
    this.name = "AppServerJsonRpcError";
    this.code = error.code;
    this.data = error.data ?? null;
  }
};
var AppServerClient = class _AppServerClient {
  runtime;
  channelCapacity;
  eventQueue = [];
  eventWaiters = [];
  pumpPromise = null;
  skippedEvents = 0;
  closed = false;
  constructor(runtime, channelCapacity) {
    this.runtime = runtime;
    this.channelCapacity = Math.max(1, channelCapacity);
  }
  static async start(runtime, args = {}) {
    const client = new _AppServerClient(runtime, args.channelCapacity ?? DEFAULT_CHANNEL_CAPACITY);
    await client.request({
      id: "initialize",
      method: "initialize",
      params: buildInitializeParams(args)
    });
    await client.notify({ method: "initialized" });
    client.startPump();
    return client;
  }
  async request(request) {
    try {
      const response = normalizeHostValue(
        await this.runtime.send({
          jsonrpc: "2.0",
          ...request
        })
      );
      if (response.error !== void 0) {
        throw new AppServerJsonRpcError(response.error);
      }
      return response.result ?? null;
    } catch (error) {
      if (error instanceof AppServerJsonRpcError) {
        throw error;
      }
      throw new TypedRequestError(
        "transport",
        request.method,
        `${request.method} transport error: ${formatErrorMessage(error)}`,
        error
      );
    }
  }
  async requestTyped(request) {
    try {
      return await this.request(request);
    } catch (error) {
      if (error instanceof TypedRequestError || error instanceof AppServerJsonRpcError) {
        throw error;
      }
      throw new TypedRequestError(
        "deserialize",
        request.method,
        `${request.method} response decode error: ${formatErrorMessage(error)}`,
        error
      );
    }
  }
  async notify(notification) {
    const envelope = "params" in notification ? {
      jsonrpc: "2.0",
      method: notification.method,
      params: notification.params
    } : {
      jsonrpc: "2.0",
      method: notification.method
    };
    await this.runtime.send(envelope);
  }
  async resolveServerRequest(requestId, result) {
    await this.runtime.send({
      jsonrpc: "2.0",
      id: requestId,
      result
    });
  }
  async rejectServerRequest(requestId, error) {
    await this.runtime.send({
      jsonrpc: "2.0",
      id: requestId,
      error
    });
  }
  async nextEvent() {
    if (this.eventQueue.length > 0) {
      return this.eventQueue.shift() ?? null;
    }
    if (this.closed) {
      return null;
    }
    return await new Promise((resolve) => {
      this.eventWaiters.push(resolve);
    });
  }
  async shutdown() {
    this.closed = true;
    while (this.eventWaiters.length > 0) {
      const waiter = this.eventWaiters.shift();
      waiter?.(null);
    }
    await this.pumpPromise;
  }
  startPump() {
    if (this.pumpPromise !== null) {
      return;
    }
    this.pumpPromise = this.pump();
  }
  async pump() {
    while (!this.closed) {
      const raw = normalizeHostValue(await this.runtime.nextMessage());
      if (raw === null) {
        continue;
      }
      if (isServerRequest(raw)) {
        this.enqueueEvent({ type: "serverRequest", request: raw });
        continue;
      }
      if (isServerNotification(raw)) {
        this.enqueueEvent({ type: "notification", notification: raw });
      }
    }
  }
  enqueueEvent(event) {
    if (this.skippedEvents > 0) {
      if (this.eventWaiters.length > 0) {
        const waiter = this.eventWaiters.shift();
        waiter?.({ type: "lagged", skipped: this.skippedEvents });
        this.skippedEvents = 0;
      } else if (this.eventQueue.length < this.channelCapacity) {
        this.eventQueue.push({ type: "lagged", skipped: this.skippedEvents });
        this.skippedEvents = 0;
      }
    }
    if (this.eventWaiters.length > 0) {
      const waiter = this.eventWaiters.shift();
      waiter?.(event);
      return;
    }
    if (this.eventQueue.length < this.channelCapacity) {
      this.eventQueue.push(event);
      return;
    }
    this.skippedEvents += 1;
    if (event.type === "serverRequest") {
      void this.rejectServerRequest(event.request.id, {
        code: -32001,
        message: "browser app-server event queue is full"
      });
    }
  }
};
function buildInitializeParams(args) {
  const capabilities = {
    experimentalApi: args.experimentalApi ?? false,
    optOutNotificationMethods: args.optOutNotificationMethods === void 0 || args.optOutNotificationMethods.length === 0 ? null : args.optOutNotificationMethods
  };
  return {
    clientInfo: {
      name: args.clientName ?? "browser-codex",
      title: null,
      version: args.clientVersion ?? "0.0.0"
    },
    capabilities,
    ...args.initializeParams
  };
}
function isServerNotification(value) {
  const record = value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
  return record !== null && typeof record.method === "string" && !("id" in record);
}
function isServerRequest(value) {
  const record = value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
  return record !== null && typeof record.method === "string" && "id" in record;
}
function formatErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

// codex-rs/wasm/ts/runtime-core/src/browser-runtime-core.ts
async function startBrowserAppServerClient(runtimeModule, host, args = {}) {
  const hostWithSink = attachRuntimeNotificationSink(host);
  const runtime = new runtimeModule.WasmBrowserRuntime(hostWithSink);
  installRuntimeNotificationSink(hostWithSink, runtime);
  return await AppServerClient.start(runtime, { experimentalApi: args.experimentalApi ?? true });
}
function asDynamicToolContentItems(output) {
  if (typeof output === "string") {
    return [{ type: "inputText", text: output }];
  }
  return [
    {
      type: "inputText",
      text: JSON.stringify(output, null, 2)
    }
  ];
}
function summarizeServerNotification(notification) {
  const params = notification.params !== null && notification.params !== void 0 && typeof notification.params === "object" && !Array.isArray(notification.params) ? notification.params : {};
  return {
    method: notification.method,
    keys: Object.keys(params),
    turnId: extractTurnId(params)
  };
}
function summarizeServerRequest(request) {
  const params = request.params !== null && request.params !== void 0 && typeof request.params === "object" && !Array.isArray(request.params) ? request.params : {};
  return {
    id: request.id,
    method: request.method,
    keys: Object.keys(params),
    turnId: extractTurnId(params)
  };
}
function summarizeClientResponse(method, requestId, result) {
  return {
    requestId,
    method,
    hasResult: result !== void 0,
    hasError: false,
    errorMessage: null
  };
}
var BrowserAppServerRuntimeCore = class {
  client;
  nextRequestId = 1;
  threadAliases = /* @__PURE__ */ new Map();
  notificationListeners = /* @__PURE__ */ new Set();
  constructor(client) {
    this.client = client;
    void this.startPump();
  }
  handleServerNotification(_notification) {
  }
  onLagged(event) {
    console.warn("[browser-app-server] lagged", event);
  }
  async request(method, params) {
    const id = `browser-${this.nextRequestId++}`;
    console.info("[browser-app-server] client-request", summarizeClientRequest(method, id, params));
    const response = await this.client.request({
      id,
      method,
      params
    });
    console.info("[browser-app-server] client-response", summarizeClientResponse(method, id, response));
    return response ?? null;
  }
  async requestTyped(method, params) {
    return await this.request(method, params);
  }
  subscribeToNotifications(listener) {
    this.notificationListeners.add(listener);
    return () => {
      this.notificationListeners.delete(listener);
    };
  }
  rememberThreadAlias(requestedThreadId, actualThreadId) {
    this.threadAliases.set(requestedThreadId, actualThreadId);
  }
  resolveThreadId(threadId) {
    return this.threadAliases.get(threadId) ?? threadId;
  }
  async startPump() {
    while (true) {
      const event = await this.client.nextEvent();
      if (event === null) {
        return;
      }
      if (event.type === "lagged") {
        this.onLagged(event);
        continue;
      }
      if (event.type === "serverRequest") {
        console.info("[browser-app-server] request", summarizeServerRequest(event.request));
        await this.handleServerRequest(event.request);
        continue;
      }
      console.info("[browser-app-server] notification", summarizeServerNotification(event.notification));
      this.handleNotification(event.notification);
    }
  }
  handleNotification(notification) {
    for (const listener of this.notificationListeners) {
      listener(notification);
    }
    this.handleServerNotification(notification);
  }
};
function extractTurnId(params) {
  if (typeof params.turnId === "string") {
    return params.turnId;
  }
  if (params.turn !== null && typeof params.turn === "object" && !Array.isArray(params.turn) && typeof params.turn.id === "string") {
    return params.turn.id;
  }
  return null;
}
function summarizeClientRequest(method, requestId, params) {
  return {
    requestId,
    method,
    keys: Object.keys(params),
    threadId: typeof params.threadId === "string" ? params.threadId : null,
    turnId: extractTurnId(params),
    hasInput: Array.isArray(params.input),
    inputCount: Array.isArray(params.input) ? params.input.length : 0,
    hasDynamicTools: Array.isArray(params.dynamicTools),
    dynamicToolCount: Array.isArray(params.dynamicTools) ? params.dynamicTools.length : 0
  };
}
function attachRuntimeNotificationSink(host) {
  if (host !== null && typeof host === "object" && !Array.isArray(host)) {
    return host;
  }
  return {};
}
function installRuntimeNotificationSink(host, runtime) {
  if (typeof runtime.enqueueNotification !== "function") {
    return;
  }
  host.emitNotification = async (notification) => {
    await runtime.enqueueNotification?.(notification);
  };
}

// codex-rs/wasm/ts/runtime-core/src/dynamic-tool-names.ts
function qualifyDynamicToolName(tool) {
  if (tool.toolNamespace === "browser") {
    return tool.toolName.startsWith("browser__") ? tool.toolName : `browser__${tool.toolName}`;
  }
  const prefix = `${tool.toolNamespace}__`;
  return tool.toolName.startsWith(prefix) ? tool.toolName : `${prefix}${tool.toolName}`;
}
function unqualifyBrowserToolName(tool) {
  if (tool.toolNamespace !== "browser") {
    return tool.toolName;
  }
  return tool.toolName.replace(/^browser__/, "");
}
function resolveDynamicToolTarget(toolName) {
  if (toolName.startsWith("browser__")) {
    return {
      toolNamespace: "browser",
      toolName
    };
  }
  const match = /^([a-z0-9_]+)__(.+)$/i.exec(toolName);
  if (match === null) {
    return null;
  }
  return {
    toolNamespace: match[1] ?? "browser",
    toolName
  };
}
function splitQualifiedToolNameForCodex(name) {
  if (name.startsWith("browser__")) {
    return {
      name: name.slice("browser__".length),
      namespace: "browser"
    };
  }
  if (name.startsWith("mcp__")) {
    const stripped = name.slice("mcp__".length);
    const separatorIndex = stripped.indexOf("__");
    if (separatorIndex !== -1) {
      const serverName = stripped.slice(0, separatorIndex);
      return {
        name: stripped.slice(separatorIndex + "__".length),
        namespace: `mcp__${serverName}__`
      };
    }
  }
  return { name };
}

// codex-rs/wasm/ts/browser-codex-runtime/src/runtime-adapter.ts
var BrowserCodexRuntime = class extends BrowserAppServerRuntimeCore {
  deps;
  constructor(client, deps) {
    super(client);
    this.deps = deps;
  }
  async loadAuthState() {
    return await this.deps.persistence.loadAuthState();
  }
  async saveAuthState(authState) {
    await this.deps.persistence.saveAuthState(authState);
  }
  async clearAuthState() {
    await this.deps.persistence.clearAuthState();
  }
  async readAccount(request) {
    const [authState, config] = await Promise.all([
      this.deps.persistence.loadAuthState(),
      this.deps.persistence.loadConfig()
    ]);
    return await this.deps.readAccount({
      authState,
      config,
      refreshToken: request.refreshToken
    });
  }
  async listModels(request) {
    const config = await this.deps.persistence.loadConfig();
    return await this.deps.discoverModels({
      config,
      cursor: request.cursor,
      limit: request.limit
    });
  }
  async refreshAuth(context) {
    return await this.deps.refreshAuth(context);
  }
  async threadStart(params) {
    const dynamicTools = await this.buildDynamicToolSpecs();
    return await this.requestTyped("thread/start", {
      ...params,
      dynamicTools
    });
  }
  async threadResume(params) {
    return await this.requestTyped("thread/resume", {
      ...params,
      threadId: this.resolveThreadId(params.threadId)
    });
  }
  async threadRead(params) {
    return await this.requestTyped("thread/read", {
      ...params,
      threadId: this.resolveThreadId(params.threadId)
    });
  }
  async threadList(params) {
    return await this.requestTyped("thread/list", params);
  }
  async threadRollback(params) {
    return await this.requestTyped("thread/rollback", {
      ...params,
      threadId: this.resolveThreadId(params.threadId)
    });
  }
  async turnStart(params) {
    await this.deps.onTurnStart?.();
    return await this.requestTyped("turn/start", {
      ...params,
      threadId: this.resolveThreadId(params.threadId)
    });
  }
  async turnInterrupt(params) {
    return await this.requestTyped("turn/interrupt", {
      ...params,
      threadId: this.resolveThreadId(params.threadId)
    });
  }
  async handleServerRequest(request) {
    const result = await this.resolveServerRequest(request);
    await this.client.resolveServerRequest(request.id, result);
  }
  async buildDynamicToolSpecs() {
    const { tools } = await this.deps.dynamicTools.list();
    return tools.map((tool) => ({
      name: this.deps.normalizeDynamicToolName?.(tool) ?? qualifyDynamicToolName(tool),
      description: tool.description,
      inputSchema: tool.inputSchema
    }));
  }
  async resolveServerRequest(request) {
    switch (request.method) {
      case "item/tool/requestUserInput": {
        if (this.deps.requestUserInput === void 0) {
          return { answers: {} };
        }
        const params = asRecord(request.params);
        const response = await this.deps.requestUserInput({
          questions: Array.isArray(params.questions) ? params.questions.map((question) => {
            const record = asRecord(question);
            return {
              id: typeof record.id === "string" ? record.id : "",
              header: typeof record.header === "string" ? record.header : "",
              question: typeof record.question === "string" ? record.question : "",
              options: Array.isArray(record.options) ? record.options.map((option) => {
                const optionRecord = asRecord(option);
                return {
                  label: typeof optionRecord.label === "string" ? optionRecord.label : "",
                  description: typeof optionRecord.description === "string" ? optionRecord.description : ""
                };
              }) : []
            };
          }) : []
        });
        return {
          answers: Object.fromEntries(
            response.answers.map((answer) => [answer.id, { answers: [String(answer.value ?? "")] }])
          )
        };
      }
      case "item/commandExecution/requestApproval":
      case "item/fileChange/requestApproval":
        return { decision: "cancel" };
      case "item/permissions/requestApproval":
        return { permissions: {}, scope: "turn" };
      case "item/tool/call":
        return await this.handleDynamicToolCall(request);
      case "mcpServer/elicitation/request":
        return { action: "cancel", content: null, meta: null };
      default:
        return await this.deps.resolveUnhandledServerRequest?.(request) ?? {};
    }
  }
  async handleDynamicToolCall(request) {
    const params = request.params;
    const toolName = typeof params.tool === "string" ? params.tool : "";
    const callId = typeof params.callId === "string" ? params.callId : String(request.id);
    const target = this.deps.resolveDynamicToolTarget?.(toolName) ?? resolveDynamicToolTarget(toolName);
    if (target === null) {
      return {
        contentItems: [
          {
            type: "inputText",
            text: `Unsupported dynamic tool: ${toolName}`
          }
        ],
        success: false
      };
    }
    try {
      const result = await this.deps.dynamicTools.invoke({
        callId,
        toolName: target.toolName,
        toolNamespace: target.toolNamespace,
        input: params.arguments ?? null
      });
      return {
        contentItems: asDynamicToolContentItems(result.output),
        success: true
      };
    } catch (error) {
      return {
        contentItems: [
          {
            type: "inputText",
            text: `${toolName} failed: ${this.deps.formatError(error)}`
          }
        ],
        success: false
      };
    }
  }
};
async function createBrowserCodexRuntime(params) {
  const client = await startBrowserAppServerClient(params.runtimeModule, params.host, {
    experimentalApi: params.experimentalApi ?? true
  });
  return new BrowserCodexRuntime(client, params.deps);
}
function asRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}

// codex-rs/wasm/ts/browser-tools/src/browser-sandbox-tools.ts
function asRecord2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function clampNumber(value, fallback, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(value)));
}
function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim();
}
function previewValue(value, includeValues) {
  if (!includeValues) {
    return null;
  }
  return value.slice(0, 200);
}
function inspectStorageArea(storage, includeValues, limit2) {
  const entries = [];
  for (let index = 0; index < storage.length && entries.length < limit2; index += 1) {
    const key = storage.key(index);
    if (key === null) {
      continue;
    }
    const value = storage.getItem(key);
    entries.push({
      key,
      valuePreview: value === null ? null : previewValue(value, includeValues),
      length: value?.length ?? null
    });
  }
  return entries;
}
function parseCookies(includeValues) {
  if (document.cookie.trim().length === 0) {
    return [];
  }
  return document.cookie.split(";").map((part) => part.trim()).filter((part) => part.length > 0).map((part) => {
    const separatorIndex = part.indexOf("=");
    const name = separatorIndex === -1 ? part : part.slice(0, separatorIndex);
    const value = separatorIndex === -1 ? "" : part.slice(separatorIndex + 1);
    return {
      name,
      valuePreview: previewValue(value, includeValues),
      length: value.length
    };
  });
}
async function listIndexedDbDatabases() {
  const indexedDbWithDatabases = indexedDB;
  if (typeof indexedDbWithDatabases.databases !== "function") {
    return [];
  }
  try {
    const databases = await indexedDbWithDatabases.databases();
    return databases.map((database) => ({
      name: database.name ?? null,
      version: typeof database.version === "number" ? database.version : null
    }));
  } catch {
    return [];
  }
}
async function inspectBrowserStorage(input) {
  const record = asRecord2(input);
  const includeValues = record.includeValues === true;
  const limit2 = clampNumber(record.limit, 20, 1, 100);
  const indexedDbDatabases = await listIndexedDbDatabases();
  return {
    origin: window.location.origin,
    localStorage: {
      count: window.localStorage.length,
      entries: inspectStorageArea(window.localStorage, includeValues, limit2)
    },
    sessionStorage: {
      count: window.sessionStorage.length,
      entries: inspectStorageArea(window.sessionStorage, includeValues, limit2)
    },
    cookies: {
      count: document.cookie.trim().length === 0 ? 0 : document.cookie.split(";").length,
      entries: parseCookies(includeValues).slice(0, limit2)
    },
    indexedDb: {
      count: indexedDbDatabases.length,
      databases: indexedDbDatabases.slice(0, limit2)
    }
  };
}
function inspectCookies(input) {
  const record = asRecord2(input);
  const includeValues = record.includeValues === true;
  const limit2 = clampNumber(record.limit, 20, 1, 100);
  const entries = parseCookies(includeValues).slice(0, limit2);
  return {
    origin: window.location.origin,
    count: entries.length,
    entries
  };
}
function collectMetaTags(limit2) {
  return [...document.querySelectorAll("meta")].slice(0, limit2).map((element) => ({
    name: element.getAttribute("name"),
    property: element.getAttribute("property"),
    httpEquiv: element.getAttribute("http-equiv"),
    content: element.getAttribute("content")
  }));
}
function inspectPageResources(input) {
  const record = asRecord2(input);
  const limit2 = clampNumber(record.limit, 24, 1, 100);
  const scriptOrigins = /* @__PURE__ */ new Set();
  const linkOrigins = /* @__PURE__ */ new Set();
  const resourceEntries = performance.getEntriesByType("resource").slice(0, limit2).map((entry) => {
    const resource = entry;
    const origin = new URL(resource.name, window.location.href).origin;
    return {
      name: resource.name,
      initiatorType: resource.initiatorType,
      duration: Math.round(resource.duration),
      transferSize: "transferSize" in resource ? resource.transferSize : null,
      origin
    };
  });
  return {
    url: window.location.href,
    scripts: [...document.scripts].slice(0, limit2).map((script, index) => ({
      ...script.src.length > 0 ? (() => {
        scriptOrigins.add(new URL(script.src, window.location.href).origin);
        return {};
      })() : {},
      index,
      src: script.src || null,
      type: script.type || null,
      async: script.async,
      defer: script.defer,
      inline: script.src.length === 0,
      textLength: script.textContent?.length ?? 0
    })),
    stylesheets: [...document.querySelectorAll('link[rel="stylesheet"], style')].slice(0, limit2).map((element, index) => ({
      index,
      tagName: element.tagName.toLowerCase(),
      href: element instanceof HTMLLinkElement ? element.href : null,
      inline: element.tagName.toLowerCase() === "style"
    })),
    iframes: [...document.querySelectorAll("iframe")].slice(0, limit2).map((iframe, index) => ({
      index,
      src: iframe.getAttribute("src"),
      sandbox: iframe.getAttribute("sandbox"),
      allow: iframe.getAttribute("allow"),
      title: iframe.getAttribute("title")
    })),
    forms: [...document.forms].slice(0, limit2).map((form, index) => ({
      index,
      action: form.getAttribute("action"),
      method: form.getAttribute("method"),
      autocomplete: form.getAttribute("autocomplete"),
      inputCount: form.querySelectorAll("input, textarea, select").length
    })),
    links: [...document.querySelectorAll("a[href]")].slice(0, limit2).map((link, index) => ({
      ...link.getAttribute("href") !== null ? (() => {
        try {
          linkOrigins.add(new URL(link.getAttribute("href") ?? "", window.location.href).origin);
        } catch {
          return {};
        }
        return {};
      })() : {},
      index,
      href: link.getAttribute("href"),
      target: link.getAttribute("target"),
      rel: link.getAttribute("rel"),
      text: normalizeText(link.textContent ?? "")
    })),
    metaTags: collectMetaTags(limit2),
    resourceEntries,
    origins: {
      scripts: [...scriptOrigins].slice(0, limit2),
      links: [...linkOrigins].slice(0, limit2)
    }
  };
}
function filterHeaders(headers, includeAllHeaders) {
  const entries = [...headers.entries()];
  const allowList = /* @__PURE__ */ new Set([
    "content-security-policy",
    "content-type",
    "cross-origin-opener-policy",
    "cross-origin-resource-policy",
    "cross-origin-embedder-policy",
    "permissions-policy",
    "referrer-policy",
    "strict-transport-security",
    "x-content-type-options",
    "x-frame-options",
    "cache-control"
  ]);
  return Object.fromEntries(
    entries.filter(([name]) => includeAllHeaders || allowList.has(name.toLowerCase()))
  );
}
async function probeHttpSurface(input) {
  const record = asRecord2(input);
  const rawUrl = typeof record.url === "string" && record.url.trim().length > 0 ? record.url.trim() : window.location.href;
  const url = new URL(rawUrl, window.location.href).toString();
  const includeAllHeaders = record.includeAllHeaders === true;
  const method = record.method === "HEAD" ? "HEAD" : "GET";
  try {
    const response = await fetch(url, {
      method,
      credentials: "same-origin",
      redirect: "follow"
    });
    return {
      ok: response.ok,
      url,
      method,
      status: response.status,
      redirected: response.redirected,
      finalUrl: response.url,
      headers: filterHeaders(response.headers, includeAllHeaders)
    };
  } catch (error) {
    return {
      ok: false,
      url,
      method,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
function performanceSnapshot(input) {
  const record = asRecord2(input);
  const limit2 = clampNumber(record.limit, 30, 1, 120);
  const navigationEntry = performance.getEntriesByType("navigation")[0];
  const resources = performance.getEntriesByType("resource").slice(0, limit2).map((entry) => {
    const resource = entry;
    return {
      name: resource.name,
      initiatorType: resource.initiatorType,
      duration: Math.round(resource.duration),
      startTime: Math.round(resource.startTime),
      transferSize: "transferSize" in resource ? resource.transferSize : null,
      encodedBodySize: "encodedBodySize" in resource ? resource.encodedBodySize : null,
      decodedBodySize: "decodedBodySize" in resource ? resource.decodedBodySize : null
    };
  });
  return {
    timeOrigin: Math.round(performance.timeOrigin),
    navigation: navigationEntry === void 0 ? null : {
      entryType: navigationEntry.entryType,
      type: navigationEntry.type,
      startTime: Math.round(navigationEntry.startTime),
      duration: Math.round(navigationEntry.duration),
      domContentLoadedEventEnd: Math.round(navigationEntry.domContentLoadedEventEnd),
      loadEventEnd: Math.round(navigationEntry.loadEventEnd),
      responseEnd: Math.round(navigationEntry.responseEnd)
    },
    resources
  };
}
function toJsonValue(value, depth = 0) {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (depth >= 4) {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((entry) => toJsonValue(entry, depth + 1));
  }
  if (typeof value === "object") {
    const entries = Object.entries(value).slice(0, 50);
    return Object.fromEntries(entries.map(([key, entry]) => [key, toJsonValue(entry, depth + 1)]));
  }
  return String(value);
}
async function runProbe(input) {
  const record = asRecord2(input);
  const script = typeof record.script === "string" ? record.script.trim() : "";
  const args = record.args ?? null;
  const timeoutMs = clampNumber(record.timeoutMs, 1500, 50, 1e4);
  if (script.length === 0) {
    throw new Error("browser__evaluate requires a non-empty script");
  }
  const helpers = {
    query: (selector) => document.querySelector(selector),
    queryAll: (selector) => [...document.querySelectorAll(selector)],
    text: (selector) => [...document.querySelectorAll(selector)].map((element) => normalizeText(element.textContent ?? "")),
    location: () => window.location.href
  };
  const probeRunner = new Function(
    "args",
    "helpers",
    `"use strict"; return (async () => { ${script} })();`
  );
  const timeoutPromise = new Promise((_, reject) => {
    window.setTimeout(() => reject(new Error(`browser__evaluate timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  const result = await Promise.race([probeRunner(args, helpers), timeoutPromise]);
  return {
    ok: true,
    result: toJsonValue(result)
  };
}

// codex-rs/wasm/ts/browser-tools/src/browser-tool-authorization.ts
var BrowserToolAuthorizationError = class extends Error {
  code;
  canonicalToolName;
  originalToolName;
  requestPhase;
  requiredScopes;
  grantedScopes;
  runtimeMode;
  resolvedOrigin;
  constructor(params) {
    super(params.message);
    this.name = "BrowserToolAuthorizationError";
    this.code = params.code;
    this.canonicalToolName = params.canonicalToolName;
    this.originalToolName = params.originalToolName;
    this.requestPhase = params.requestPhase;
    this.requiredScopes = params.requiredScopes;
    this.grantedScopes = params.grantedScopes;
    this.runtimeMode = params.runtimeMode;
    this.resolvedOrigin = params.resolvedOrigin;
  }
};
function createBrowserToolAuthorizationContext(params) {
  const baselineGrants = grantedScopesForRuntimeMode(params.runtimeMode);
  const turnGrants = [];
  const sessionGrants = [];
  return {
    runtimeMode: params.runtimeMode,
    browserSecurityPolicy: params.browserSecurityPolicy,
    baselineGrants,
    turnGrants,
    sessionGrants,
    addGrant(grant) {
      const destination = grant.lifetime === "turn" ? turnGrants : sessionGrants;
      destination.push({
        ...grant,
        scopes: [...grant.scopes]
      });
    },
    clearTurnGrants() {
      turnGrants.length = 0;
    },
    effectiveScopes(origin) {
      if (origin === null) {
        return [...baselineGrants];
      }
      return [.../* @__PURE__ */ new Set([
        ...baselineGrants,
        ...scopesForOrigin(turnGrants, origin),
        ...scopesForOrigin(sessionGrants, origin)
      ])];
    },
    hasGrant(origin, scopes) {
      const effectiveScopes = this.effectiveScopes(origin);
      return scopes.every((scope) => effectiveScopes.includes(scope));
    }
  };
}
function wrapBrowserToolExecutorWithAuthorization(executor, options) {
  let authorizationContextPromise = null;
  async function loadAuthorizationContext() {
    if (options?.getAuthorizationContext !== void 0) {
      return await options.getAuthorizationContext();
    }
    if (authorizationContextPromise === null) {
      authorizationContextPromise = Promise.all([
        loadRuntimeMode(options?.loadRuntimeMode),
        loadBrowserSecurityPolicy(options?.loadBrowserSecurityPolicy)
      ]).then(([runtimeMode, browserSecurityPolicy]) => createBrowserToolAuthorizationContext({
        runtimeMode,
        browserSecurityPolicy
      }));
    }
    return await authorizationContextPromise;
  }
  return {
    async list() {
      const [authorizationContext, currentPageUrl] = await Promise.all([
        loadAuthorizationContext(),
        loadCurrentPageUrl(options?.getCurrentPageUrl)
      ]);
      const { tools } = await executor.list();
      return {
        tools: tools.filter((tool) => {
          const decision = authorizeBrowserToolRequest({
            toolName: qualifyDynamicToolName(tool),
            input: null,
            requestPhase: "list",
            authorizationContext,
            currentPageUrl
          });
          return decision.decision === "allow" || decision.decision === "requires_approval";
        })
      };
    },
    async invoke(params) {
      const [authorizationContext, currentPageUrl] = await Promise.all([
        loadAuthorizationContext(),
        loadCurrentPageUrl(options?.getCurrentPageUrl)
      ]);
      const originalToolName = qualifyDynamicToolName(params);
      const decision = authorizeBrowserToolRequest({
        toolName: originalToolName,
        input: params.input,
        requestPhase: "invoke",
        authorizationContext,
        currentPageUrl
      });
      if (decision.decision === "deny") {
        throw authorizationErrorFromDecision(decision, originalToolName, "invoke");
      }
      if (decision.decision === "requires_approval") {
        await mediateBrowserToolApproval({
          decision,
          originalToolName,
          requestPhase: "invoke",
          authorizationContext,
          requestApproval: options?.requestApproval
        });
      }
      return await executor.invoke({
        ...params,
        toolName: decision.canonicalToolName
      });
    }
  };
}
function authorizeBrowserToolRequest(params) {
  const entry = findAuthorizationEntry(params.toolName);
  const authorizationContext = params.authorizationContext ?? createBrowserToolAuthorizationContext({
    runtimeMode: params.runtimeMode ?? "agent",
    browserSecurityPolicy: params.browserSecurityPolicy ?? DEFAULT_BROWSER_SECURITY_POLICY
  });
  if (entry === null) {
    return {
      decision: "deny",
      canonicalToolName: null,
      reason: "unknown_tool",
      requiredScopes: [],
      grantedScopes: authorizationContext.baselineGrants,
      runtimeMode: authorizationContext.runtimeMode,
      resolvedOrigin: null
    };
  }
  const requiredScopes = params.requestPhase === "list" ? entry.discoveryScopes : entry.resolveInvokeScopes(params.input);
  const requestContext = {
    browserSecurityPolicy: authorizationContext.browserSecurityPolicy,
    currentPageUrl: params.currentPageUrl ?? null,
    input: params.input,
    requestPhase: params.requestPhase,
    runtimeMode: authorizationContext.runtimeMode
  };
  const originDecision = resolveOriginAuthorizationDecision(entry, requestContext);
  if (originDecision.decision === "deny") {
    return {
      decision: "deny",
      canonicalToolName: entry.canonicalToolName,
      reason: originDecision.reason,
      requiredScopes,
      grantedScopes: authorizationContext.baselineGrants,
      runtimeMode: authorizationContext.runtimeMode,
      resolvedOrigin: originDecision.resolvedOrigin
    };
  }
  const resolvedOrigin = originDecision.resolvedOrigin;
  const grantedScopes = authorizationContext.effectiveScopes(resolvedOrigin);
  if (requiredScopes.every((scope) => grantedScopes.includes(scope))) {
    return {
      decision: "allow",
      canonicalToolName: entry.canonicalToolName,
      requiredScopes,
      grantedScopes,
      runtimeMode: authorizationContext.runtimeMode,
      resolvedOrigin
    };
  }
  if (entry.approvalKind !== void 0 && entry.approvalReason !== void 0 && isApprovalEligibleForMode(entry, authorizationContext.runtimeMode)) {
    if (params.requestPhase === "list") {
      return {
        decision: "allow",
        canonicalToolName: entry.canonicalToolName,
        requiredScopes,
        grantedScopes,
        runtimeMode: authorizationContext.runtimeMode,
        resolvedOrigin
      };
    }
    if (resolvedOrigin !== null) {
      return {
        decision: "requires_approval",
        canonicalToolName: entry.canonicalToolName,
        requiredScopes,
        grantedScopes,
        runtimeMode: authorizationContext.runtimeMode,
        resolvedOrigin,
        approvalKind: entry.approvalKind,
        reason: entry.approvalReason,
        grantOptions: DEFAULT_APPROVAL_OPTIONS,
        targetUrl: entry.resolveTargetUrl?.(params.input, params.currentPageUrl ?? null) ?? null,
        displayOrigin: resolvedOrigin,
        targetOrigin: entry.canonicalToolName === "browser__navigate" || entry.canonicalToolName === "browser__inspect_http" ? resolvedOrigin : null
      };
    }
  }
  return {
    decision: "deny",
    canonicalToolName: entry.canonicalToolName,
    reason: "insufficient_scope",
    requiredScopes,
    grantedScopes,
    runtimeMode: authorizationContext.runtimeMode,
    resolvedOrigin
  };
}
async function mediateBrowserToolApproval(params) {
  if (params.requestApproval === void 0) {
    throw new BrowserToolAuthorizationError({
      code: "approval_mediator_unavailable",
      canonicalToolName: params.decision.canonicalToolName,
      originalToolName: params.originalToolName,
      requestPhase: params.requestPhase,
      requiredScopes: params.decision.requiredScopes,
      grantedScopes: params.decision.grantedScopes,
      runtimeMode: params.decision.runtimeMode,
      resolvedOrigin: params.decision.resolvedOrigin,
      message: `${params.requestPhase} blocked: ${params.decision.canonicalToolName} requires human approval, but no browser approval mediator is configured`
    });
  }
  let response;
  try {
    response = await params.requestApproval(
      approvalRequestFromDecision(params.decision, params.originalToolName)
    );
  } catch (error) {
    throw new BrowserToolAuthorizationError({
      code: "approval_mediation_failed",
      canonicalToolName: params.decision.canonicalToolName,
      originalToolName: params.originalToolName,
      requestPhase: params.requestPhase,
      requiredScopes: params.decision.requiredScopes,
      grantedScopes: params.decision.grantedScopes,
      runtimeMode: params.decision.runtimeMode,
      resolvedOrigin: params.decision.resolvedOrigin,
      message: `${params.requestPhase} blocked: approval mediation failed for ${params.decision.canonicalToolName}: ${error instanceof Error ? error.message : String(error)}`
    });
  }
  if (response.decision !== "allow_once" && response.decision !== "allow_for_session" && response.decision !== "deny" && response.decision !== "abort") {
    throw new BrowserToolAuthorizationError({
      code: "invalid_approval_response",
      canonicalToolName: params.decision.canonicalToolName,
      originalToolName: params.originalToolName,
      requestPhase: params.requestPhase,
      requiredScopes: params.decision.requiredScopes,
      grantedScopes: params.decision.grantedScopes,
      runtimeMode: params.decision.runtimeMode,
      resolvedOrigin: params.decision.resolvedOrigin,
      message: `${params.requestPhase} blocked: approval mediator returned an invalid decision for ${params.decision.canonicalToolName}`
    });
  }
  if (response.decision === "deny") {
    throw new BrowserToolAuthorizationError({
      code: "approval_denied",
      canonicalToolName: params.decision.canonicalToolName,
      originalToolName: params.originalToolName,
      requestPhase: params.requestPhase,
      requiredScopes: params.decision.requiredScopes,
      grantedScopes: params.decision.grantedScopes,
      runtimeMode: params.decision.runtimeMode,
      resolvedOrigin: params.decision.resolvedOrigin,
      message: `${params.requestPhase} blocked: approval denied for ${params.decision.canonicalToolName}`
    });
  }
  if (response.decision === "abort") {
    throw new BrowserToolAuthorizationError({
      code: "approval_aborted",
      canonicalToolName: params.decision.canonicalToolName,
      originalToolName: params.originalToolName,
      requestPhase: params.requestPhase,
      requiredScopes: params.decision.requiredScopes,
      grantedScopes: params.decision.grantedScopes,
      runtimeMode: params.decision.runtimeMode,
      resolvedOrigin: params.decision.resolvedOrigin,
      message: `${params.requestPhase} blocked: approval aborted for ${params.decision.canonicalToolName}`
    });
  }
  params.authorizationContext.addGrant({
    scopes: params.decision.requiredScopes,
    origin: params.decision.resolvedOrigin,
    approvalKind: params.decision.approvalKind,
    lifetime: response.decision === "allow_for_session" ? "session" : "turn"
  });
}
function approvalRequestFromDecision(decision, originalToolName) {
  return {
    approvalId: nextApprovalId(),
    toolName: originalToolName,
    canonicalToolName: decision.canonicalToolName,
    requiredScopes: decision.requiredScopes,
    runtimeMode: decision.runtimeMode,
    origin: decision.resolvedOrigin,
    displayOrigin: decision.displayOrigin,
    targetOrigin: decision.targetOrigin,
    targetUrl: decision.targetUrl,
    approvalKind: decision.approvalKind,
    reason: decision.reason,
    grantOptions: decision.grantOptions
  };
}
function authorizationErrorFromDecision(decision, originalToolName, requestPhase) {
  return new BrowserToolAuthorizationError({
    code: decision.reason,
    canonicalToolName: decision.canonicalToolName,
    originalToolName,
    requestPhase,
    requiredScopes: decision.requiredScopes,
    grantedScopes: decision.grantedScopes,
    runtimeMode: decision.runtimeMode,
    resolvedOrigin: decision.resolvedOrigin,
    message: formatAuthorizationErrorMessage(decision, originalToolName, requestPhase)
  });
}
function formatAuthorizationErrorMessage(decision, originalToolName, requestPhase) {
  const toolName = decision.canonicalToolName ?? originalToolName;
  if (decision.reason === "unknown_tool") {
    return `${requestPhase} blocked: browser tool ${originalToolName} is not mapped to an authorization policy`;
  }
  if (decision.reason === "invalid_runtime_mode") {
    return `${requestPhase} blocked: runtime mode ${decision.runtimeMode} is not supported by browser tool policy`;
  }
  if (decision.reason === "current_origin_unavailable") {
    return `${requestPhase} blocked: ${toolName} requires a current page origin, but none is available`;
  }
  if (decision.reason === "invalid_target_url") {
    return `${requestPhase} blocked: ${toolName} requires a valid target URL that can be resolved to an origin`;
  }
  if (decision.reason === "origin_not_allowlisted") {
    return `${requestPhase} blocked: ${toolName} target origin ${decision.resolvedOrigin} is not in browser_security.allowed_origins`;
  }
  if (decision.reason === "localhost_not_allowed") {
    return `${requestPhase} blocked: ${toolName} target origin ${decision.resolvedOrigin} resolves to localhost or loopback and browser_security.allow_localhost is false`;
  }
  if (decision.reason === "private_network_not_allowed") {
    return `${requestPhase} blocked: ${toolName} target origin ${decision.resolvedOrigin} resolves to a private or link-local network and browser_security.allow_private_network is false`;
  }
  return `${requestPhase} blocked: ${toolName} requires scopes [${decision.requiredScopes.join(", ")}] in ${decision.runtimeMode} mode`;
}
function findAuthorizationEntry(toolName) {
  for (const entry of BROWSER_TOOL_AUTHORIZATION_REGISTRY) {
    if (entry.canonicalToolName === toolName || entry.aliases.includes(toolName)) {
      return entry;
    }
  }
  return null;
}
function grantedScopesForRuntimeMode(runtimeMode) {
  return RUNTIME_MODE_SCOPE_GRANTS[runtimeMode] ?? [];
}
async function loadRuntimeMode(loadRuntimeModeOverride) {
  return await loadRuntimeModeOverride?.() ?? "agent";
}
async function loadBrowserSecurityPolicy(loadBrowserSecurityPolicyOverride) {
  return await loadBrowserSecurityPolicyOverride?.() ?? DEFAULT_BROWSER_SECURITY_POLICY;
}
async function loadCurrentPageUrl(getCurrentPageUrlOverride) {
  if (getCurrentPageUrlOverride !== void 0) {
    return await getCurrentPageUrlOverride() ?? null;
  }
  return typeof window === "undefined" ? null : window.location.href;
}
function domInspectionScopes(input) {
  const record = asRecord3(input);
  return record.includeHtml === true ? ["browser.dom:read", "browser.dom.html:read"] : ["browser.dom:read"];
}
function resolveCurrentPageOrigin(context) {
  return originFromUrl(context.currentPageUrl);
}
function resolveTargetOriginFromInput(context) {
  const record = asRecord3(context.input);
  return originFromUrl(
    typeof record.url === "string" ? record.url : null,
    context.currentPageUrl
  );
}
function resolveTargetUrlFromInput(input, currentPageUrl) {
  const record = asRecord3(input);
  const url = typeof record.url === "string" ? record.url : null;
  if (url === null) {
    return null;
  }
  try {
    return new URL(url, currentPageUrl ?? void 0).toString();
  } catch {
    return url;
  }
}
function resolveOriginAuthorizationDecision(entry, context) {
  if (entry.resolveProtectedOrigin === void 0 || context.requestPhase === "list" && entry.enforceOriginPolicyInList !== true) {
    return {
      decision: "allow",
      resolvedOrigin: null
    };
  }
  const resolvedOrigin = entry.resolveProtectedOrigin(context);
  if (resolvedOrigin === null) {
    return {
      decision: "deny",
      reason: entry.canonicalToolName === "browser__evaluate" ? "current_origin_unavailable" : "invalid_target_url",
      resolvedOrigin: null
    };
  }
  const originDecision = authorizeProtectedOrigin(
    resolvedOrigin,
    context.browserSecurityPolicy,
    entry.protectedOriginPolicy ?? "allowlist"
  );
  if (originDecision !== "allow") {
    return {
      decision: "deny",
      reason: originDecision,
      resolvedOrigin
    };
  }
  return {
    decision: "allow",
    resolvedOrigin
  };
}
function authorizeProtectedOrigin(origin, browserSecurityPolicy, policy) {
  const hostname = hostnameFromOrigin(origin);
  if (hostname === null) {
    return "origin_not_allowlisted";
  }
  if (isLocalhostHostname(hostname) && !browserSecurityPolicy.allowLocalhost) {
    return "localhost_not_allowed";
  }
  if (isPrivateNetworkHostname(hostname) && !browserSecurityPolicy.allowPrivateNetwork) {
    return "private_network_not_allowed";
  }
  if (policy === "public_web") {
    return "allow";
  }
  return browserSecurityPolicy.allowedOrigins.includes(origin) ? "allow" : "origin_not_allowlisted";
}
function originFromUrl(url, baseUrl) {
  if (typeof url !== "string" || url.trim().length === 0) {
    return null;
  }
  try {
    const resolved = baseUrl === void 0 || baseUrl === null ? new URL(url) : new URL(url, baseUrl);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return null;
    }
    return resolved.origin;
  } catch {
    return null;
  }
}
function hostnameFromOrigin(origin) {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}
function isLocalhostHostname(hostname) {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1).toLowerCase() === "::1";
  }
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}
function isPrivateNetworkHostname(hostname) {
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    return false;
  }
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    const normalized = hostname.slice(1, -1).toLowerCase();
    if (normalized === "::1") {
      return false;
    }
    return normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
  }
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    return false;
  }
  const octets = hostname.split(".").map(Number);
  const [first, second] = octets;
  if (octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) {
    return false;
  }
  return first === 10 || first === 192 && second === 168 || first === 172 && second >= 16 && second <= 31 || first === 169 && second === 254;
}
function asRecord3(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function scopesForOrigin(grants, origin) {
  return grants.filter((grant) => grant.origin === origin).flatMap((grant) => grant.scopes);
}
function isApprovalEligibleForMode(entry, runtimeMode) {
  return entry.approvalEligibleInModes?.includes(runtimeMode) ?? false;
}
var approvalCounter = 0;
function nextApprovalId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  approvalCounter += 1;
  return `browser-approval-${approvalCounter}`;
}
var DEFAULT_APPROVAL_OPTIONS = [
  "allow_once",
  "allow_for_session",
  "deny",
  "abort"
];
var BROWSER_TOOL_AUTHORIZATION_REGISTRY = [
  {
    canonicalToolName: "browser__tool_search",
    aliases: [],
    discoveryScopes: ["browser.tools:read"],
    resolveInvokeScopes: () => ["browser.tools:read"]
  },
  {
    canonicalToolName: "browser__inspect_page",
    aliases: ["browser__page_context"],
    discoveryScopes: ["browser.page:read"],
    resolveInvokeScopes: () => ["browser.page:read"]
  },
  {
    canonicalToolName: "browser__inspect_dom",
    aliases: ["browser__extract_dom"],
    discoveryScopes: ["browser.dom:read"],
    resolveInvokeScopes: domInspectionScopes
  },
  {
    canonicalToolName: "browser__list_interactives",
    aliases: [],
    discoveryScopes: ["browser.interactives:read"],
    resolveInvokeScopes: () => ["browser.interactives:read"]
  },
  {
    canonicalToolName: "browser__click",
    aliases: [],
    discoveryScopes: ["browser.page:click"],
    resolveInvokeScopes: () => ["browser.page:click"]
  },
  {
    canonicalToolName: "browser__fill",
    aliases: [],
    discoveryScopes: ["browser.page:fill"],
    resolveInvokeScopes: () => ["browser.page:fill"]
  },
  {
    canonicalToolName: "browser__navigate",
    aliases: [],
    discoveryScopes: ["browser.page:navigate"],
    resolveInvokeScopes: () => ["browser.page:navigate"],
    resolveProtectedOrigin: resolveTargetOriginFromInput,
    protectedOriginPolicy: "public_web",
    resolveTargetUrl: resolveTargetUrlFromInput,
    approvalKind: "navigation",
    approvalEligibleInModes: ["chaos"],
    approvalReason: "Navigate the current page to the requested URL."
  },
  {
    canonicalToolName: "browser__wait_for",
    aliases: [],
    discoveryScopes: ["browser.page:wait"],
    resolveInvokeScopes: () => ["browser.page:wait"]
  },
  {
    canonicalToolName: "browser__inspect_storage",
    aliases: [],
    discoveryScopes: ["browser.storage:read"],
    resolveInvokeScopes: () => ["browser.storage:read"]
  },
  {
    canonicalToolName: "browser__inspect_cookies",
    aliases: [],
    discoveryScopes: ["browser.cookies:read"],
    resolveInvokeScopes: () => ["browser.cookies:read"]
  },
  {
    canonicalToolName: "browser__inspect_http",
    aliases: ["browser__probe_http"],
    discoveryScopes: ["browser.http:read"],
    resolveInvokeScopes: () => ["browser.http:read"],
    resolveProtectedOrigin: resolveTargetOriginFromInput,
    resolveTargetUrl: resolveTargetUrlFromInput,
    approvalKind: "network",
    approvalEligibleInModes: ["chaos"],
    approvalReason: "Read HTTP response metadata from the target origin."
  },
  {
    canonicalToolName: "browser__inspect_resources",
    aliases: ["browser__page_resources"],
    discoveryScopes: ["browser.resources:read"],
    resolveInvokeScopes: () => ["browser.resources:read"]
  },
  {
    canonicalToolName: "browser__inspect_performance",
    aliases: ["browser__performance_snapshot"],
    discoveryScopes: ["browser.performance:read"],
    resolveInvokeScopes: () => ["browser.performance:read"]
  },
  {
    canonicalToolName: "browser__evaluate",
    aliases: ["browser__run_probe"],
    discoveryScopes: ["browser.js:execute"],
    resolveInvokeScopes: () => ["browser.js:execute"],
    resolveProtectedOrigin: resolveCurrentPageOrigin,
    enforceOriginPolicyInList: true,
    approvalKind: "code_execution",
    approvalEligibleInModes: ["chaos"],
    approvalReason: "Run JavaScript in the current page context."
  },
  {
    canonicalToolName: "browser__submit_patch",
    aliases: [],
    discoveryScopes: ["browser.workspace:write"],
    resolveInvokeScopes: () => ["browser.workspace:write"]
  }
];
var RUNTIME_MODE_SCOPE_GRANTS = {
  chat: [],
  inspect: [
    "browser.tools:read",
    "browser.page:read",
    "browser.interactives:read",
    "browser.performance:read",
    "browser.page:wait",
    "browser.dom:read",
    "browser.resources:read"
  ],
  interact: [
    "browser.tools:read",
    "browser.page:read",
    "browser.interactives:read",
    "browser.performance:read",
    "browser.page:wait",
    "browser.dom:read",
    "browser.resources:read",
    "browser.page:click",
    "browser.page:fill"
  ],
  agent: [
    "browser.tools:read",
    "browser.page:read",
    "browser.interactives:read",
    "browser.performance:read",
    "browser.page:wait",
    "browser.dom:read",
    "browser.resources:read",
    "browser.workspace:write"
  ],
  chaos: [
    "browser.tools:read",
    "browser.page:read",
    "browser.interactives:read",
    "browser.performance:read",
    "browser.page:wait",
    "browser.dom:read",
    "browser.dom.html:read",
    "browser.resources:read",
    "browser.storage:read",
    "browser.cookies:read",
    "browser.page:click",
    "browser.page:fill",
    "browser.workspace:write"
  ]
};
var DEFAULT_BROWSER_SECURITY_POLICY = {
  allowedOrigins: [],
  allowLocalhost: false,
  allowPrivateNetwork: false
};

// codex-rs/wasm/ts/browser-tools/src/page-telemetry.ts
var MAX_EVENTS = 160;
var listeners = /* @__PURE__ */ new Set();
var initialized = false;
var events = [];
var snapshot = captureSnapshot();
var mutationObserver = null;
var refreshTimer = null;
var activitySink = null;
function initializePageTelemetry() {
  if (initialized) {
    emit();
    return () => {
    };
  }
  initialized = true;
  snapshot = captureSnapshot();
  recordPageEvent("lifecycle", "Page telemetry online", {
    url: snapshot.url,
    title: snapshot.title
  });
  const refreshFromPage = (kind, summary, detail, target) => {
    scheduleSnapshotRefresh();
    recordPageEvent(kind, summary, {
      detail: detail ?? null,
      target: target ?? null,
      url: window.location.href
    });
  };
  const originalPushState = window.history.pushState.bind(window.history);
  const originalReplaceState = window.history.replaceState.bind(window.history);
  window.history.pushState = (...args) => {
    originalPushState(...args);
    refreshFromPage("navigation", "history.pushState", window.location.href, null);
  };
  window.history.replaceState = (...args) => {
    originalReplaceState(...args);
    refreshFromPage("navigation", "history.replaceState", window.location.href, null);
  };
  const handleNavigation = () => refreshFromPage("navigation", "location changed", window.location.href, null);
  const handleSelection = () => {
    const selectionText = normalizeText2(window.getSelection?.()?.toString() ?? "");
    if (selectionText.length > 0) {
      refreshFromPage("selection", "selection changed", selectionText.slice(0, 240), null);
    }
  };
  const handleClick = (event) => {
    const target = event.target instanceof Element ? buildStableSelector(event.target) : null;
    refreshFromPage("click", "user click", null, target);
  };
  const handleInput = (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }
    refreshFromPage("input", "user input", null, buildStableSelector(event.target));
  };
  window.addEventListener("popstate", handleNavigation);
  window.addEventListener("hashchange", handleNavigation);
  document.addEventListener("selectionchange", handleSelection);
  document.addEventListener("click", handleClick, true);
  document.addEventListener("input", handleInput, true);
  mutationObserver = new MutationObserver((entries) => {
    const relevantEntries = entries.filter((entry) => !isInsideRuntimeShell(entry.target));
    if (relevantEntries.length === 0) {
      return;
    }
    const summary = relevantEntries.slice(0, 3).map((entry) => buildMutationSummary(entry)).filter((value) => value.length > 0).join(" | ");
    scheduleSnapshotRefresh();
    recordPageEvent("mutation", summary || "dom mutated", {
      mutations: relevantEntries.length,
      url: window.location.href
    });
  });
  mutationObserver.observe(document.documentElement, {
    attributes: true,
    childList: true,
    subtree: true,
    characterData: false
  });
  const teardown = () => {
    mutationObserver?.disconnect();
    mutationObserver = null;
    if (refreshTimer !== null) {
      window.clearTimeout(refreshTimer);
      refreshTimer = null;
    }
    window.history.pushState = originalPushState;
    window.history.replaceState = originalReplaceState;
    window.removeEventListener("popstate", handleNavigation);
    window.removeEventListener("hashchange", handleNavigation);
    document.removeEventListener("selectionchange", handleSelection);
    document.removeEventListener("click", handleClick, true);
    document.removeEventListener("input", handleInput, true);
    initialized = false;
  };
  return teardown;
}
function recordPageEvent(kind, summary, data = null, options) {
  const nextEvent = {
    id: `${Date.now()}-${events.length + 1}`,
    kind,
    summary,
    detail: options?.detail ?? null,
    target: options?.target ?? null,
    timestamp: Date.now(),
    data
  };
  events = [...events, nextEvent].slice(-MAX_EVENTS);
  if (options?.silent !== true) {
    activitySink?.({
      kind,
      summary,
      detail: nextEvent.detail,
      target: nextEvent.target,
      timestamp: nextEvent.timestamp,
      data
    });
  }
  emit();
}
function refreshPageRuntimeSnapshot() {
  snapshot = captureSnapshot();
  emit();
  return snapshot;
}
function emit() {
  for (const listener of listeners) {
    listener(snapshot, events);
  }
}
function scheduleSnapshotRefresh() {
  if (refreshTimer !== null) {
    return;
  }
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;
    snapshot = captureSnapshot();
    emit();
  }, 120);
}
function captureSnapshot() {
  return {
    url: window.location.href,
    title: document.title,
    capabilityMode: inferCapabilityMode(),
    selectionText: normalizeText2(window.getSelection?.()?.toString() ?? "") || null,
    readyState: document.readyState,
    interactives: collectInteractives(),
    observedAt: Date.now()
  };
}
function collectInteractives() {
  const seen = /* @__PURE__ */ new Set();
  return [...document.querySelectorAll("a[href], button, input, textarea, select, [role='button'], [tabindex]")].filter((element) => element.offsetParent !== null || element === document.activeElement).map((element) => {
    const selector = buildStableSelector(element);
    const label = normalizeText2(
      element.getAttribute("aria-label") ?? element.textContent ?? (element instanceof HTMLInputElement ? element.placeholder : "") ?? ""
    );
    return {
      selector,
      tagName: element.tagName.toLowerCase(),
      role: element.getAttribute("role"),
      label: label || selector
    };
  }).filter((surface) => {
    if (seen.has(surface.selector)) {
      return false;
    }
    seen.add(surface.selector);
    return true;
  }).slice(0, 14);
}
function buildMutationSummary(entry) {
  const baseTarget = entry.target instanceof Element ? buildStableSelector(entry.target) : entry.target.nodeName.toLowerCase();
  if (entry.type === "attributes") {
    return `${baseTarget} attribute:${entry.attributeName ?? "unknown"}`;
  }
  if (entry.type === "childList") {
    return `${baseTarget} children:${entry.addedNodes.length}+/${entry.removedNodes.length}-`;
  }
  return `${baseTarget} changed`;
}
function isInsideRuntimeShell(target) {
  const element = target instanceof Element ? target : target.parentElement;
  if (element === null) {
    return false;
  }
  return element.closest("#app") !== null;
}
function buildStableSelector(element) {
  if (element.id.length > 0) {
    return `#${escapeSelectorValue(element.id)}`;
  }
  const role = element.getAttribute("role");
  const name = element.getAttribute("aria-label") ?? (element instanceof HTMLInputElement ? element.name || element.placeholder : "") ?? "";
  if (role !== null && name.trim().length > 0) {
    return `${element.tagName.toLowerCase()}[role="${role}"][aria-label="${name.trim().slice(0, 40)}"]`;
  }
  const classes = [...element.classList].slice(0, 2);
  if (classes.length > 0) {
    return `${element.tagName.toLowerCase()}.${classes.map(escapeSelectorValue).join(".")}`;
  }
  const parent = element.parentElement;
  if (parent === null) {
    return element.tagName.toLowerCase();
  }
  const siblings = [...parent.children].filter((candidate) => candidate.tagName === element.tagName);
  const index = siblings.indexOf(element) + 1;
  return `${parent.tagName.toLowerCase()} > ${element.tagName.toLowerCase()}:nth-of-type(${index})`;
}
function escapeSelectorValue(value) {
  return value.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}
function inferCapabilityMode() {
  const chromeLike = window.chrome;
  if (chromeLike?.devtools !== void 0) {
    return "devtools";
  }
  if (chromeLike?.runtime?.id !== void 0) {
    return "extension";
  }
  return "page";
}
function normalizeText2(value) {
  return value.replace(/\s+/g, " ").trim();
}

// codex-rs/wasm/ts/browser-tools/src/browser-tools.ts
var browserToolCatalogSources = /* @__PURE__ */ new Set();
var BROWSER_TOOLS = [
  {
    name: "browser__tool_search",
    description: "Search browser-owned tools and registered frontend tool catalogs. This is the extension point for future frontend MCP-owned tools.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
        includeSchema: { type: "boolean" }
      },
      required: ["query"],
      additionalProperties: false
    }
  },
  {
    name: "browser__inspect_page",
    description: "Inspect the current page, including title, URL, selection, headings, links, viewport, and interactive elements.",
    inputSchema: {
      type: "object",
      properties: {
        includeLinksLimit: { type: "number" },
        includeSelection: { type: "boolean" }
      },
      additionalProperties: false
    }
  },
  {
    name: "browser__inspect_dom",
    description: "Inspect DOM elements matched by a CSS selector and return text, attributes, and optional HTML previews.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string" },
        maxItems: { type: "number" },
        includeHtml: { type: "boolean" }
      },
      required: ["selector"],
      additionalProperties: false
    }
  },
  {
    name: "browser__list_interactives",
    description: "List likely clickable or fillable page elements with stable selectors for follow-up actions.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number" }
      },
      additionalProperties: false
    }
  },
  {
    name: "browser__click",
    description: "Click an element on the current page using a CSS selector and optional index.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string" },
        index: { type: "number" }
      },
      required: ["selector"],
      additionalProperties: false
    }
  },
  {
    name: "browser__fill",
    description: "Fill a form control on the current page and dispatch standard input/change events.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string" },
        value: { type: "string" },
        index: { type: "number" }
      },
      required: ["selector", "value"],
      additionalProperties: false
    }
  },
  {
    name: "browser__navigate",
    description: "Navigate the current tab to a URL or path in the same browser context.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string" }
      },
      required: ["url"],
      additionalProperties: false
    }
  },
  {
    name: "browser__wait_for",
    description: "Wait for an element to appear on the page, useful after navigation or async UI changes.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string" },
        timeoutMs: { type: "number" }
      },
      required: ["selector"],
      additionalProperties: false
    }
  },
  {
    name: "browser__inspect_storage",
    description: "Inspect browser storage available to page JavaScript, including localStorage, sessionStorage, indexedDB, and non-HttpOnly cookies.",
    inputSchema: {
      type: "object",
      properties: {
        includeValues: { type: "boolean" },
        limit: { type: "number" }
      },
      additionalProperties: false
    }
  },
  {
    name: "browser__inspect_cookies",
    description: "Inspect cookies visible to document.cookie in the current page context.",
    inputSchema: {
      type: "object",
      properties: {
        includeValues: { type: "boolean" },
        limit: { type: "number" }
      },
      additionalProperties: false
    }
  },
  {
    name: "browser__inspect_http",
    description: "Inspect a same-origin HTTP URL with GET or HEAD and return readable response headers and status.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string" },
        method: { type: "string", enum: ["GET", "HEAD"] },
        includeAllHeaders: { type: "boolean" }
      },
      additionalProperties: false
    }
  },
  {
    name: "browser__inspect_resources",
    description: "Inspect scripts, styles, links, forms, iframes, meta tags, and resource timing entries on the current page.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number" }
      },
      additionalProperties: false
    }
  },
  {
    name: "browser__inspect_performance",
    description: "Inspect navigation and resource timing data exposed by the Performance API for the current page.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number" }
      },
      additionalProperties: false
    }
  },
  {
    name: "browser__evaluate",
    description: "Run a bounded JavaScript evaluation in the current page context and return JSON-serializable output.",
    inputSchema: {
      type: "object",
      properties: {
        script: { type: "string" },
        args: {},
        timeoutMs: { type: "number" }
      },
      required: ["script"],
      additionalProperties: false
    }
  },
  {
    name: "browser__submit_patch",
    description: "Apply an XCodex workspace patch to browser-managed files. Use this for file edits in browser runtime instead of shell-style editing.",
    inputSchema: {
      type: "object",
      properties: {
        patch: { type: "string" }
      },
      required: ["patch"],
      additionalProperties: false
    }
  }
];
function createBrowserAwareToolExecutor(options) {
  return wrapBrowserToolExecutorWithAuthorization(createRawBrowserAwareToolExecutor(options), options);
}
function createRawBrowserAwareToolExecutor(options) {
  return {
    async list() {
      const tools = await listAuthorizedBrowserToolCatalog(options);
      return {
        tools: tools.map((tool) => ({
          toolName: unqualifyBrowserToolName(tool),
          toolNamespace: tool.toolNamespace,
          description: tool.description,
          inputSchema: tool.inputSchema
        }))
      };
    },
    async invoke(params) {
      let output;
      const toolName = qualifyDynamicToolName(params);
      if (toolName === "browser__tool_search") {
        output = await searchBrowserToolCatalog(asRecord4(params.input), options);
      } else if (toolName === "browser__inspect_page" || toolName === "browser__page_context") {
        output = inspectPageContext(asRecord4(params.input));
      } else if (toolName === "browser__inspect_dom" || toolName === "browser__extract_dom") {
        output = extractDom(asRecord4(params.input));
      } else if (toolName === "browser__list_interactives") {
        output = listInteractives(asRecord4(params.input));
      } else if (toolName === "browser__click") {
        output = clickElement(asRecord4(params.input));
      } else if (toolName === "browser__fill") {
        output = fillElement(asRecord4(params.input));
      } else if (toolName === "browser__navigate") {
        output = navigatePage(asRecord4(params.input));
      } else if (toolName === "browser__wait_for") {
        output = await waitForElement(asRecord4(params.input));
      } else if (toolName === "browser__inspect_storage") {
        output = await inspectBrowserStorage(params.input);
      } else if (toolName === "browser__inspect_cookies") {
        output = inspectCookies(params.input);
      } else if (toolName === "browser__inspect_http" || toolName === "browser__probe_http") {
        output = await probeHttpSurface(params.input);
      } else if (toolName === "browser__inspect_resources" || toolName === "browser__page_resources") {
        output = inspectPageResources(params.input);
      } else if (toolName === "browser__inspect_performance" || toolName === "browser__performance_snapshot") {
        output = performanceSnapshot(params.input);
      } else if (toolName === "browser__evaluate" || toolName === "browser__run_probe") {
        output = await runProbe(params.input);
      } else if (toolName === "browser__submit_patch") {
        if (options?.applyPatch === void 0) {
          throw new Error("browser__submit_patch is unavailable: no browser workspace patch executor is configured");
        }
        output = await options.applyPatch(params.input);
      } else {
        throw new Error(`Unsupported browser-aware tool: ${toolName}`);
      }
      return {
        output
      };
    }
  };
}
async function listBrowserToolCatalog() {
  const builtinTools = BROWSER_TOOLS.map(
    (tool) => ({
      toolName: tool.name,
      toolNamespace: "browser",
      description: tool.description,
      inputSchema: tool.inputSchema,
      source: "browser-runtime"
    })
  );
  const extraTools = (await Promise.all(
    [...browserToolCatalogSources].map(async (source) => {
      try {
        return await source();
      } catch (error) {
        console.warn("[browser-tools] browser tool catalog source failed", error);
        return [];
      }
    })
  )).flat();
  return dedupeBrowserToolCatalog([...builtinTools, ...extraTools]);
}
async function listAuthorizedBrowserToolCatalog(options) {
  const [catalog, authorizationContext, currentPageUrl] = await Promise.all([
    listBrowserToolCatalog(),
    loadCatalogAuthorizationContext(options),
    options?.getCurrentPageUrl?.() ?? (typeof window === "undefined" ? null : window.location.href)
  ]);
  return catalog.filter((tool) => {
    const decision = authorizeBrowserToolRequest({
      toolName: qualifyDynamicToolName(tool),
      input: null,
      requestPhase: "list",
      authorizationContext,
      currentPageUrl
    });
    return decision.decision === "allow" || decision.decision === "requires_approval";
  });
}
async function searchBrowserToolCatalog(input, options) {
  const query = typeof input.query === "string" ? input.query.trim() : "";
  if (query.length === 0) {
    throw new Error("browser__tool_search requires a non-empty query");
  }
  const limit2 = clampNumber2(input.limit, 8, 1, 25);
  const includeSchema = input.includeSchema === true;
  const catalog = await listAuthorizedBrowserToolCatalog(options);
  const queryTerms = tokenizeSearchText(query);
  const results = catalog.map((entry) => ({
    entry,
    score: scoreBrowserToolCatalogEntry(entry, queryTerms)
  })).filter((entry) => entry.score > 0).sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    const leftQualified = `${left.entry.toolNamespace}__${left.entry.toolName}`;
    const rightQualified = `${right.entry.toolNamespace}__${right.entry.toolName}`;
    return leftQualified.localeCompare(rightQualified);
  }).slice(0, limit2);
  return {
    query,
    count: results.length,
    tools: results.map(({ entry, score }) => ({
      toolName: entry.toolName,
      toolNamespace: entry.toolNamespace,
      qualifiedName: qualifyDynamicToolName(entry),
      description: entry.description,
      source: entry.source ?? null,
      keywords: entry.keywords ?? [],
      score,
      inputSchema: includeSchema ? entry.inputSchema : null
    }))
  };
}
async function loadCatalogAuthorizationContext(options) {
  if (options?.getAuthorizationContext !== void 0) {
    return await options.getAuthorizationContext();
  }
  const [runtimeMode, browserSecurityPolicy] = await Promise.all([
    options?.loadRuntimeMode?.() ?? "agent",
    options?.loadBrowserSecurityPolicy?.() ?? {
      allowedOrigins: [],
      allowLocalhost: false,
      allowPrivateNetwork: false
    }
  ]);
  return createBrowserToolAuthorizationContext({
    runtimeMode,
    browserSecurityPolicy
  });
}
function dedupeBrowserToolCatalog(tools) {
  const deduped = /* @__PURE__ */ new Map();
  for (const tool of tools) {
    deduped.set(`${tool.toolNamespace}::${tool.toolName}`, tool);
  }
  return [...deduped.values()];
}
function scoreBrowserToolCatalogEntry(entry, queryTerms) {
  const qualifiedName = qualifyDynamicToolName(entry);
  const haystack = tokenizeSearchText(
    [
      entry.toolName,
      qualifiedName,
      entry.toolNamespace,
      entry.description,
      ...entry.keywords ?? [],
      entry.source ?? ""
    ].join(" ")
  );
  const haystackSet = new Set(haystack);
  let score = 0;
  for (const term of queryTerms) {
    if (qualifiedName.includes(term)) {
      score += 8;
    } else if (entry.toolName.includes(term)) {
      score += 6;
    } else if (entry.toolNamespace.includes(term)) {
      score += 4;
    } else if (haystackSet.has(term)) {
      score += 3;
    }
  }
  return score;
}
function tokenizeSearchText(input) {
  return input.toLowerCase().split(/[^a-z0-9_]+/i).map((part) => part.trim()).filter((part) => part.length > 0);
}
function inspectPageContext(input) {
  const includeLinksLimit = clampNumber2(input.includeLinksLimit, 12, 1, 40);
  const includeSelection = input.includeSelection !== false;
  const headings = [...document.querySelectorAll("h1, h2, h3")].map((heading) => normalizeText3(heading.textContent ?? "")).filter((text) => text.length > 0).slice(0, 18);
  const links = [...document.querySelectorAll("a[href]")].map((link) => ({
    text: normalizeText3(link.textContent ?? ""),
    href: link.getAttribute("href") ?? ""
  })).filter((link) => link.text.length > 0 || link.href.length > 0).slice(0, includeLinksLimit);
  const selectionText = includeSelection ? normalizeText3(window.getSelection?.()?.toString() ?? "") : "";
  const snapshot2 = refreshPageRuntimeSnapshot();
  return {
    url: window.location.href,
    origin: window.location.origin,
    title: document.title,
    language: document.documentElement.lang || null,
    capabilityMode: inferCapabilityMode2(),
    selectionText: selectionText.length > 0 ? selectionText : null,
    headings,
    links,
    landmarks: {
      main: document.querySelectorAll("main").length,
      nav: document.querySelectorAll("nav").length,
      article: document.querySelectorAll("article").length,
      section: document.querySelectorAll("section").length,
      form: document.querySelectorAll("form").length
    },
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio
    },
    interactives: snapshot2.interactives
  };
}
function extractDom(input) {
  const selector = typeof input.selector === "string" ? input.selector.trim() : "";
  if (selector.length === 0) {
    throw new Error("browser__inspect_dom requires a non-empty selector");
  }
  const maxItems = clampNumber2(input.maxItems, 8, 1, 24);
  const includeHtml = input.includeHtml === true;
  const elements = [...document.querySelectorAll(selector)].slice(0, maxItems);
  return {
    selector,
    count: elements.length,
    elements: elements.map((element, index) => ({
      index,
      tagName: element.tagName.toLowerCase(),
      id: element.id || null,
      className: typeof element.className === "string" && element.className.length > 0 ? element.className : null,
      role: element.getAttribute("role"),
      text: normalizeText3(element.textContent ?? ""),
      href: element instanceof HTMLAnchorElement ? element.href : null,
      html: includeHtml && "outerHTML" in element ? String(element.outerHTML).slice(0, 500) : null
    }))
  };
}
function listInteractives(input) {
  const limit2 = clampNumber2(input.limit, 10, 1, 30);
  const snapshot2 = refreshPageRuntimeSnapshot();
  recordPageEvent(
    "tool",
    "browser__list_interactives",
    {
      count: snapshot2.interactives.length
    },
    {
      detail: `Listed ${Math.min(limit2, snapshot2.interactives.length)} interactive surfaces`
    }
  );
  return {
    url: snapshot2.url,
    title: snapshot2.title,
    count: Math.min(limit2, snapshot2.interactives.length),
    surfaces: snapshot2.interactives.slice(0, limit2)
  };
}
function clickElement(input) {
  const element = requireElement(input, "browser__click");
  const selector = typeof input.selector === "string" ? input.selector.trim() : "";
  if (!(element instanceof HTMLElement)) {
    throw new Error("browser__click requires an HTMLElement target");
  }
  element.click();
  refreshPageRuntimeSnapshot();
  recordPageEvent(
    "tool",
    "browser__click",
    {
      selector
    },
    {
      target: selector,
      detail: summarizeElement(element)
    }
  );
  return {
    ok: true,
    action: "click",
    selector,
    target: summarizeElement(element),
    url: window.location.href
  };
}
function fillElement(input) {
  const element = requireElement(input, "browser__fill");
  const value = typeof input.value === "string" ? input.value : "";
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) {
    throw new Error("browser__fill requires an input, textarea, or select target");
  }
  if (element instanceof HTMLSelectElement) {
    element.value = value;
    const selectedOption = [...element.options].find((option) => option.value === value || normalizeText3(option.textContent ?? "") === value) ?? null;
    if (selectedOption !== null) {
      element.value = selectedOption.value;
    }
  } else {
    element.focus();
    element.value = value;
  }
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  refreshPageRuntimeSnapshot();
  const selector = typeof input.selector === "string" ? input.selector.trim() : "";
  recordPageEvent(
    "tool",
    "browser__fill",
    {
      selector,
      valueLength: value.length
    },
    {
      target: selector,
      detail: summarizeElement(element)
    }
  );
  return {
    ok: true,
    action: "fill",
    selector,
    target: summarizeElement(element),
    valueLength: value.length
  };
}
function navigatePage(input) {
  const rawUrl = typeof input.url === "string" ? input.url.trim() : "";
  if (rawUrl.length === 0) {
    throw new Error("browser__navigate requires a non-empty url");
  }
  const url = new URL(rawUrl, window.location.href).toString();
  recordPageEvent(
    "tool",
    "browser__navigate",
    {
      from: window.location.href,
      to: url
    },
    {
      detail: url
    }
  );
  window.location.assign(url);
  return {
    ok: true,
    action: "navigate",
    url
  };
}
async function waitForElement(input) {
  const selector = typeof input.selector === "string" ? input.selector.trim() : "";
  if (selector.length === 0) {
    throw new Error("browser__wait_for requires a non-empty selector");
  }
  const timeoutMs = clampNumber2(input.timeoutMs, 3e3, 100, 2e4);
  const start = performance.now();
  while (performance.now() - start <= timeoutMs) {
    const element = document.querySelector(selector);
    if (element !== null) {
      refreshPageRuntimeSnapshot();
      recordPageEvent(
        "tool",
        "browser__wait_for",
        {
          selector,
          elapsedMs: Math.round(performance.now() - start)
        },
        {
          target: selector,
          detail: "selector became available"
        }
      );
      return {
        ok: true,
        selector,
        elapsedMs: Math.round(performance.now() - start),
        target: summarizeElement(element)
      };
    }
    await new Promise((resolve) => window.setTimeout(resolve, 120));
  }
  recordPageEvent(
    "tool",
    "browser__wait_for_timeout",
    {
      selector,
      timeoutMs
    },
    {
      target: selector,
      detail: "selector did not appear before timeout"
    }
  );
  throw new Error(`browser__wait_for timed out after ${timeoutMs}ms for selector ${selector}`);
}
function asRecord4(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function clampNumber2(value, fallback, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(value)));
}
function requireElement(input, toolName) {
  const selector = typeof input.selector === "string" ? input.selector.trim() : "";
  if (selector.length === 0) {
    throw new Error(`${toolName} requires a non-empty selector`);
  }
  const index = clampNumber2(input.index, 0, 0, 40);
  const matches = [...document.querySelectorAll(selector)];
  const element = matches[index] ?? null;
  if (element === null) {
    throw new Error(`${toolName} could not find selector ${selector} at index ${index}`);
  }
  return element;
}
function summarizeElement(element) {
  const label = normalizeText3(
    element.getAttribute("aria-label") ?? element.textContent ?? (element instanceof HTMLInputElement ? element.placeholder : "") ?? ""
  );
  const tagName = element.tagName.toLowerCase();
  return label.length > 0 ? `${tagName} ${label.slice(0, 80)}` : tagName;
}
function inferCapabilityMode2() {
  const chromeLike = window.chrome;
  if (chromeLike?.devtools !== void 0) {
    return "devtools";
  }
  if (chromeLike?.runtime?.id !== void 0) {
    return "extension";
  }
  return "page";
}
function normalizeText3(value) {
  return value.replace(/\s+/g, " ").trim();
}

// codex-rs/wasm/ts/browser-runtime/src/bootstrap.ts
function buildBrowserRuntimeBootstrap(params) {
  return {
    codexHome: params.codexHome,
    cwd: params.cwd,
    model: params.model,
    modelProviderId: params.modelProviderId,
    modelProvider: {
      name: params.modelProvider.name,
      base_url: params.modelProvider.baseUrl,
      env_key: params.modelProvider.envKey,
      env_key_instructions: null,
      experimental_bearer_token: null,
      wire_api: "responses",
      query_params: null,
      http_headers: null,
      env_http_headers: null,
      request_max_retries: null,
      stream_max_retries: null,
      stream_idle_timeout_ms: null,
      requires_openai_auth: false,
      supports_websockets: false
    },
    reasoningEffort: params.reasoningEffort,
    personality: params.personality,
    baseInstructions: params.baseInstructions,
    developerInstructions: params.developerInstructions,
    userInstructions: params.userInstructions,
    workspaceTools: params.capabilities.workspaceTools,
    planningTools: params.capabilities.planningTools,
    appTools: params.capabilities.appTools,
    apiKey: params.apiKey,
    ephemeral: params.ephemeral
  };
}
function capabilitiesForRuntimeMode(runtimeMode) {
  switch (runtimeMode) {
    case "chat":
    case "inspect":
    case "interact":
      return {
        workspaceTools: false,
        planningTools: false,
        appTools: false
      };
    case "agent":
    case "chaos":
      return {
        workspaceTools: true,
        planningTools: true,
        appTools: true
      };
  }
}

// codex-rs/wasm/ts/browser-runtime/src/runtime-host.ts
function createBrowserRuntimeHostFromDeps(deps) {
  return {
    async loadBootstrap(_request) {
      return await deps.loadBootstrap();
    },
    readFile: deps.readFile,
    listDir: deps.listDir,
    search: deps.search,
    applyPatch: deps.applyPatch,
    async loadUserConfig(request) {
      if (deps.loadUserConfig === void 0) {
        throw new Error("Browser runtime host does not provide user config loading");
      }
      return await deps.loadUserConfig(request);
    },
    async saveUserConfig(request) {
      if (deps.saveUserConfig === void 0) {
        throw new Error("Browser runtime host does not provide user config persistence");
      }
      return await deps.saveUserConfig(request);
    },
    async loadThreadSession(request) {
      if (deps.loadThreadSession === void 0) {
        throw new Error("Browser runtime host does not provide thread session loading");
      }
      return await deps.loadThreadSession(request);
    },
    async saveThreadSession(request) {
      if (deps.saveThreadSession === void 0) {
        throw new Error("Browser runtime host does not provide thread session persistence");
      }
      return await deps.saveThreadSession(request);
    },
    async deleteThreadSession(request) {
      if (deps.deleteThreadSession === void 0) {
        throw new Error("Browser runtime host does not provide thread session deletion");
      }
      return await deps.deleteThreadSession(request);
    },
    async listThreadSessions(request) {
      if (deps.listThreadSessions === void 0) {
        return { sessions: [] };
      }
      return await deps.listThreadSessions(request);
    },
    async listDiscoverableApps(request) {
      if (deps.listDiscoverableApps === void 0) {
        return [];
      }
      return await deps.listDiscoverableApps(request);
    },
    async runModelTurn(request, onEvent) {
      if (deps.runNormalizedModelTurn === void 0) {
        throw new Error("Browser runtime host does not provide model transport execution");
      }
      return await deps.runNormalizedModelTurn(
        normalizeModelTurnRequest(request, onEvent)
      );
    },
    async resolveMcpOauthRedirectUri(request) {
      if (deps.resolveMcpOauthRedirectUri === void 0) {
        throw new Error("Browser runtime host does not provide MCP OAuth redirect resolution");
      }
      return await deps.resolveMcpOauthRedirectUri(request);
    },
    async waitForMcpOauthCallback(request) {
      if (deps.waitForMcpOauthCallback === void 0) {
        throw new Error("Browser runtime host does not provide MCP OAuth callback handling");
      }
      return await deps.waitForMcpOauthCallback(request);
    }
  };
}
function normalizeModelTurnRequest(request, emitModelEvent) {
  const requestRecord = asJsonRecord(normalizeHostValuePreservingStrings(request));
  return {
    requestId: typeof requestRecord.requestId === "string" ? requestRecord.requestId : crypto.randomUUID(),
    requestBody: asJsonRecord(
      normalizeHostValuePreservingStrings(requestRecord.requestBody)
    ),
    transportOptions: asJsonRecord(
      normalizeHostValuePreservingStrings(requestRecord.transportOptions)
    ),
    rawRequest: request,
    emitModelEvent: emitModelEvent === void 0 ? void 0 : async (event) => {
      emitModelEvent(event);
    }
  };
}
function extraHeadersFromTransportOptions(transportOptions) {
  const extraHeaders = asJsonRecord(transportOptions.extraHeaders);
  const entries = Object.entries(extraHeaders).filter(
    (entry) => typeof entry[1] === "string"
  );
  if (entries.length === 0) {
    return null;
  }
  return Object.fromEntries(entries);
}
function createNormalizedModelTurnRunner(deps) {
  return async (request) => {
    const config = await deps.loadConfig();
    const scope = deps.scope ?? "browser-runtime";
    const extraHeaders = extraHeadersFromTransportOptions(request.transportOptions);
    console.info(`[${scope}] host.run-model-turn`, {
      requestId: request.requestId,
      providerKind: deps.getProviderKind(config),
      requestBodyKeys: Object.keys(request.requestBody),
      inputSummary: summarizeNormalizedModelTurnInput(request.requestBody),
      transport: summarizeTransportOptions(request.transportOptions)
    });
    return await deps.runModelTurn({
      requestId: request.requestId,
      config,
      requestBody: request.requestBody,
      transportOptions: request.transportOptions,
      extraHeaders,
      emitModelEvent: request.emitModelEvent
    });
  };
}
function summarizeNormalizedModelTurnInput(requestBody) {
  const input = Array.isArray(requestBody.input) ? requestBody.input : null;
  if (input === null) {
    return null;
  }
  return {
    count: input.length,
    itemTypes: input.map(
      (item) => item !== null && typeof item === "object" && !Array.isArray(item) && typeof item.type === "string" ? item.type : "<invalid>"
    )
  };
}
function asJsonRecord(value) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return {};
}
function summarizeTransportOptions(transportOptions) {
  const extraHeaders = extraHeadersFromTransportOptions(transportOptions);
  return {
    keys: Object.keys(transportOptions),
    extraHeaderKeys: extraHeaders === null ? [] : Object.keys(extraHeaders)
  };
}

// codex-rs/wasm/ts/browser-runtime/src/workspace.ts
var DEFAULT_WORKSPACE_ROOT = "/workspace";
var DEFAULT_WORKSPACE_STORAGE_KEY = "codex.wasm.workspace.codex-browser-terminal";
var WORKSPACE_CHANGED_EVENT = "codex:workspace-changed";
function createLocalStorageWorkspaceAdapter(options = {}) {
  const normalizeFilePath = (path2) => normalizeWorkspaceFilePath(path2, options);
  const normalizeDirectoryPath = (path2) => normalizeWorkspaceDirectoryPath(path2, options);
  return {
    async readFile(request) {
      const normalizedRequest = normalizeHostValue(request);
      if (typeof normalizedRequest.path !== "string") {
        throw createHostError("invalidInput", "readFile expected path");
      }
      const workspace = await loadStoredWorkspaceSnapshot(options);
      const path2 = normalizeFilePath(normalizedRequest.path);
      const file = workspace.files.find((entry) => entry.path === path2);
      if (file === void 0) {
        throw createHostError(
          "notFound",
          `workspace file was not found: ${path2}`
        );
      }
      return {
        path: path2,
        content: file.content
      };
    },
    async listDir(request) {
      const normalizedRequest = normalizeHostValue(request);
      if (typeof normalizedRequest.path !== "string") {
        throw createHostError("invalidInput", "listDir expected path");
      }
      const recursive = normalizedRequest.recursive === true;
      const workspace = await loadStoredWorkspaceSnapshot(options);
      const path2 = normalizeDirectoryPath(normalizedRequest.path);
      return {
        entries: workspace.files.filter(
          (file) => recursive ? file.path === path2 || file.path.startsWith(`${path2}/`) : parentDirectory(file.path) === path2
        ).sort((left, right) => left.path.localeCompare(right.path)).map((file) => ({
          path: file.path,
          isDir: false,
          sizeBytes: new TextEncoder().encode(file.content).length
        }))
      };
    },
    async search(request) {
      const normalizedRequest = normalizeHostValue(request);
      if (typeof normalizedRequest.path !== "string" || typeof normalizedRequest.query !== "string" || typeof normalizedRequest.caseSensitive !== "boolean") {
        throw createHostError(
          "invalidInput",
          "search expected path, query and caseSensitive"
        );
      }
      const workspace = await loadStoredWorkspaceSnapshot(options);
      const path2 = normalizeDirectoryPath(normalizedRequest.path);
      const query = normalizedRequest.caseSensitive ? normalizedRequest.query : normalizedRequest.query.toLocaleLowerCase();
      return {
        matches: workspace.files.filter((file) => file.path === path2 || file.path.startsWith(`${path2}/`)).flatMap(
          (file) => file.content.split("\n").flatMap((line, index) => {
            const candidate = normalizedRequest.caseSensitive ? line : line.toLocaleLowerCase();
            if (!candidate.includes(query)) {
              return [];
            }
            return [{ path: file.path, lineNumber: index + 1, line }];
          })
        )
      };
    },
    async applyPatch(request) {
      const normalizedRequest = normalizeHostValue(request);
      if (typeof normalizedRequest.patch !== "string") {
        throw createHostError("invalidInput", "applyPatch expected patch");
      }
      const workspace = await loadStoredWorkspaceSnapshot(options);
      const operations = parseWorkspacePatch(
        normalizedRequest.patch,
        normalizeFilePath
      );
      const filesChanged = [];
      for (const operation of operations) {
        if (operation.type === "add") {
          const existingFile = workspace.files.find(
            (file) => file.path === operation.path
          );
          if (existingFile !== void 0) {
            throw createHostError(
              "conflict",
              `workspace file already exists: ${operation.path}`
            );
          }
          workspace.files = upsertWorkspaceFile(workspace.files, {
            path: operation.path,
            content: operation.content
          });
          filesChanged.push(operation.path);
          continue;
        }
        if (operation.type === "delete") {
          const nextFiles = workspace.files.filter(
            (file) => file.path !== operation.path
          );
          if (nextFiles.length === workspace.files.length) {
            throw createHostError(
              "notFound",
              `workspace file was not found: ${operation.path}`
            );
          }
          workspace.files = nextFiles;
          filesChanged.push(operation.path);
          continue;
        }
        const originalFile = workspace.files.find(
          (file) => file.path === operation.path
        );
        const currentContent = originalFile?.content ?? "";
        const nextContent = applyUpdateHunksToContent(
          currentContent,
          operation.hunks
        );
        workspace.files = upsertWorkspaceFile(workspace.files, {
          path: operation.path,
          content: nextContent
        });
        filesChanged.push(operation.path);
      }
      await saveStoredWorkspaceSnapshot(workspace, options);
      return { filesChanged };
    }
  };
}
async function loadStoredWorkspaceSnapshot(options = {}) {
  const storage = resolveWorkspaceStorage(options);
  const rootPath = resolveWorkspaceRoot(options.rootPath);
  const raw = storage.getItem(options.storageKey ?? DEFAULT_WORKSPACE_STORAGE_KEY);
  if (raw === null) {
    return {
      rootPath,
      files: []
    };
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      rootPath: typeof parsed.rootPath === "string" ? normalizeWorkspaceDirectoryPath(parsed.rootPath, { rootPath }) : rootPath,
      files: Array.isArray(parsed.files) ? parsed.files.filter(
        (file) => file !== null && typeof file === "object" && typeof file.path === "string" && typeof file.content === "string"
      ).map((file) => ({
        path: normalizeWorkspaceFilePath(file.path, { rootPath }),
        content: file.content
      })) : []
    };
  } catch {
    return {
      rootPath,
      files: []
    };
  }
}
async function saveStoredWorkspaceSnapshot(snapshot2, options = {}) {
  const storage = resolveWorkspaceStorage(options);
  const rootPath = resolveWorkspaceRoot(options.rootPath ?? snapshot2.rootPath);
  storage.setItem(
    options.storageKey ?? DEFAULT_WORKSPACE_STORAGE_KEY,
    JSON.stringify({
      rootPath,
      files: snapshot2.files.map((file) => ({
        path: normalizeWorkspaceFilePath(file.path, { rootPath }),
        content: file.content
      })).sort((left, right) => left.path.localeCompare(right.path))
    })
  );
  const eventTarget = resolveWorkspaceEventTarget(options.eventTarget);
  eventTarget?.dispatchEvent(new CustomEvent(WORKSPACE_CHANGED_EVENT));
}
function normalizeWorkspaceFilePath(path2, options = {}) {
  const rootPath = resolveWorkspaceRoot(options.rootPath);
  const normalizedRoot = rootPath.replace(/^\/+/, "");
  const trimmed = path2.replace(/^\/+/, "").replace(/\/+$/, "");
  if (trimmed.length === 0 || trimmed === normalizedRoot) {
    return rootPath;
  }
  if (trimmed.startsWith(`${normalizedRoot}/`)) {
    return `/${trimmed}`;
  }
  return `${rootPath}/${trimmed}`;
}
function normalizeWorkspaceDirectoryPath(path2, options = {}) {
  return normalizeWorkspaceFilePath(path2, options).replace(/\/+$/, "");
}
function parentDirectory(path2) {
  const normalized = path2.replace(/^\/+/, "").replace(/\/+$/, "");
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash === -1) {
    return "";
  }
  return `/${normalized.slice(0, lastSlash)}`;
}
function upsertWorkspaceFile(files, nextFile) {
  const nextFiles = files.filter((file) => file.path !== nextFile.path);
  nextFiles.push(nextFile);
  nextFiles.sort((left, right) => left.path.localeCompare(right.path));
  return nextFiles;
}
function applyUpdateHunksToContent(content, hunks) {
  let cursor = 0;
  let nextContent = "";
  for (const hunk of hunks) {
    if (hunk.oldText.length === 0) {
      nextContent += content.slice(cursor, cursor) + hunk.newText;
      continue;
    }
    const matchIndex = content.indexOf(hunk.oldText, cursor);
    if (matchIndex === -1) {
      throw createHostError(
        "conflict",
        "patch target block was not found in workspace file"
      );
    }
    nextContent += content.slice(cursor, matchIndex);
    nextContent += hunk.newText;
    cursor = matchIndex + hunk.oldText.length;
  }
  nextContent += content.slice(cursor);
  return nextContent;
}
function parseWorkspacePatch(patch, normalizeFilePath) {
  const lines = patch.replace(/\r\n/g, "\n").split("\n");
  if (lines[0]?.startsWith("--- ")) {
    return parseUnifiedWorkspacePatch(lines, normalizeFilePath);
  }
  if (lines[0] !== "*** Begin Patch") {
    throw createHostError(
      "invalidInput",
      "workspace patch parser expected `*** Begin Patch`"
    );
  }
  const operations = [];
  let index = 1;
  while (index < lines.length) {
    const line = lines[index];
    if (line === "*** End Patch") {
      return operations;
    }
    if (line.startsWith("*** Add File: ")) {
      const path3 = normalizeFilePath(line.slice("*** Add File: ".length).trim());
      index += 1;
      const contentLines = [];
      while (index < lines.length && !lines[index].startsWith("*** ")) {
        if (!lines[index].startsWith("+")) {
          throw createHostError(
            "invalidInput",
            "workspace patch parser expected added lines for `*** Add File:`"
          );
        }
        contentLines.push(lines[index].slice(1));
        index += 1;
      }
      operations.push({ type: "add", path: path3, content: contentLines.join("\n") });
      continue;
    }
    if (line.startsWith("*** Delete File: ")) {
      operations.push({
        type: "delete",
        path: normalizeFilePath(line.slice("*** Delete File: ".length).trim())
      });
      index += 1;
      continue;
    }
    if (!line.startsWith("*** Update File: ")) {
      throw createHostError(
        "invalidInput",
        `workspace patch parser found an unsupported directive: ${line}`
      );
    }
    const path2 = normalizeFilePath(line.slice("*** Update File: ".length).trim());
    index += 1;
    const hunks = [];
    while (index < lines.length && !lines[index].startsWith("*** ")) {
      if (!lines[index].startsWith("@@")) {
        throw createHostError(
          "invalidInput",
          "workspace patch parser expected `@@` hunk header"
        );
      }
      index += 1;
      const oldLines = [];
      const newLines = [];
      while (index < lines.length && !lines[index].startsWith("@@") && !lines[index].startsWith("*** ")) {
        const hunkLine = lines[index];
        if (hunkLine === "\\ No newline at end of file") {
          index += 1;
          continue;
        }
        if (hunkLine.startsWith("-")) {
          oldLines.push(hunkLine.slice(1));
        } else if (hunkLine.startsWith("+")) {
          newLines.push(hunkLine.slice(1));
        } else if (hunkLine.startsWith(" ")) {
          oldLines.push(hunkLine.slice(1));
          newLines.push(hunkLine.slice(1));
        } else {
          throw createHostError(
            "invalidInput",
            "workspace patch parser found an unsupported hunk line"
          );
        }
        index += 1;
      }
      hunks.push({ oldText: oldLines.join("\n"), newText: newLines.join("\n") });
    }
    operations.push({ type: "update", path: path2, hunks });
  }
  throw createHostError(
    "invalidInput",
    "workspace patch parser expected `*** End Patch`"
  );
}
function parseUnifiedWorkspacePatch(lines, normalizeFilePath) {
  const operations = [];
  let index = 0;
  while (index < lines.length) {
    const oldHeader = lines[index];
    if (oldHeader.trim().length === 0) {
      index += 1;
      continue;
    }
    if (!oldHeader.startsWith("--- ")) {
      throw createHostError(
        "invalidInput",
        `workspace patch parser found an unsupported unified diff header: ${oldHeader}`
      );
    }
    const newHeader = lines[index + 1];
    if (newHeader === void 0 || !newHeader.startsWith("+++ ")) {
      throw createHostError(
        "invalidInput",
        "workspace patch parser expected `+++` after unified diff `---` header"
      );
    }
    const oldPath = parseUnifiedDiffPath(
      oldHeader.slice(4).trim(),
      normalizeFilePath
    );
    const newPath = parseUnifiedDiffPath(
      newHeader.slice(4).trim(),
      normalizeFilePath
    );
    index += 2;
    const hunks = [];
    while (index < lines.length) {
      const line = lines[index];
      if (line.startsWith("--- ")) {
        break;
      }
      if (line.startsWith("@@")) {
        index += 1;
        const oldLines = [];
        const newLines = [];
        while (index < lines.length) {
          const hunkLine = lines[index];
          if (hunkLine.startsWith("@@") || hunkLine.startsWith("--- ")) {
            break;
          }
          if (hunkLine === "\\ No newline at end of file") {
            index += 1;
            continue;
          }
          if (hunkLine.startsWith("-")) {
            oldLines.push(hunkLine.slice(1));
          } else if (hunkLine.startsWith("+")) {
            newLines.push(hunkLine.slice(1));
          } else if (hunkLine.startsWith(" ")) {
            oldLines.push(hunkLine.slice(1));
            newLines.push(hunkLine.slice(1));
          } else {
            throw createHostError(
              "invalidInput",
              "workspace patch parser found an unsupported unified diff hunk line"
            );
          }
          index += 1;
        }
        hunks.push({ oldText: oldLines.join("\n"), newText: newLines.join("\n") });
        continue;
      }
      index += 1;
    }
    if (oldPath === null && newPath === null) {
      throw createHostError(
        "invalidInput",
        "workspace patch parser expected a real file path in unified diff headers"
      );
    }
    if (oldPath === null) {
      operations.push({
        type: "add",
        path: newPath ?? "",
        content: hunks.map((hunk) => hunk.newText).join("")
      });
      continue;
    }
    if (newPath === null) {
      operations.push({ type: "delete", path: oldPath });
      continue;
    }
    operations.push({ type: "update", path: newPath, hunks });
  }
  return operations;
}
function parseUnifiedDiffPath(rawPath, normalizeFilePath) {
  const [candidate] = rawPath.split("	");
  if (candidate === "/dev/null") {
    return null;
  }
  const normalizedCandidate = candidate.startsWith("a/") || candidate.startsWith("b/") ? candidate.slice(2) : candidate;
  return normalizeFilePath(normalizedCandidate);
}
function resolveWorkspaceRoot(rootPath) {
  const trimmed = (rootPath ?? DEFAULT_WORKSPACE_ROOT).replace(/^\/+/, "").replace(/\/+$/, "");
  return trimmed.length === 0 ? DEFAULT_WORKSPACE_ROOT : `/${trimmed}`;
}
function resolveWorkspaceStorage(options) {
  if (options.storage !== void 0) {
    return options.storage;
  }
  if (typeof window !== "undefined" && "localStorage" in window && window.localStorage !== void 0) {
    return window.localStorage;
  }
  throw createHostError(
    "unsupported",
    "localStorage is not available in this environment"
  );
}
function resolveWorkspaceEventTarget(eventTarget) {
  if (eventTarget !== void 0) {
    return eventTarget;
  }
  if (typeof window !== "undefined") {
    return window;
  }
  return null;
}
function createHostError(code, message, data = null) {
  return {
    code,
    message,
    retryable: false,
    data
  };
}
var createBrowserWorkspaceAdapter = createLocalStorageWorkspaceAdapter;
var defaultWorkspaceAdapter = createLocalStorageWorkspaceAdapter();
var readWorkspaceFile = defaultWorkspaceAdapter.readFile;
var listWorkspaceDir = defaultWorkspaceAdapter.listDir;
var searchWorkspace = defaultWorkspaceAdapter.search;
var applyWorkspacePatch = defaultWorkspaceAdapter.applyPatch;

// codex-rs/wasm/ts/browser-runtime/src/config.ts
var OPENAI_API_BASE_URL = "https://api.openai.com/v1";
var OPENROUTER_API_BASE_URL = "https://openrouter.ai/api/v1";
var ZAI_API_BASE_URL = "https://api.z.ai/api/paas/v4";
var DEEPSEEK_API_BASE_URL = "https://api.deepseek.com";
var PREFERRED_API_MODELS = [
  "gpt-5",
  "gpt-5-mini",
  "gpt-5-nano",
  "gpt-4.1",
  "gpt-4.1-mini"
];
var BUILD_MANIFEST_PATH = "/pkg/manifest.json";
var XROUTER_MANIFEST_PATH = "/xrouter-browser/manifest.json";
var OPENAI_PROVIDER_ID = "openai";
var XROUTER_BROWSER_PROVIDER_ID = "xrouter-browser";
var OPENAI_COMPATIBLE_PROVIDER_ID = "external";
var OPENAI_ENV_KEY = "OPENAI_API_KEY";
var XROUTER_ENV_KEY = "XROUTER_API_KEY";
var OPENAI_COMPATIBLE_ENV_KEY = "OPENAI_COMPATIBLE_API_KEY";
var DEFAULT_RUNTIME_MODE = "agent";
var DEFAULT_BROWSER_SECURITY_CONFIG = {
  allowed_origins: [],
  allow_localhost: false,
  allow_private_network: false
};
var DEFAULT_CODEX_CONFIG = {
  model: "",
  modelProvider: XROUTER_BROWSER_PROVIDER_ID,
  runtime_mode: DEFAULT_RUNTIME_MODE,
  browser_security: structuredClone(DEFAULT_BROWSER_SECURITY_CONFIG),
  modelReasoningEffort: "medium",
  personality: "pragmatic",
  modelProviders: {
    [XROUTER_BROWSER_PROVIDER_ID]: {
      name: "DeepSeek via Browser Runtime",
      baseUrl: DEEPSEEK_API_BASE_URL,
      envKey: XROUTER_ENV_KEY,
      providerKind: "xrouter_browser",
      wireApi: "responses",
      metadata: {
        xrouterProvider: "deepseek"
      }
    }
  },
  env: {
    [XROUTER_ENV_KEY]: ""
  }
};
var DEFAULT_DEMO_INSTRUCTIONS = {
  baseInstructions: [
    "You are operating inside the WASM Codex browser runtime.",
    "This runtime is browser-native.",
    "Do not assume local shell access, git, native filesystem access, or local background processes.",
    "Use browser-safe workspace tools like `read_file`, `list_dir`, `grep_files`, `apply_patch`, `update_plan`, and `request_user_input` when available.",
    "Keep behavior aligned with Codex core semantics where the browser host supports it.",
    "If a requested action depends on native OS capabilities, explain plainly that this browser runtime cannot provide them.",
    "The terminal UI is only a shell-like surface. It is not a desktop terminal and should not claim to execute native shell commands.",
    "Prefer concise terminal-style output over chatty prose."
  ].join("\n"),
  agentsDirectory: DEFAULT_WORKSPACE_ROOT,
  agentsInstructions: "",
  skillName: "browser-skill",
  skillPath: "skills/browser/SKILL.md",
  skillContents: ""
};
var XROUTER_PROVIDER_OPTIONS = [
  {
    value: "deepseek",
    label: "DeepSeek",
    displayName: "DeepSeek via Browser Runtime",
    baseUrl: DEEPSEEK_API_BASE_URL
  },
  {
    value: "openai",
    label: "OpenAI",
    displayName: "OpenAI via Browser Runtime",
    baseUrl: OPENAI_API_BASE_URL
  },
  {
    value: "openrouter",
    label: "OpenRouter",
    displayName: "OpenRouter via Browser Runtime",
    baseUrl: OPENROUTER_API_BASE_URL
  },
  {
    value: "zai",
    label: "ZAI",
    displayName: "ZAI via Browser Runtime",
    baseUrl: ZAI_API_BASE_URL
  }
];
function formatError(error) {
  if (error instanceof Error) {
    return error.message;
  }
  if (error !== null && typeof error === "object" && "message" in error && typeof error.message === "string") {
    const code = "code" in error && typeof error.code === "string" ? `${error.code}: ` : "";
    const data = "data" in error && error.data != null ? ` ${JSON.stringify(error.data)}` : "";
    return `${code}${error.message}${data}`;
  }
  if (error !== null && typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
    }
  }
  return String(error);
}
function modelIdToDisplayName(id) {
  return id.split("-").map((part) => part.length === 0 ? part : `${part[0].toUpperCase()}${part.slice(1)}`).join(" ");
}
function toProviderLabel(providerId) {
  return modelIdToDisplayName(providerId.trim() || "provider");
}
function defaultXrouterProviderBaseUrl(provider) {
  switch (provider) {
    case "deepseek":
      return DEEPSEEK_API_BASE_URL;
    case "openai":
      return OPENAI_API_BASE_URL;
    case "openrouter":
      return OPENROUTER_API_BASE_URL;
    case "zai":
      return ZAI_API_BASE_URL;
  }
}
function createProviderConfig(transportMode, displayName, baseUrl, xrouterProvider) {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
  switch (transportMode) {
    case "openai":
      return {
        name: displayName.trim() || "OpenAI",
        baseUrl: normalizedBaseUrl || OPENAI_API_BASE_URL,
        envKey: OPENAI_ENV_KEY,
        providerKind: "openai",
        wireApi: "responses",
        metadata: null
      };
    case "xrouter-browser":
      return {
        name: displayName.trim() || `${toProviderLabel(xrouterProvider)} via XRouter Browser`,
        baseUrl: normalizedBaseUrl || defaultXrouterProviderBaseUrl(xrouterProvider),
        envKey: XROUTER_ENV_KEY,
        providerKind: "xrouter_browser",
        wireApi: "responses",
        metadata: {
          xrouterProvider
        }
      };
    case "openai-compatible":
      return {
        name: displayName.trim() || "OpenAI-Compatible Server",
        baseUrl: normalizedBaseUrl,
        envKey: OPENAI_COMPATIBLE_ENV_KEY,
        providerKind: "openai_compatible",
        wireApi: "responses",
        metadata: null
      };
  }
}
function getActiveProvider(config) {
  return config.modelProviders[config.modelProvider] ?? DEFAULT_CODEX_CONFIG.modelProviders[DEFAULT_CODEX_CONFIG.modelProvider];
}
function activeProviderApiKey(config) {
  const provider = getActiveProvider(config);
  return (config.env[provider.envKey] ?? "").trim();
}
function detectTransportMode(config) {
  switch (getActiveProvider(config).providerKind) {
    case "openai":
      return "openai";
    case "xrouter_browser":
      return "xrouter-browser";
    case "openai_compatible":
      return "openai-compatible";
  }
}
function normalizeCodexConfig(config) {
  const transportMode = detectTransportMode(config);
  const activeProvider = getActiveProvider(config);
  const runtimeMode = normalizeRuntimeMode(config.runtime_mode);
  const runtimeArchitecture = normalizeOptionalString(config.runtime_architecture);
  const browserSecurity = normalizeBrowserSecurityConfig(config.browser_security);
  return materializeCodexConfig({
    transportMode,
    model: config.model.trim(),
    runtimeMode,
    runtimeArchitecture,
    browserSecurity,
    modelReasoningEffort: config.modelReasoningEffort,
    personality: config.personality,
    displayName: activeProvider.name,
    baseUrl: activeProvider.baseUrl,
    apiKey: activeProviderApiKey(config),
    xrouterProvider: activeProvider.metadata?.xrouterProvider ?? "deepseek"
  });
}
function materializeCodexConfig(params) {
  const provider = createProviderConfig(
    params.transportMode,
    params.displayName,
    params.baseUrl,
    params.xrouterProvider
  );
  const modelProvider = params.transportMode === "openai" ? OPENAI_PROVIDER_ID : params.transportMode === "xrouter-browser" ? XROUTER_BROWSER_PROVIDER_ID : OPENAI_COMPATIBLE_PROVIDER_ID;
  return {
    model: params.model,
    modelProvider,
    runtime_mode: normalizeRuntimeMode(params.runtimeMode),
    runtime_architecture: normalizeOptionalString(params.runtimeArchitecture),
    browser_security: normalizeBrowserSecurityConfig(params.browserSecurity),
    modelReasoningEffort: params.modelReasoningEffort,
    personality: params.personality,
    modelProviders: {
      [modelProvider]: provider
    },
    env: {
      [provider.envKey]: params.apiKey.trim()
    }
  };
}
function normalizeRuntimeMode(runtimeMode) {
  switch (runtimeMode) {
    case "chat":
    case "inspect":
    case "interact":
    case "agent":
    case "chaos":
      return runtimeMode;
    default:
      return DEFAULT_RUNTIME_MODE;
  }
}
function normalizeBrowserSecurityConfig(browserSecurity) {
  const record = browserSecurity !== null && typeof browserSecurity === "object" ? browserSecurity : {};
  return {
    allowed_origins: normalizeAllowedOrigins(record.allowed_origins),
    allow_localhost: record.allow_localhost === true,
    allow_private_network: record.allow_private_network === true
  };
}
function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
function normalizeAllowedOrigins(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const normalized = value.map((entry) => normalizeOrigin(entry)).filter((entry) => entry !== null);
  return [...new Set(normalized)];
}
function normalizeOrigin(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}
function normalizeDiscoveredModels(payload, preferOpenAiOrdering) {
  const data = Array.isArray(payload.data) ? payload.data.filter((entry) => entry !== null && typeof entry === "object") : [];
  const models = data.map((entry) => normalizeDiscoveredModelEntry(entry)).filter((entry) => entry !== null);
  if (preferOpenAiOrdering) {
    const preferred = PREFERRED_API_MODELS.map((id) => models.find((model) => model.id === id)).filter((model) => model !== void 0);
    const remainder = models.filter(
      (model) => !preferred.some((preferredModel) => preferredModel.id === model.id)
    );
    return [...preferred, ...remainder].map((model, index) => ({
      ...model,
      isDefault: index === 0
    }));
  }
  return models.map((model, index) => ({
    ...model,
    isDefault: index === 0
  }));
}
function normalizeDiscoveredModelEntry(entry) {
  if (typeof entry.id !== "string" || entry.id.trim().length === 0) {
    return null;
  }
  const displayName = typeof entry.name === "string" && entry.name.trim().length > 0 ? entry.name : modelIdToDisplayName(entry.id);
  return {
    id: entry.id,
    displayName,
    description: buildModelDescription(entry),
    isDefault: false,
    showInPicker: true,
    supportsApi: true
  };
}
function buildModelDescription(entry) {
  if (typeof entry.description === "string" && entry.description.trim().length > 0) {
    return entry.description;
  }
  const parts = [
    typeof entry.provider === "string" && entry.provider.trim().length > 0 ? `provider: ${entry.provider}` : null,
    typeof entry.vendor === "string" && entry.vendor.trim().length > 0 ? `vendor: ${entry.vendor}` : null,
    typeof entry.route === "string" && entry.route.trim().length > 0 ? `route: ${entry.route}` : null
  ].filter((part) => part !== null);
  return parts.length === 0 ? null : parts.join(" | ");
}
function createHostError2(code, message, data = null) {
  return {
    code,
    message,
    retryable: false,
    data
  };
}
function isAbortError(error) {
  return error instanceof DOMException && error.name === "AbortError";
}

// codex-rs/wasm/ts/browser-runtime/src/assets.ts
var xrouterModulePromise = null;
async function loadBuildManifest(path2 = BUILD_MANIFEST_PATH, label = "pkg") {
  const response = await fetch(path2, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${label} manifest was not found (${response.status})`);
  }
  const manifest = await response.json();
  if (typeof manifest.buildId !== "string" || typeof manifest.entry !== "string" || typeof manifest.wasm !== "string") {
    throw new Error(`${label} manifest is invalid`);
  }
  return {
    buildId: manifest.buildId,
    entry: manifest.entry,
    wasm: manifest.wasm
  };
}
function toBrowserModuleUrl(path2, buildId) {
  if (/^https?:\/\//.test(path2)) {
    return appendVersionParam(path2, buildId);
  }
  return appendVersionParam(new URL(path2, window.location.origin).toString(), buildId);
}
function toBrowserAssetUrl(path2, buildId) {
  if (/^https?:\/\//.test(path2)) {
    return appendVersionParam(path2, buildId);
  }
  return appendVersionParam(new URL(path2, window.location.origin).toString(), buildId);
}
async function loadRuntimeModule() {
  const manifest = await loadBuildManifest();
  const wasm = await import(
    /* @vite-ignore */
    toBrowserModuleUrl(manifest.entry, manifest.buildId)
  );
  await wasm.default({
    module_or_path: toBrowserAssetUrl(manifest.wasm, manifest.buildId)
  });
  return wasm;
}
async function loadXrouterRuntime() {
  const existing = xrouterModulePromise;
  if (existing !== null) {
    return existing;
  }
  const promise = loadXrouterRuntimeInner();
  xrouterModulePromise = promise;
  return promise;
}
function appendVersionParam(url, buildId) {
  if (buildId === void 0 || buildId.length === 0) {
    return url;
  }
  const resolved = new URL(url, window.location.origin);
  resolved.searchParams.set("v", buildId);
  return resolved.toString();
}
async function loadXrouterRuntimeInner() {
  const manifest = await loadBuildManifest(
    XROUTER_MANIFEST_PATH,
    "xrouter-browser pkg"
  );
  const entryUrl = toBrowserModuleUrl(manifest.entry, manifest.buildId);
  const wasmUrl = toBrowserAssetUrl(manifest.wasm, manifest.buildId);
  const wasm = await import(
    /* @vite-ignore */
    entryUrl
  );
  await wasm.default({ module_or_path: wasmUrl });
  return wasm;
}

// codex-rs/wasm/ts/model-transport/src/http.ts
function candidateApiUrls(baseUrl, resource) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const urls = [`${normalizedBaseUrl}/${resource}`];
  if (!normalizedBaseUrl.endsWith("/v1") && !normalizedBaseUrl.endsWith("/api/v1")) {
    urls.push(`${normalizedBaseUrl}/v1/${resource}`);
  }
  return urls;
}
function firstResponsesApiUrl(baseUrl) {
  return candidateApiUrls(baseUrl, "responses")[0] ?? `${baseUrl.replace(/\/+$/, "")}/responses`;
}
async function sendJsonRequestWithFallback(params) {
  const uniqueUrls = [...new Set(params.urls)];
  let lastError = null;
  for (const url of uniqueUrls) {
    const response = await fetch(url, {
      method: params.method,
      signal: params.signal,
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        ...params.method === "POST" ? { "Content-Type": "application/json" } : {}
      },
      body: params.method === "POST" ? JSON.stringify(params.body ?? {}) : void 0
    });
    if (response.ok) {
      return response;
    }
    lastError = await createOpenAiLikeError(response, params.fallbackMessage, params.createError);
    if (response.status !== 404) {
      throw lastError;
    }
  }
  throw lastError ?? params.createError("openaiError", params.fallbackMessage);
}
async function createOpenAiLikeError(response, fallbackMessage, createError) {
  let detail = fallbackMessage;
  try {
    const payload = await response.json();
    if (typeof payload.error?.message === "string") {
      detail = payload.error.message;
    }
    return createError(payload.error?.code ?? "openaiError", detail, {
      status: response.status,
      type: payload.error?.type ?? null
    });
  } catch {
    const body = await response.text().catch(() => "");
    return createError("openaiError", detail, { status: response.status, body });
  }
}

// codex-rs/wasm/node_modules/openai/internal/tslib.mjs
function __classPrivateFieldSet(receiver, state, value, kind, f) {
  if (kind === "m")
    throw new TypeError("Private method is not writable");
  if (kind === "a" && !f)
    throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver))
    throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
}
function __classPrivateFieldGet(receiver, state, kind, f) {
  if (kind === "a" && !f)
    throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver))
    throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
}

// codex-rs/wasm/node_modules/openai/internal/utils/uuid.mjs
var uuid4 = function() {
  const { crypto: crypto2 } = globalThis;
  if (crypto2?.randomUUID) {
    uuid4 = crypto2.randomUUID.bind(crypto2);
    return crypto2.randomUUID();
  }
  const u8 = new Uint8Array(1);
  const randomByte = crypto2 ? () => crypto2.getRandomValues(u8)[0] : () => Math.random() * 255 & 255;
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (+c ^ randomByte() & 15 >> +c / 4).toString(16));
};

// codex-rs/wasm/node_modules/openai/internal/errors.mjs
function isAbortError2(err) {
  return typeof err === "object" && err !== null && // Spec-compliant fetch implementations
  ("name" in err && err.name === "AbortError" || // Expo fetch
  "message" in err && String(err.message).includes("FetchRequestCanceledException"));
}
var castToError = (err) => {
  if (err instanceof Error)
    return err;
  if (typeof err === "object" && err !== null) {
    try {
      if (Object.prototype.toString.call(err) === "[object Error]") {
        const error = new Error(err.message, err.cause ? { cause: err.cause } : {});
        if (err.stack)
          error.stack = err.stack;
        if (err.cause && !error.cause)
          error.cause = err.cause;
        if (err.name)
          error.name = err.name;
        return error;
      }
    } catch {
    }
    try {
      return new Error(JSON.stringify(err));
    } catch {
    }
  }
  return new Error(err);
};

// codex-rs/wasm/node_modules/openai/core/error.mjs
var OpenAIError = class extends Error {
};
var APIError = class _APIError extends OpenAIError {
  constructor(status, error, message, headers) {
    super(`${_APIError.makeMessage(status, error, message)}`);
    this.status = status;
    this.headers = headers;
    this.requestID = headers?.get("x-request-id");
    this.error = error;
    const data = error;
    this.code = data?.["code"];
    this.param = data?.["param"];
    this.type = data?.["type"];
  }
  static makeMessage(status, error, message) {
    const msg = error?.message ? typeof error.message === "string" ? error.message : JSON.stringify(error.message) : error ? JSON.stringify(error) : message;
    if (status && msg) {
      return `${status} ${msg}`;
    }
    if (status) {
      return `${status} status code (no body)`;
    }
    if (msg) {
      return msg;
    }
    return "(no status code or body)";
  }
  static generate(status, errorResponse, message, headers) {
    if (!status || !headers) {
      return new APIConnectionError({ message, cause: castToError(errorResponse) });
    }
    const error = errorResponse?.["error"];
    if (status === 400) {
      return new BadRequestError(status, error, message, headers);
    }
    if (status === 401) {
      return new AuthenticationError(status, error, message, headers);
    }
    if (status === 403) {
      return new PermissionDeniedError(status, error, message, headers);
    }
    if (status === 404) {
      return new NotFoundError(status, error, message, headers);
    }
    if (status === 409) {
      return new ConflictError(status, error, message, headers);
    }
    if (status === 422) {
      return new UnprocessableEntityError(status, error, message, headers);
    }
    if (status === 429) {
      return new RateLimitError(status, error, message, headers);
    }
    if (status >= 500) {
      return new InternalServerError(status, error, message, headers);
    }
    return new _APIError(status, error, message, headers);
  }
};
var APIUserAbortError = class extends APIError {
  constructor({ message } = {}) {
    super(void 0, void 0, message || "Request was aborted.", void 0);
  }
};
var APIConnectionError = class extends APIError {
  constructor({ message, cause }) {
    super(void 0, void 0, message || "Connection error.", void 0);
    if (cause)
      this.cause = cause;
  }
};
var APIConnectionTimeoutError = class extends APIConnectionError {
  constructor({ message } = {}) {
    super({ message: message ?? "Request timed out." });
  }
};
var BadRequestError = class extends APIError {
};
var AuthenticationError = class extends APIError {
};
var PermissionDeniedError = class extends APIError {
};
var NotFoundError = class extends APIError {
};
var ConflictError = class extends APIError {
};
var UnprocessableEntityError = class extends APIError {
};
var RateLimitError = class extends APIError {
};
var InternalServerError = class extends APIError {
};
var LengthFinishReasonError = class extends OpenAIError {
  constructor() {
    super(`Could not parse response content as the length limit was reached`);
  }
};
var ContentFilterFinishReasonError = class extends OpenAIError {
  constructor() {
    super(`Could not parse response content as the request was rejected by the content filter`);
  }
};
var InvalidWebhookSignatureError = class extends Error {
  constructor(message) {
    super(message);
  }
};

// codex-rs/wasm/node_modules/openai/internal/utils/values.mjs
var startsWithSchemeRegexp = /^[a-z][a-z0-9+.-]*:/i;
var isAbsoluteURL = (url) => {
  return startsWithSchemeRegexp.test(url);
};
var isArray = (val) => (isArray = Array.isArray, isArray(val));
var isReadonlyArray = isArray;
function maybeObj(x) {
  if (typeof x !== "object") {
    return {};
  }
  return x ?? {};
}
function isEmptyObj(obj) {
  if (!obj)
    return true;
  for (const _k in obj)
    return false;
  return true;
}
function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}
function isObj(obj) {
  return obj != null && typeof obj === "object" && !Array.isArray(obj);
}
var validatePositiveInteger = (name, n) => {
  if (typeof n !== "number" || !Number.isInteger(n)) {
    throw new OpenAIError(`${name} must be an integer`);
  }
  if (n < 0) {
    throw new OpenAIError(`${name} must be a positive integer`);
  }
  return n;
};
var safeJSON = (text) => {
  try {
    return JSON.parse(text);
  } catch (err) {
    return void 0;
  }
};

// codex-rs/wasm/node_modules/openai/internal/utils/sleep.mjs
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// codex-rs/wasm/node_modules/openai/version.mjs
var VERSION = "6.31.0";

// codex-rs/wasm/node_modules/openai/internal/detect-platform.mjs
var isRunningInBrowser = () => {
  return (
    // @ts-ignore
    typeof window !== "undefined" && // @ts-ignore
    typeof window.document !== "undefined" && // @ts-ignore
    typeof navigator !== "undefined"
  );
};
function getDetectedPlatform() {
  if (typeof Deno !== "undefined" && Deno.build != null) {
    return "deno";
  }
  if (typeof EdgeRuntime !== "undefined") {
    return "edge";
  }
  if (Object.prototype.toString.call(typeof globalThis.process !== "undefined" ? globalThis.process : 0) === "[object process]") {
    return "node";
  }
  return "unknown";
}
var getPlatformProperties = () => {
  const detectedPlatform = getDetectedPlatform();
  if (detectedPlatform === "deno") {
    return {
      "X-Stainless-Lang": "js",
      "X-Stainless-Package-Version": VERSION,
      "X-Stainless-OS": normalizePlatform(Deno.build.os),
      "X-Stainless-Arch": normalizeArch(Deno.build.arch),
      "X-Stainless-Runtime": "deno",
      "X-Stainless-Runtime-Version": typeof Deno.version === "string" ? Deno.version : Deno.version?.deno ?? "unknown"
    };
  }
  if (typeof EdgeRuntime !== "undefined") {
    return {
      "X-Stainless-Lang": "js",
      "X-Stainless-Package-Version": VERSION,
      "X-Stainless-OS": "Unknown",
      "X-Stainless-Arch": `other:${EdgeRuntime}`,
      "X-Stainless-Runtime": "edge",
      "X-Stainless-Runtime-Version": globalThis.process.version
    };
  }
  if (detectedPlatform === "node") {
    return {
      "X-Stainless-Lang": "js",
      "X-Stainless-Package-Version": VERSION,
      "X-Stainless-OS": normalizePlatform(globalThis.process.platform ?? "unknown"),
      "X-Stainless-Arch": normalizeArch(globalThis.process.arch ?? "unknown"),
      "X-Stainless-Runtime": "node",
      "X-Stainless-Runtime-Version": globalThis.process.version ?? "unknown"
    };
  }
  const browserInfo = getBrowserInfo();
  if (browserInfo) {
    return {
      "X-Stainless-Lang": "js",
      "X-Stainless-Package-Version": VERSION,
      "X-Stainless-OS": "Unknown",
      "X-Stainless-Arch": "unknown",
      "X-Stainless-Runtime": `browser:${browserInfo.browser}`,
      "X-Stainless-Runtime-Version": browserInfo.version
    };
  }
  return {
    "X-Stainless-Lang": "js",
    "X-Stainless-Package-Version": VERSION,
    "X-Stainless-OS": "Unknown",
    "X-Stainless-Arch": "unknown",
    "X-Stainless-Runtime": "unknown",
    "X-Stainless-Runtime-Version": "unknown"
  };
};
function getBrowserInfo() {
  if (typeof navigator === "undefined" || !navigator) {
    return null;
  }
  const browserPatterns = [
    { key: "edge", pattern: /Edge(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
    { key: "ie", pattern: /MSIE(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
    { key: "ie", pattern: /Trident(?:.*rv\:(\d+)\.(\d+)(?:\.(\d+))?)?/ },
    { key: "chrome", pattern: /Chrome(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
    { key: "firefox", pattern: /Firefox(?:\W+(\d+)\.(\d+)(?:\.(\d+))?)?/ },
    { key: "safari", pattern: /(?:Version\W+(\d+)\.(\d+)(?:\.(\d+))?)?(?:\W+Mobile\S*)?\W+Safari/ }
  ];
  for (const { key, pattern } of browserPatterns) {
    const match = pattern.exec(navigator.userAgent);
    if (match) {
      const major = match[1] || 0;
      const minor = match[2] || 0;
      const patch = match[3] || 0;
      return { browser: key, version: `${major}.${minor}.${patch}` };
    }
  }
  return null;
}
var normalizeArch = (arch) => {
  if (arch === "x32")
    return "x32";
  if (arch === "x86_64" || arch === "x64")
    return "x64";
  if (arch === "arm")
    return "arm";
  if (arch === "aarch64" || arch === "arm64")
    return "arm64";
  if (arch)
    return `other:${arch}`;
  return "unknown";
};
var normalizePlatform = (platform) => {
  platform = platform.toLowerCase();
  if (platform.includes("ios"))
    return "iOS";
  if (platform === "android")
    return "Android";
  if (platform === "darwin")
    return "MacOS";
  if (platform === "win32")
    return "Windows";
  if (platform === "freebsd")
    return "FreeBSD";
  if (platform === "openbsd")
    return "OpenBSD";
  if (platform === "linux")
    return "Linux";
  if (platform)
    return `Other:${platform}`;
  return "Unknown";
};
var _platformHeaders;
var getPlatformHeaders = () => {
  return _platformHeaders ?? (_platformHeaders = getPlatformProperties());
};

// codex-rs/wasm/node_modules/openai/internal/shims.mjs
function getDefaultFetch() {
  if (typeof fetch !== "undefined") {
    return fetch;
  }
  throw new Error("`fetch` is not defined as a global; Either pass `fetch` to the client, `new OpenAI({ fetch })` or polyfill the global, `globalThis.fetch = fetch`");
}
function makeReadableStream(...args) {
  const ReadableStream = globalThis.ReadableStream;
  if (typeof ReadableStream === "undefined") {
    throw new Error("`ReadableStream` is not defined as a global; You will need to polyfill it, `globalThis.ReadableStream = ReadableStream`");
  }
  return new ReadableStream(...args);
}
function ReadableStreamFrom(iterable) {
  let iter = Symbol.asyncIterator in iterable ? iterable[Symbol.asyncIterator]() : iterable[Symbol.iterator]();
  return makeReadableStream({
    start() {
    },
    async pull(controller) {
      const { done, value } = await iter.next();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(value);
      }
    },
    async cancel() {
      await iter.return?.();
    }
  });
}
function ReadableStreamToAsyncIterable(stream) {
  if (stream[Symbol.asyncIterator])
    return stream;
  const reader = stream.getReader();
  return {
    async next() {
      try {
        const result = await reader.read();
        if (result?.done)
          reader.releaseLock();
        return result;
      } catch (e) {
        reader.releaseLock();
        throw e;
      }
    },
    async return() {
      const cancelPromise = reader.cancel();
      reader.releaseLock();
      await cancelPromise;
      return { done: true, value: void 0 };
    },
    [Symbol.asyncIterator]() {
      return this;
    }
  };
}
async function CancelReadableStream(stream) {
  if (stream === null || typeof stream !== "object")
    return;
  if (stream[Symbol.asyncIterator]) {
    await stream[Symbol.asyncIterator]().return?.();
    return;
  }
  const reader = stream.getReader();
  const cancelPromise = reader.cancel();
  reader.releaseLock();
  await cancelPromise;
}

// codex-rs/wasm/node_modules/openai/internal/request-options.mjs
var FallbackEncoder = ({ headers, body }) => {
  return {
    bodyHeaders: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  };
};

// codex-rs/wasm/node_modules/openai/internal/qs/formats.mjs
var default_format = "RFC3986";
var default_formatter = (v) => String(v);
var formatters = {
  RFC1738: (v) => String(v).replace(/%20/g, "+"),
  RFC3986: default_formatter
};
var RFC1738 = "RFC1738";

// codex-rs/wasm/node_modules/openai/internal/qs/utils.mjs
var has = (obj, key) => (has = Object.hasOwn ?? Function.prototype.call.bind(Object.prototype.hasOwnProperty), has(obj, key));
var hex_table = /* @__PURE__ */ (() => {
  const array = [];
  for (let i = 0; i < 256; ++i) {
    array.push("%" + ((i < 16 ? "0" : "") + i.toString(16)).toUpperCase());
  }
  return array;
})();
var limit = 1024;
var encode = (str2, _defaultEncoder, charset, _kind, format) => {
  if (str2.length === 0) {
    return str2;
  }
  let string = str2;
  if (typeof str2 === "symbol") {
    string = Symbol.prototype.toString.call(str2);
  } else if (typeof str2 !== "string") {
    string = String(str2);
  }
  if (charset === "iso-8859-1") {
    return escape(string).replace(/%u[0-9a-f]{4}/gi, function($0) {
      return "%26%23" + parseInt($0.slice(2), 16) + "%3B";
    });
  }
  let out = "";
  for (let j = 0; j < string.length; j += limit) {
    const segment = string.length >= limit ? string.slice(j, j + limit) : string;
    const arr = [];
    for (let i = 0; i < segment.length; ++i) {
      let c = segment.charCodeAt(i);
      if (c === 45 || // -
      c === 46 || // .
      c === 95 || // _
      c === 126 || // ~
      c >= 48 && c <= 57 || // 0-9
      c >= 65 && c <= 90 || // a-z
      c >= 97 && c <= 122 || // A-Z
      format === RFC1738 && (c === 40 || c === 41)) {
        arr[arr.length] = segment.charAt(i);
        continue;
      }
      if (c < 128) {
        arr[arr.length] = hex_table[c];
        continue;
      }
      if (c < 2048) {
        arr[arr.length] = hex_table[192 | c >> 6] + hex_table[128 | c & 63];
        continue;
      }
      if (c < 55296 || c >= 57344) {
        arr[arr.length] = hex_table[224 | c >> 12] + hex_table[128 | c >> 6 & 63] + hex_table[128 | c & 63];
        continue;
      }
      i += 1;
      c = 65536 + ((c & 1023) << 10 | segment.charCodeAt(i) & 1023);
      arr[arr.length] = hex_table[240 | c >> 18] + hex_table[128 | c >> 12 & 63] + hex_table[128 | c >> 6 & 63] + hex_table[128 | c & 63];
    }
    out += arr.join("");
  }
  return out;
};
function is_buffer(obj) {
  if (!obj || typeof obj !== "object") {
    return false;
  }
  return !!(obj.constructor && obj.constructor.isBuffer && obj.constructor.isBuffer(obj));
}
function maybe_map(val, fn) {
  if (isArray(val)) {
    const mapped = [];
    for (let i = 0; i < val.length; i += 1) {
      mapped.push(fn(val[i]));
    }
    return mapped;
  }
  return fn(val);
}

// codex-rs/wasm/node_modules/openai/internal/qs/stringify.mjs
var array_prefix_generators = {
  brackets(prefix) {
    return String(prefix) + "[]";
  },
  comma: "comma",
  indices(prefix, key) {
    return String(prefix) + "[" + key + "]";
  },
  repeat(prefix) {
    return String(prefix);
  }
};
var push_to_array = function(arr, value_or_array) {
  Array.prototype.push.apply(arr, isArray(value_or_array) ? value_or_array : [value_or_array]);
};
var toISOString;
var defaults = {
  addQueryPrefix: false,
  allowDots: false,
  allowEmptyArrays: false,
  arrayFormat: "indices",
  charset: "utf-8",
  charsetSentinel: false,
  delimiter: "&",
  encode: true,
  encodeDotInKeys: false,
  encoder: encode,
  encodeValuesOnly: false,
  format: default_format,
  formatter: default_formatter,
  /** @deprecated */
  indices: false,
  serializeDate(date) {
    return (toISOString ?? (toISOString = Function.prototype.call.bind(Date.prototype.toISOString)))(date);
  },
  skipNulls: false,
  strictNullHandling: false
};
function is_non_nullish_primitive(v) {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean" || typeof v === "symbol" || typeof v === "bigint";
}
var sentinel = {};
function inner_stringify(object, prefix, generateArrayPrefix, commaRoundTrip, allowEmptyArrays, strictNullHandling, skipNulls, encodeDotInKeys, encoder, filter, sort, allowDots, serializeDate, format, formatter, encodeValuesOnly, charset, sideChannel) {
  let obj = object;
  let tmp_sc = sideChannel;
  let step = 0;
  let find_flag = false;
  while ((tmp_sc = tmp_sc.get(sentinel)) !== void 0 && !find_flag) {
    const pos = tmp_sc.get(object);
    step += 1;
    if (typeof pos !== "undefined") {
      if (pos === step) {
        throw new RangeError("Cyclic object value");
      } else {
        find_flag = true;
      }
    }
    if (typeof tmp_sc.get(sentinel) === "undefined") {
      step = 0;
    }
  }
  if (typeof filter === "function") {
    obj = filter(prefix, obj);
  } else if (obj instanceof Date) {
    obj = serializeDate?.(obj);
  } else if (generateArrayPrefix === "comma" && isArray(obj)) {
    obj = maybe_map(obj, function(value) {
      if (value instanceof Date) {
        return serializeDate?.(value);
      }
      return value;
    });
  }
  if (obj === null) {
    if (strictNullHandling) {
      return encoder && !encodeValuesOnly ? (
        // @ts-expect-error
        encoder(prefix, defaults.encoder, charset, "key", format)
      ) : prefix;
    }
    obj = "";
  }
  if (is_non_nullish_primitive(obj) || is_buffer(obj)) {
    if (encoder) {
      const key_value = encodeValuesOnly ? prefix : encoder(prefix, defaults.encoder, charset, "key", format);
      return [
        formatter?.(key_value) + "=" + // @ts-expect-error
        formatter?.(encoder(obj, defaults.encoder, charset, "value", format))
      ];
    }
    return [formatter?.(prefix) + "=" + formatter?.(String(obj))];
  }
  const values = [];
  if (typeof obj === "undefined") {
    return values;
  }
  let obj_keys;
  if (generateArrayPrefix === "comma" && isArray(obj)) {
    if (encodeValuesOnly && encoder) {
      obj = maybe_map(obj, encoder);
    }
    obj_keys = [{ value: obj.length > 0 ? obj.join(",") || null : void 0 }];
  } else if (isArray(filter)) {
    obj_keys = filter;
  } else {
    const keys = Object.keys(obj);
    obj_keys = sort ? keys.sort(sort) : keys;
  }
  const encoded_prefix = encodeDotInKeys ? String(prefix).replace(/\./g, "%2E") : String(prefix);
  const adjusted_prefix = commaRoundTrip && isArray(obj) && obj.length === 1 ? encoded_prefix + "[]" : encoded_prefix;
  if (allowEmptyArrays && isArray(obj) && obj.length === 0) {
    return adjusted_prefix + "[]";
  }
  for (let j = 0; j < obj_keys.length; ++j) {
    const key = obj_keys[j];
    const value = (
      // @ts-ignore
      typeof key === "object" && typeof key.value !== "undefined" ? key.value : obj[key]
    );
    if (skipNulls && value === null) {
      continue;
    }
    const encoded_key = allowDots && encodeDotInKeys ? key.replace(/\./g, "%2E") : key;
    const key_prefix = isArray(obj) ? typeof generateArrayPrefix === "function" ? generateArrayPrefix(adjusted_prefix, encoded_key) : adjusted_prefix : adjusted_prefix + (allowDots ? "." + encoded_key : "[" + encoded_key + "]");
    sideChannel.set(object, step);
    const valueSideChannel = /* @__PURE__ */ new WeakMap();
    valueSideChannel.set(sentinel, sideChannel);
    push_to_array(values, inner_stringify(
      value,
      key_prefix,
      generateArrayPrefix,
      commaRoundTrip,
      allowEmptyArrays,
      strictNullHandling,
      skipNulls,
      encodeDotInKeys,
      // @ts-ignore
      generateArrayPrefix === "comma" && encodeValuesOnly && isArray(obj) ? null : encoder,
      filter,
      sort,
      allowDots,
      serializeDate,
      format,
      formatter,
      encodeValuesOnly,
      charset,
      valueSideChannel
    ));
  }
  return values;
}
function normalize_stringify_options(opts = defaults) {
  if (typeof opts.allowEmptyArrays !== "undefined" && typeof opts.allowEmptyArrays !== "boolean") {
    throw new TypeError("`allowEmptyArrays` option can only be `true` or `false`, when provided");
  }
  if (typeof opts.encodeDotInKeys !== "undefined" && typeof opts.encodeDotInKeys !== "boolean") {
    throw new TypeError("`encodeDotInKeys` option can only be `true` or `false`, when provided");
  }
  if (opts.encoder !== null && typeof opts.encoder !== "undefined" && typeof opts.encoder !== "function") {
    throw new TypeError("Encoder has to be a function.");
  }
  const charset = opts.charset || defaults.charset;
  if (typeof opts.charset !== "undefined" && opts.charset !== "utf-8" && opts.charset !== "iso-8859-1") {
    throw new TypeError("The charset option must be either utf-8, iso-8859-1, or undefined");
  }
  let format = default_format;
  if (typeof opts.format !== "undefined") {
    if (!has(formatters, opts.format)) {
      throw new TypeError("Unknown format option provided.");
    }
    format = opts.format;
  }
  const formatter = formatters[format];
  let filter = defaults.filter;
  if (typeof opts.filter === "function" || isArray(opts.filter)) {
    filter = opts.filter;
  }
  let arrayFormat;
  if (opts.arrayFormat && opts.arrayFormat in array_prefix_generators) {
    arrayFormat = opts.arrayFormat;
  } else if ("indices" in opts) {
    arrayFormat = opts.indices ? "indices" : "repeat";
  } else {
    arrayFormat = defaults.arrayFormat;
  }
  if ("commaRoundTrip" in opts && typeof opts.commaRoundTrip !== "boolean") {
    throw new TypeError("`commaRoundTrip` must be a boolean, or absent");
  }
  const allowDots = typeof opts.allowDots === "undefined" ? !!opts.encodeDotInKeys === true ? true : defaults.allowDots : !!opts.allowDots;
  return {
    addQueryPrefix: typeof opts.addQueryPrefix === "boolean" ? opts.addQueryPrefix : defaults.addQueryPrefix,
    // @ts-ignore
    allowDots,
    allowEmptyArrays: typeof opts.allowEmptyArrays === "boolean" ? !!opts.allowEmptyArrays : defaults.allowEmptyArrays,
    arrayFormat,
    charset,
    charsetSentinel: typeof opts.charsetSentinel === "boolean" ? opts.charsetSentinel : defaults.charsetSentinel,
    commaRoundTrip: !!opts.commaRoundTrip,
    delimiter: typeof opts.delimiter === "undefined" ? defaults.delimiter : opts.delimiter,
    encode: typeof opts.encode === "boolean" ? opts.encode : defaults.encode,
    encodeDotInKeys: typeof opts.encodeDotInKeys === "boolean" ? opts.encodeDotInKeys : defaults.encodeDotInKeys,
    encoder: typeof opts.encoder === "function" ? opts.encoder : defaults.encoder,
    encodeValuesOnly: typeof opts.encodeValuesOnly === "boolean" ? opts.encodeValuesOnly : defaults.encodeValuesOnly,
    filter,
    format,
    formatter,
    serializeDate: typeof opts.serializeDate === "function" ? opts.serializeDate : defaults.serializeDate,
    skipNulls: typeof opts.skipNulls === "boolean" ? opts.skipNulls : defaults.skipNulls,
    // @ts-ignore
    sort: typeof opts.sort === "function" ? opts.sort : null,
    strictNullHandling: typeof opts.strictNullHandling === "boolean" ? opts.strictNullHandling : defaults.strictNullHandling
  };
}
function stringify(object, opts = {}) {
  let obj = object;
  const options = normalize_stringify_options(opts);
  let obj_keys;
  let filter;
  if (typeof options.filter === "function") {
    filter = options.filter;
    obj = filter("", obj);
  } else if (isArray(options.filter)) {
    filter = options.filter;
    obj_keys = filter;
  }
  const keys = [];
  if (typeof obj !== "object" || obj === null) {
    return "";
  }
  const generateArrayPrefix = array_prefix_generators[options.arrayFormat];
  const commaRoundTrip = generateArrayPrefix === "comma" && options.commaRoundTrip;
  if (!obj_keys) {
    obj_keys = Object.keys(obj);
  }
  if (options.sort) {
    obj_keys.sort(options.sort);
  }
  const sideChannel = /* @__PURE__ */ new WeakMap();
  for (let i = 0; i < obj_keys.length; ++i) {
    const key = obj_keys[i];
    if (options.skipNulls && obj[key] === null) {
      continue;
    }
    push_to_array(keys, inner_stringify(
      obj[key],
      key,
      // @ts-expect-error
      generateArrayPrefix,
      commaRoundTrip,
      options.allowEmptyArrays,
      options.strictNullHandling,
      options.skipNulls,
      options.encodeDotInKeys,
      options.encode ? options.encoder : null,
      options.filter,
      options.sort,
      options.allowDots,
      options.serializeDate,
      options.format,
      options.formatter,
      options.encodeValuesOnly,
      options.charset,
      sideChannel
    ));
  }
  const joined = keys.join(options.delimiter);
  let prefix = options.addQueryPrefix === true ? "?" : "";
  if (options.charsetSentinel) {
    if (options.charset === "iso-8859-1") {
      prefix += "utf8=%26%2310003%3B&";
    } else {
      prefix += "utf8=%E2%9C%93&";
    }
  }
  return joined.length > 0 ? prefix + joined : "";
}

// codex-rs/wasm/node_modules/openai/internal/utils/query.mjs
function stringifyQuery(query) {
  return stringify(query, { arrayFormat: "brackets" });
}

// codex-rs/wasm/node_modules/openai/internal/utils/bytes.mjs
function concatBytes(buffers) {
  let length = 0;
  for (const buffer of buffers) {
    length += buffer.length;
  }
  const output = new Uint8Array(length);
  let index = 0;
  for (const buffer of buffers) {
    output.set(buffer, index);
    index += buffer.length;
  }
  return output;
}
var encodeUTF8_;
function encodeUTF8(str2) {
  let encoder;
  return (encodeUTF8_ ?? (encoder = new globalThis.TextEncoder(), encodeUTF8_ = encoder.encode.bind(encoder)))(str2);
}
var decodeUTF8_;
function decodeUTF8(bytes) {
  let decoder;
  return (decodeUTF8_ ?? (decoder = new globalThis.TextDecoder(), decodeUTF8_ = decoder.decode.bind(decoder)))(bytes);
}

// codex-rs/wasm/node_modules/openai/internal/decoders/line.mjs
var _LineDecoder_buffer;
var _LineDecoder_carriageReturnIndex;
var LineDecoder = class {
  constructor() {
    _LineDecoder_buffer.set(this, void 0);
    _LineDecoder_carriageReturnIndex.set(this, void 0);
    __classPrivateFieldSet(this, _LineDecoder_buffer, new Uint8Array(), "f");
    __classPrivateFieldSet(this, _LineDecoder_carriageReturnIndex, null, "f");
  }
  decode(chunk) {
    if (chunk == null) {
      return [];
    }
    const binaryChunk = chunk instanceof ArrayBuffer ? new Uint8Array(chunk) : typeof chunk === "string" ? encodeUTF8(chunk) : chunk;
    __classPrivateFieldSet(this, _LineDecoder_buffer, concatBytes([__classPrivateFieldGet(this, _LineDecoder_buffer, "f"), binaryChunk]), "f");
    const lines = [];
    let patternIndex;
    while ((patternIndex = findNewlineIndex(__classPrivateFieldGet(this, _LineDecoder_buffer, "f"), __classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f"))) != null) {
      if (patternIndex.carriage && __classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f") == null) {
        __classPrivateFieldSet(this, _LineDecoder_carriageReturnIndex, patternIndex.index, "f");
        continue;
      }
      if (__classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f") != null && (patternIndex.index !== __classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f") + 1 || patternIndex.carriage)) {
        lines.push(decodeUTF8(__classPrivateFieldGet(this, _LineDecoder_buffer, "f").subarray(0, __classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f") - 1)));
        __classPrivateFieldSet(this, _LineDecoder_buffer, __classPrivateFieldGet(this, _LineDecoder_buffer, "f").subarray(__classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f")), "f");
        __classPrivateFieldSet(this, _LineDecoder_carriageReturnIndex, null, "f");
        continue;
      }
      const endIndex = __classPrivateFieldGet(this, _LineDecoder_carriageReturnIndex, "f") !== null ? patternIndex.preceding - 1 : patternIndex.preceding;
      const line = decodeUTF8(__classPrivateFieldGet(this, _LineDecoder_buffer, "f").subarray(0, endIndex));
      lines.push(line);
      __classPrivateFieldSet(this, _LineDecoder_buffer, __classPrivateFieldGet(this, _LineDecoder_buffer, "f").subarray(patternIndex.index), "f");
      __classPrivateFieldSet(this, _LineDecoder_carriageReturnIndex, null, "f");
    }
    return lines;
  }
  flush() {
    if (!__classPrivateFieldGet(this, _LineDecoder_buffer, "f").length) {
      return [];
    }
    return this.decode("\n");
  }
};
_LineDecoder_buffer = /* @__PURE__ */ new WeakMap(), _LineDecoder_carriageReturnIndex = /* @__PURE__ */ new WeakMap();
LineDecoder.NEWLINE_CHARS = /* @__PURE__ */ new Set(["\n", "\r"]);
LineDecoder.NEWLINE_REGEXP = /\r\n|[\n\r]/g;
function findNewlineIndex(buffer, startIndex) {
  const newline = 10;
  const carriage = 13;
  for (let i = startIndex ?? 0; i < buffer.length; i++) {
    if (buffer[i] === newline) {
      return { preceding: i, index: i + 1, carriage: false };
    }
    if (buffer[i] === carriage) {
      return { preceding: i, index: i + 1, carriage: true };
    }
  }
  return null;
}
function findDoubleNewlineIndex(buffer) {
  const newline = 10;
  const carriage = 13;
  for (let i = 0; i < buffer.length - 1; i++) {
    if (buffer[i] === newline && buffer[i + 1] === newline) {
      return i + 2;
    }
    if (buffer[i] === carriage && buffer[i + 1] === carriage) {
      return i + 2;
    }
    if (buffer[i] === carriage && buffer[i + 1] === newline && i + 3 < buffer.length && buffer[i + 2] === carriage && buffer[i + 3] === newline) {
      return i + 4;
    }
  }
  return -1;
}

// codex-rs/wasm/node_modules/openai/internal/utils/log.mjs
var levelNumbers = {
  off: 0,
  error: 200,
  warn: 300,
  info: 400,
  debug: 500
};
var parseLogLevel = (maybeLevel, sourceName, client) => {
  if (!maybeLevel) {
    return void 0;
  }
  if (hasOwn(levelNumbers, maybeLevel)) {
    return maybeLevel;
  }
  loggerFor(client).warn(`${sourceName} was set to ${JSON.stringify(maybeLevel)}, expected one of ${JSON.stringify(Object.keys(levelNumbers))}`);
  return void 0;
};
function noop() {
}
function makeLogFn(fnLevel, logger, logLevel) {
  if (!logger || levelNumbers[fnLevel] > levelNumbers[logLevel]) {
    return noop;
  } else {
    return logger[fnLevel].bind(logger);
  }
}
var noopLogger = {
  error: noop,
  warn: noop,
  info: noop,
  debug: noop
};
var cachedLoggers = /* @__PURE__ */ new WeakMap();
function loggerFor(client) {
  const logger = client.logger;
  const logLevel = client.logLevel ?? "off";
  if (!logger) {
    return noopLogger;
  }
  const cachedLogger = cachedLoggers.get(logger);
  if (cachedLogger && cachedLogger[0] === logLevel) {
    return cachedLogger[1];
  }
  const levelLogger = {
    error: makeLogFn("error", logger, logLevel),
    warn: makeLogFn("warn", logger, logLevel),
    info: makeLogFn("info", logger, logLevel),
    debug: makeLogFn("debug", logger, logLevel)
  };
  cachedLoggers.set(logger, [logLevel, levelLogger]);
  return levelLogger;
}
var formatRequestDetails = (details) => {
  if (details.options) {
    details.options = { ...details.options };
    delete details.options["headers"];
  }
  if (details.headers) {
    details.headers = Object.fromEntries((details.headers instanceof Headers ? [...details.headers] : Object.entries(details.headers)).map(([name, value]) => [
      name,
      name.toLowerCase() === "authorization" || name.toLowerCase() === "cookie" || name.toLowerCase() === "set-cookie" ? "***" : value
    ]));
  }
  if ("retryOfRequestLogID" in details) {
    if (details.retryOfRequestLogID) {
      details.retryOf = details.retryOfRequestLogID;
    }
    delete details.retryOfRequestLogID;
  }
  return details;
};

// codex-rs/wasm/node_modules/openai/core/streaming.mjs
var _Stream_client;
var Stream = class _Stream {
  constructor(iterator, controller, client) {
    this.iterator = iterator;
    _Stream_client.set(this, void 0);
    this.controller = controller;
    __classPrivateFieldSet(this, _Stream_client, client, "f");
  }
  static fromSSEResponse(response, controller, client, synthesizeEventData) {
    let consumed = false;
    const logger = client ? loggerFor(client) : console;
    async function* iterator() {
      if (consumed) {
        throw new OpenAIError("Cannot iterate over a consumed stream, use `.tee()` to split the stream.");
      }
      consumed = true;
      let done = false;
      try {
        for await (const sse of _iterSSEMessages(response, controller)) {
          if (done)
            continue;
          if (sse.data.startsWith("[DONE]")) {
            done = true;
            continue;
          }
          if (sse.event === null || !sse.event.startsWith("thread.")) {
            let data;
            try {
              data = JSON.parse(sse.data);
            } catch (e) {
              logger.error(`Could not parse message into JSON:`, sse.data);
              logger.error(`From chunk:`, sse.raw);
              throw e;
            }
            if (data && data.error) {
              throw new APIError(void 0, data.error, void 0, response.headers);
            }
            yield synthesizeEventData ? { event: sse.event, data } : data;
          } else {
            let data;
            try {
              data = JSON.parse(sse.data);
            } catch (e) {
              console.error(`Could not parse message into JSON:`, sse.data);
              console.error(`From chunk:`, sse.raw);
              throw e;
            }
            if (sse.event == "error") {
              throw new APIError(void 0, data.error, data.message, void 0);
            }
            yield { event: sse.event, data };
          }
        }
        done = true;
      } catch (e) {
        if (isAbortError2(e))
          return;
        throw e;
      } finally {
        if (!done)
          controller.abort();
      }
    }
    return new _Stream(iterator, controller, client);
  }
  /**
   * Generates a Stream from a newline-separated ReadableStream
   * where each item is a JSON value.
   */
  static fromReadableStream(readableStream, controller, client) {
    let consumed = false;
    async function* iterLines() {
      const lineDecoder = new LineDecoder();
      const iter = ReadableStreamToAsyncIterable(readableStream);
      for await (const chunk of iter) {
        for (const line of lineDecoder.decode(chunk)) {
          yield line;
        }
      }
      for (const line of lineDecoder.flush()) {
        yield line;
      }
    }
    async function* iterator() {
      if (consumed) {
        throw new OpenAIError("Cannot iterate over a consumed stream, use `.tee()` to split the stream.");
      }
      consumed = true;
      let done = false;
      try {
        for await (const line of iterLines()) {
          if (done)
            continue;
          if (line)
            yield JSON.parse(line);
        }
        done = true;
      } catch (e) {
        if (isAbortError2(e))
          return;
        throw e;
      } finally {
        if (!done)
          controller.abort();
      }
    }
    return new _Stream(iterator, controller, client);
  }
  [(_Stream_client = /* @__PURE__ */ new WeakMap(), Symbol.asyncIterator)]() {
    return this.iterator();
  }
  /**
   * Splits the stream into two streams which can be
   * independently read from at different speeds.
   */
  tee() {
    const left = [];
    const right = [];
    const iterator = this.iterator();
    const teeIterator = (queue) => {
      return {
        next: () => {
          if (queue.length === 0) {
            const result = iterator.next();
            left.push(result);
            right.push(result);
          }
          return queue.shift();
        }
      };
    };
    return [
      new _Stream(() => teeIterator(left), this.controller, __classPrivateFieldGet(this, _Stream_client, "f")),
      new _Stream(() => teeIterator(right), this.controller, __classPrivateFieldGet(this, _Stream_client, "f"))
    ];
  }
  /**
   * Converts this stream to a newline-separated ReadableStream of
   * JSON stringified values in the stream
   * which can be turned back into a Stream with `Stream.fromReadableStream()`.
   */
  toReadableStream() {
    const self = this;
    let iter;
    return makeReadableStream({
      async start() {
        iter = self[Symbol.asyncIterator]();
      },
      async pull(ctrl) {
        try {
          const { value, done } = await iter.next();
          if (done)
            return ctrl.close();
          const bytes = encodeUTF8(JSON.stringify(value) + "\n");
          ctrl.enqueue(bytes);
        } catch (err) {
          ctrl.error(err);
        }
      },
      async cancel() {
        await iter.return?.();
      }
    });
  }
};
async function* _iterSSEMessages(response, controller) {
  if (!response.body) {
    controller.abort();
    if (typeof globalThis.navigator !== "undefined" && globalThis.navigator.product === "ReactNative") {
      throw new OpenAIError(`The default react-native fetch implementation does not support streaming. Please use expo/fetch: https://docs.expo.dev/versions/latest/sdk/expo/#expofetch-api`);
    }
    throw new OpenAIError(`Attempted to iterate over a response with no body`);
  }
  const sseDecoder = new SSEDecoder();
  const lineDecoder = new LineDecoder();
  const iter = ReadableStreamToAsyncIterable(response.body);
  for await (const sseChunk of iterSSEChunks(iter)) {
    for (const line of lineDecoder.decode(sseChunk)) {
      const sse = sseDecoder.decode(line);
      if (sse)
        yield sse;
    }
  }
  for (const line of lineDecoder.flush()) {
    const sse = sseDecoder.decode(line);
    if (sse)
      yield sse;
  }
}
async function* iterSSEChunks(iterator) {
  let data = new Uint8Array();
  for await (const chunk of iterator) {
    if (chunk == null) {
      continue;
    }
    const binaryChunk = chunk instanceof ArrayBuffer ? new Uint8Array(chunk) : typeof chunk === "string" ? encodeUTF8(chunk) : chunk;
    let newData = new Uint8Array(data.length + binaryChunk.length);
    newData.set(data);
    newData.set(binaryChunk, data.length);
    data = newData;
    let patternIndex;
    while ((patternIndex = findDoubleNewlineIndex(data)) !== -1) {
      yield data.slice(0, patternIndex);
      data = data.slice(patternIndex);
    }
  }
  if (data.length > 0) {
    yield data;
  }
}
var SSEDecoder = class {
  constructor() {
    this.event = null;
    this.data = [];
    this.chunks = [];
  }
  decode(line) {
    if (line.endsWith("\r")) {
      line = line.substring(0, line.length - 1);
    }
    if (!line) {
      if (!this.event && !this.data.length)
        return null;
      const sse = {
        event: this.event,
        data: this.data.join("\n"),
        raw: this.chunks
      };
      this.event = null;
      this.data = [];
      this.chunks = [];
      return sse;
    }
    this.chunks.push(line);
    if (line.startsWith(":")) {
      return null;
    }
    let [fieldname, _, value] = partition(line, ":");
    if (value.startsWith(" ")) {
      value = value.substring(1);
    }
    if (fieldname === "event") {
      this.event = value;
    } else if (fieldname === "data") {
      this.data.push(value);
    }
    return null;
  }
};
function partition(str2, delimiter) {
  const index = str2.indexOf(delimiter);
  if (index !== -1) {
    return [str2.substring(0, index), delimiter, str2.substring(index + delimiter.length)];
  }
  return [str2, "", ""];
}

// codex-rs/wasm/node_modules/openai/internal/parse.mjs
async function defaultParseResponse(client, props) {
  const { response, requestLogID, retryOfRequestLogID, startTime } = props;
  const body = await (async () => {
    if (props.options.stream) {
      loggerFor(client).debug("response", response.status, response.url, response.headers, response.body);
      if (props.options.__streamClass) {
        return props.options.__streamClass.fromSSEResponse(response, props.controller, client, props.options.__synthesizeEventData);
      }
      return Stream.fromSSEResponse(response, props.controller, client, props.options.__synthesizeEventData);
    }
    if (response.status === 204) {
      return null;
    }
    if (props.options.__binaryResponse) {
      return response;
    }
    const contentType = response.headers.get("content-type");
    const mediaType = contentType?.split(";")[0]?.trim();
    const isJSON = mediaType?.includes("application/json") || mediaType?.endsWith("+json");
    if (isJSON) {
      const contentLength = response.headers.get("content-length");
      if (contentLength === "0") {
        return void 0;
      }
      const json = await response.json();
      return addRequestID(json, response);
    }
    const text = await response.text();
    return text;
  })();
  loggerFor(client).debug(`[${requestLogID}] response parsed`, formatRequestDetails({
    retryOfRequestLogID,
    url: response.url,
    status: response.status,
    body,
    durationMs: Date.now() - startTime
  }));
  return body;
}
function addRequestID(value, response) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  return Object.defineProperty(value, "_request_id", {
    value: response.headers.get("x-request-id"),
    enumerable: false
  });
}

// codex-rs/wasm/node_modules/openai/core/api-promise.mjs
var _APIPromise_client;
var APIPromise = class _APIPromise extends Promise {
  constructor(client, responsePromise, parseResponse2 = defaultParseResponse) {
    super((resolve) => {
      resolve(null);
    });
    this.responsePromise = responsePromise;
    this.parseResponse = parseResponse2;
    _APIPromise_client.set(this, void 0);
    __classPrivateFieldSet(this, _APIPromise_client, client, "f");
  }
  _thenUnwrap(transform) {
    return new _APIPromise(__classPrivateFieldGet(this, _APIPromise_client, "f"), this.responsePromise, async (client, props) => addRequestID(transform(await this.parseResponse(client, props), props), props.response));
  }
  /**
   * Gets the raw `Response` instance instead of parsing the response
   * data.
   *
   * If you want to parse the response body but still get the `Response`
   * instance, you can use {@link withResponse()}.
   *
   * 👋 Getting the wrong TypeScript type for `Response`?
   * Try setting `"moduleResolution": "NodeNext"` or add `"lib": ["DOM"]`
   * to your `tsconfig.json`.
   */
  asResponse() {
    return this.responsePromise.then((p) => p.response);
  }
  /**
   * Gets the parsed response data, the raw `Response` instance and the ID of the request,
   * returned via the X-Request-ID header which is useful for debugging requests and reporting
   * issues to OpenAI.
   *
   * If you just want to get the raw `Response` instance without parsing it,
   * you can use {@link asResponse()}.
   *
   * 👋 Getting the wrong TypeScript type for `Response`?
   * Try setting `"moduleResolution": "NodeNext"` or add `"lib": ["DOM"]`
   * to your `tsconfig.json`.
   */
  async withResponse() {
    const [data, response] = await Promise.all([this.parse(), this.asResponse()]);
    return { data, response, request_id: response.headers.get("x-request-id") };
  }
  parse() {
    if (!this.parsedPromise) {
      this.parsedPromise = this.responsePromise.then((data) => this.parseResponse(__classPrivateFieldGet(this, _APIPromise_client, "f"), data));
    }
    return this.parsedPromise;
  }
  then(onfulfilled, onrejected) {
    return this.parse().then(onfulfilled, onrejected);
  }
  catch(onrejected) {
    return this.parse().catch(onrejected);
  }
  finally(onfinally) {
    return this.parse().finally(onfinally);
  }
};
_APIPromise_client = /* @__PURE__ */ new WeakMap();

// codex-rs/wasm/node_modules/openai/core/pagination.mjs
var _AbstractPage_client;
var AbstractPage = class {
  constructor(client, response, body, options) {
    _AbstractPage_client.set(this, void 0);
    __classPrivateFieldSet(this, _AbstractPage_client, client, "f");
    this.options = options;
    this.response = response;
    this.body = body;
  }
  hasNextPage() {
    const items = this.getPaginatedItems();
    if (!items.length)
      return false;
    return this.nextPageRequestOptions() != null;
  }
  async getNextPage() {
    const nextOptions = this.nextPageRequestOptions();
    if (!nextOptions) {
      throw new OpenAIError("No next page expected; please check `.hasNextPage()` before calling `.getNextPage()`.");
    }
    return await __classPrivateFieldGet(this, _AbstractPage_client, "f").requestAPIList(this.constructor, nextOptions);
  }
  async *iterPages() {
    let page = this;
    yield page;
    while (page.hasNextPage()) {
      page = await page.getNextPage();
      yield page;
    }
  }
  async *[(_AbstractPage_client = /* @__PURE__ */ new WeakMap(), Symbol.asyncIterator)]() {
    for await (const page of this.iterPages()) {
      for (const item of page.getPaginatedItems()) {
        yield item;
      }
    }
  }
};
var PagePromise = class extends APIPromise {
  constructor(client, request, Page2) {
    super(client, request, async (client2, props) => new Page2(client2, props.response, await defaultParseResponse(client2, props), props.options));
  }
  /**
   * Allow auto-paginating iteration on an unawaited list call, eg:
   *
   *    for await (const item of client.items.list()) {
   *      console.log(item)
   *    }
   */
  async *[Symbol.asyncIterator]() {
    const page = await this;
    for await (const item of page) {
      yield item;
    }
  }
};
var Page = class extends AbstractPage {
  constructor(client, response, body, options) {
    super(client, response, body, options);
    this.data = body.data || [];
    this.object = body.object;
  }
  getPaginatedItems() {
    return this.data ?? [];
  }
  nextPageRequestOptions() {
    return null;
  }
};
var CursorPage = class extends AbstractPage {
  constructor(client, response, body, options) {
    super(client, response, body, options);
    this.data = body.data || [];
    this.has_more = body.has_more || false;
  }
  getPaginatedItems() {
    return this.data ?? [];
  }
  hasNextPage() {
    if (this.has_more === false) {
      return false;
    }
    return super.hasNextPage();
  }
  nextPageRequestOptions() {
    const data = this.getPaginatedItems();
    const id = data[data.length - 1]?.id;
    if (!id) {
      return null;
    }
    return {
      ...this.options,
      query: {
        ...maybeObj(this.options.query),
        after: id
      }
    };
  }
};
var ConversationCursorPage = class extends AbstractPage {
  constructor(client, response, body, options) {
    super(client, response, body, options);
    this.data = body.data || [];
    this.has_more = body.has_more || false;
    this.last_id = body.last_id || "";
  }
  getPaginatedItems() {
    return this.data ?? [];
  }
  hasNextPage() {
    if (this.has_more === false) {
      return false;
    }
    return super.hasNextPage();
  }
  nextPageRequestOptions() {
    const cursor = this.last_id;
    if (!cursor) {
      return null;
    }
    return {
      ...this.options,
      query: {
        ...maybeObj(this.options.query),
        after: cursor
      }
    };
  }
};

// codex-rs/wasm/node_modules/openai/internal/uploads.mjs
var checkFileSupport = () => {
  if (typeof File === "undefined") {
    const { process: process2 } = globalThis;
    const isOldNode = typeof process2?.versions?.node === "string" && parseInt(process2.versions.node.split(".")) < 20;
    throw new Error("`File` is not defined as a global, which is required for file uploads." + (isOldNode ? " Update to Node 20 LTS or newer, or set `globalThis.File` to `import('node:buffer').File`." : ""));
  }
};
function makeFile(fileBits, fileName, options) {
  checkFileSupport();
  return new File(fileBits, fileName ?? "unknown_file", options);
}
function getName(value) {
  return (typeof value === "object" && value !== null && ("name" in value && value.name && String(value.name) || "url" in value && value.url && String(value.url) || "filename" in value && value.filename && String(value.filename) || "path" in value && value.path && String(value.path)) || "").split(/[\\/]/).pop() || void 0;
}
var isAsyncIterable = (value) => value != null && typeof value === "object" && typeof value[Symbol.asyncIterator] === "function";
var maybeMultipartFormRequestOptions = async (opts, fetch2) => {
  if (!hasUploadableValue(opts.body))
    return opts;
  return { ...opts, body: await createForm(opts.body, fetch2) };
};
var multipartFormRequestOptions = async (opts, fetch2) => {
  return { ...opts, body: await createForm(opts.body, fetch2) };
};
var supportsFormDataMap = /* @__PURE__ */ new WeakMap();
function supportsFormData(fetchObject) {
  const fetch2 = typeof fetchObject === "function" ? fetchObject : fetchObject.fetch;
  const cached = supportsFormDataMap.get(fetch2);
  if (cached)
    return cached;
  const promise = (async () => {
    try {
      const FetchResponse = "Response" in fetch2 ? fetch2.Response : (await fetch2("data:,")).constructor;
      const data = new FormData();
      if (data.toString() === await new FetchResponse(data).text()) {
        return false;
      }
      return true;
    } catch {
      return true;
    }
  })();
  supportsFormDataMap.set(fetch2, promise);
  return promise;
}
var createForm = async (body, fetch2) => {
  if (!await supportsFormData(fetch2)) {
    throw new TypeError("The provided fetch function does not support file uploads with the current global FormData class.");
  }
  const form = new FormData();
  await Promise.all(Object.entries(body || {}).map(([key, value]) => addFormValue(form, key, value)));
  return form;
};
var isNamedBlob = (value) => value instanceof Blob && "name" in value;
var isUploadable = (value) => typeof value === "object" && value !== null && (value instanceof Response || isAsyncIterable(value) || isNamedBlob(value));
var hasUploadableValue = (value) => {
  if (isUploadable(value))
    return true;
  if (Array.isArray(value))
    return value.some(hasUploadableValue);
  if (value && typeof value === "object") {
    for (const k in value) {
      if (hasUploadableValue(value[k]))
        return true;
    }
  }
  return false;
};
var addFormValue = async (form, key, value) => {
  if (value === void 0)
    return;
  if (value == null) {
    throw new TypeError(`Received null for "${key}"; to pass null in FormData, you must use the string 'null'`);
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    form.append(key, String(value));
  } else if (value instanceof Response) {
    form.append(key, makeFile([await value.blob()], getName(value)));
  } else if (isAsyncIterable(value)) {
    form.append(key, makeFile([await new Response(ReadableStreamFrom(value)).blob()], getName(value)));
  } else if (isNamedBlob(value)) {
    form.append(key, value, getName(value));
  } else if (Array.isArray(value)) {
    await Promise.all(value.map((entry) => addFormValue(form, key + "[]", entry)));
  } else if (typeof value === "object") {
    await Promise.all(Object.entries(value).map(([name, prop]) => addFormValue(form, `${key}[${name}]`, prop)));
  } else {
    throw new TypeError(`Invalid value given to form, expected a string, number, boolean, object, Array, File or Blob but got ${value} instead`);
  }
};

// codex-rs/wasm/node_modules/openai/internal/to-file.mjs
var isBlobLike = (value) => value != null && typeof value === "object" && typeof value.size === "number" && typeof value.type === "string" && typeof value.text === "function" && typeof value.slice === "function" && typeof value.arrayBuffer === "function";
var isFileLike = (value) => value != null && typeof value === "object" && typeof value.name === "string" && typeof value.lastModified === "number" && isBlobLike(value);
var isResponseLike = (value) => value != null && typeof value === "object" && typeof value.url === "string" && typeof value.blob === "function";
async function toFile(value, name, options) {
  checkFileSupport();
  value = await value;
  if (isFileLike(value)) {
    if (value instanceof File) {
      return value;
    }
    return makeFile([await value.arrayBuffer()], value.name);
  }
  if (isResponseLike(value)) {
    const blob = await value.blob();
    name || (name = new URL(value.url).pathname.split(/[\\/]/).pop());
    return makeFile(await getBytes(blob), name, options);
  }
  const parts = await getBytes(value);
  name || (name = getName(value));
  if (!options?.type) {
    const type = parts.find((part) => typeof part === "object" && "type" in part && part.type);
    if (typeof type === "string") {
      options = { ...options, type };
    }
  }
  return makeFile(parts, name, options);
}
async function getBytes(value) {
  let parts = [];
  if (typeof value === "string" || ArrayBuffer.isView(value) || // includes Uint8Array, Buffer, etc.
  value instanceof ArrayBuffer) {
    parts.push(value);
  } else if (isBlobLike(value)) {
    parts.push(value instanceof Blob ? value : await value.arrayBuffer());
  } else if (isAsyncIterable(value)) {
    for await (const chunk of value) {
      parts.push(...await getBytes(chunk));
    }
  } else {
    const constructor = value?.constructor?.name;
    throw new Error(`Unexpected data type: ${typeof value}${constructor ? `; constructor: ${constructor}` : ""}${propsForError(value)}`);
  }
  return parts;
}
function propsForError(value) {
  if (typeof value !== "object" || value === null)
    return "";
  const props = Object.getOwnPropertyNames(value);
  return `; props: [${props.map((p) => `"${p}"`).join(", ")}]`;
}

// codex-rs/wasm/node_modules/openai/core/resource.mjs
var APIResource = class {
  constructor(client) {
    this._client = client;
  }
};

// codex-rs/wasm/node_modules/openai/internal/utils/path.mjs
function encodeURIPath(str2) {
  return str2.replace(/[^A-Za-z0-9\-._~!$&'()*+,;=:@]+/g, encodeURIComponent);
}
var EMPTY = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.create(null));
var createPathTagFunction = (pathEncoder = encodeURIPath) => function path2(statics, ...params) {
  if (statics.length === 1)
    return statics[0];
  let postPath = false;
  const invalidSegments = [];
  const path3 = statics.reduce((previousValue, currentValue, index) => {
    if (/[?#]/.test(currentValue)) {
      postPath = true;
    }
    const value = params[index];
    let encoded = (postPath ? encodeURIComponent : pathEncoder)("" + value);
    if (index !== params.length && (value == null || typeof value === "object" && // handle values from other realms
    value.toString === Object.getPrototypeOf(Object.getPrototypeOf(value.hasOwnProperty ?? EMPTY) ?? EMPTY)?.toString)) {
      encoded = value + "";
      invalidSegments.push({
        start: previousValue.length + currentValue.length,
        length: encoded.length,
        error: `Value of type ${Object.prototype.toString.call(value).slice(8, -1)} is not a valid path parameter`
      });
    }
    return previousValue + currentValue + (index === params.length ? "" : encoded);
  }, "");
  const pathOnly = path3.split(/[?#]/, 1)[0];
  const invalidSegmentPattern = /(?<=^|\/)(?:\.|%2e){1,2}(?=\/|$)/gi;
  let match;
  while ((match = invalidSegmentPattern.exec(pathOnly)) !== null) {
    invalidSegments.push({
      start: match.index,
      length: match[0].length,
      error: `Value "${match[0]}" can't be safely passed as a path parameter`
    });
  }
  invalidSegments.sort((a, b) => a.start - b.start);
  if (invalidSegments.length > 0) {
    let lastEnd = 0;
    const underline = invalidSegments.reduce((acc, segment) => {
      const spaces = " ".repeat(segment.start - lastEnd);
      const arrows = "^".repeat(segment.length);
      lastEnd = segment.start + segment.length;
      return acc + spaces + arrows;
    }, "");
    throw new OpenAIError(`Path parameters result in path with invalid segments:
${invalidSegments.map((e) => e.error).join("\n")}
${path3}
${underline}`);
  }
  return path3;
};
var path = /* @__PURE__ */ createPathTagFunction(encodeURIPath);

// codex-rs/wasm/node_modules/openai/resources/chat/completions/messages.mjs
var Messages = class extends APIResource {
  /**
   * Get the messages in a stored chat completion. Only Chat Completions that have
   * been created with the `store` parameter set to `true` will be returned.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const chatCompletionStoreMessage of client.chat.completions.messages.list(
   *   'completion_id',
   * )) {
   *   // ...
   * }
   * ```
   */
  list(completionID, query = {}, options) {
    return this._client.getAPIList(path`/chat/completions/${completionID}/messages`, CursorPage, { query, ...options });
  }
};

// codex-rs/wasm/node_modules/openai/lib/parser.mjs
function isChatCompletionFunctionTool(tool) {
  return tool !== void 0 && "function" in tool && tool.function !== void 0;
}
function isAutoParsableResponseFormat(response_format) {
  return response_format?.["$brand"] === "auto-parseable-response-format";
}
function isAutoParsableTool(tool) {
  return tool?.["$brand"] === "auto-parseable-tool";
}
function maybeParseChatCompletion(completion, params) {
  if (!params || !hasAutoParseableInput(params)) {
    return {
      ...completion,
      choices: completion.choices.map((choice) => {
        assertToolCallsAreChatCompletionFunctionToolCalls(choice.message.tool_calls);
        return {
          ...choice,
          message: {
            ...choice.message,
            parsed: null,
            ...choice.message.tool_calls ? {
              tool_calls: choice.message.tool_calls
            } : void 0
          }
        };
      })
    };
  }
  return parseChatCompletion(completion, params);
}
function parseChatCompletion(completion, params) {
  const choices = completion.choices.map((choice) => {
    if (choice.finish_reason === "length") {
      throw new LengthFinishReasonError();
    }
    if (choice.finish_reason === "content_filter") {
      throw new ContentFilterFinishReasonError();
    }
    assertToolCallsAreChatCompletionFunctionToolCalls(choice.message.tool_calls);
    return {
      ...choice,
      message: {
        ...choice.message,
        ...choice.message.tool_calls ? {
          tool_calls: choice.message.tool_calls?.map((toolCall) => parseToolCall(params, toolCall)) ?? void 0
        } : void 0,
        parsed: choice.message.content && !choice.message.refusal ? parseResponseFormat(params, choice.message.content) : null
      }
    };
  });
  return { ...completion, choices };
}
function parseResponseFormat(params, content) {
  if (params.response_format?.type !== "json_schema") {
    return null;
  }
  if (params.response_format?.type === "json_schema") {
    if ("$parseRaw" in params.response_format) {
      const response_format = params.response_format;
      return response_format.$parseRaw(content);
    }
    return JSON.parse(content);
  }
  return null;
}
function parseToolCall(params, toolCall) {
  const inputTool = params.tools?.find((inputTool2) => isChatCompletionFunctionTool(inputTool2) && inputTool2.function?.name === toolCall.function.name);
  return {
    ...toolCall,
    function: {
      ...toolCall.function,
      parsed_arguments: isAutoParsableTool(inputTool) ? inputTool.$parseRaw(toolCall.function.arguments) : inputTool?.function.strict ? JSON.parse(toolCall.function.arguments) : null
    }
  };
}
function shouldParseToolCall(params, toolCall) {
  if (!params || !("tools" in params) || !params.tools) {
    return false;
  }
  const inputTool = params.tools?.find((inputTool2) => isChatCompletionFunctionTool(inputTool2) && inputTool2.function?.name === toolCall.function.name);
  return isChatCompletionFunctionTool(inputTool) && (isAutoParsableTool(inputTool) || inputTool?.function.strict || false);
}
function hasAutoParseableInput(params) {
  if (isAutoParsableResponseFormat(params.response_format)) {
    return true;
  }
  return params.tools?.some((t) => isAutoParsableTool(t) || t.type === "function" && t.function.strict === true) ?? false;
}
function assertToolCallsAreChatCompletionFunctionToolCalls(toolCalls) {
  for (const toolCall of toolCalls || []) {
    if (toolCall.type !== "function") {
      throw new OpenAIError(`Currently only \`function\` tool calls are supported; Received \`${toolCall.type}\``);
    }
  }
}
function validateInputTools(tools) {
  for (const tool of tools ?? []) {
    if (tool.type !== "function") {
      throw new OpenAIError(`Currently only \`function\` tool types support auto-parsing; Received \`${tool.type}\``);
    }
    if (tool.function.strict !== true) {
      throw new OpenAIError(`The \`${tool.function.name}\` tool is not marked with \`strict: true\`. Only strict function tools can be auto-parsed`);
    }
  }
}

// codex-rs/wasm/node_modules/openai/lib/chatCompletionUtils.mjs
var isAssistantMessage = (message) => {
  return message?.role === "assistant";
};
var isToolMessage = (message) => {
  return message?.role === "tool";
};

// codex-rs/wasm/node_modules/openai/lib/EventStream.mjs
var _EventStream_instances;
var _EventStream_connectedPromise;
var _EventStream_resolveConnectedPromise;
var _EventStream_rejectConnectedPromise;
var _EventStream_endPromise;
var _EventStream_resolveEndPromise;
var _EventStream_rejectEndPromise;
var _EventStream_listeners;
var _EventStream_ended;
var _EventStream_errored;
var _EventStream_aborted;
var _EventStream_catchingPromiseCreated;
var _EventStream_handleError;
var EventStream = class {
  constructor() {
    _EventStream_instances.add(this);
    this.controller = new AbortController();
    _EventStream_connectedPromise.set(this, void 0);
    _EventStream_resolveConnectedPromise.set(this, () => {
    });
    _EventStream_rejectConnectedPromise.set(this, () => {
    });
    _EventStream_endPromise.set(this, void 0);
    _EventStream_resolveEndPromise.set(this, () => {
    });
    _EventStream_rejectEndPromise.set(this, () => {
    });
    _EventStream_listeners.set(this, {});
    _EventStream_ended.set(this, false);
    _EventStream_errored.set(this, false);
    _EventStream_aborted.set(this, false);
    _EventStream_catchingPromiseCreated.set(this, false);
    __classPrivateFieldSet(this, _EventStream_connectedPromise, new Promise((resolve, reject) => {
      __classPrivateFieldSet(this, _EventStream_resolveConnectedPromise, resolve, "f");
      __classPrivateFieldSet(this, _EventStream_rejectConnectedPromise, reject, "f");
    }), "f");
    __classPrivateFieldSet(this, _EventStream_endPromise, new Promise((resolve, reject) => {
      __classPrivateFieldSet(this, _EventStream_resolveEndPromise, resolve, "f");
      __classPrivateFieldSet(this, _EventStream_rejectEndPromise, reject, "f");
    }), "f");
    __classPrivateFieldGet(this, _EventStream_connectedPromise, "f").catch(() => {
    });
    __classPrivateFieldGet(this, _EventStream_endPromise, "f").catch(() => {
    });
  }
  _run(executor) {
    setTimeout(() => {
      executor().then(() => {
        this._emitFinal();
        this._emit("end");
      }, __classPrivateFieldGet(this, _EventStream_instances, "m", _EventStream_handleError).bind(this));
    }, 0);
  }
  _connected() {
    if (this.ended)
      return;
    __classPrivateFieldGet(this, _EventStream_resolveConnectedPromise, "f").call(this);
    this._emit("connect");
  }
  get ended() {
    return __classPrivateFieldGet(this, _EventStream_ended, "f");
  }
  get errored() {
    return __classPrivateFieldGet(this, _EventStream_errored, "f");
  }
  get aborted() {
    return __classPrivateFieldGet(this, _EventStream_aborted, "f");
  }
  abort() {
    this.controller.abort();
  }
  /**
   * Adds the listener function to the end of the listeners array for the event.
   * No checks are made to see if the listener has already been added. Multiple calls passing
   * the same combination of event and listener will result in the listener being added, and
   * called, multiple times.
   * @returns this ChatCompletionStream, so that calls can be chained
   */
  on(event, listener) {
    const listeners2 = __classPrivateFieldGet(this, _EventStream_listeners, "f")[event] || (__classPrivateFieldGet(this, _EventStream_listeners, "f")[event] = []);
    listeners2.push({ listener });
    return this;
  }
  /**
   * Removes the specified listener from the listener array for the event.
   * off() will remove, at most, one instance of a listener from the listener array. If any single
   * listener has been added multiple times to the listener array for the specified event, then
   * off() must be called multiple times to remove each instance.
   * @returns this ChatCompletionStream, so that calls can be chained
   */
  off(event, listener) {
    const listeners2 = __classPrivateFieldGet(this, _EventStream_listeners, "f")[event];
    if (!listeners2)
      return this;
    const index = listeners2.findIndex((l) => l.listener === listener);
    if (index >= 0)
      listeners2.splice(index, 1);
    return this;
  }
  /**
   * Adds a one-time listener function for the event. The next time the event is triggered,
   * this listener is removed and then invoked.
   * @returns this ChatCompletionStream, so that calls can be chained
   */
  once(event, listener) {
    const listeners2 = __classPrivateFieldGet(this, _EventStream_listeners, "f")[event] || (__classPrivateFieldGet(this, _EventStream_listeners, "f")[event] = []);
    listeners2.push({ listener, once: true });
    return this;
  }
  /**
   * This is similar to `.once()`, but returns a Promise that resolves the next time
   * the event is triggered, instead of calling a listener callback.
   * @returns a Promise that resolves the next time given event is triggered,
   * or rejects if an error is emitted.  (If you request the 'error' event,
   * returns a promise that resolves with the error).
   *
   * Example:
   *
   *   const message = await stream.emitted('message') // rejects if the stream errors
   */
  emitted(event) {
    return new Promise((resolve, reject) => {
      __classPrivateFieldSet(this, _EventStream_catchingPromiseCreated, true, "f");
      if (event !== "error")
        this.once("error", reject);
      this.once(event, resolve);
    });
  }
  async done() {
    __classPrivateFieldSet(this, _EventStream_catchingPromiseCreated, true, "f");
    await __classPrivateFieldGet(this, _EventStream_endPromise, "f");
  }
  _emit(event, ...args) {
    if (__classPrivateFieldGet(this, _EventStream_ended, "f")) {
      return;
    }
    if (event === "end") {
      __classPrivateFieldSet(this, _EventStream_ended, true, "f");
      __classPrivateFieldGet(this, _EventStream_resolveEndPromise, "f").call(this);
    }
    const listeners2 = __classPrivateFieldGet(this, _EventStream_listeners, "f")[event];
    if (listeners2) {
      __classPrivateFieldGet(this, _EventStream_listeners, "f")[event] = listeners2.filter((l) => !l.once);
      listeners2.forEach(({ listener }) => listener(...args));
    }
    if (event === "abort") {
      const error = args[0];
      if (!__classPrivateFieldGet(this, _EventStream_catchingPromiseCreated, "f") && !listeners2?.length) {
        Promise.reject(error);
      }
      __classPrivateFieldGet(this, _EventStream_rejectConnectedPromise, "f").call(this, error);
      __classPrivateFieldGet(this, _EventStream_rejectEndPromise, "f").call(this, error);
      this._emit("end");
      return;
    }
    if (event === "error") {
      const error = args[0];
      if (!__classPrivateFieldGet(this, _EventStream_catchingPromiseCreated, "f") && !listeners2?.length) {
        Promise.reject(error);
      }
      __classPrivateFieldGet(this, _EventStream_rejectConnectedPromise, "f").call(this, error);
      __classPrivateFieldGet(this, _EventStream_rejectEndPromise, "f").call(this, error);
      this._emit("end");
    }
  }
  _emitFinal() {
  }
};
_EventStream_connectedPromise = /* @__PURE__ */ new WeakMap(), _EventStream_resolveConnectedPromise = /* @__PURE__ */ new WeakMap(), _EventStream_rejectConnectedPromise = /* @__PURE__ */ new WeakMap(), _EventStream_endPromise = /* @__PURE__ */ new WeakMap(), _EventStream_resolveEndPromise = /* @__PURE__ */ new WeakMap(), _EventStream_rejectEndPromise = /* @__PURE__ */ new WeakMap(), _EventStream_listeners = /* @__PURE__ */ new WeakMap(), _EventStream_ended = /* @__PURE__ */ new WeakMap(), _EventStream_errored = /* @__PURE__ */ new WeakMap(), _EventStream_aborted = /* @__PURE__ */ new WeakMap(), _EventStream_catchingPromiseCreated = /* @__PURE__ */ new WeakMap(), _EventStream_instances = /* @__PURE__ */ new WeakSet(), _EventStream_handleError = function _EventStream_handleError2(error) {
  __classPrivateFieldSet(this, _EventStream_errored, true, "f");
  if (error instanceof Error && error.name === "AbortError") {
    error = new APIUserAbortError();
  }
  if (error instanceof APIUserAbortError) {
    __classPrivateFieldSet(this, _EventStream_aborted, true, "f");
    return this._emit("abort", error);
  }
  if (error instanceof OpenAIError) {
    return this._emit("error", error);
  }
  if (error instanceof Error) {
    const openAIError = new OpenAIError(error.message);
    openAIError.cause = error;
    return this._emit("error", openAIError);
  }
  return this._emit("error", new OpenAIError(String(error)));
};

// codex-rs/wasm/node_modules/openai/lib/RunnableFunction.mjs
function isRunnableFunctionWithParse(fn) {
  return typeof fn.parse === "function";
}

// codex-rs/wasm/node_modules/openai/lib/AbstractChatCompletionRunner.mjs
var _AbstractChatCompletionRunner_instances;
var _AbstractChatCompletionRunner_getFinalContent;
var _AbstractChatCompletionRunner_getFinalMessage;
var _AbstractChatCompletionRunner_getFinalFunctionToolCall;
var _AbstractChatCompletionRunner_getFinalFunctionToolCallResult;
var _AbstractChatCompletionRunner_calculateTotalUsage;
var _AbstractChatCompletionRunner_validateParams;
var _AbstractChatCompletionRunner_stringifyFunctionCallResult;
var DEFAULT_MAX_CHAT_COMPLETIONS = 10;
var AbstractChatCompletionRunner = class extends EventStream {
  constructor() {
    super(...arguments);
    _AbstractChatCompletionRunner_instances.add(this);
    this._chatCompletions = [];
    this.messages = [];
  }
  _addChatCompletion(chatCompletion) {
    this._chatCompletions.push(chatCompletion);
    this._emit("chatCompletion", chatCompletion);
    const message = chatCompletion.choices[0]?.message;
    if (message)
      this._addMessage(message);
    return chatCompletion;
  }
  _addMessage(message, emit2 = true) {
    if (!("content" in message))
      message.content = null;
    this.messages.push(message);
    if (emit2) {
      this._emit("message", message);
      if (isToolMessage(message) && message.content) {
        this._emit("functionToolCallResult", message.content);
      } else if (isAssistantMessage(message) && message.tool_calls) {
        for (const tool_call of message.tool_calls) {
          if (tool_call.type === "function") {
            this._emit("functionToolCall", tool_call.function);
          }
        }
      }
    }
  }
  /**
   * @returns a promise that resolves with the final ChatCompletion, or rejects
   * if an error occurred or the stream ended prematurely without producing a ChatCompletion.
   */
  async finalChatCompletion() {
    await this.done();
    const completion = this._chatCompletions[this._chatCompletions.length - 1];
    if (!completion)
      throw new OpenAIError("stream ended without producing a ChatCompletion");
    return completion;
  }
  /**
   * @returns a promise that resolves with the content of the final ChatCompletionMessage, or rejects
   * if an error occurred or the stream ended prematurely without producing a ChatCompletionMessage.
   */
  async finalContent() {
    await this.done();
    return __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalContent).call(this);
  }
  /**
   * @returns a promise that resolves with the the final assistant ChatCompletionMessage response,
   * or rejects if an error occurred or the stream ended prematurely without producing a ChatCompletionMessage.
   */
  async finalMessage() {
    await this.done();
    return __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalMessage).call(this);
  }
  /**
   * @returns a promise that resolves with the content of the final FunctionCall, or rejects
   * if an error occurred or the stream ended prematurely without producing a ChatCompletionMessage.
   */
  async finalFunctionToolCall() {
    await this.done();
    return __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalFunctionToolCall).call(this);
  }
  async finalFunctionToolCallResult() {
    await this.done();
    return __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalFunctionToolCallResult).call(this);
  }
  async totalUsage() {
    await this.done();
    return __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_calculateTotalUsage).call(this);
  }
  allChatCompletions() {
    return [...this._chatCompletions];
  }
  _emitFinal() {
    const completion = this._chatCompletions[this._chatCompletions.length - 1];
    if (completion)
      this._emit("finalChatCompletion", completion);
    const finalMessage = __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalMessage).call(this);
    if (finalMessage)
      this._emit("finalMessage", finalMessage);
    const finalContent = __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalContent).call(this);
    if (finalContent)
      this._emit("finalContent", finalContent);
    const finalFunctionCall = __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalFunctionToolCall).call(this);
    if (finalFunctionCall)
      this._emit("finalFunctionToolCall", finalFunctionCall);
    const finalFunctionCallResult = __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalFunctionToolCallResult).call(this);
    if (finalFunctionCallResult != null)
      this._emit("finalFunctionToolCallResult", finalFunctionCallResult);
    if (this._chatCompletions.some((c) => c.usage)) {
      this._emit("totalUsage", __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_calculateTotalUsage).call(this));
    }
  }
  async _createChatCompletion(client, params, options) {
    const signal = options?.signal;
    if (signal) {
      if (signal.aborted)
        this.controller.abort();
      signal.addEventListener("abort", () => this.controller.abort());
    }
    __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_validateParams).call(this, params);
    const chatCompletion = await client.chat.completions.create({ ...params, stream: false }, { ...options, signal: this.controller.signal });
    this._connected();
    return this._addChatCompletion(parseChatCompletion(chatCompletion, params));
  }
  async _runChatCompletion(client, params, options) {
    for (const message of params.messages) {
      this._addMessage(message, false);
    }
    return await this._createChatCompletion(client, params, options);
  }
  async _runTools(client, params, options) {
    const role = "tool";
    const { tool_choice = "auto", stream, ...restParams } = params;
    const singleFunctionToCall = typeof tool_choice !== "string" && tool_choice.type === "function" && tool_choice?.function?.name;
    const { maxChatCompletions = DEFAULT_MAX_CHAT_COMPLETIONS } = options || {};
    const inputTools = params.tools.map((tool) => {
      if (isAutoParsableTool(tool)) {
        if (!tool.$callback) {
          throw new OpenAIError("Tool given to `.runTools()` that does not have an associated function");
        }
        return {
          type: "function",
          function: {
            function: tool.$callback,
            name: tool.function.name,
            description: tool.function.description || "",
            parameters: tool.function.parameters,
            parse: tool.$parseRaw,
            strict: true
          }
        };
      }
      return tool;
    });
    const functionsByName = {};
    for (const f of inputTools) {
      if (f.type === "function") {
        functionsByName[f.function.name || f.function.function.name] = f.function;
      }
    }
    const tools = "tools" in params ? inputTools.map((t) => t.type === "function" ? {
      type: "function",
      function: {
        name: t.function.name || t.function.function.name,
        parameters: t.function.parameters,
        description: t.function.description,
        strict: t.function.strict
      }
    } : t) : void 0;
    for (const message of params.messages) {
      this._addMessage(message, false);
    }
    for (let i = 0; i < maxChatCompletions; ++i) {
      const chatCompletion = await this._createChatCompletion(client, {
        ...restParams,
        tool_choice,
        tools,
        messages: [...this.messages]
      }, options);
      const message = chatCompletion.choices[0]?.message;
      if (!message) {
        throw new OpenAIError(`missing message in ChatCompletion response`);
      }
      if (!message.tool_calls?.length) {
        return;
      }
      for (const tool_call of message.tool_calls) {
        if (tool_call.type !== "function")
          continue;
        const tool_call_id = tool_call.id;
        const { name, arguments: args } = tool_call.function;
        const fn = functionsByName[name];
        if (!fn) {
          const content2 = `Invalid tool_call: ${JSON.stringify(name)}. Available options are: ${Object.keys(functionsByName).map((name2) => JSON.stringify(name2)).join(", ")}. Please try again`;
          this._addMessage({ role, tool_call_id, content: content2 });
          continue;
        } else if (singleFunctionToCall && singleFunctionToCall !== name) {
          const content2 = `Invalid tool_call: ${JSON.stringify(name)}. ${JSON.stringify(singleFunctionToCall)} requested. Please try again`;
          this._addMessage({ role, tool_call_id, content: content2 });
          continue;
        }
        let parsed;
        try {
          parsed = isRunnableFunctionWithParse(fn) ? await fn.parse(args) : args;
        } catch (error) {
          const content2 = error instanceof Error ? error.message : String(error);
          this._addMessage({ role, tool_call_id, content: content2 });
          continue;
        }
        const rawContent = await fn.function(parsed, this);
        const content = __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_stringifyFunctionCallResult).call(this, rawContent);
        this._addMessage({ role, tool_call_id, content });
        if (singleFunctionToCall) {
          return;
        }
      }
    }
    return;
  }
};
_AbstractChatCompletionRunner_instances = /* @__PURE__ */ new WeakSet(), _AbstractChatCompletionRunner_getFinalContent = function _AbstractChatCompletionRunner_getFinalContent2() {
  return __classPrivateFieldGet(this, _AbstractChatCompletionRunner_instances, "m", _AbstractChatCompletionRunner_getFinalMessage).call(this).content ?? null;
}, _AbstractChatCompletionRunner_getFinalMessage = function _AbstractChatCompletionRunner_getFinalMessage2() {
  let i = this.messages.length;
  while (i-- > 0) {
    const message = this.messages[i];
    if (isAssistantMessage(message)) {
      const ret = {
        ...message,
        content: message.content ?? null,
        refusal: message.refusal ?? null
      };
      return ret;
    }
  }
  throw new OpenAIError("stream ended without producing a ChatCompletionMessage with role=assistant");
}, _AbstractChatCompletionRunner_getFinalFunctionToolCall = function _AbstractChatCompletionRunner_getFinalFunctionToolCall2() {
  for (let i = this.messages.length - 1; i >= 0; i--) {
    const message = this.messages[i];
    if (isAssistantMessage(message) && message?.tool_calls?.length) {
      return message.tool_calls.filter((x) => x.type === "function").at(-1)?.function;
    }
  }
  return;
}, _AbstractChatCompletionRunner_getFinalFunctionToolCallResult = function _AbstractChatCompletionRunner_getFinalFunctionToolCallResult2() {
  for (let i = this.messages.length - 1; i >= 0; i--) {
    const message = this.messages[i];
    if (isToolMessage(message) && message.content != null && typeof message.content === "string" && this.messages.some((x) => x.role === "assistant" && x.tool_calls?.some((y) => y.type === "function" && y.id === message.tool_call_id))) {
      return message.content;
    }
  }
  return;
}, _AbstractChatCompletionRunner_calculateTotalUsage = function _AbstractChatCompletionRunner_calculateTotalUsage2() {
  const total = {
    completion_tokens: 0,
    prompt_tokens: 0,
    total_tokens: 0
  };
  for (const { usage } of this._chatCompletions) {
    if (usage) {
      total.completion_tokens += usage.completion_tokens;
      total.prompt_tokens += usage.prompt_tokens;
      total.total_tokens += usage.total_tokens;
    }
  }
  return total;
}, _AbstractChatCompletionRunner_validateParams = function _AbstractChatCompletionRunner_validateParams2(params) {
  if (params.n != null && params.n > 1) {
    throw new OpenAIError("ChatCompletion convenience helpers only support n=1 at this time. To use n>1, please use chat.completions.create() directly.");
  }
}, _AbstractChatCompletionRunner_stringifyFunctionCallResult = function _AbstractChatCompletionRunner_stringifyFunctionCallResult2(rawContent) {
  return typeof rawContent === "string" ? rawContent : rawContent === void 0 ? "undefined" : JSON.stringify(rawContent);
};

// codex-rs/wasm/node_modules/openai/lib/ChatCompletionRunner.mjs
var ChatCompletionRunner = class _ChatCompletionRunner extends AbstractChatCompletionRunner {
  static runTools(client, params, options) {
    const runner = new _ChatCompletionRunner();
    const opts = {
      ...options,
      headers: { ...options?.headers, "X-Stainless-Helper-Method": "runTools" }
    };
    runner._run(() => runner._runTools(client, params, opts));
    return runner;
  }
  _addMessage(message, emit2 = true) {
    super._addMessage(message, emit2);
    if (isAssistantMessage(message) && message.content) {
      this._emit("content", message.content);
    }
  }
};

// codex-rs/wasm/node_modules/openai/_vendor/partial-json-parser/parser.mjs
var STR = 1;
var NUM = 2;
var ARR = 4;
var OBJ = 8;
var NULL = 16;
var BOOL = 32;
var NAN = 64;
var INFINITY = 128;
var MINUS_INFINITY = 256;
var INF = INFINITY | MINUS_INFINITY;
var SPECIAL = NULL | BOOL | INF | NAN;
var ATOM = STR | NUM | SPECIAL;
var COLLECTION = ARR | OBJ;
var ALL = ATOM | COLLECTION;
var Allow = {
  STR,
  NUM,
  ARR,
  OBJ,
  NULL,
  BOOL,
  NAN,
  INFINITY,
  MINUS_INFINITY,
  INF,
  SPECIAL,
  ATOM,
  COLLECTION,
  ALL
};
var PartialJSON = class extends Error {
};
var MalformedJSON = class extends Error {
};
function parseJSON(jsonString, allowPartial = Allow.ALL) {
  if (typeof jsonString !== "string") {
    throw new TypeError(`expecting str, got ${typeof jsonString}`);
  }
  if (!jsonString.trim()) {
    throw new Error(`${jsonString} is empty`);
  }
  return _parseJSON(jsonString.trim(), allowPartial);
}
var _parseJSON = (jsonString, allow) => {
  const length = jsonString.length;
  let index = 0;
  const markPartialJSON = (msg) => {
    throw new PartialJSON(`${msg} at position ${index}`);
  };
  const throwMalformedError = (msg) => {
    throw new MalformedJSON(`${msg} at position ${index}`);
  };
  const parseAny = () => {
    skipBlank();
    if (index >= length)
      markPartialJSON("Unexpected end of input");
    if (jsonString[index] === '"')
      return parseStr();
    if (jsonString[index] === "{")
      return parseObj();
    if (jsonString[index] === "[")
      return parseArr();
    if (jsonString.substring(index, index + 4) === "null" || Allow.NULL & allow && length - index < 4 && "null".startsWith(jsonString.substring(index))) {
      index += 4;
      return null;
    }
    if (jsonString.substring(index, index + 4) === "true" || Allow.BOOL & allow && length - index < 4 && "true".startsWith(jsonString.substring(index))) {
      index += 4;
      return true;
    }
    if (jsonString.substring(index, index + 5) === "false" || Allow.BOOL & allow && length - index < 5 && "false".startsWith(jsonString.substring(index))) {
      index += 5;
      return false;
    }
    if (jsonString.substring(index, index + 8) === "Infinity" || Allow.INFINITY & allow && length - index < 8 && "Infinity".startsWith(jsonString.substring(index))) {
      index += 8;
      return Infinity;
    }
    if (jsonString.substring(index, index + 9) === "-Infinity" || Allow.MINUS_INFINITY & allow && 1 < length - index && length - index < 9 && "-Infinity".startsWith(jsonString.substring(index))) {
      index += 9;
      return -Infinity;
    }
    if (jsonString.substring(index, index + 3) === "NaN" || Allow.NAN & allow && length - index < 3 && "NaN".startsWith(jsonString.substring(index))) {
      index += 3;
      return NaN;
    }
    return parseNum();
  };
  const parseStr = () => {
    const start = index;
    let escape2 = false;
    index++;
    while (index < length && (jsonString[index] !== '"' || escape2 && jsonString[index - 1] === "\\")) {
      escape2 = jsonString[index] === "\\" ? !escape2 : false;
      index++;
    }
    if (jsonString.charAt(index) == '"') {
      try {
        return JSON.parse(jsonString.substring(start, ++index - Number(escape2)));
      } catch (e) {
        throwMalformedError(String(e));
      }
    } else if (Allow.STR & allow) {
      try {
        return JSON.parse(jsonString.substring(start, index - Number(escape2)) + '"');
      } catch (e) {
        return JSON.parse(jsonString.substring(start, jsonString.lastIndexOf("\\")) + '"');
      }
    }
    markPartialJSON("Unterminated string literal");
  };
  const parseObj = () => {
    index++;
    skipBlank();
    const obj = {};
    try {
      while (jsonString[index] !== "}") {
        skipBlank();
        if (index >= length && Allow.OBJ & allow)
          return obj;
        const key = parseStr();
        skipBlank();
        index++;
        try {
          const value = parseAny();
          Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true });
        } catch (e) {
          if (Allow.OBJ & allow)
            return obj;
          else
            throw e;
        }
        skipBlank();
        if (jsonString[index] === ",")
          index++;
      }
    } catch (e) {
      if (Allow.OBJ & allow)
        return obj;
      else
        markPartialJSON("Expected '}' at end of object");
    }
    index++;
    return obj;
  };
  const parseArr = () => {
    index++;
    const arr = [];
    try {
      while (jsonString[index] !== "]") {
        arr.push(parseAny());
        skipBlank();
        if (jsonString[index] === ",") {
          index++;
        }
      }
    } catch (e) {
      if (Allow.ARR & allow) {
        return arr;
      }
      markPartialJSON("Expected ']' at end of array");
    }
    index++;
    return arr;
  };
  const parseNum = () => {
    if (index === 0) {
      if (jsonString === "-" && Allow.NUM & allow)
        markPartialJSON("Not sure what '-' is");
      try {
        return JSON.parse(jsonString);
      } catch (e) {
        if (Allow.NUM & allow) {
          try {
            if ("." === jsonString[jsonString.length - 1])
              return JSON.parse(jsonString.substring(0, jsonString.lastIndexOf(".")));
            return JSON.parse(jsonString.substring(0, jsonString.lastIndexOf("e")));
          } catch (e2) {
          }
        }
        throwMalformedError(String(e));
      }
    }
    const start = index;
    if (jsonString[index] === "-")
      index++;
    while (jsonString[index] && !",]}".includes(jsonString[index]))
      index++;
    if (index == length && !(Allow.NUM & allow))
      markPartialJSON("Unterminated number literal");
    try {
      return JSON.parse(jsonString.substring(start, index));
    } catch (e) {
      if (jsonString.substring(start, index) === "-" && Allow.NUM & allow)
        markPartialJSON("Not sure what '-' is");
      try {
        return JSON.parse(jsonString.substring(start, jsonString.lastIndexOf("e")));
      } catch (e2) {
        throwMalformedError(String(e2));
      }
    }
  };
  const skipBlank = () => {
    while (index < length && " \n\r	".includes(jsonString[index])) {
      index++;
    }
  };
  return parseAny();
};
var partialParse = (input) => parseJSON(input, Allow.ALL ^ Allow.NUM);

// codex-rs/wasm/node_modules/openai/lib/ChatCompletionStream.mjs
var _ChatCompletionStream_instances;
var _ChatCompletionStream_params;
var _ChatCompletionStream_choiceEventStates;
var _ChatCompletionStream_currentChatCompletionSnapshot;
var _ChatCompletionStream_beginRequest;
var _ChatCompletionStream_getChoiceEventState;
var _ChatCompletionStream_addChunk;
var _ChatCompletionStream_emitToolCallDoneEvent;
var _ChatCompletionStream_emitContentDoneEvents;
var _ChatCompletionStream_endRequest;
var _ChatCompletionStream_getAutoParseableResponseFormat;
var _ChatCompletionStream_accumulateChatCompletion;
var ChatCompletionStream = class _ChatCompletionStream extends AbstractChatCompletionRunner {
  constructor(params) {
    super();
    _ChatCompletionStream_instances.add(this);
    _ChatCompletionStream_params.set(this, void 0);
    _ChatCompletionStream_choiceEventStates.set(this, void 0);
    _ChatCompletionStream_currentChatCompletionSnapshot.set(this, void 0);
    __classPrivateFieldSet(this, _ChatCompletionStream_params, params, "f");
    __classPrivateFieldSet(this, _ChatCompletionStream_choiceEventStates, [], "f");
  }
  get currentChatCompletionSnapshot() {
    return __classPrivateFieldGet(this, _ChatCompletionStream_currentChatCompletionSnapshot, "f");
  }
  /**
   * Intended for use on the frontend, consuming a stream produced with
   * `.toReadableStream()` on the backend.
   *
   * Note that messages sent to the model do not appear in `.on('message')`
   * in this context.
   */
  static fromReadableStream(stream) {
    const runner = new _ChatCompletionStream(null);
    runner._run(() => runner._fromReadableStream(stream));
    return runner;
  }
  static createChatCompletion(client, params, options) {
    const runner = new _ChatCompletionStream(params);
    runner._run(() => runner._runChatCompletion(client, { ...params, stream: true }, { ...options, headers: { ...options?.headers, "X-Stainless-Helper-Method": "stream" } }));
    return runner;
  }
  async _createChatCompletion(client, params, options) {
    super._createChatCompletion;
    const signal = options?.signal;
    if (signal) {
      if (signal.aborted)
        this.controller.abort();
      signal.addEventListener("abort", () => this.controller.abort());
    }
    __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_beginRequest).call(this);
    const stream = await client.chat.completions.create({ ...params, stream: true }, { ...options, signal: this.controller.signal });
    this._connected();
    for await (const chunk of stream) {
      __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_addChunk).call(this, chunk);
    }
    if (stream.controller.signal?.aborted) {
      throw new APIUserAbortError();
    }
    return this._addChatCompletion(__classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_endRequest).call(this));
  }
  async _fromReadableStream(readableStream, options) {
    const signal = options?.signal;
    if (signal) {
      if (signal.aborted)
        this.controller.abort();
      signal.addEventListener("abort", () => this.controller.abort());
    }
    __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_beginRequest).call(this);
    this._connected();
    const stream = Stream.fromReadableStream(readableStream, this.controller);
    let chatId;
    for await (const chunk of stream) {
      if (chatId && chatId !== chunk.id) {
        this._addChatCompletion(__classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_endRequest).call(this));
      }
      __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_addChunk).call(this, chunk);
      chatId = chunk.id;
    }
    if (stream.controller.signal?.aborted) {
      throw new APIUserAbortError();
    }
    return this._addChatCompletion(__classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_endRequest).call(this));
  }
  [(_ChatCompletionStream_params = /* @__PURE__ */ new WeakMap(), _ChatCompletionStream_choiceEventStates = /* @__PURE__ */ new WeakMap(), _ChatCompletionStream_currentChatCompletionSnapshot = /* @__PURE__ */ new WeakMap(), _ChatCompletionStream_instances = /* @__PURE__ */ new WeakSet(), _ChatCompletionStream_beginRequest = function _ChatCompletionStream_beginRequest2() {
    if (this.ended)
      return;
    __classPrivateFieldSet(this, _ChatCompletionStream_currentChatCompletionSnapshot, void 0, "f");
  }, _ChatCompletionStream_getChoiceEventState = function _ChatCompletionStream_getChoiceEventState2(choice) {
    let state = __classPrivateFieldGet(this, _ChatCompletionStream_choiceEventStates, "f")[choice.index];
    if (state) {
      return state;
    }
    state = {
      content_done: false,
      refusal_done: false,
      logprobs_content_done: false,
      logprobs_refusal_done: false,
      done_tool_calls: /* @__PURE__ */ new Set(),
      current_tool_call_index: null
    };
    __classPrivateFieldGet(this, _ChatCompletionStream_choiceEventStates, "f")[choice.index] = state;
    return state;
  }, _ChatCompletionStream_addChunk = function _ChatCompletionStream_addChunk2(chunk) {
    if (this.ended)
      return;
    const completion = __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_accumulateChatCompletion).call(this, chunk);
    this._emit("chunk", chunk, completion);
    for (const choice of chunk.choices) {
      const choiceSnapshot = completion.choices[choice.index];
      if (choice.delta.content != null && choiceSnapshot.message?.role === "assistant" && choiceSnapshot.message?.content) {
        this._emit("content", choice.delta.content, choiceSnapshot.message.content);
        this._emit("content.delta", {
          delta: choice.delta.content,
          snapshot: choiceSnapshot.message.content,
          parsed: choiceSnapshot.message.parsed
        });
      }
      if (choice.delta.refusal != null && choiceSnapshot.message?.role === "assistant" && choiceSnapshot.message?.refusal) {
        this._emit("refusal.delta", {
          delta: choice.delta.refusal,
          snapshot: choiceSnapshot.message.refusal
        });
      }
      if (choice.logprobs?.content != null && choiceSnapshot.message?.role === "assistant") {
        this._emit("logprobs.content.delta", {
          content: choice.logprobs?.content,
          snapshot: choiceSnapshot.logprobs?.content ?? []
        });
      }
      if (choice.logprobs?.refusal != null && choiceSnapshot.message?.role === "assistant") {
        this._emit("logprobs.refusal.delta", {
          refusal: choice.logprobs?.refusal,
          snapshot: choiceSnapshot.logprobs?.refusal ?? []
        });
      }
      const state = __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_getChoiceEventState).call(this, choiceSnapshot);
      if (choiceSnapshot.finish_reason) {
        __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_emitContentDoneEvents).call(this, choiceSnapshot);
        if (state.current_tool_call_index != null) {
          __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_emitToolCallDoneEvent).call(this, choiceSnapshot, state.current_tool_call_index);
        }
      }
      for (const toolCall of choice.delta.tool_calls ?? []) {
        if (state.current_tool_call_index !== toolCall.index) {
          __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_emitContentDoneEvents).call(this, choiceSnapshot);
          if (state.current_tool_call_index != null) {
            __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_emitToolCallDoneEvent).call(this, choiceSnapshot, state.current_tool_call_index);
          }
        }
        state.current_tool_call_index = toolCall.index;
      }
      for (const toolCallDelta of choice.delta.tool_calls ?? []) {
        const toolCallSnapshot = choiceSnapshot.message.tool_calls?.[toolCallDelta.index];
        if (!toolCallSnapshot?.type) {
          continue;
        }
        if (toolCallSnapshot?.type === "function") {
          this._emit("tool_calls.function.arguments.delta", {
            name: toolCallSnapshot.function?.name,
            index: toolCallDelta.index,
            arguments: toolCallSnapshot.function.arguments,
            parsed_arguments: toolCallSnapshot.function.parsed_arguments,
            arguments_delta: toolCallDelta.function?.arguments ?? ""
          });
        } else {
          assertNever(toolCallSnapshot?.type);
        }
      }
    }
  }, _ChatCompletionStream_emitToolCallDoneEvent = function _ChatCompletionStream_emitToolCallDoneEvent2(choiceSnapshot, toolCallIndex) {
    const state = __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_getChoiceEventState).call(this, choiceSnapshot);
    if (state.done_tool_calls.has(toolCallIndex)) {
      return;
    }
    const toolCallSnapshot = choiceSnapshot.message.tool_calls?.[toolCallIndex];
    if (!toolCallSnapshot) {
      throw new Error("no tool call snapshot");
    }
    if (!toolCallSnapshot.type) {
      throw new Error("tool call snapshot missing `type`");
    }
    if (toolCallSnapshot.type === "function") {
      const inputTool = __classPrivateFieldGet(this, _ChatCompletionStream_params, "f")?.tools?.find((tool) => isChatCompletionFunctionTool(tool) && tool.function.name === toolCallSnapshot.function.name);
      this._emit("tool_calls.function.arguments.done", {
        name: toolCallSnapshot.function.name,
        index: toolCallIndex,
        arguments: toolCallSnapshot.function.arguments,
        parsed_arguments: isAutoParsableTool(inputTool) ? inputTool.$parseRaw(toolCallSnapshot.function.arguments) : inputTool?.function.strict ? JSON.parse(toolCallSnapshot.function.arguments) : null
      });
    } else {
      assertNever(toolCallSnapshot.type);
    }
  }, _ChatCompletionStream_emitContentDoneEvents = function _ChatCompletionStream_emitContentDoneEvents2(choiceSnapshot) {
    const state = __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_getChoiceEventState).call(this, choiceSnapshot);
    if (choiceSnapshot.message.content && !state.content_done) {
      state.content_done = true;
      const responseFormat = __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_getAutoParseableResponseFormat).call(this);
      this._emit("content.done", {
        content: choiceSnapshot.message.content,
        parsed: responseFormat ? responseFormat.$parseRaw(choiceSnapshot.message.content) : null
      });
    }
    if (choiceSnapshot.message.refusal && !state.refusal_done) {
      state.refusal_done = true;
      this._emit("refusal.done", { refusal: choiceSnapshot.message.refusal });
    }
    if (choiceSnapshot.logprobs?.content && !state.logprobs_content_done) {
      state.logprobs_content_done = true;
      this._emit("logprobs.content.done", { content: choiceSnapshot.logprobs.content });
    }
    if (choiceSnapshot.logprobs?.refusal && !state.logprobs_refusal_done) {
      state.logprobs_refusal_done = true;
      this._emit("logprobs.refusal.done", { refusal: choiceSnapshot.logprobs.refusal });
    }
  }, _ChatCompletionStream_endRequest = function _ChatCompletionStream_endRequest2() {
    if (this.ended) {
      throw new OpenAIError(`stream has ended, this shouldn't happen`);
    }
    const snapshot2 = __classPrivateFieldGet(this, _ChatCompletionStream_currentChatCompletionSnapshot, "f");
    if (!snapshot2) {
      throw new OpenAIError(`request ended without sending any chunks`);
    }
    __classPrivateFieldSet(this, _ChatCompletionStream_currentChatCompletionSnapshot, void 0, "f");
    __classPrivateFieldSet(this, _ChatCompletionStream_choiceEventStates, [], "f");
    return finalizeChatCompletion(snapshot2, __classPrivateFieldGet(this, _ChatCompletionStream_params, "f"));
  }, _ChatCompletionStream_getAutoParseableResponseFormat = function _ChatCompletionStream_getAutoParseableResponseFormat2() {
    const responseFormat = __classPrivateFieldGet(this, _ChatCompletionStream_params, "f")?.response_format;
    if (isAutoParsableResponseFormat(responseFormat)) {
      return responseFormat;
    }
    return null;
  }, _ChatCompletionStream_accumulateChatCompletion = function _ChatCompletionStream_accumulateChatCompletion2(chunk) {
    var _a3, _b, _c, _d;
    let snapshot2 = __classPrivateFieldGet(this, _ChatCompletionStream_currentChatCompletionSnapshot, "f");
    const { choices, ...rest } = chunk;
    if (!snapshot2) {
      snapshot2 = __classPrivateFieldSet(this, _ChatCompletionStream_currentChatCompletionSnapshot, {
        ...rest,
        choices: []
      }, "f");
    } else {
      Object.assign(snapshot2, rest);
    }
    for (const { delta, finish_reason, index, logprobs = null, ...other } of chunk.choices) {
      let choice = snapshot2.choices[index];
      if (!choice) {
        choice = snapshot2.choices[index] = { finish_reason, index, message: {}, logprobs, ...other };
      }
      if (logprobs) {
        if (!choice.logprobs) {
          choice.logprobs = Object.assign({}, logprobs);
        } else {
          const { content: content2, refusal: refusal2, ...rest3 } = logprobs;
          assertIsEmpty(rest3);
          Object.assign(choice.logprobs, rest3);
          if (content2) {
            (_a3 = choice.logprobs).content ?? (_a3.content = []);
            choice.logprobs.content.push(...content2);
          }
          if (refusal2) {
            (_b = choice.logprobs).refusal ?? (_b.refusal = []);
            choice.logprobs.refusal.push(...refusal2);
          }
        }
      }
      if (finish_reason) {
        choice.finish_reason = finish_reason;
        if (__classPrivateFieldGet(this, _ChatCompletionStream_params, "f") && hasAutoParseableInput(__classPrivateFieldGet(this, _ChatCompletionStream_params, "f"))) {
          if (finish_reason === "length") {
            throw new LengthFinishReasonError();
          }
          if (finish_reason === "content_filter") {
            throw new ContentFilterFinishReasonError();
          }
        }
      }
      Object.assign(choice, other);
      if (!delta)
        continue;
      const { content, refusal, function_call, role, tool_calls, ...rest2 } = delta;
      assertIsEmpty(rest2);
      Object.assign(choice.message, rest2);
      if (refusal) {
        choice.message.refusal = (choice.message.refusal || "") + refusal;
      }
      if (role)
        choice.message.role = role;
      if (function_call) {
        if (!choice.message.function_call) {
          choice.message.function_call = function_call;
        } else {
          if (function_call.name)
            choice.message.function_call.name = function_call.name;
          if (function_call.arguments) {
            (_c = choice.message.function_call).arguments ?? (_c.arguments = "");
            choice.message.function_call.arguments += function_call.arguments;
          }
        }
      }
      if (content) {
        choice.message.content = (choice.message.content || "") + content;
        if (!choice.message.refusal && __classPrivateFieldGet(this, _ChatCompletionStream_instances, "m", _ChatCompletionStream_getAutoParseableResponseFormat).call(this)) {
          choice.message.parsed = partialParse(choice.message.content);
        }
      }
      if (tool_calls) {
        if (!choice.message.tool_calls)
          choice.message.tool_calls = [];
        for (const { index: index2, id, type, function: fn, ...rest3 } of tool_calls) {
          const tool_call = (_d = choice.message.tool_calls)[index2] ?? (_d[index2] = {});
          Object.assign(tool_call, rest3);
          if (id)
            tool_call.id = id;
          if (type)
            tool_call.type = type;
          if (fn)
            tool_call.function ?? (tool_call.function = { name: fn.name ?? "", arguments: "" });
          if (fn?.name)
            tool_call.function.name = fn.name;
          if (fn?.arguments) {
            tool_call.function.arguments += fn.arguments;
            if (shouldParseToolCall(__classPrivateFieldGet(this, _ChatCompletionStream_params, "f"), tool_call)) {
              tool_call.function.parsed_arguments = partialParse(tool_call.function.arguments);
            }
          }
        }
      }
    }
    return snapshot2;
  }, Symbol.asyncIterator)]() {
    const pushQueue = [];
    const readQueue = [];
    let done = false;
    this.on("chunk", (chunk) => {
      const reader = readQueue.shift();
      if (reader) {
        reader.resolve(chunk);
      } else {
        pushQueue.push(chunk);
      }
    });
    this.on("end", () => {
      done = true;
      for (const reader of readQueue) {
        reader.resolve(void 0);
      }
      readQueue.length = 0;
    });
    this.on("abort", (err) => {
      done = true;
      for (const reader of readQueue) {
        reader.reject(err);
      }
      readQueue.length = 0;
    });
    this.on("error", (err) => {
      done = true;
      for (const reader of readQueue) {
        reader.reject(err);
      }
      readQueue.length = 0;
    });
    return {
      next: async () => {
        if (!pushQueue.length) {
          if (done) {
            return { value: void 0, done: true };
          }
          return new Promise((resolve, reject) => readQueue.push({ resolve, reject })).then((chunk2) => chunk2 ? { value: chunk2, done: false } : { value: void 0, done: true });
        }
        const chunk = pushQueue.shift();
        return { value: chunk, done: false };
      },
      return: async () => {
        this.abort();
        return { value: void 0, done: true };
      }
    };
  }
  toReadableStream() {
    const stream = new Stream(this[Symbol.asyncIterator].bind(this), this.controller);
    return stream.toReadableStream();
  }
};
function finalizeChatCompletion(snapshot2, params) {
  const { id, choices, created, model, system_fingerprint, ...rest } = snapshot2;
  const completion = {
    ...rest,
    id,
    choices: choices.map(({ message, finish_reason, index, logprobs, ...choiceRest }) => {
      if (!finish_reason) {
        throw new OpenAIError(`missing finish_reason for choice ${index}`);
      }
      const { content = null, function_call, tool_calls, ...messageRest } = message;
      const role = message.role;
      if (!role) {
        throw new OpenAIError(`missing role for choice ${index}`);
      }
      if (function_call) {
        const { arguments: args, name } = function_call;
        if (args == null) {
          throw new OpenAIError(`missing function_call.arguments for choice ${index}`);
        }
        if (!name) {
          throw new OpenAIError(`missing function_call.name for choice ${index}`);
        }
        return {
          ...choiceRest,
          message: {
            content,
            function_call: { arguments: args, name },
            role,
            refusal: message.refusal ?? null
          },
          finish_reason,
          index,
          logprobs
        };
      }
      if (tool_calls) {
        return {
          ...choiceRest,
          index,
          finish_reason,
          logprobs,
          message: {
            ...messageRest,
            role,
            content,
            refusal: message.refusal ?? null,
            tool_calls: tool_calls.map((tool_call, i) => {
              const { function: fn, type, id: id2, ...toolRest } = tool_call;
              const { arguments: args, name, ...fnRest } = fn || {};
              if (id2 == null) {
                throw new OpenAIError(`missing choices[${index}].tool_calls[${i}].id
${str(snapshot2)}`);
              }
              if (type == null) {
                throw new OpenAIError(`missing choices[${index}].tool_calls[${i}].type
${str(snapshot2)}`);
              }
              if (name == null) {
                throw new OpenAIError(`missing choices[${index}].tool_calls[${i}].function.name
${str(snapshot2)}`);
              }
              if (args == null) {
                throw new OpenAIError(`missing choices[${index}].tool_calls[${i}].function.arguments
${str(snapshot2)}`);
              }
              return { ...toolRest, id: id2, type, function: { ...fnRest, name, arguments: args } };
            })
          }
        };
      }
      return {
        ...choiceRest,
        message: { ...messageRest, content, role, refusal: message.refusal ?? null },
        finish_reason,
        index,
        logprobs
      };
    }),
    created,
    model,
    object: "chat.completion",
    ...system_fingerprint ? { system_fingerprint } : {}
  };
  return maybeParseChatCompletion(completion, params);
}
function str(x) {
  return JSON.stringify(x);
}
function assertIsEmpty(obj) {
  return;
}
function assertNever(_x) {
}

// codex-rs/wasm/node_modules/openai/lib/ChatCompletionStreamingRunner.mjs
var ChatCompletionStreamingRunner = class _ChatCompletionStreamingRunner extends ChatCompletionStream {
  static fromReadableStream(stream) {
    const runner = new _ChatCompletionStreamingRunner(null);
    runner._run(() => runner._fromReadableStream(stream));
    return runner;
  }
  static runTools(client, params, options) {
    const runner = new _ChatCompletionStreamingRunner(
      // @ts-expect-error TODO these types are incompatible
      params
    );
    const opts = {
      ...options,
      headers: { ...options?.headers, "X-Stainless-Helper-Method": "runTools" }
    };
    runner._run(() => runner._runTools(client, params, opts));
    return runner;
  }
};

// codex-rs/wasm/node_modules/openai/resources/chat/completions/completions.mjs
var Completions = class extends APIResource {
  constructor() {
    super(...arguments);
    this.messages = new Messages(this._client);
  }
  create(body, options) {
    return this._client.post("/chat/completions", { body, ...options, stream: body.stream ?? false });
  }
  /**
   * Get a stored chat completion. Only Chat Completions that have been created with
   * the `store` parameter set to `true` will be returned.
   *
   * @example
   * ```ts
   * const chatCompletion =
   *   await client.chat.completions.retrieve('completion_id');
   * ```
   */
  retrieve(completionID, options) {
    return this._client.get(path`/chat/completions/${completionID}`, options);
  }
  /**
   * Modify a stored chat completion. Only Chat Completions that have been created
   * with the `store` parameter set to `true` can be modified. Currently, the only
   * supported modification is to update the `metadata` field.
   *
   * @example
   * ```ts
   * const chatCompletion = await client.chat.completions.update(
   *   'completion_id',
   *   { metadata: { foo: 'string' } },
   * );
   * ```
   */
  update(completionID, body, options) {
    return this._client.post(path`/chat/completions/${completionID}`, { body, ...options });
  }
  /**
   * List stored Chat Completions. Only Chat Completions that have been stored with
   * the `store` parameter set to `true` will be returned.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const chatCompletion of client.chat.completions.list()) {
   *   // ...
   * }
   * ```
   */
  list(query = {}, options) {
    return this._client.getAPIList("/chat/completions", CursorPage, { query, ...options });
  }
  /**
   * Delete a stored chat completion. Only Chat Completions that have been created
   * with the `store` parameter set to `true` can be deleted.
   *
   * @example
   * ```ts
   * const chatCompletionDeleted =
   *   await client.chat.completions.delete('completion_id');
   * ```
   */
  delete(completionID, options) {
    return this._client.delete(path`/chat/completions/${completionID}`, options);
  }
  parse(body, options) {
    validateInputTools(body.tools);
    return this._client.chat.completions.create(body, {
      ...options,
      headers: {
        ...options?.headers,
        "X-Stainless-Helper-Method": "chat.completions.parse"
      }
    })._thenUnwrap((completion) => parseChatCompletion(completion, body));
  }
  runTools(body, options) {
    if (body.stream) {
      return ChatCompletionStreamingRunner.runTools(this._client, body, options);
    }
    return ChatCompletionRunner.runTools(this._client, body, options);
  }
  /**
   * Creates a chat completion stream
   */
  stream(body, options) {
    return ChatCompletionStream.createChatCompletion(this._client, body, options);
  }
};
Completions.Messages = Messages;

// codex-rs/wasm/node_modules/openai/resources/chat/chat.mjs
var Chat = class extends APIResource {
  constructor() {
    super(...arguments);
    this.completions = new Completions(this._client);
  }
};
Chat.Completions = Completions;

// codex-rs/wasm/node_modules/openai/internal/headers.mjs
var brand_privateNullableHeaders = /* @__PURE__ */ Symbol("brand.privateNullableHeaders");
function* iterateHeaders(headers) {
  if (!headers)
    return;
  if (brand_privateNullableHeaders in headers) {
    const { values, nulls } = headers;
    yield* values.entries();
    for (const name of nulls) {
      yield [name, null];
    }
    return;
  }
  let shouldClear = false;
  let iter;
  if (headers instanceof Headers) {
    iter = headers.entries();
  } else if (isReadonlyArray(headers)) {
    iter = headers;
  } else {
    shouldClear = true;
    iter = Object.entries(headers ?? {});
  }
  for (let row of iter) {
    const name = row[0];
    if (typeof name !== "string")
      throw new TypeError("expected header name to be a string");
    const values = isReadonlyArray(row[1]) ? row[1] : [row[1]];
    let didClear = false;
    for (const value of values) {
      if (value === void 0)
        continue;
      if (shouldClear && !didClear) {
        didClear = true;
        yield [name, null];
      }
      yield [name, value];
    }
  }
}
var buildHeaders = (newHeaders) => {
  const targetHeaders = new Headers();
  const nullHeaders = /* @__PURE__ */ new Set();
  for (const headers of newHeaders) {
    const seenHeaders = /* @__PURE__ */ new Set();
    for (const [name, value] of iterateHeaders(headers)) {
      const lowerName = name.toLowerCase();
      if (!seenHeaders.has(lowerName)) {
        targetHeaders.delete(name);
        seenHeaders.add(lowerName);
      }
      if (value === null) {
        targetHeaders.delete(name);
        nullHeaders.add(lowerName);
      } else {
        targetHeaders.append(name, value);
        nullHeaders.delete(lowerName);
      }
    }
  }
  return { [brand_privateNullableHeaders]: true, values: targetHeaders, nulls: nullHeaders };
};

// codex-rs/wasm/node_modules/openai/resources/audio/speech.mjs
var Speech = class extends APIResource {
  /**
   * Generates audio from the input text.
   *
   * Returns the audio file content, or a stream of audio events.
   *
   * @example
   * ```ts
   * const speech = await client.audio.speech.create({
   *   input: 'input',
   *   model: 'string',
   *   voice: 'string',
   * });
   *
   * const content = await speech.blob();
   * console.log(content);
   * ```
   */
  create(body, options) {
    return this._client.post("/audio/speech", {
      body,
      ...options,
      headers: buildHeaders([{ Accept: "application/octet-stream" }, options?.headers]),
      __binaryResponse: true
    });
  }
};

// codex-rs/wasm/node_modules/openai/resources/audio/transcriptions.mjs
var Transcriptions = class extends APIResource {
  create(body, options) {
    return this._client.post("/audio/transcriptions", multipartFormRequestOptions({
      body,
      ...options,
      stream: body.stream ?? false,
      __metadata: { model: body.model }
    }, this._client));
  }
};

// codex-rs/wasm/node_modules/openai/resources/audio/translations.mjs
var Translations = class extends APIResource {
  create(body, options) {
    return this._client.post("/audio/translations", multipartFormRequestOptions({ body, ...options, __metadata: { model: body.model } }, this._client));
  }
};

// codex-rs/wasm/node_modules/openai/resources/audio/audio.mjs
var Audio = class extends APIResource {
  constructor() {
    super(...arguments);
    this.transcriptions = new Transcriptions(this._client);
    this.translations = new Translations(this._client);
    this.speech = new Speech(this._client);
  }
};
Audio.Transcriptions = Transcriptions;
Audio.Translations = Translations;
Audio.Speech = Speech;

// codex-rs/wasm/node_modules/openai/resources/batches.mjs
var Batches = class extends APIResource {
  /**
   * Creates and executes a batch from an uploaded file of requests
   */
  create(body, options) {
    return this._client.post("/batches", { body, ...options });
  }
  /**
   * Retrieves a batch.
   */
  retrieve(batchID, options) {
    return this._client.get(path`/batches/${batchID}`, options);
  }
  /**
   * List your organization's batches.
   */
  list(query = {}, options) {
    return this._client.getAPIList("/batches", CursorPage, { query, ...options });
  }
  /**
   * Cancels an in-progress batch. The batch will be in status `cancelling` for up to
   * 10 minutes, before changing to `cancelled`, where it will have partial results
   * (if any) available in the output file.
   */
  cancel(batchID, options) {
    return this._client.post(path`/batches/${batchID}/cancel`, options);
  }
};

// codex-rs/wasm/node_modules/openai/resources/beta/assistants.mjs
var Assistants = class extends APIResource {
  /**
   * Create an assistant with a model and instructions.
   *
   * @deprecated
   */
  create(body, options) {
    return this._client.post("/assistants", {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
  /**
   * Retrieves an assistant.
   *
   * @deprecated
   */
  retrieve(assistantID, options) {
    return this._client.get(path`/assistants/${assistantID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
  /**
   * Modifies an assistant.
   *
   * @deprecated
   */
  update(assistantID, body, options) {
    return this._client.post(path`/assistants/${assistantID}`, {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
  /**
   * Returns a list of assistants.
   *
   * @deprecated
   */
  list(query = {}, options) {
    return this._client.getAPIList("/assistants", CursorPage, {
      query,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
  /**
   * Delete an assistant.
   *
   * @deprecated
   */
  delete(assistantID, options) {
    return this._client.delete(path`/assistants/${assistantID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
};

// codex-rs/wasm/node_modules/openai/resources/beta/realtime/sessions.mjs
var Sessions = class extends APIResource {
  /**
   * Create an ephemeral API token for use in client-side applications with the
   * Realtime API. Can be configured with the same session parameters as the
   * `session.update` client event.
   *
   * It responds with a session object, plus a `client_secret` key which contains a
   * usable ephemeral API token that can be used to authenticate browser clients for
   * the Realtime API.
   *
   * @example
   * ```ts
   * const session =
   *   await client.beta.realtime.sessions.create();
   * ```
   */
  create(body, options) {
    return this._client.post("/realtime/sessions", {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
};

// codex-rs/wasm/node_modules/openai/resources/beta/realtime/transcription-sessions.mjs
var TranscriptionSessions = class extends APIResource {
  /**
   * Create an ephemeral API token for use in client-side applications with the
   * Realtime API specifically for realtime transcriptions. Can be configured with
   * the same session parameters as the `transcription_session.update` client event.
   *
   * It responds with a session object, plus a `client_secret` key which contains a
   * usable ephemeral API token that can be used to authenticate browser clients for
   * the Realtime API.
   *
   * @example
   * ```ts
   * const transcriptionSession =
   *   await client.beta.realtime.transcriptionSessions.create();
   * ```
   */
  create(body, options) {
    return this._client.post("/realtime/transcription_sessions", {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
};

// codex-rs/wasm/node_modules/openai/resources/beta/realtime/realtime.mjs
var Realtime = class extends APIResource {
  constructor() {
    super(...arguments);
    this.sessions = new Sessions(this._client);
    this.transcriptionSessions = new TranscriptionSessions(this._client);
  }
};
Realtime.Sessions = Sessions;
Realtime.TranscriptionSessions = TranscriptionSessions;

// codex-rs/wasm/node_modules/openai/resources/beta/chatkit/sessions.mjs
var Sessions2 = class extends APIResource {
  /**
   * Create a ChatKit session.
   *
   * @example
   * ```ts
   * const chatSession =
   *   await client.beta.chatkit.sessions.create({
   *     user: 'x',
   *     workflow: { id: 'id' },
   *   });
   * ```
   */
  create(body, options) {
    return this._client.post("/chatkit/sessions", {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "chatkit_beta=v1" }, options?.headers])
    });
  }
  /**
   * Cancel an active ChatKit session and return its most recent metadata.
   *
   * Cancelling prevents new requests from using the issued client secret.
   *
   * @example
   * ```ts
   * const chatSession =
   *   await client.beta.chatkit.sessions.cancel('cksess_123');
   * ```
   */
  cancel(sessionID, options) {
    return this._client.post(path`/chatkit/sessions/${sessionID}/cancel`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "chatkit_beta=v1" }, options?.headers])
    });
  }
};

// codex-rs/wasm/node_modules/openai/resources/beta/chatkit/threads.mjs
var Threads = class extends APIResource {
  /**
   * Retrieve a ChatKit thread by its identifier.
   *
   * @example
   * ```ts
   * const chatkitThread =
   *   await client.beta.chatkit.threads.retrieve('cthr_123');
   * ```
   */
  retrieve(threadID, options) {
    return this._client.get(path`/chatkit/threads/${threadID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "chatkit_beta=v1" }, options?.headers])
    });
  }
  /**
   * List ChatKit threads with optional pagination and user filters.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const chatkitThread of client.beta.chatkit.threads.list()) {
   *   // ...
   * }
   * ```
   */
  list(query = {}, options) {
    return this._client.getAPIList("/chatkit/threads", ConversationCursorPage, {
      query,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "chatkit_beta=v1" }, options?.headers])
    });
  }
  /**
   * Delete a ChatKit thread along with its items and stored attachments.
   *
   * @example
   * ```ts
   * const thread = await client.beta.chatkit.threads.delete(
   *   'cthr_123',
   * );
   * ```
   */
  delete(threadID, options) {
    return this._client.delete(path`/chatkit/threads/${threadID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "chatkit_beta=v1" }, options?.headers])
    });
  }
  /**
   * List items that belong to a ChatKit thread.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const thread of client.beta.chatkit.threads.listItems(
   *   'cthr_123',
   * )) {
   *   // ...
   * }
   * ```
   */
  listItems(threadID, query = {}, options) {
    return this._client.getAPIList(path`/chatkit/threads/${threadID}/items`, ConversationCursorPage, { query, ...options, headers: buildHeaders([{ "OpenAI-Beta": "chatkit_beta=v1" }, options?.headers]) });
  }
};

// codex-rs/wasm/node_modules/openai/resources/beta/chatkit/chatkit.mjs
var ChatKit = class extends APIResource {
  constructor() {
    super(...arguments);
    this.sessions = new Sessions2(this._client);
    this.threads = new Threads(this._client);
  }
};
ChatKit.Sessions = Sessions2;
ChatKit.Threads = Threads;

// codex-rs/wasm/node_modules/openai/resources/beta/threads/messages.mjs
var Messages2 = class extends APIResource {
  /**
   * Create a message.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  create(threadID, body, options) {
    return this._client.post(path`/threads/${threadID}/messages`, {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
  /**
   * Retrieve a message.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  retrieve(messageID, params, options) {
    const { thread_id } = params;
    return this._client.get(path`/threads/${thread_id}/messages/${messageID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
  /**
   * Modifies a message.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  update(messageID, params, options) {
    const { thread_id, ...body } = params;
    return this._client.post(path`/threads/${thread_id}/messages/${messageID}`, {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
  /**
   * Returns a list of messages for a given thread.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  list(threadID, query = {}, options) {
    return this._client.getAPIList(path`/threads/${threadID}/messages`, CursorPage, {
      query,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
  /**
   * Deletes a message.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  delete(messageID, params, options) {
    const { thread_id } = params;
    return this._client.delete(path`/threads/${thread_id}/messages/${messageID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
};

// codex-rs/wasm/node_modules/openai/resources/beta/threads/runs/steps.mjs
var Steps = class extends APIResource {
  /**
   * Retrieves a run step.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  retrieve(stepID, params, options) {
    const { thread_id, run_id, ...query } = params;
    return this._client.get(path`/threads/${thread_id}/runs/${run_id}/steps/${stepID}`, {
      query,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
  /**
   * Returns a list of run steps belonging to a run.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  list(runID, params, options) {
    const { thread_id, ...query } = params;
    return this._client.getAPIList(path`/threads/${thread_id}/runs/${runID}/steps`, CursorPage, {
      query,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
};

// codex-rs/wasm/node_modules/openai/internal/utils/base64.mjs
var toFloat32Array = (base64Str) => {
  if (typeof Buffer !== "undefined") {
    const buf = Buffer.from(base64Str, "base64");
    return Array.from(new Float32Array(buf.buffer, buf.byteOffset, buf.length / Float32Array.BYTES_PER_ELEMENT));
  } else {
    const binaryStr = atob(base64Str);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return Array.from(new Float32Array(bytes.buffer));
  }
};

// codex-rs/wasm/node_modules/openai/internal/utils/env.mjs
var readEnv = (env) => {
  if (typeof globalThis.process !== "undefined") {
    return globalThis.process.env?.[env]?.trim() ?? void 0;
  }
  if (typeof globalThis.Deno !== "undefined") {
    return globalThis.Deno.env?.get?.(env)?.trim();
  }
  return void 0;
};

// codex-rs/wasm/node_modules/openai/lib/AssistantStream.mjs
var _AssistantStream_instances;
var _a;
var _AssistantStream_events;
var _AssistantStream_runStepSnapshots;
var _AssistantStream_messageSnapshots;
var _AssistantStream_messageSnapshot;
var _AssistantStream_finalRun;
var _AssistantStream_currentContentIndex;
var _AssistantStream_currentContent;
var _AssistantStream_currentToolCallIndex;
var _AssistantStream_currentToolCall;
var _AssistantStream_currentEvent;
var _AssistantStream_currentRunSnapshot;
var _AssistantStream_currentRunStepSnapshot;
var _AssistantStream_addEvent;
var _AssistantStream_endRequest;
var _AssistantStream_handleMessage;
var _AssistantStream_handleRunStep;
var _AssistantStream_handleEvent;
var _AssistantStream_accumulateRunStep;
var _AssistantStream_accumulateMessage;
var _AssistantStream_accumulateContent;
var _AssistantStream_handleRun;
var AssistantStream = class extends EventStream {
  constructor() {
    super(...arguments);
    _AssistantStream_instances.add(this);
    _AssistantStream_events.set(this, []);
    _AssistantStream_runStepSnapshots.set(this, {});
    _AssistantStream_messageSnapshots.set(this, {});
    _AssistantStream_messageSnapshot.set(this, void 0);
    _AssistantStream_finalRun.set(this, void 0);
    _AssistantStream_currentContentIndex.set(this, void 0);
    _AssistantStream_currentContent.set(this, void 0);
    _AssistantStream_currentToolCallIndex.set(this, void 0);
    _AssistantStream_currentToolCall.set(this, void 0);
    _AssistantStream_currentEvent.set(this, void 0);
    _AssistantStream_currentRunSnapshot.set(this, void 0);
    _AssistantStream_currentRunStepSnapshot.set(this, void 0);
  }
  [(_AssistantStream_events = /* @__PURE__ */ new WeakMap(), _AssistantStream_runStepSnapshots = /* @__PURE__ */ new WeakMap(), _AssistantStream_messageSnapshots = /* @__PURE__ */ new WeakMap(), _AssistantStream_messageSnapshot = /* @__PURE__ */ new WeakMap(), _AssistantStream_finalRun = /* @__PURE__ */ new WeakMap(), _AssistantStream_currentContentIndex = /* @__PURE__ */ new WeakMap(), _AssistantStream_currentContent = /* @__PURE__ */ new WeakMap(), _AssistantStream_currentToolCallIndex = /* @__PURE__ */ new WeakMap(), _AssistantStream_currentToolCall = /* @__PURE__ */ new WeakMap(), _AssistantStream_currentEvent = /* @__PURE__ */ new WeakMap(), _AssistantStream_currentRunSnapshot = /* @__PURE__ */ new WeakMap(), _AssistantStream_currentRunStepSnapshot = /* @__PURE__ */ new WeakMap(), _AssistantStream_instances = /* @__PURE__ */ new WeakSet(), Symbol.asyncIterator)]() {
    const pushQueue = [];
    const readQueue = [];
    let done = false;
    this.on("event", (event) => {
      const reader = readQueue.shift();
      if (reader) {
        reader.resolve(event);
      } else {
        pushQueue.push(event);
      }
    });
    this.on("end", () => {
      done = true;
      for (const reader of readQueue) {
        reader.resolve(void 0);
      }
      readQueue.length = 0;
    });
    this.on("abort", (err) => {
      done = true;
      for (const reader of readQueue) {
        reader.reject(err);
      }
      readQueue.length = 0;
    });
    this.on("error", (err) => {
      done = true;
      for (const reader of readQueue) {
        reader.reject(err);
      }
      readQueue.length = 0;
    });
    return {
      next: async () => {
        if (!pushQueue.length) {
          if (done) {
            return { value: void 0, done: true };
          }
          return new Promise((resolve, reject) => readQueue.push({ resolve, reject })).then((chunk2) => chunk2 ? { value: chunk2, done: false } : { value: void 0, done: true });
        }
        const chunk = pushQueue.shift();
        return { value: chunk, done: false };
      },
      return: async () => {
        this.abort();
        return { value: void 0, done: true };
      }
    };
  }
  static fromReadableStream(stream) {
    const runner = new _a();
    runner._run(() => runner._fromReadableStream(stream));
    return runner;
  }
  async _fromReadableStream(readableStream, options) {
    const signal = options?.signal;
    if (signal) {
      if (signal.aborted)
        this.controller.abort();
      signal.addEventListener("abort", () => this.controller.abort());
    }
    this._connected();
    const stream = Stream.fromReadableStream(readableStream, this.controller);
    for await (const event of stream) {
      __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_addEvent).call(this, event);
    }
    if (stream.controller.signal?.aborted) {
      throw new APIUserAbortError();
    }
    return this._addRun(__classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_endRequest).call(this));
  }
  toReadableStream() {
    const stream = new Stream(this[Symbol.asyncIterator].bind(this), this.controller);
    return stream.toReadableStream();
  }
  static createToolAssistantStream(runId, runs, params, options) {
    const runner = new _a();
    runner._run(() => runner._runToolAssistantStream(runId, runs, params, {
      ...options,
      headers: { ...options?.headers, "X-Stainless-Helper-Method": "stream" }
    }));
    return runner;
  }
  async _createToolAssistantStream(run, runId, params, options) {
    const signal = options?.signal;
    if (signal) {
      if (signal.aborted)
        this.controller.abort();
      signal.addEventListener("abort", () => this.controller.abort());
    }
    const body = { ...params, stream: true };
    const stream = await run.submitToolOutputs(runId, body, {
      ...options,
      signal: this.controller.signal
    });
    this._connected();
    for await (const event of stream) {
      __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_addEvent).call(this, event);
    }
    if (stream.controller.signal?.aborted) {
      throw new APIUserAbortError();
    }
    return this._addRun(__classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_endRequest).call(this));
  }
  static createThreadAssistantStream(params, thread, options) {
    const runner = new _a();
    runner._run(() => runner._threadAssistantStream(params, thread, {
      ...options,
      headers: { ...options?.headers, "X-Stainless-Helper-Method": "stream" }
    }));
    return runner;
  }
  static createAssistantStream(threadId, runs, params, options) {
    const runner = new _a();
    runner._run(() => runner._runAssistantStream(threadId, runs, params, {
      ...options,
      headers: { ...options?.headers, "X-Stainless-Helper-Method": "stream" }
    }));
    return runner;
  }
  currentEvent() {
    return __classPrivateFieldGet(this, _AssistantStream_currentEvent, "f");
  }
  currentRun() {
    return __classPrivateFieldGet(this, _AssistantStream_currentRunSnapshot, "f");
  }
  currentMessageSnapshot() {
    return __classPrivateFieldGet(this, _AssistantStream_messageSnapshot, "f");
  }
  currentRunStepSnapshot() {
    return __classPrivateFieldGet(this, _AssistantStream_currentRunStepSnapshot, "f");
  }
  async finalRunSteps() {
    await this.done();
    return Object.values(__classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f"));
  }
  async finalMessages() {
    await this.done();
    return Object.values(__classPrivateFieldGet(this, _AssistantStream_messageSnapshots, "f"));
  }
  async finalRun() {
    await this.done();
    if (!__classPrivateFieldGet(this, _AssistantStream_finalRun, "f"))
      throw Error("Final run was not received.");
    return __classPrivateFieldGet(this, _AssistantStream_finalRun, "f");
  }
  async _createThreadAssistantStream(thread, params, options) {
    const signal = options?.signal;
    if (signal) {
      if (signal.aborted)
        this.controller.abort();
      signal.addEventListener("abort", () => this.controller.abort());
    }
    const body = { ...params, stream: true };
    const stream = await thread.createAndRun(body, { ...options, signal: this.controller.signal });
    this._connected();
    for await (const event of stream) {
      __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_addEvent).call(this, event);
    }
    if (stream.controller.signal?.aborted) {
      throw new APIUserAbortError();
    }
    return this._addRun(__classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_endRequest).call(this));
  }
  async _createAssistantStream(run, threadId, params, options) {
    const signal = options?.signal;
    if (signal) {
      if (signal.aborted)
        this.controller.abort();
      signal.addEventListener("abort", () => this.controller.abort());
    }
    const body = { ...params, stream: true };
    const stream = await run.create(threadId, body, { ...options, signal: this.controller.signal });
    this._connected();
    for await (const event of stream) {
      __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_addEvent).call(this, event);
    }
    if (stream.controller.signal?.aborted) {
      throw new APIUserAbortError();
    }
    return this._addRun(__classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_endRequest).call(this));
  }
  static accumulateDelta(acc, delta) {
    for (const [key, deltaValue] of Object.entries(delta)) {
      if (!acc.hasOwnProperty(key)) {
        acc[key] = deltaValue;
        continue;
      }
      let accValue = acc[key];
      if (accValue === null || accValue === void 0) {
        acc[key] = deltaValue;
        continue;
      }
      if (key === "index" || key === "type") {
        acc[key] = deltaValue;
        continue;
      }
      if (typeof accValue === "string" && typeof deltaValue === "string") {
        accValue += deltaValue;
      } else if (typeof accValue === "number" && typeof deltaValue === "number") {
        accValue += deltaValue;
      } else if (isObj(accValue) && isObj(deltaValue)) {
        accValue = this.accumulateDelta(accValue, deltaValue);
      } else if (Array.isArray(accValue) && Array.isArray(deltaValue)) {
        if (accValue.every((x) => typeof x === "string" || typeof x === "number")) {
          accValue.push(...deltaValue);
          continue;
        }
        for (const deltaEntry of deltaValue) {
          if (!isObj(deltaEntry)) {
            throw new Error(`Expected array delta entry to be an object but got: ${deltaEntry}`);
          }
          const index = deltaEntry["index"];
          if (index == null) {
            console.error(deltaEntry);
            throw new Error("Expected array delta entry to have an `index` property");
          }
          if (typeof index !== "number") {
            throw new Error(`Expected array delta entry \`index\` property to be a number but got ${index}`);
          }
          const accEntry = accValue[index];
          if (accEntry == null) {
            accValue.push(deltaEntry);
          } else {
            accValue[index] = this.accumulateDelta(accEntry, deltaEntry);
          }
        }
        continue;
      } else {
        throw Error(`Unhandled record type: ${key}, deltaValue: ${deltaValue}, accValue: ${accValue}`);
      }
      acc[key] = accValue;
    }
    return acc;
  }
  _addRun(run) {
    return run;
  }
  async _threadAssistantStream(params, thread, options) {
    return await this._createThreadAssistantStream(thread, params, options);
  }
  async _runAssistantStream(threadId, runs, params, options) {
    return await this._createAssistantStream(runs, threadId, params, options);
  }
  async _runToolAssistantStream(runId, runs, params, options) {
    return await this._createToolAssistantStream(runs, runId, params, options);
  }
};
_a = AssistantStream, _AssistantStream_addEvent = function _AssistantStream_addEvent2(event) {
  if (this.ended)
    return;
  __classPrivateFieldSet(this, _AssistantStream_currentEvent, event, "f");
  __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_handleEvent).call(this, event);
  switch (event.event) {
    case "thread.created":
      break;
    case "thread.run.created":
    case "thread.run.queued":
    case "thread.run.in_progress":
    case "thread.run.requires_action":
    case "thread.run.completed":
    case "thread.run.incomplete":
    case "thread.run.failed":
    case "thread.run.cancelling":
    case "thread.run.cancelled":
    case "thread.run.expired":
      __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_handleRun).call(this, event);
      break;
    case "thread.run.step.created":
    case "thread.run.step.in_progress":
    case "thread.run.step.delta":
    case "thread.run.step.completed":
    case "thread.run.step.failed":
    case "thread.run.step.cancelled":
    case "thread.run.step.expired":
      __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_handleRunStep).call(this, event);
      break;
    case "thread.message.created":
    case "thread.message.in_progress":
    case "thread.message.delta":
    case "thread.message.completed":
    case "thread.message.incomplete":
      __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_handleMessage).call(this, event);
      break;
    case "error":
      throw new Error("Encountered an error event in event processing - errors should be processed earlier");
    default:
      assertNever2(event);
  }
}, _AssistantStream_endRequest = function _AssistantStream_endRequest2() {
  if (this.ended) {
    throw new OpenAIError(`stream has ended, this shouldn't happen`);
  }
  if (!__classPrivateFieldGet(this, _AssistantStream_finalRun, "f"))
    throw Error("Final run has not been received");
  return __classPrivateFieldGet(this, _AssistantStream_finalRun, "f");
}, _AssistantStream_handleMessage = function _AssistantStream_handleMessage2(event) {
  const [accumulatedMessage, newContent] = __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_accumulateMessage).call(this, event, __classPrivateFieldGet(this, _AssistantStream_messageSnapshot, "f"));
  __classPrivateFieldSet(this, _AssistantStream_messageSnapshot, accumulatedMessage, "f");
  __classPrivateFieldGet(this, _AssistantStream_messageSnapshots, "f")[accumulatedMessage.id] = accumulatedMessage;
  for (const content of newContent) {
    const snapshotContent = accumulatedMessage.content[content.index];
    if (snapshotContent?.type == "text") {
      this._emit("textCreated", snapshotContent.text);
    }
  }
  switch (event.event) {
    case "thread.message.created":
      this._emit("messageCreated", event.data);
      break;
    case "thread.message.in_progress":
      break;
    case "thread.message.delta":
      this._emit("messageDelta", event.data.delta, accumulatedMessage);
      if (event.data.delta.content) {
        for (const content of event.data.delta.content) {
          if (content.type == "text" && content.text) {
            let textDelta = content.text;
            let snapshot2 = accumulatedMessage.content[content.index];
            if (snapshot2 && snapshot2.type == "text") {
              this._emit("textDelta", textDelta, snapshot2.text);
            } else {
              throw Error("The snapshot associated with this text delta is not text or missing");
            }
          }
          if (content.index != __classPrivateFieldGet(this, _AssistantStream_currentContentIndex, "f")) {
            if (__classPrivateFieldGet(this, _AssistantStream_currentContent, "f")) {
              switch (__classPrivateFieldGet(this, _AssistantStream_currentContent, "f").type) {
                case "text":
                  this._emit("textDone", __classPrivateFieldGet(this, _AssistantStream_currentContent, "f").text, __classPrivateFieldGet(this, _AssistantStream_messageSnapshot, "f"));
                  break;
                case "image_file":
                  this._emit("imageFileDone", __classPrivateFieldGet(this, _AssistantStream_currentContent, "f").image_file, __classPrivateFieldGet(this, _AssistantStream_messageSnapshot, "f"));
                  break;
              }
            }
            __classPrivateFieldSet(this, _AssistantStream_currentContentIndex, content.index, "f");
          }
          __classPrivateFieldSet(this, _AssistantStream_currentContent, accumulatedMessage.content[content.index], "f");
        }
      }
      break;
    case "thread.message.completed":
    case "thread.message.incomplete":
      if (__classPrivateFieldGet(this, _AssistantStream_currentContentIndex, "f") !== void 0) {
        const currentContent = event.data.content[__classPrivateFieldGet(this, _AssistantStream_currentContentIndex, "f")];
        if (currentContent) {
          switch (currentContent.type) {
            case "image_file":
              this._emit("imageFileDone", currentContent.image_file, __classPrivateFieldGet(this, _AssistantStream_messageSnapshot, "f"));
              break;
            case "text":
              this._emit("textDone", currentContent.text, __classPrivateFieldGet(this, _AssistantStream_messageSnapshot, "f"));
              break;
          }
        }
      }
      if (__classPrivateFieldGet(this, _AssistantStream_messageSnapshot, "f")) {
        this._emit("messageDone", event.data);
      }
      __classPrivateFieldSet(this, _AssistantStream_messageSnapshot, void 0, "f");
  }
}, _AssistantStream_handleRunStep = function _AssistantStream_handleRunStep2(event) {
  const accumulatedRunStep = __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_accumulateRunStep).call(this, event);
  __classPrivateFieldSet(this, _AssistantStream_currentRunStepSnapshot, accumulatedRunStep, "f");
  switch (event.event) {
    case "thread.run.step.created":
      this._emit("runStepCreated", event.data);
      break;
    case "thread.run.step.delta":
      const delta = event.data.delta;
      if (delta.step_details && delta.step_details.type == "tool_calls" && delta.step_details.tool_calls && accumulatedRunStep.step_details.type == "tool_calls") {
        for (const toolCall of delta.step_details.tool_calls) {
          if (toolCall.index == __classPrivateFieldGet(this, _AssistantStream_currentToolCallIndex, "f")) {
            this._emit("toolCallDelta", toolCall, accumulatedRunStep.step_details.tool_calls[toolCall.index]);
          } else {
            if (__classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f")) {
              this._emit("toolCallDone", __classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f"));
            }
            __classPrivateFieldSet(this, _AssistantStream_currentToolCallIndex, toolCall.index, "f");
            __classPrivateFieldSet(this, _AssistantStream_currentToolCall, accumulatedRunStep.step_details.tool_calls[toolCall.index], "f");
            if (__classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f"))
              this._emit("toolCallCreated", __classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f"));
          }
        }
      }
      this._emit("runStepDelta", event.data.delta, accumulatedRunStep);
      break;
    case "thread.run.step.completed":
    case "thread.run.step.failed":
    case "thread.run.step.cancelled":
    case "thread.run.step.expired":
      __classPrivateFieldSet(this, _AssistantStream_currentRunStepSnapshot, void 0, "f");
      const details = event.data.step_details;
      if (details.type == "tool_calls") {
        if (__classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f")) {
          this._emit("toolCallDone", __classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f"));
          __classPrivateFieldSet(this, _AssistantStream_currentToolCall, void 0, "f");
        }
      }
      this._emit("runStepDone", event.data, accumulatedRunStep);
      break;
    case "thread.run.step.in_progress":
      break;
  }
}, _AssistantStream_handleEvent = function _AssistantStream_handleEvent2(event) {
  __classPrivateFieldGet(this, _AssistantStream_events, "f").push(event);
  this._emit("event", event);
}, _AssistantStream_accumulateRunStep = function _AssistantStream_accumulateRunStep2(event) {
  switch (event.event) {
    case "thread.run.step.created":
      __classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f")[event.data.id] = event.data;
      return event.data;
    case "thread.run.step.delta":
      let snapshot2 = __classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f")[event.data.id];
      if (!snapshot2) {
        throw Error("Received a RunStepDelta before creation of a snapshot");
      }
      let data = event.data;
      if (data.delta) {
        const accumulated = _a.accumulateDelta(snapshot2, data.delta);
        __classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f")[event.data.id] = accumulated;
      }
      return __classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f")[event.data.id];
    case "thread.run.step.completed":
    case "thread.run.step.failed":
    case "thread.run.step.cancelled":
    case "thread.run.step.expired":
    case "thread.run.step.in_progress":
      __classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f")[event.data.id] = event.data;
      break;
  }
  if (__classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f")[event.data.id])
    return __classPrivateFieldGet(this, _AssistantStream_runStepSnapshots, "f")[event.data.id];
  throw new Error("No snapshot available");
}, _AssistantStream_accumulateMessage = function _AssistantStream_accumulateMessage2(event, snapshot2) {
  let newContent = [];
  switch (event.event) {
    case "thread.message.created":
      return [event.data, newContent];
    case "thread.message.delta":
      if (!snapshot2) {
        throw Error("Received a delta with no existing snapshot (there should be one from message creation)");
      }
      let data = event.data;
      if (data.delta.content) {
        for (const contentElement of data.delta.content) {
          if (contentElement.index in snapshot2.content) {
            let currentContent = snapshot2.content[contentElement.index];
            snapshot2.content[contentElement.index] = __classPrivateFieldGet(this, _AssistantStream_instances, "m", _AssistantStream_accumulateContent).call(this, contentElement, currentContent);
          } else {
            snapshot2.content[contentElement.index] = contentElement;
            newContent.push(contentElement);
          }
        }
      }
      return [snapshot2, newContent];
    case "thread.message.in_progress":
    case "thread.message.completed":
    case "thread.message.incomplete":
      if (snapshot2) {
        return [snapshot2, newContent];
      } else {
        throw Error("Received thread message event with no existing snapshot");
      }
  }
  throw Error("Tried to accumulate a non-message event");
}, _AssistantStream_accumulateContent = function _AssistantStream_accumulateContent2(contentElement, currentContent) {
  return _a.accumulateDelta(currentContent, contentElement);
}, _AssistantStream_handleRun = function _AssistantStream_handleRun2(event) {
  __classPrivateFieldSet(this, _AssistantStream_currentRunSnapshot, event.data, "f");
  switch (event.event) {
    case "thread.run.created":
      break;
    case "thread.run.queued":
      break;
    case "thread.run.in_progress":
      break;
    case "thread.run.requires_action":
    case "thread.run.cancelled":
    case "thread.run.failed":
    case "thread.run.completed":
    case "thread.run.expired":
    case "thread.run.incomplete":
      __classPrivateFieldSet(this, _AssistantStream_finalRun, event.data, "f");
      if (__classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f")) {
        this._emit("toolCallDone", __classPrivateFieldGet(this, _AssistantStream_currentToolCall, "f"));
        __classPrivateFieldSet(this, _AssistantStream_currentToolCall, void 0, "f");
      }
      break;
    case "thread.run.cancelling":
      break;
  }
};
function assertNever2(_x) {
}

// codex-rs/wasm/node_modules/openai/resources/beta/threads/runs/runs.mjs
var Runs = class extends APIResource {
  constructor() {
    super(...arguments);
    this.steps = new Steps(this._client);
  }
  create(threadID, params, options) {
    const { include, ...body } = params;
    return this._client.post(path`/threads/${threadID}/runs`, {
      query: { include },
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      stream: params.stream ?? false,
      __synthesizeEventData: true
    });
  }
  /**
   * Retrieves a run.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  retrieve(runID, params, options) {
    const { thread_id } = params;
    return this._client.get(path`/threads/${thread_id}/runs/${runID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
  /**
   * Modifies a run.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  update(runID, params, options) {
    const { thread_id, ...body } = params;
    return this._client.post(path`/threads/${thread_id}/runs/${runID}`, {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
  /**
   * Returns a list of runs belonging to a thread.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  list(threadID, query = {}, options) {
    return this._client.getAPIList(path`/threads/${threadID}/runs`, CursorPage, {
      query,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
  /**
   * Cancels a run that is `in_progress`.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  cancel(runID, params, options) {
    const { thread_id } = params;
    return this._client.post(path`/threads/${thread_id}/runs/${runID}/cancel`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
  /**
   * A helper to create a run an poll for a terminal state. More information on Run
   * lifecycles can be found here:
   * https://platform.openai.com/docs/assistants/how-it-works/runs-and-run-steps
   */
  async createAndPoll(threadId, body, options) {
    const run = await this.create(threadId, body, options);
    return await this.poll(run.id, { thread_id: threadId }, options);
  }
  /**
   * Create a Run stream
   *
   * @deprecated use `stream` instead
   */
  createAndStream(threadId, body, options) {
    return AssistantStream.createAssistantStream(threadId, this._client.beta.threads.runs, body, options);
  }
  /**
   * A helper to poll a run status until it reaches a terminal state. More
   * information on Run lifecycles can be found here:
   * https://platform.openai.com/docs/assistants/how-it-works/runs-and-run-steps
   */
  async poll(runId, params, options) {
    const headers = buildHeaders([
      options?.headers,
      {
        "X-Stainless-Poll-Helper": "true",
        "X-Stainless-Custom-Poll-Interval": options?.pollIntervalMs?.toString() ?? void 0
      }
    ]);
    while (true) {
      const { data: run, response } = await this.retrieve(runId, params, {
        ...options,
        headers: { ...options?.headers, ...headers }
      }).withResponse();
      switch (run.status) {
        //If we are in any sort of intermediate state we poll
        case "queued":
        case "in_progress":
        case "cancelling":
          let sleepInterval = 5e3;
          if (options?.pollIntervalMs) {
            sleepInterval = options.pollIntervalMs;
          } else {
            const headerInterval = response.headers.get("openai-poll-after-ms");
            if (headerInterval) {
              const headerIntervalMs = parseInt(headerInterval);
              if (!isNaN(headerIntervalMs)) {
                sleepInterval = headerIntervalMs;
              }
            }
          }
          await sleep(sleepInterval);
          break;
        //We return the run in any terminal state.
        case "requires_action":
        case "incomplete":
        case "cancelled":
        case "completed":
        case "failed":
        case "expired":
          return run;
      }
    }
  }
  /**
   * Create a Run stream
   */
  stream(threadId, body, options) {
    return AssistantStream.createAssistantStream(threadId, this._client.beta.threads.runs, body, options);
  }
  submitToolOutputs(runID, params, options) {
    const { thread_id, ...body } = params;
    return this._client.post(path`/threads/${thread_id}/runs/${runID}/submit_tool_outputs`, {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      stream: params.stream ?? false,
      __synthesizeEventData: true
    });
  }
  /**
   * A helper to submit a tool output to a run and poll for a terminal run state.
   * More information on Run lifecycles can be found here:
   * https://platform.openai.com/docs/assistants/how-it-works/runs-and-run-steps
   */
  async submitToolOutputsAndPoll(runId, params, options) {
    const run = await this.submitToolOutputs(runId, params, options);
    return await this.poll(run.id, params, options);
  }
  /**
   * Submit the tool outputs from a previous run and stream the run to a terminal
   * state. More information on Run lifecycles can be found here:
   * https://platform.openai.com/docs/assistants/how-it-works/runs-and-run-steps
   */
  submitToolOutputsStream(runId, params, options) {
    return AssistantStream.createToolAssistantStream(runId, this._client.beta.threads.runs, params, options);
  }
};
Runs.Steps = Steps;

// codex-rs/wasm/node_modules/openai/resources/beta/threads/threads.mjs
var Threads2 = class extends APIResource {
  constructor() {
    super(...arguments);
    this.runs = new Runs(this._client);
    this.messages = new Messages2(this._client);
  }
  /**
   * Create a thread.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  create(body = {}, options) {
    return this._client.post("/threads", {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
  /**
   * Retrieves a thread.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  retrieve(threadID, options) {
    return this._client.get(path`/threads/${threadID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
  /**
   * Modifies a thread.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  update(threadID, body, options) {
    return this._client.post(path`/threads/${threadID}`, {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
  /**
   * Delete a thread.
   *
   * @deprecated The Assistants API is deprecated in favor of the Responses API
   */
  delete(threadID, options) {
    return this._client.delete(path`/threads/${threadID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
  createAndRun(body, options) {
    return this._client.post("/threads/runs", {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]),
      stream: body.stream ?? false,
      __synthesizeEventData: true
    });
  }
  /**
   * A helper to create a thread, start a run and then poll for a terminal state.
   * More information on Run lifecycles can be found here:
   * https://platform.openai.com/docs/assistants/how-it-works/runs-and-run-steps
   */
  async createAndRunPoll(body, options) {
    const run = await this.createAndRun(body, options);
    return await this.runs.poll(run.id, { thread_id: run.thread_id }, options);
  }
  /**
   * Create a thread and stream the run back
   */
  createAndRunStream(body, options) {
    return AssistantStream.createThreadAssistantStream(body, this._client.beta.threads, options);
  }
};
Threads2.Runs = Runs;
Threads2.Messages = Messages2;

// codex-rs/wasm/node_modules/openai/resources/beta/beta.mjs
var Beta = class extends APIResource {
  constructor() {
    super(...arguments);
    this.realtime = new Realtime(this._client);
    this.chatkit = new ChatKit(this._client);
    this.assistants = new Assistants(this._client);
    this.threads = new Threads2(this._client);
  }
};
Beta.Realtime = Realtime;
Beta.ChatKit = ChatKit;
Beta.Assistants = Assistants;
Beta.Threads = Threads2;

// codex-rs/wasm/node_modules/openai/resources/completions.mjs
var Completions2 = class extends APIResource {
  create(body, options) {
    return this._client.post("/completions", { body, ...options, stream: body.stream ?? false });
  }
};

// codex-rs/wasm/node_modules/openai/resources/containers/files/content.mjs
var Content = class extends APIResource {
  /**
   * Retrieve Container File Content
   */
  retrieve(fileID, params, options) {
    const { container_id } = params;
    return this._client.get(path`/containers/${container_id}/files/${fileID}/content`, {
      ...options,
      headers: buildHeaders([{ Accept: "application/binary" }, options?.headers]),
      __binaryResponse: true
    });
  }
};

// codex-rs/wasm/node_modules/openai/resources/containers/files/files.mjs
var Files = class extends APIResource {
  constructor() {
    super(...arguments);
    this.content = new Content(this._client);
  }
  /**
   * Create a Container File
   *
   * You can send either a multipart/form-data request with the raw file content, or
   * a JSON request with a file ID.
   */
  create(containerID, body, options) {
    return this._client.post(path`/containers/${containerID}/files`, maybeMultipartFormRequestOptions({ body, ...options }, this._client));
  }
  /**
   * Retrieve Container File
   */
  retrieve(fileID, params, options) {
    const { container_id } = params;
    return this._client.get(path`/containers/${container_id}/files/${fileID}`, options);
  }
  /**
   * List Container files
   */
  list(containerID, query = {}, options) {
    return this._client.getAPIList(path`/containers/${containerID}/files`, CursorPage, {
      query,
      ...options
    });
  }
  /**
   * Delete Container File
   */
  delete(fileID, params, options) {
    const { container_id } = params;
    return this._client.delete(path`/containers/${container_id}/files/${fileID}`, {
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers])
    });
  }
};
Files.Content = Content;

// codex-rs/wasm/node_modules/openai/resources/containers/containers.mjs
var Containers = class extends APIResource {
  constructor() {
    super(...arguments);
    this.files = new Files(this._client);
  }
  /**
   * Create Container
   */
  create(body, options) {
    return this._client.post("/containers", { body, ...options });
  }
  /**
   * Retrieve Container
   */
  retrieve(containerID, options) {
    return this._client.get(path`/containers/${containerID}`, options);
  }
  /**
   * List Containers
   */
  list(query = {}, options) {
    return this._client.getAPIList("/containers", CursorPage, { query, ...options });
  }
  /**
   * Delete Container
   */
  delete(containerID, options) {
    return this._client.delete(path`/containers/${containerID}`, {
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers])
    });
  }
};
Containers.Files = Files;

// codex-rs/wasm/node_modules/openai/resources/conversations/items.mjs
var Items = class extends APIResource {
  /**
   * Create items in a conversation with the given ID.
   */
  create(conversationID, params, options) {
    const { include, ...body } = params;
    return this._client.post(path`/conversations/${conversationID}/items`, {
      query: { include },
      body,
      ...options
    });
  }
  /**
   * Get a single item from a conversation with the given IDs.
   */
  retrieve(itemID, params, options) {
    const { conversation_id, ...query } = params;
    return this._client.get(path`/conversations/${conversation_id}/items/${itemID}`, { query, ...options });
  }
  /**
   * List all items for a conversation with the given ID.
   */
  list(conversationID, query = {}, options) {
    return this._client.getAPIList(path`/conversations/${conversationID}/items`, ConversationCursorPage, { query, ...options });
  }
  /**
   * Delete an item from a conversation with the given IDs.
   */
  delete(itemID, params, options) {
    const { conversation_id } = params;
    return this._client.delete(path`/conversations/${conversation_id}/items/${itemID}`, options);
  }
};

// codex-rs/wasm/node_modules/openai/resources/conversations/conversations.mjs
var Conversations = class extends APIResource {
  constructor() {
    super(...arguments);
    this.items = new Items(this._client);
  }
  /**
   * Create a conversation.
   */
  create(body = {}, options) {
    return this._client.post("/conversations", { body, ...options });
  }
  /**
   * Get a conversation
   */
  retrieve(conversationID, options) {
    return this._client.get(path`/conversations/${conversationID}`, options);
  }
  /**
   * Update a conversation
   */
  update(conversationID, body, options) {
    return this._client.post(path`/conversations/${conversationID}`, { body, ...options });
  }
  /**
   * Delete a conversation. Items in the conversation will not be deleted.
   */
  delete(conversationID, options) {
    return this._client.delete(path`/conversations/${conversationID}`, options);
  }
};
Conversations.Items = Items;

// codex-rs/wasm/node_modules/openai/resources/embeddings.mjs
var Embeddings = class extends APIResource {
  /**
   * Creates an embedding vector representing the input text.
   *
   * @example
   * ```ts
   * const createEmbeddingResponse =
   *   await client.embeddings.create({
   *     input: 'The quick brown fox jumped over the lazy dog',
   *     model: 'text-embedding-3-small',
   *   });
   * ```
   */
  create(body, options) {
    const hasUserProvidedEncodingFormat = !!body.encoding_format;
    let encoding_format = hasUserProvidedEncodingFormat ? body.encoding_format : "base64";
    if (hasUserProvidedEncodingFormat) {
      loggerFor(this._client).debug("embeddings/user defined encoding_format:", body.encoding_format);
    }
    const response = this._client.post("/embeddings", {
      body: {
        ...body,
        encoding_format
      },
      ...options
    });
    if (hasUserProvidedEncodingFormat) {
      return response;
    }
    loggerFor(this._client).debug("embeddings/decoding base64 embeddings from base64");
    return response._thenUnwrap((response2) => {
      if (response2 && response2.data) {
        response2.data.forEach((embeddingBase64Obj) => {
          const embeddingBase64Str = embeddingBase64Obj.embedding;
          embeddingBase64Obj.embedding = toFloat32Array(embeddingBase64Str);
        });
      }
      return response2;
    });
  }
};

// codex-rs/wasm/node_modules/openai/resources/evals/runs/output-items.mjs
var OutputItems = class extends APIResource {
  /**
   * Get an evaluation run output item by ID.
   */
  retrieve(outputItemID, params, options) {
    const { eval_id, run_id } = params;
    return this._client.get(path`/evals/${eval_id}/runs/${run_id}/output_items/${outputItemID}`, options);
  }
  /**
   * Get a list of output items for an evaluation run.
   */
  list(runID, params, options) {
    const { eval_id, ...query } = params;
    return this._client.getAPIList(path`/evals/${eval_id}/runs/${runID}/output_items`, CursorPage, { query, ...options });
  }
};

// codex-rs/wasm/node_modules/openai/resources/evals/runs/runs.mjs
var Runs2 = class extends APIResource {
  constructor() {
    super(...arguments);
    this.outputItems = new OutputItems(this._client);
  }
  /**
   * Kicks off a new run for a given evaluation, specifying the data source, and what
   * model configuration to use to test. The datasource will be validated against the
   * schema specified in the config of the evaluation.
   */
  create(evalID, body, options) {
    return this._client.post(path`/evals/${evalID}/runs`, { body, ...options });
  }
  /**
   * Get an evaluation run by ID.
   */
  retrieve(runID, params, options) {
    const { eval_id } = params;
    return this._client.get(path`/evals/${eval_id}/runs/${runID}`, options);
  }
  /**
   * Get a list of runs for an evaluation.
   */
  list(evalID, query = {}, options) {
    return this._client.getAPIList(path`/evals/${evalID}/runs`, CursorPage, {
      query,
      ...options
    });
  }
  /**
   * Delete an eval run.
   */
  delete(runID, params, options) {
    const { eval_id } = params;
    return this._client.delete(path`/evals/${eval_id}/runs/${runID}`, options);
  }
  /**
   * Cancel an ongoing evaluation run.
   */
  cancel(runID, params, options) {
    const { eval_id } = params;
    return this._client.post(path`/evals/${eval_id}/runs/${runID}`, options);
  }
};
Runs2.OutputItems = OutputItems;

// codex-rs/wasm/node_modules/openai/resources/evals/evals.mjs
var Evals = class extends APIResource {
  constructor() {
    super(...arguments);
    this.runs = new Runs2(this._client);
  }
  /**
   * Create the structure of an evaluation that can be used to test a model's
   * performance. An evaluation is a set of testing criteria and the config for a
   * data source, which dictates the schema of the data used in the evaluation. After
   * creating an evaluation, you can run it on different models and model parameters.
   * We support several types of graders and datasources. For more information, see
   * the [Evals guide](https://platform.openai.com/docs/guides/evals).
   */
  create(body, options) {
    return this._client.post("/evals", { body, ...options });
  }
  /**
   * Get an evaluation by ID.
   */
  retrieve(evalID, options) {
    return this._client.get(path`/evals/${evalID}`, options);
  }
  /**
   * Update certain properties of an evaluation.
   */
  update(evalID, body, options) {
    return this._client.post(path`/evals/${evalID}`, { body, ...options });
  }
  /**
   * List evaluations for a project.
   */
  list(query = {}, options) {
    return this._client.getAPIList("/evals", CursorPage, { query, ...options });
  }
  /**
   * Delete an evaluation.
   */
  delete(evalID, options) {
    return this._client.delete(path`/evals/${evalID}`, options);
  }
};
Evals.Runs = Runs2;

// codex-rs/wasm/node_modules/openai/resources/files.mjs
var Files2 = class extends APIResource {
  /**
   * Upload a file that can be used across various endpoints. Individual files can be
   * up to 512 MB, and each project can store up to 2.5 TB of files in total. There
   * is no organization-wide storage limit.
   *
   * - The Assistants API supports files up to 2 million tokens and of specific file
   *   types. See the
   *   [Assistants Tools guide](https://platform.openai.com/docs/assistants/tools)
   *   for details.
   * - The Fine-tuning API only supports `.jsonl` files. The input also has certain
   *   required formats for fine-tuning
   *   [chat](https://platform.openai.com/docs/api-reference/fine-tuning/chat-input)
   *   or
   *   [completions](https://platform.openai.com/docs/api-reference/fine-tuning/completions-input)
   *   models.
   * - The Batch API only supports `.jsonl` files up to 200 MB in size. The input
   *   also has a specific required
   *   [format](https://platform.openai.com/docs/api-reference/batch/request-input).
   *
   * Please [contact us](https://help.openai.com/) if you need to increase these
   * storage limits.
   */
  create(body, options) {
    return this._client.post("/files", multipartFormRequestOptions({ body, ...options }, this._client));
  }
  /**
   * Returns information about a specific file.
   */
  retrieve(fileID, options) {
    return this._client.get(path`/files/${fileID}`, options);
  }
  /**
   * Returns a list of files.
   */
  list(query = {}, options) {
    return this._client.getAPIList("/files", CursorPage, { query, ...options });
  }
  /**
   * Delete a file and remove it from all vector stores.
   */
  delete(fileID, options) {
    return this._client.delete(path`/files/${fileID}`, options);
  }
  /**
   * Returns the contents of the specified file.
   */
  content(fileID, options) {
    return this._client.get(path`/files/${fileID}/content`, {
      ...options,
      headers: buildHeaders([{ Accept: "application/binary" }, options?.headers]),
      __binaryResponse: true
    });
  }
  /**
   * Waits for the given file to be processed, default timeout is 30 mins.
   */
  async waitForProcessing(id, { pollInterval = 5e3, maxWait = 30 * 60 * 1e3 } = {}) {
    const TERMINAL_STATES = /* @__PURE__ */ new Set(["processed", "error", "deleted"]);
    const start = Date.now();
    let file = await this.retrieve(id);
    while (!file.status || !TERMINAL_STATES.has(file.status)) {
      await sleep(pollInterval);
      file = await this.retrieve(id);
      if (Date.now() - start > maxWait) {
        throw new APIConnectionTimeoutError({
          message: `Giving up on waiting for file ${id} to finish processing after ${maxWait} milliseconds.`
        });
      }
    }
    return file;
  }
};

// codex-rs/wasm/node_modules/openai/resources/fine-tuning/methods.mjs
var Methods = class extends APIResource {
};

// codex-rs/wasm/node_modules/openai/resources/fine-tuning/alpha/graders.mjs
var Graders = class extends APIResource {
  /**
   * Run a grader.
   *
   * @example
   * ```ts
   * const response = await client.fineTuning.alpha.graders.run({
   *   grader: {
   *     input: 'input',
   *     name: 'name',
   *     operation: 'eq',
   *     reference: 'reference',
   *     type: 'string_check',
   *   },
   *   model_sample: 'model_sample',
   * });
   * ```
   */
  run(body, options) {
    return this._client.post("/fine_tuning/alpha/graders/run", { body, ...options });
  }
  /**
   * Validate a grader.
   *
   * @example
   * ```ts
   * const response =
   *   await client.fineTuning.alpha.graders.validate({
   *     grader: {
   *       input: 'input',
   *       name: 'name',
   *       operation: 'eq',
   *       reference: 'reference',
   *       type: 'string_check',
   *     },
   *   });
   * ```
   */
  validate(body, options) {
    return this._client.post("/fine_tuning/alpha/graders/validate", { body, ...options });
  }
};

// codex-rs/wasm/node_modules/openai/resources/fine-tuning/alpha/alpha.mjs
var Alpha = class extends APIResource {
  constructor() {
    super(...arguments);
    this.graders = new Graders(this._client);
  }
};
Alpha.Graders = Graders;

// codex-rs/wasm/node_modules/openai/resources/fine-tuning/checkpoints/permissions.mjs
var Permissions = class extends APIResource {
  /**
   * **NOTE:** Calling this endpoint requires an [admin API key](../admin-api-keys).
   *
   * This enables organization owners to share fine-tuned models with other projects
   * in their organization.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const permissionCreateResponse of client.fineTuning.checkpoints.permissions.create(
   *   'ft:gpt-4o-mini-2024-07-18:org:weather:B7R9VjQd',
   *   { project_ids: ['string'] },
   * )) {
   *   // ...
   * }
   * ```
   */
  create(fineTunedModelCheckpoint, body, options) {
    return this._client.getAPIList(path`/fine_tuning/checkpoints/${fineTunedModelCheckpoint}/permissions`, Page, { body, method: "post", ...options });
  }
  /**
   * **NOTE:** This endpoint requires an [admin API key](../admin-api-keys).
   *
   * Organization owners can use this endpoint to view all permissions for a
   * fine-tuned model checkpoint.
   *
   * @deprecated Retrieve is deprecated. Please swap to the paginated list method instead.
   */
  retrieve(fineTunedModelCheckpoint, query = {}, options) {
    return this._client.get(path`/fine_tuning/checkpoints/${fineTunedModelCheckpoint}/permissions`, {
      query,
      ...options
    });
  }
  /**
   * **NOTE:** This endpoint requires an [admin API key](../admin-api-keys).
   *
   * Organization owners can use this endpoint to view all permissions for a
   * fine-tuned model checkpoint.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const permissionListResponse of client.fineTuning.checkpoints.permissions.list(
   *   'ft-AF1WoRqd3aJAHsqc9NY7iL8F',
   * )) {
   *   // ...
   * }
   * ```
   */
  list(fineTunedModelCheckpoint, query = {}, options) {
    return this._client.getAPIList(path`/fine_tuning/checkpoints/${fineTunedModelCheckpoint}/permissions`, ConversationCursorPage, { query, ...options });
  }
  /**
   * **NOTE:** This endpoint requires an [admin API key](../admin-api-keys).
   *
   * Organization owners can use this endpoint to delete a permission for a
   * fine-tuned model checkpoint.
   *
   * @example
   * ```ts
   * const permission =
   *   await client.fineTuning.checkpoints.permissions.delete(
   *     'cp_zc4Q7MP6XxulcVzj4MZdwsAB',
   *     {
   *       fine_tuned_model_checkpoint:
   *         'ft:gpt-4o-mini-2024-07-18:org:weather:B7R9VjQd',
   *     },
   *   );
   * ```
   */
  delete(permissionID, params, options) {
    const { fine_tuned_model_checkpoint } = params;
    return this._client.delete(path`/fine_tuning/checkpoints/${fine_tuned_model_checkpoint}/permissions/${permissionID}`, options);
  }
};

// codex-rs/wasm/node_modules/openai/resources/fine-tuning/checkpoints/checkpoints.mjs
var Checkpoints = class extends APIResource {
  constructor() {
    super(...arguments);
    this.permissions = new Permissions(this._client);
  }
};
Checkpoints.Permissions = Permissions;

// codex-rs/wasm/node_modules/openai/resources/fine-tuning/jobs/checkpoints.mjs
var Checkpoints2 = class extends APIResource {
  /**
   * List checkpoints for a fine-tuning job.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const fineTuningJobCheckpoint of client.fineTuning.jobs.checkpoints.list(
   *   'ft-AF1WoRqd3aJAHsqc9NY7iL8F',
   * )) {
   *   // ...
   * }
   * ```
   */
  list(fineTuningJobID, query = {}, options) {
    return this._client.getAPIList(path`/fine_tuning/jobs/${fineTuningJobID}/checkpoints`, CursorPage, { query, ...options });
  }
};

// codex-rs/wasm/node_modules/openai/resources/fine-tuning/jobs/jobs.mjs
var Jobs = class extends APIResource {
  constructor() {
    super(...arguments);
    this.checkpoints = new Checkpoints2(this._client);
  }
  /**
   * Creates a fine-tuning job which begins the process of creating a new model from
   * a given dataset.
   *
   * Response includes details of the enqueued job including job status and the name
   * of the fine-tuned models once complete.
   *
   * [Learn more about fine-tuning](https://platform.openai.com/docs/guides/model-optimization)
   *
   * @example
   * ```ts
   * const fineTuningJob = await client.fineTuning.jobs.create({
   *   model: 'gpt-4o-mini',
   *   training_file: 'file-abc123',
   * });
   * ```
   */
  create(body, options) {
    return this._client.post("/fine_tuning/jobs", { body, ...options });
  }
  /**
   * Get info about a fine-tuning job.
   *
   * [Learn more about fine-tuning](https://platform.openai.com/docs/guides/model-optimization)
   *
   * @example
   * ```ts
   * const fineTuningJob = await client.fineTuning.jobs.retrieve(
   *   'ft-AF1WoRqd3aJAHsqc9NY7iL8F',
   * );
   * ```
   */
  retrieve(fineTuningJobID, options) {
    return this._client.get(path`/fine_tuning/jobs/${fineTuningJobID}`, options);
  }
  /**
   * List your organization's fine-tuning jobs
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const fineTuningJob of client.fineTuning.jobs.list()) {
   *   // ...
   * }
   * ```
   */
  list(query = {}, options) {
    return this._client.getAPIList("/fine_tuning/jobs", CursorPage, { query, ...options });
  }
  /**
   * Immediately cancel a fine-tune job.
   *
   * @example
   * ```ts
   * const fineTuningJob = await client.fineTuning.jobs.cancel(
   *   'ft-AF1WoRqd3aJAHsqc9NY7iL8F',
   * );
   * ```
   */
  cancel(fineTuningJobID, options) {
    return this._client.post(path`/fine_tuning/jobs/${fineTuningJobID}/cancel`, options);
  }
  /**
   * Get status updates for a fine-tuning job.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const fineTuningJobEvent of client.fineTuning.jobs.listEvents(
   *   'ft-AF1WoRqd3aJAHsqc9NY7iL8F',
   * )) {
   *   // ...
   * }
   * ```
   */
  listEvents(fineTuningJobID, query = {}, options) {
    return this._client.getAPIList(path`/fine_tuning/jobs/${fineTuningJobID}/events`, CursorPage, { query, ...options });
  }
  /**
   * Pause a fine-tune job.
   *
   * @example
   * ```ts
   * const fineTuningJob = await client.fineTuning.jobs.pause(
   *   'ft-AF1WoRqd3aJAHsqc9NY7iL8F',
   * );
   * ```
   */
  pause(fineTuningJobID, options) {
    return this._client.post(path`/fine_tuning/jobs/${fineTuningJobID}/pause`, options);
  }
  /**
   * Resume a fine-tune job.
   *
   * @example
   * ```ts
   * const fineTuningJob = await client.fineTuning.jobs.resume(
   *   'ft-AF1WoRqd3aJAHsqc9NY7iL8F',
   * );
   * ```
   */
  resume(fineTuningJobID, options) {
    return this._client.post(path`/fine_tuning/jobs/${fineTuningJobID}/resume`, options);
  }
};
Jobs.Checkpoints = Checkpoints2;

// codex-rs/wasm/node_modules/openai/resources/fine-tuning/fine-tuning.mjs
var FineTuning = class extends APIResource {
  constructor() {
    super(...arguments);
    this.methods = new Methods(this._client);
    this.jobs = new Jobs(this._client);
    this.checkpoints = new Checkpoints(this._client);
    this.alpha = new Alpha(this._client);
  }
};
FineTuning.Methods = Methods;
FineTuning.Jobs = Jobs;
FineTuning.Checkpoints = Checkpoints;
FineTuning.Alpha = Alpha;

// codex-rs/wasm/node_modules/openai/resources/graders/grader-models.mjs
var GraderModels = class extends APIResource {
};

// codex-rs/wasm/node_modules/openai/resources/graders/graders.mjs
var Graders2 = class extends APIResource {
  constructor() {
    super(...arguments);
    this.graderModels = new GraderModels(this._client);
  }
};
Graders2.GraderModels = GraderModels;

// codex-rs/wasm/node_modules/openai/resources/images.mjs
var Images = class extends APIResource {
  /**
   * Creates a variation of a given image. This endpoint only supports `dall-e-2`.
   *
   * @example
   * ```ts
   * const imagesResponse = await client.images.createVariation({
   *   image: fs.createReadStream('otter.png'),
   * });
   * ```
   */
  createVariation(body, options) {
    return this._client.post("/images/variations", multipartFormRequestOptions({ body, ...options }, this._client));
  }
  edit(body, options) {
    return this._client.post("/images/edits", multipartFormRequestOptions({ body, ...options, stream: body.stream ?? false }, this._client));
  }
  generate(body, options) {
    return this._client.post("/images/generations", { body, ...options, stream: body.stream ?? false });
  }
};

// codex-rs/wasm/node_modules/openai/resources/models.mjs
var Models = class extends APIResource {
  /**
   * Retrieves a model instance, providing basic information about the model such as
   * the owner and permissioning.
   */
  retrieve(model, options) {
    return this._client.get(path`/models/${model}`, options);
  }
  /**
   * Lists the currently available models, and provides basic information about each
   * one such as the owner and availability.
   */
  list(options) {
    return this._client.getAPIList("/models", Page, options);
  }
  /**
   * Delete a fine-tuned model. You must have the Owner role in your organization to
   * delete a model.
   */
  delete(model, options) {
    return this._client.delete(path`/models/${model}`, options);
  }
};

// codex-rs/wasm/node_modules/openai/resources/moderations.mjs
var Moderations = class extends APIResource {
  /**
   * Classifies if text and/or image inputs are potentially harmful. Learn more in
   * the [moderation guide](https://platform.openai.com/docs/guides/moderation).
   */
  create(body, options) {
    return this._client.post("/moderations", { body, ...options });
  }
};

// codex-rs/wasm/node_modules/openai/resources/realtime/calls.mjs
var Calls = class extends APIResource {
  /**
   * Accept an incoming SIP call and configure the realtime session that will handle
   * it.
   *
   * @example
   * ```ts
   * await client.realtime.calls.accept('call_id', {
   *   type: 'realtime',
   * });
   * ```
   */
  accept(callID, body, options) {
    return this._client.post(path`/realtime/calls/${callID}/accept`, {
      body,
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers])
    });
  }
  /**
   * End an active Realtime API call, whether it was initiated over SIP or WebRTC.
   *
   * @example
   * ```ts
   * await client.realtime.calls.hangup('call_id');
   * ```
   */
  hangup(callID, options) {
    return this._client.post(path`/realtime/calls/${callID}/hangup`, {
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers])
    });
  }
  /**
   * Transfer an active SIP call to a new destination using the SIP REFER verb.
   *
   * @example
   * ```ts
   * await client.realtime.calls.refer('call_id', {
   *   target_uri: 'tel:+14155550123',
   * });
   * ```
   */
  refer(callID, body, options) {
    return this._client.post(path`/realtime/calls/${callID}/refer`, {
      body,
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers])
    });
  }
  /**
   * Decline an incoming SIP call by returning a SIP status code to the caller.
   *
   * @example
   * ```ts
   * await client.realtime.calls.reject('call_id');
   * ```
   */
  reject(callID, body = {}, options) {
    return this._client.post(path`/realtime/calls/${callID}/reject`, {
      body,
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers])
    });
  }
};

// codex-rs/wasm/node_modules/openai/resources/realtime/client-secrets.mjs
var ClientSecrets = class extends APIResource {
  /**
   * Create a Realtime client secret with an associated session configuration.
   *
   * Client secrets are short-lived tokens that can be passed to a client app, such
   * as a web frontend or mobile client, which grants access to the Realtime API
   * without leaking your main API key. You can configure a custom TTL for each
   * client secret.
   *
   * You can also attach session configuration options to the client secret, which
   * will be applied to any sessions created using that client secret, but these can
   * also be overridden by the client connection.
   *
   * [Learn more about authentication with client secrets over WebRTC](https://platform.openai.com/docs/guides/realtime-webrtc).
   *
   * Returns the created client secret and the effective session object. The client
   * secret is a string that looks like `ek_1234`.
   *
   * @example
   * ```ts
   * const clientSecret =
   *   await client.realtime.clientSecrets.create();
   * ```
   */
  create(body, options) {
    return this._client.post("/realtime/client_secrets", { body, ...options });
  }
};

// codex-rs/wasm/node_modules/openai/resources/realtime/realtime.mjs
var Realtime2 = class extends APIResource {
  constructor() {
    super(...arguments);
    this.clientSecrets = new ClientSecrets(this._client);
    this.calls = new Calls(this._client);
  }
};
Realtime2.ClientSecrets = ClientSecrets;
Realtime2.Calls = Calls;

// codex-rs/wasm/node_modules/openai/lib/ResponsesParser.mjs
function maybeParseResponse(response, params) {
  if (!params || !hasAutoParseableInput2(params)) {
    return {
      ...response,
      output_parsed: null,
      output: response.output.map((item) => {
        if (item.type === "function_call") {
          return {
            ...item,
            parsed_arguments: null
          };
        }
        if (item.type === "message") {
          return {
            ...item,
            content: item.content.map((content) => ({
              ...content,
              parsed: null
            }))
          };
        } else {
          return item;
        }
      })
    };
  }
  return parseResponse(response, params);
}
function parseResponse(response, params) {
  const output = response.output.map((item) => {
    if (item.type === "function_call") {
      return {
        ...item,
        parsed_arguments: parseToolCall2(params, item)
      };
    }
    if (item.type === "message") {
      const content = item.content.map((content2) => {
        if (content2.type === "output_text") {
          return {
            ...content2,
            parsed: parseTextFormat(params, content2.text)
          };
        }
        return content2;
      });
      return {
        ...item,
        content
      };
    }
    return item;
  });
  const parsed = Object.assign({}, response, { output });
  if (!Object.getOwnPropertyDescriptor(response, "output_text")) {
    addOutputText(parsed);
  }
  Object.defineProperty(parsed, "output_parsed", {
    enumerable: true,
    get() {
      for (const output2 of parsed.output) {
        if (output2.type !== "message") {
          continue;
        }
        for (const content of output2.content) {
          if (content.type === "output_text" && content.parsed !== null) {
            return content.parsed;
          }
        }
      }
      return null;
    }
  });
  return parsed;
}
function parseTextFormat(params, content) {
  if (params.text?.format?.type !== "json_schema") {
    return null;
  }
  if ("$parseRaw" in params.text?.format) {
    const text_format = params.text?.format;
    return text_format.$parseRaw(content);
  }
  return JSON.parse(content);
}
function hasAutoParseableInput2(params) {
  if (isAutoParsableResponseFormat(params.text?.format)) {
    return true;
  }
  return false;
}
function isAutoParsableTool2(tool) {
  return tool?.["$brand"] === "auto-parseable-tool";
}
function getInputToolByName(input_tools, name) {
  return input_tools.find((tool) => tool.type === "function" && tool.name === name);
}
function parseToolCall2(params, toolCall) {
  const inputTool = getInputToolByName(params.tools ?? [], toolCall.name);
  return {
    ...toolCall,
    ...toolCall,
    parsed_arguments: isAutoParsableTool2(inputTool) ? inputTool.$parseRaw(toolCall.arguments) : inputTool?.strict ? JSON.parse(toolCall.arguments) : null
  };
}
function addOutputText(rsp) {
  const texts = [];
  for (const output of rsp.output) {
    if (output.type !== "message") {
      continue;
    }
    for (const content of output.content) {
      if (content.type === "output_text") {
        texts.push(content.text);
      }
    }
  }
  rsp.output_text = texts.join("");
}

// codex-rs/wasm/node_modules/openai/lib/responses/ResponseStream.mjs
var _ResponseStream_instances;
var _ResponseStream_params;
var _ResponseStream_currentResponseSnapshot;
var _ResponseStream_finalResponse;
var _ResponseStream_beginRequest;
var _ResponseStream_addEvent;
var _ResponseStream_endRequest;
var _ResponseStream_accumulateResponse;
var ResponseStream = class _ResponseStream extends EventStream {
  constructor(params) {
    super();
    _ResponseStream_instances.add(this);
    _ResponseStream_params.set(this, void 0);
    _ResponseStream_currentResponseSnapshot.set(this, void 0);
    _ResponseStream_finalResponse.set(this, void 0);
    __classPrivateFieldSet(this, _ResponseStream_params, params, "f");
  }
  static createResponse(client, params, options) {
    const runner = new _ResponseStream(params);
    runner._run(() => runner._createOrRetrieveResponse(client, params, {
      ...options,
      headers: { ...options?.headers, "X-Stainless-Helper-Method": "stream" }
    }));
    return runner;
  }
  async _createOrRetrieveResponse(client, params, options) {
    const signal = options?.signal;
    if (signal) {
      if (signal.aborted)
        this.controller.abort();
      signal.addEventListener("abort", () => this.controller.abort());
    }
    __classPrivateFieldGet(this, _ResponseStream_instances, "m", _ResponseStream_beginRequest).call(this);
    let stream;
    let starting_after = null;
    if ("response_id" in params) {
      stream = await client.responses.retrieve(params.response_id, { stream: true }, { ...options, signal: this.controller.signal, stream: true });
      starting_after = params.starting_after ?? null;
    } else {
      stream = await client.responses.create({ ...params, stream: true }, { ...options, signal: this.controller.signal });
    }
    this._connected();
    for await (const event of stream) {
      __classPrivateFieldGet(this, _ResponseStream_instances, "m", _ResponseStream_addEvent).call(this, event, starting_after);
    }
    if (stream.controller.signal?.aborted) {
      throw new APIUserAbortError();
    }
    return __classPrivateFieldGet(this, _ResponseStream_instances, "m", _ResponseStream_endRequest).call(this);
  }
  [(_ResponseStream_params = /* @__PURE__ */ new WeakMap(), _ResponseStream_currentResponseSnapshot = /* @__PURE__ */ new WeakMap(), _ResponseStream_finalResponse = /* @__PURE__ */ new WeakMap(), _ResponseStream_instances = /* @__PURE__ */ new WeakSet(), _ResponseStream_beginRequest = function _ResponseStream_beginRequest2() {
    if (this.ended)
      return;
    __classPrivateFieldSet(this, _ResponseStream_currentResponseSnapshot, void 0, "f");
  }, _ResponseStream_addEvent = function _ResponseStream_addEvent2(event, starting_after) {
    if (this.ended)
      return;
    const maybeEmit = (name, event2) => {
      if (starting_after == null || event2.sequence_number > starting_after) {
        this._emit(name, event2);
      }
    };
    const response = __classPrivateFieldGet(this, _ResponseStream_instances, "m", _ResponseStream_accumulateResponse).call(this, event);
    maybeEmit("event", event);
    switch (event.type) {
      case "response.output_text.delta": {
        const output = response.output[event.output_index];
        if (!output) {
          throw new OpenAIError(`missing output at index ${event.output_index}`);
        }
        if (output.type === "message") {
          const content = output.content[event.content_index];
          if (!content) {
            throw new OpenAIError(`missing content at index ${event.content_index}`);
          }
          if (content.type !== "output_text") {
            throw new OpenAIError(`expected content to be 'output_text', got ${content.type}`);
          }
          maybeEmit("response.output_text.delta", {
            ...event,
            snapshot: content.text
          });
        }
        break;
      }
      case "response.function_call_arguments.delta": {
        const output = response.output[event.output_index];
        if (!output) {
          throw new OpenAIError(`missing output at index ${event.output_index}`);
        }
        if (output.type === "function_call") {
          maybeEmit("response.function_call_arguments.delta", {
            ...event,
            snapshot: output.arguments
          });
        }
        break;
      }
      default:
        maybeEmit(event.type, event);
        break;
    }
  }, _ResponseStream_endRequest = function _ResponseStream_endRequest2() {
    if (this.ended) {
      throw new OpenAIError(`stream has ended, this shouldn't happen`);
    }
    const snapshot2 = __classPrivateFieldGet(this, _ResponseStream_currentResponseSnapshot, "f");
    if (!snapshot2) {
      throw new OpenAIError(`request ended without sending any events`);
    }
    __classPrivateFieldSet(this, _ResponseStream_currentResponseSnapshot, void 0, "f");
    const parsedResponse = finalizeResponse(snapshot2, __classPrivateFieldGet(this, _ResponseStream_params, "f"));
    __classPrivateFieldSet(this, _ResponseStream_finalResponse, parsedResponse, "f");
    return parsedResponse;
  }, _ResponseStream_accumulateResponse = function _ResponseStream_accumulateResponse2(event) {
    let snapshot2 = __classPrivateFieldGet(this, _ResponseStream_currentResponseSnapshot, "f");
    if (!snapshot2) {
      if (event.type !== "response.created") {
        throw new OpenAIError(`When snapshot hasn't been set yet, expected 'response.created' event, got ${event.type}`);
      }
      snapshot2 = __classPrivateFieldSet(this, _ResponseStream_currentResponseSnapshot, event.response, "f");
      return snapshot2;
    }
    switch (event.type) {
      case "response.output_item.added": {
        snapshot2.output.push(event.item);
        break;
      }
      case "response.content_part.added": {
        const output = snapshot2.output[event.output_index];
        if (!output) {
          throw new OpenAIError(`missing output at index ${event.output_index}`);
        }
        const type = output.type;
        const part = event.part;
        if (type === "message" && part.type !== "reasoning_text") {
          output.content.push(part);
        } else if (type === "reasoning" && part.type === "reasoning_text") {
          if (!output.content) {
            output.content = [];
          }
          output.content.push(part);
        }
        break;
      }
      case "response.output_text.delta": {
        const output = snapshot2.output[event.output_index];
        if (!output) {
          throw new OpenAIError(`missing output at index ${event.output_index}`);
        }
        if (output.type === "message") {
          const content = output.content[event.content_index];
          if (!content) {
            throw new OpenAIError(`missing content at index ${event.content_index}`);
          }
          if (content.type !== "output_text") {
            throw new OpenAIError(`expected content to be 'output_text', got ${content.type}`);
          }
          content.text += event.delta;
        }
        break;
      }
      case "response.function_call_arguments.delta": {
        const output = snapshot2.output[event.output_index];
        if (!output) {
          throw new OpenAIError(`missing output at index ${event.output_index}`);
        }
        if (output.type === "function_call") {
          output.arguments += event.delta;
        }
        break;
      }
      case "response.reasoning_text.delta": {
        const output = snapshot2.output[event.output_index];
        if (!output) {
          throw new OpenAIError(`missing output at index ${event.output_index}`);
        }
        if (output.type === "reasoning") {
          const content = output.content?.[event.content_index];
          if (!content) {
            throw new OpenAIError(`missing content at index ${event.content_index}`);
          }
          if (content.type !== "reasoning_text") {
            throw new OpenAIError(`expected content to be 'reasoning_text', got ${content.type}`);
          }
          content.text += event.delta;
        }
        break;
      }
      case "response.completed": {
        __classPrivateFieldSet(this, _ResponseStream_currentResponseSnapshot, event.response, "f");
        break;
      }
    }
    return snapshot2;
  }, Symbol.asyncIterator)]() {
    const pushQueue = [];
    const readQueue = [];
    let done = false;
    this.on("event", (event) => {
      const reader = readQueue.shift();
      if (reader) {
        reader.resolve(event);
      } else {
        pushQueue.push(event);
      }
    });
    this.on("end", () => {
      done = true;
      for (const reader of readQueue) {
        reader.resolve(void 0);
      }
      readQueue.length = 0;
    });
    this.on("abort", (err) => {
      done = true;
      for (const reader of readQueue) {
        reader.reject(err);
      }
      readQueue.length = 0;
    });
    this.on("error", (err) => {
      done = true;
      for (const reader of readQueue) {
        reader.reject(err);
      }
      readQueue.length = 0;
    });
    return {
      next: async () => {
        if (!pushQueue.length) {
          if (done) {
            return { value: void 0, done: true };
          }
          return new Promise((resolve, reject) => readQueue.push({ resolve, reject })).then((event2) => event2 ? { value: event2, done: false } : { value: void 0, done: true });
        }
        const event = pushQueue.shift();
        return { value: event, done: false };
      },
      return: async () => {
        this.abort();
        return { value: void 0, done: true };
      }
    };
  }
  /**
   * @returns a promise that resolves with the final Response, or rejects
   * if an error occurred or the stream ended prematurely without producing a REsponse.
   */
  async finalResponse() {
    await this.done();
    const response = __classPrivateFieldGet(this, _ResponseStream_finalResponse, "f");
    if (!response)
      throw new OpenAIError("stream ended without producing a ChatCompletion");
    return response;
  }
};
function finalizeResponse(snapshot2, params) {
  return maybeParseResponse(snapshot2, params);
}

// codex-rs/wasm/node_modules/openai/resources/responses/input-items.mjs
var InputItems = class extends APIResource {
  /**
   * Returns a list of input items for a given response.
   *
   * @example
   * ```ts
   * // Automatically fetches more pages as needed.
   * for await (const responseItem of client.responses.inputItems.list(
   *   'response_id',
   * )) {
   *   // ...
   * }
   * ```
   */
  list(responseID, query = {}, options) {
    return this._client.getAPIList(path`/responses/${responseID}/input_items`, CursorPage, { query, ...options });
  }
};

// codex-rs/wasm/node_modules/openai/resources/responses/input-tokens.mjs
var InputTokens = class extends APIResource {
  /**
   * Returns input token counts of the request.
   *
   * Returns an object with `object` set to `response.input_tokens` and an
   * `input_tokens` count.
   *
   * @example
   * ```ts
   * const response = await client.responses.inputTokens.count();
   * ```
   */
  count(body = {}, options) {
    return this._client.post("/responses/input_tokens", { body, ...options });
  }
};

// codex-rs/wasm/node_modules/openai/resources/responses/responses.mjs
var Responses = class extends APIResource {
  constructor() {
    super(...arguments);
    this.inputItems = new InputItems(this._client);
    this.inputTokens = new InputTokens(this._client);
  }
  create(body, options) {
    return this._client.post("/responses", { body, ...options, stream: body.stream ?? false })._thenUnwrap((rsp) => {
      if ("object" in rsp && rsp.object === "response") {
        addOutputText(rsp);
      }
      return rsp;
    });
  }
  retrieve(responseID, query = {}, options) {
    return this._client.get(path`/responses/${responseID}`, {
      query,
      ...options,
      stream: query?.stream ?? false
    })._thenUnwrap((rsp) => {
      if ("object" in rsp && rsp.object === "response") {
        addOutputText(rsp);
      }
      return rsp;
    });
  }
  /**
   * Deletes a model response with the given ID.
   *
   * @example
   * ```ts
   * await client.responses.delete(
   *   'resp_677efb5139a88190b512bc3fef8e535d',
   * );
   * ```
   */
  delete(responseID, options) {
    return this._client.delete(path`/responses/${responseID}`, {
      ...options,
      headers: buildHeaders([{ Accept: "*/*" }, options?.headers])
    });
  }
  parse(body, options) {
    return this._client.responses.create(body, options)._thenUnwrap((response) => parseResponse(response, body));
  }
  /**
   * Creates a model response stream
   */
  stream(body, options) {
    return ResponseStream.createResponse(this._client, body, options);
  }
  /**
   * Cancels a model response with the given ID. Only responses created with the
   * `background` parameter set to `true` can be cancelled.
   * [Learn more](https://platform.openai.com/docs/guides/background).
   *
   * @example
   * ```ts
   * const response = await client.responses.cancel(
   *   'resp_677efb5139a88190b512bc3fef8e535d',
   * );
   * ```
   */
  cancel(responseID, options) {
    return this._client.post(path`/responses/${responseID}/cancel`, options);
  }
  /**
   * Compact a conversation. Returns a compacted response object.
   *
   * Learn when and how to compact long-running conversations in the
   * [conversation state guide](https://platform.openai.com/docs/guides/conversation-state#managing-the-context-window).
   * For ZDR-compatible compaction details, see
   * [Compaction (advanced)](https://platform.openai.com/docs/guides/conversation-state#compaction-advanced).
   *
   * @example
   * ```ts
   * const compactedResponse = await client.responses.compact({
   *   model: 'gpt-5.4',
   * });
   * ```
   */
  compact(body, options) {
    return this._client.post("/responses/compact", { body, ...options });
  }
};
Responses.InputItems = InputItems;
Responses.InputTokens = InputTokens;

// codex-rs/wasm/node_modules/openai/resources/skills/content.mjs
var Content2 = class extends APIResource {
  /**
   * Download a skill zip bundle by its ID.
   */
  retrieve(skillID, options) {
    return this._client.get(path`/skills/${skillID}/content`, {
      ...options,
      headers: buildHeaders([{ Accept: "application/binary" }, options?.headers]),
      __binaryResponse: true
    });
  }
};

// codex-rs/wasm/node_modules/openai/resources/skills/versions/content.mjs
var Content3 = class extends APIResource {
  /**
   * Download a skill version zip bundle.
   */
  retrieve(version, params, options) {
    const { skill_id } = params;
    return this._client.get(path`/skills/${skill_id}/versions/${version}/content`, {
      ...options,
      headers: buildHeaders([{ Accept: "application/binary" }, options?.headers]),
      __binaryResponse: true
    });
  }
};

// codex-rs/wasm/node_modules/openai/resources/skills/versions/versions.mjs
var Versions = class extends APIResource {
  constructor() {
    super(...arguments);
    this.content = new Content3(this._client);
  }
  /**
   * Create a new immutable skill version.
   */
  create(skillID, body = {}, options) {
    return this._client.post(path`/skills/${skillID}/versions`, maybeMultipartFormRequestOptions({ body, ...options }, this._client));
  }
  /**
   * Get a specific skill version.
   */
  retrieve(version, params, options) {
    const { skill_id } = params;
    return this._client.get(path`/skills/${skill_id}/versions/${version}`, options);
  }
  /**
   * List skill versions for a skill.
   */
  list(skillID, query = {}, options) {
    return this._client.getAPIList(path`/skills/${skillID}/versions`, CursorPage, {
      query,
      ...options
    });
  }
  /**
   * Delete a skill version.
   */
  delete(version, params, options) {
    const { skill_id } = params;
    return this._client.delete(path`/skills/${skill_id}/versions/${version}`, options);
  }
};
Versions.Content = Content3;

// codex-rs/wasm/node_modules/openai/resources/skills/skills.mjs
var Skills = class extends APIResource {
  constructor() {
    super(...arguments);
    this.content = new Content2(this._client);
    this.versions = new Versions(this._client);
  }
  /**
   * Create a new skill.
   */
  create(body = {}, options) {
    return this._client.post("/skills", maybeMultipartFormRequestOptions({ body, ...options }, this._client));
  }
  /**
   * Get a skill by its ID.
   */
  retrieve(skillID, options) {
    return this._client.get(path`/skills/${skillID}`, options);
  }
  /**
   * Update the default version pointer for a skill.
   */
  update(skillID, body, options) {
    return this._client.post(path`/skills/${skillID}`, { body, ...options });
  }
  /**
   * List all skills for the current project.
   */
  list(query = {}, options) {
    return this._client.getAPIList("/skills", CursorPage, { query, ...options });
  }
  /**
   * Delete a skill by its ID.
   */
  delete(skillID, options) {
    return this._client.delete(path`/skills/${skillID}`, options);
  }
};
Skills.Content = Content2;
Skills.Versions = Versions;

// codex-rs/wasm/node_modules/openai/resources/uploads/parts.mjs
var Parts = class extends APIResource {
  /**
   * Adds a
   * [Part](https://platform.openai.com/docs/api-reference/uploads/part-object) to an
   * [Upload](https://platform.openai.com/docs/api-reference/uploads/object) object.
   * A Part represents a chunk of bytes from the file you are trying to upload.
   *
   * Each Part can be at most 64 MB, and you can add Parts until you hit the Upload
   * maximum of 8 GB.
   *
   * It is possible to add multiple Parts in parallel. You can decide the intended
   * order of the Parts when you
   * [complete the Upload](https://platform.openai.com/docs/api-reference/uploads/complete).
   */
  create(uploadID, body, options) {
    return this._client.post(path`/uploads/${uploadID}/parts`, multipartFormRequestOptions({ body, ...options }, this._client));
  }
};

// codex-rs/wasm/node_modules/openai/resources/uploads/uploads.mjs
var Uploads = class extends APIResource {
  constructor() {
    super(...arguments);
    this.parts = new Parts(this._client);
  }
  /**
   * Creates an intermediate
   * [Upload](https://platform.openai.com/docs/api-reference/uploads/object) object
   * that you can add
   * [Parts](https://platform.openai.com/docs/api-reference/uploads/part-object) to.
   * Currently, an Upload can accept at most 8 GB in total and expires after an hour
   * after you create it.
   *
   * Once you complete the Upload, we will create a
   * [File](https://platform.openai.com/docs/api-reference/files/object) object that
   * contains all the parts you uploaded. This File is usable in the rest of our
   * platform as a regular File object.
   *
   * For certain `purpose` values, the correct `mime_type` must be specified. Please
   * refer to documentation for the
   * [supported MIME types for your use case](https://platform.openai.com/docs/assistants/tools/file-search#supported-files).
   *
   * For guidance on the proper filename extensions for each purpose, please follow
   * the documentation on
   * [creating a File](https://platform.openai.com/docs/api-reference/files/create).
   *
   * Returns the Upload object with status `pending`.
   */
  create(body, options) {
    return this._client.post("/uploads", { body, ...options });
  }
  /**
   * Cancels the Upload. No Parts may be added after an Upload is cancelled.
   *
   * Returns the Upload object with status `cancelled`.
   */
  cancel(uploadID, options) {
    return this._client.post(path`/uploads/${uploadID}/cancel`, options);
  }
  /**
   * Completes the
   * [Upload](https://platform.openai.com/docs/api-reference/uploads/object).
   *
   * Within the returned Upload object, there is a nested
   * [File](https://platform.openai.com/docs/api-reference/files/object) object that
   * is ready to use in the rest of the platform.
   *
   * You can specify the order of the Parts by passing in an ordered list of the Part
   * IDs.
   *
   * The number of bytes uploaded upon completion must match the number of bytes
   * initially specified when creating the Upload object. No Parts may be added after
   * an Upload is completed. Returns the Upload object with status `completed`,
   * including an additional `file` property containing the created usable File
   * object.
   */
  complete(uploadID, body, options) {
    return this._client.post(path`/uploads/${uploadID}/complete`, { body, ...options });
  }
};
Uploads.Parts = Parts;

// codex-rs/wasm/node_modules/openai/lib/Util.mjs
var allSettledWithThrow = async (promises) => {
  const results = await Promise.allSettled(promises);
  const rejected = results.filter((result) => result.status === "rejected");
  if (rejected.length) {
    for (const result of rejected) {
      console.error(result.reason);
    }
    throw new Error(`${rejected.length} promise(s) failed - see the above errors`);
  }
  const values = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      values.push(result.value);
    }
  }
  return values;
};

// codex-rs/wasm/node_modules/openai/resources/vector-stores/file-batches.mjs
var FileBatches = class extends APIResource {
  /**
   * Create a vector store file batch.
   */
  create(vectorStoreID, body, options) {
    return this._client.post(path`/vector_stores/${vectorStoreID}/file_batches`, {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
  /**
   * Retrieves a vector store file batch.
   */
  retrieve(batchID, params, options) {
    const { vector_store_id } = params;
    return this._client.get(path`/vector_stores/${vector_store_id}/file_batches/${batchID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
  /**
   * Cancel a vector store file batch. This attempts to cancel the processing of
   * files in this batch as soon as possible.
   */
  cancel(batchID, params, options) {
    const { vector_store_id } = params;
    return this._client.post(path`/vector_stores/${vector_store_id}/file_batches/${batchID}/cancel`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
  /**
   * Create a vector store batch and poll until all files have been processed.
   */
  async createAndPoll(vectorStoreId, body, options) {
    const batch = await this.create(vectorStoreId, body);
    return await this.poll(vectorStoreId, batch.id, options);
  }
  /**
   * Returns a list of vector store files in a batch.
   */
  listFiles(batchID, params, options) {
    const { vector_store_id, ...query } = params;
    return this._client.getAPIList(path`/vector_stores/${vector_store_id}/file_batches/${batchID}/files`, CursorPage, { query, ...options, headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]) });
  }
  /**
   * Wait for the given file batch to be processed.
   *
   * Note: this will return even if one of the files failed to process, you need to
   * check batch.file_counts.failed_count to handle this case.
   */
  async poll(vectorStoreID, batchID, options) {
    const headers = buildHeaders([
      options?.headers,
      {
        "X-Stainless-Poll-Helper": "true",
        "X-Stainless-Custom-Poll-Interval": options?.pollIntervalMs?.toString() ?? void 0
      }
    ]);
    while (true) {
      const { data: batch, response } = await this.retrieve(batchID, { vector_store_id: vectorStoreID }, {
        ...options,
        headers
      }).withResponse();
      switch (batch.status) {
        case "in_progress":
          let sleepInterval = 5e3;
          if (options?.pollIntervalMs) {
            sleepInterval = options.pollIntervalMs;
          } else {
            const headerInterval = response.headers.get("openai-poll-after-ms");
            if (headerInterval) {
              const headerIntervalMs = parseInt(headerInterval);
              if (!isNaN(headerIntervalMs)) {
                sleepInterval = headerIntervalMs;
              }
            }
          }
          await sleep(sleepInterval);
          break;
        case "failed":
        case "cancelled":
        case "completed":
          return batch;
      }
    }
  }
  /**
   * Uploads the given files concurrently and then creates a vector store file batch.
   *
   * The concurrency limit is configurable using the `maxConcurrency` parameter.
   */
  async uploadAndPoll(vectorStoreId, { files, fileIds = [] }, options) {
    if (files == null || files.length == 0) {
      throw new Error(`No \`files\` provided to process. If you've already uploaded files you should use \`.createAndPoll()\` instead`);
    }
    const configuredConcurrency = options?.maxConcurrency ?? 5;
    const concurrencyLimit = Math.min(configuredConcurrency, files.length);
    const client = this._client;
    const fileIterator = files.values();
    const allFileIds = [...fileIds];
    async function processFiles(iterator) {
      for (let item of iterator) {
        const fileObj = await client.files.create({ file: item, purpose: "assistants" }, options);
        allFileIds.push(fileObj.id);
      }
    }
    const workers = Array(concurrencyLimit).fill(fileIterator).map(processFiles);
    await allSettledWithThrow(workers);
    return await this.createAndPoll(vectorStoreId, {
      file_ids: allFileIds
    });
  }
};

// codex-rs/wasm/node_modules/openai/resources/vector-stores/files.mjs
var Files3 = class extends APIResource {
  /**
   * Create a vector store file by attaching a
   * [File](https://platform.openai.com/docs/api-reference/files) to a
   * [vector store](https://platform.openai.com/docs/api-reference/vector-stores/object).
   */
  create(vectorStoreID, body, options) {
    return this._client.post(path`/vector_stores/${vectorStoreID}/files`, {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
  /**
   * Retrieves a vector store file.
   */
  retrieve(fileID, params, options) {
    const { vector_store_id } = params;
    return this._client.get(path`/vector_stores/${vector_store_id}/files/${fileID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
  /**
   * Update attributes on a vector store file.
   */
  update(fileID, params, options) {
    const { vector_store_id, ...body } = params;
    return this._client.post(path`/vector_stores/${vector_store_id}/files/${fileID}`, {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
  /**
   * Returns a list of vector store files.
   */
  list(vectorStoreID, query = {}, options) {
    return this._client.getAPIList(path`/vector_stores/${vectorStoreID}/files`, CursorPage, {
      query,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
  /**
   * Delete a vector store file. This will remove the file from the vector store but
   * the file itself will not be deleted. To delete the file, use the
   * [delete file](https://platform.openai.com/docs/api-reference/files/delete)
   * endpoint.
   */
  delete(fileID, params, options) {
    const { vector_store_id } = params;
    return this._client.delete(path`/vector_stores/${vector_store_id}/files/${fileID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
  /**
   * Attach a file to the given vector store and wait for it to be processed.
   */
  async createAndPoll(vectorStoreId, body, options) {
    const file = await this.create(vectorStoreId, body, options);
    return await this.poll(vectorStoreId, file.id, options);
  }
  /**
   * Wait for the vector store file to finish processing.
   *
   * Note: this will return even if the file failed to process, you need to check
   * file.last_error and file.status to handle these cases
   */
  async poll(vectorStoreID, fileID, options) {
    const headers = buildHeaders([
      options?.headers,
      {
        "X-Stainless-Poll-Helper": "true",
        "X-Stainless-Custom-Poll-Interval": options?.pollIntervalMs?.toString() ?? void 0
      }
    ]);
    while (true) {
      const fileResponse = await this.retrieve(fileID, {
        vector_store_id: vectorStoreID
      }, { ...options, headers }).withResponse();
      const file = fileResponse.data;
      switch (file.status) {
        case "in_progress":
          let sleepInterval = 5e3;
          if (options?.pollIntervalMs) {
            sleepInterval = options.pollIntervalMs;
          } else {
            const headerInterval = fileResponse.response.headers.get("openai-poll-after-ms");
            if (headerInterval) {
              const headerIntervalMs = parseInt(headerInterval);
              if (!isNaN(headerIntervalMs)) {
                sleepInterval = headerIntervalMs;
              }
            }
          }
          await sleep(sleepInterval);
          break;
        case "failed":
        case "completed":
          return file;
      }
    }
  }
  /**
   * Upload a file to the `files` API and then attach it to the given vector store.
   *
   * Note the file will be asynchronously processed (you can use the alternative
   * polling helper method to wait for processing to complete).
   */
  async upload(vectorStoreId, file, options) {
    const fileInfo = await this._client.files.create({ file, purpose: "assistants" }, options);
    return this.create(vectorStoreId, { file_id: fileInfo.id }, options);
  }
  /**
   * Add a file to a vector store and poll until processing is complete.
   */
  async uploadAndPoll(vectorStoreId, file, options) {
    const fileInfo = await this.upload(vectorStoreId, file, options);
    return await this.poll(vectorStoreId, fileInfo.id, options);
  }
  /**
   * Retrieve the parsed contents of a vector store file.
   */
  content(fileID, params, options) {
    const { vector_store_id } = params;
    return this._client.getAPIList(path`/vector_stores/${vector_store_id}/files/${fileID}/content`, Page, { ...options, headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers]) });
  }
};

// codex-rs/wasm/node_modules/openai/resources/vector-stores/vector-stores.mjs
var VectorStores = class extends APIResource {
  constructor() {
    super(...arguments);
    this.files = new Files3(this._client);
    this.fileBatches = new FileBatches(this._client);
  }
  /**
   * Create a vector store.
   */
  create(body, options) {
    return this._client.post("/vector_stores", {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
  /**
   * Retrieves a vector store.
   */
  retrieve(vectorStoreID, options) {
    return this._client.get(path`/vector_stores/${vectorStoreID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
  /**
   * Modifies a vector store.
   */
  update(vectorStoreID, body, options) {
    return this._client.post(path`/vector_stores/${vectorStoreID}`, {
      body,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
  /**
   * Returns a list of vector stores.
   */
  list(query = {}, options) {
    return this._client.getAPIList("/vector_stores", CursorPage, {
      query,
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
  /**
   * Delete a vector store.
   */
  delete(vectorStoreID, options) {
    return this._client.delete(path`/vector_stores/${vectorStoreID}`, {
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
  /**
   * Search a vector store for relevant chunks based on a query and file attributes
   * filter.
   */
  search(vectorStoreID, body, options) {
    return this._client.getAPIList(path`/vector_stores/${vectorStoreID}/search`, Page, {
      body,
      method: "post",
      ...options,
      headers: buildHeaders([{ "OpenAI-Beta": "assistants=v2" }, options?.headers])
    });
  }
};
VectorStores.Files = Files3;
VectorStores.FileBatches = FileBatches;

// codex-rs/wasm/node_modules/openai/resources/videos.mjs
var Videos = class extends APIResource {
  /**
   * Create a new video generation job from a prompt and optional reference assets.
   */
  create(body, options) {
    return this._client.post("/videos", multipartFormRequestOptions({ body, ...options }, this._client));
  }
  /**
   * Fetch the latest metadata for a generated video.
   */
  retrieve(videoID, options) {
    return this._client.get(path`/videos/${videoID}`, options);
  }
  /**
   * List recently generated videos for the current project.
   */
  list(query = {}, options) {
    return this._client.getAPIList("/videos", ConversationCursorPage, { query, ...options });
  }
  /**
   * Permanently delete a completed or failed video and its stored assets.
   */
  delete(videoID, options) {
    return this._client.delete(path`/videos/${videoID}`, options);
  }
  /**
   * Create a character from an uploaded video.
   */
  createCharacter(body, options) {
    return this._client.post("/videos/characters", multipartFormRequestOptions({ body, ...options }, this._client));
  }
  /**
   * Download the generated video bytes or a derived preview asset.
   *
   * Streams the rendered video content for the specified video job.
   */
  downloadContent(videoID, query = {}, options) {
    return this._client.get(path`/videos/${videoID}/content`, {
      query,
      ...options,
      headers: buildHeaders([{ Accept: "application/binary" }, options?.headers]),
      __binaryResponse: true
    });
  }
  /**
   * Create a new video generation job by editing a source video or existing
   * generated video.
   */
  edit(body, options) {
    return this._client.post("/videos/edits", multipartFormRequestOptions({ body, ...options }, this._client));
  }
  /**
   * Create an extension of a completed video.
   */
  extend(body, options) {
    return this._client.post("/videos/extensions", multipartFormRequestOptions({ body, ...options }, this._client));
  }
  /**
   * Fetch a character.
   */
  getCharacter(characterID, options) {
    return this._client.get(path`/videos/characters/${characterID}`, options);
  }
  /**
   * Create a remix of a completed video using a refreshed prompt.
   */
  remix(videoID, body, options) {
    return this._client.post(path`/videos/${videoID}/remix`, maybeMultipartFormRequestOptions({ body, ...options }, this._client));
  }
};

// codex-rs/wasm/node_modules/openai/resources/webhooks/webhooks.mjs
var _Webhooks_instances;
var _Webhooks_validateSecret;
var _Webhooks_getRequiredHeader;
var Webhooks = class extends APIResource {
  constructor() {
    super(...arguments);
    _Webhooks_instances.add(this);
  }
  /**
   * Validates that the given payload was sent by OpenAI and parses the payload.
   */
  async unwrap(payload, headers, secret = this._client.webhookSecret, tolerance = 300) {
    await this.verifySignature(payload, headers, secret, tolerance);
    return JSON.parse(payload);
  }
  /**
   * Validates whether or not the webhook payload was sent by OpenAI.
   *
   * An error will be raised if the webhook payload was not sent by OpenAI.
   *
   * @param payload - The webhook payload
   * @param headers - The webhook headers
   * @param secret - The webhook secret (optional, will use client secret if not provided)
   * @param tolerance - Maximum age of the webhook in seconds (default: 300 = 5 minutes)
   */
  async verifySignature(payload, headers, secret = this._client.webhookSecret, tolerance = 300) {
    if (typeof crypto === "undefined" || typeof crypto.subtle.importKey !== "function" || typeof crypto.subtle.verify !== "function") {
      throw new Error("Webhook signature verification is only supported when the `crypto` global is defined");
    }
    __classPrivateFieldGet(this, _Webhooks_instances, "m", _Webhooks_validateSecret).call(this, secret);
    const headersObj = buildHeaders([headers]).values;
    const signatureHeader = __classPrivateFieldGet(this, _Webhooks_instances, "m", _Webhooks_getRequiredHeader).call(this, headersObj, "webhook-signature");
    const timestamp = __classPrivateFieldGet(this, _Webhooks_instances, "m", _Webhooks_getRequiredHeader).call(this, headersObj, "webhook-timestamp");
    const webhookId = __classPrivateFieldGet(this, _Webhooks_instances, "m", _Webhooks_getRequiredHeader).call(this, headersObj, "webhook-id");
    const timestampSeconds = parseInt(timestamp, 10);
    if (isNaN(timestampSeconds)) {
      throw new InvalidWebhookSignatureError("Invalid webhook timestamp format");
    }
    const nowSeconds = Math.floor(Date.now() / 1e3);
    if (nowSeconds - timestampSeconds > tolerance) {
      throw new InvalidWebhookSignatureError("Webhook timestamp is too old");
    }
    if (timestampSeconds > nowSeconds + tolerance) {
      throw new InvalidWebhookSignatureError("Webhook timestamp is too new");
    }
    const signatures = signatureHeader.split(" ").map((part) => part.startsWith("v1,") ? part.substring(3) : part);
    const decodedSecret = secret.startsWith("whsec_") ? Buffer.from(secret.replace("whsec_", ""), "base64") : Buffer.from(secret, "utf-8");
    const signedPayload = webhookId ? `${webhookId}.${timestamp}.${payload}` : `${timestamp}.${payload}`;
    const key = await crypto.subtle.importKey("raw", decodedSecret, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    for (const signature of signatures) {
      try {
        const signatureBytes = Buffer.from(signature, "base64");
        const isValid = await crypto.subtle.verify("HMAC", key, signatureBytes, new TextEncoder().encode(signedPayload));
        if (isValid) {
          return;
        }
      } catch {
        continue;
      }
    }
    throw new InvalidWebhookSignatureError("The given webhook signature does not match the expected signature");
  }
};
_Webhooks_instances = /* @__PURE__ */ new WeakSet(), _Webhooks_validateSecret = function _Webhooks_validateSecret2(secret) {
  if (typeof secret !== "string" || secret.length === 0) {
    throw new Error(`The webhook secret must either be set using the env var, OPENAI_WEBHOOK_SECRET, on the client class, OpenAI({ webhookSecret: '123' }), or passed to this function`);
  }
}, _Webhooks_getRequiredHeader = function _Webhooks_getRequiredHeader2(headers, name) {
  if (!headers) {
    throw new Error(`Headers are required`);
  }
  const value = headers.get(name);
  if (value === null || value === void 0) {
    throw new Error(`Missing required header: ${name}`);
  }
  return value;
};

// codex-rs/wasm/node_modules/openai/client.mjs
var _OpenAI_instances;
var _a2;
var _OpenAI_encoder;
var _OpenAI_baseURLOverridden;
var OpenAI = class {
  /**
   * API Client for interfacing with the OpenAI API.
   *
   * @param {string | undefined} [opts.apiKey=process.env['OPENAI_API_KEY'] ?? undefined]
   * @param {string | null | undefined} [opts.organization=process.env['OPENAI_ORG_ID'] ?? null]
   * @param {string | null | undefined} [opts.project=process.env['OPENAI_PROJECT_ID'] ?? null]
   * @param {string | null | undefined} [opts.webhookSecret=process.env['OPENAI_WEBHOOK_SECRET'] ?? null]
   * @param {string} [opts.baseURL=process.env['OPENAI_BASE_URL'] ?? https://api.openai.com/v1] - Override the default base URL for the API.
   * @param {number} [opts.timeout=10 minutes] - The maximum amount of time (in milliseconds) the client will wait for a response before timing out.
   * @param {MergedRequestInit} [opts.fetchOptions] - Additional `RequestInit` options to be passed to `fetch` calls.
   * @param {Fetch} [opts.fetch] - Specify a custom `fetch` function implementation.
   * @param {number} [opts.maxRetries=2] - The maximum number of times the client will retry a request.
   * @param {HeadersLike} opts.defaultHeaders - Default headers to include with every request to the API.
   * @param {Record<string, string | undefined>} opts.defaultQuery - Default query parameters to include with every request to the API.
   * @param {boolean} [opts.dangerouslyAllowBrowser=false] - By default, client-side use of this library is not allowed, as it risks exposing your secret API credentials to attackers.
   */
  constructor({ baseURL = readEnv("OPENAI_BASE_URL"), apiKey = readEnv("OPENAI_API_KEY"), organization = readEnv("OPENAI_ORG_ID") ?? null, project = readEnv("OPENAI_PROJECT_ID") ?? null, webhookSecret = readEnv("OPENAI_WEBHOOK_SECRET") ?? null, ...opts } = {}) {
    _OpenAI_instances.add(this);
    _OpenAI_encoder.set(this, void 0);
    this.completions = new Completions2(this);
    this.chat = new Chat(this);
    this.embeddings = new Embeddings(this);
    this.files = new Files2(this);
    this.images = new Images(this);
    this.audio = new Audio(this);
    this.moderations = new Moderations(this);
    this.models = new Models(this);
    this.fineTuning = new FineTuning(this);
    this.graders = new Graders2(this);
    this.vectorStores = new VectorStores(this);
    this.webhooks = new Webhooks(this);
    this.beta = new Beta(this);
    this.batches = new Batches(this);
    this.uploads = new Uploads(this);
    this.responses = new Responses(this);
    this.realtime = new Realtime2(this);
    this.conversations = new Conversations(this);
    this.evals = new Evals(this);
    this.containers = new Containers(this);
    this.skills = new Skills(this);
    this.videos = new Videos(this);
    if (apiKey === void 0) {
      throw new OpenAIError("Missing credentials. Please pass an `apiKey`, or set the `OPENAI_API_KEY` environment variable.");
    }
    const options = {
      apiKey,
      organization,
      project,
      webhookSecret,
      ...opts,
      baseURL: baseURL || `https://api.openai.com/v1`
    };
    if (!options.dangerouslyAllowBrowser && isRunningInBrowser()) {
      throw new OpenAIError("It looks like you're running in a browser-like environment.\n\nThis is disabled by default, as it risks exposing your secret API credentials to attackers.\nIf you understand the risks and have appropriate mitigations in place,\nyou can set the `dangerouslyAllowBrowser` option to `true`, e.g.,\n\nnew OpenAI({ apiKey, dangerouslyAllowBrowser: true });\n\nhttps://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety\n");
    }
    this.baseURL = options.baseURL;
    this.timeout = options.timeout ?? _a2.DEFAULT_TIMEOUT;
    this.logger = options.logger ?? console;
    const defaultLogLevel = "warn";
    this.logLevel = defaultLogLevel;
    this.logLevel = parseLogLevel(options.logLevel, "ClientOptions.logLevel", this) ?? parseLogLevel(readEnv("OPENAI_LOG"), "process.env['OPENAI_LOG']", this) ?? defaultLogLevel;
    this.fetchOptions = options.fetchOptions;
    this.maxRetries = options.maxRetries ?? 2;
    this.fetch = options.fetch ?? getDefaultFetch();
    __classPrivateFieldSet(this, _OpenAI_encoder, FallbackEncoder, "f");
    this._options = options;
    this.apiKey = typeof apiKey === "string" ? apiKey : "Missing Key";
    this.organization = organization;
    this.project = project;
    this.webhookSecret = webhookSecret;
  }
  /**
   * Create a new client instance re-using the same options given to the current client with optional overriding.
   */
  withOptions(options) {
    const client = new this.constructor({
      ...this._options,
      baseURL: this.baseURL,
      maxRetries: this.maxRetries,
      timeout: this.timeout,
      logger: this.logger,
      logLevel: this.logLevel,
      fetch: this.fetch,
      fetchOptions: this.fetchOptions,
      apiKey: this.apiKey,
      organization: this.organization,
      project: this.project,
      webhookSecret: this.webhookSecret,
      ...options
    });
    return client;
  }
  defaultQuery() {
    return this._options.defaultQuery;
  }
  validateHeaders({ values, nulls }) {
    return;
  }
  async authHeaders(opts) {
    return buildHeaders([{ Authorization: `Bearer ${this.apiKey}` }]);
  }
  stringifyQuery(query) {
    return stringifyQuery(query);
  }
  getUserAgent() {
    return `${this.constructor.name}/JS ${VERSION}`;
  }
  defaultIdempotencyKey() {
    return `stainless-node-retry-${uuid4()}`;
  }
  makeStatusError(status, error, message, headers) {
    return APIError.generate(status, error, message, headers);
  }
  async _callApiKey() {
    const apiKey = this._options.apiKey;
    if (typeof apiKey !== "function")
      return false;
    let token;
    try {
      token = await apiKey();
    } catch (err) {
      if (err instanceof OpenAIError)
        throw err;
      throw new OpenAIError(
        `Failed to get token from 'apiKey' function: ${err.message}`,
        // @ts-ignore
        { cause: err }
      );
    }
    if (typeof token !== "string" || !token) {
      throw new OpenAIError(`Expected 'apiKey' function argument to return a string but it returned ${token}`);
    }
    this.apiKey = token;
    return true;
  }
  buildURL(path2, query, defaultBaseURL) {
    const baseURL = !__classPrivateFieldGet(this, _OpenAI_instances, "m", _OpenAI_baseURLOverridden).call(this) && defaultBaseURL || this.baseURL;
    const url = isAbsoluteURL(path2) ? new URL(path2) : new URL(baseURL + (baseURL.endsWith("/") && path2.startsWith("/") ? path2.slice(1) : path2));
    const defaultQuery = this.defaultQuery();
    const pathQuery = Object.fromEntries(url.searchParams);
    if (!isEmptyObj(defaultQuery) || !isEmptyObj(pathQuery)) {
      query = { ...pathQuery, ...defaultQuery, ...query };
    }
    if (typeof query === "object" && query && !Array.isArray(query)) {
      url.search = this.stringifyQuery(query);
    }
    return url.toString();
  }
  /**
   * Used as a callback for mutating the given `FinalRequestOptions` object.
   */
  async prepareOptions(options) {
    await this._callApiKey();
  }
  /**
   * Used as a callback for mutating the given `RequestInit` object.
   *
   * This is useful for cases where you want to add certain headers based off of
   * the request properties, e.g. `method` or `url`.
   */
  async prepareRequest(request, { url, options }) {
  }
  get(path2, opts) {
    return this.methodRequest("get", path2, opts);
  }
  post(path2, opts) {
    return this.methodRequest("post", path2, opts);
  }
  patch(path2, opts) {
    return this.methodRequest("patch", path2, opts);
  }
  put(path2, opts) {
    return this.methodRequest("put", path2, opts);
  }
  delete(path2, opts) {
    return this.methodRequest("delete", path2, opts);
  }
  methodRequest(method, path2, opts) {
    return this.request(Promise.resolve(opts).then((opts2) => {
      return { method, path: path2, ...opts2 };
    }));
  }
  request(options, remainingRetries = null) {
    return new APIPromise(this, this.makeRequest(options, remainingRetries, void 0));
  }
  async makeRequest(optionsInput, retriesRemaining, retryOfRequestLogID) {
    const options = await optionsInput;
    const maxRetries = options.maxRetries ?? this.maxRetries;
    if (retriesRemaining == null) {
      retriesRemaining = maxRetries;
    }
    await this.prepareOptions(options);
    const { req, url, timeout } = await this.buildRequest(options, {
      retryCount: maxRetries - retriesRemaining
    });
    await this.prepareRequest(req, { url, options });
    const requestLogID = "log_" + (Math.random() * (1 << 24) | 0).toString(16).padStart(6, "0");
    const retryLogStr = retryOfRequestLogID === void 0 ? "" : `, retryOf: ${retryOfRequestLogID}`;
    const startTime = Date.now();
    loggerFor(this).debug(`[${requestLogID}] sending request`, formatRequestDetails({
      retryOfRequestLogID,
      method: options.method,
      url,
      options,
      headers: req.headers
    }));
    if (options.signal?.aborted) {
      throw new APIUserAbortError();
    }
    const controller = new AbortController();
    const response = await this.fetchWithTimeout(url, req, timeout, controller).catch(castToError);
    const headersTime = Date.now();
    if (response instanceof globalThis.Error) {
      const retryMessage = `retrying, ${retriesRemaining} attempts remaining`;
      if (options.signal?.aborted) {
        throw new APIUserAbortError();
      }
      const isTimeout = isAbortError2(response) || /timed? ?out/i.test(String(response) + ("cause" in response ? String(response.cause) : ""));
      if (retriesRemaining) {
        loggerFor(this).info(`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} - ${retryMessage}`);
        loggerFor(this).debug(`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} (${retryMessage})`, formatRequestDetails({
          retryOfRequestLogID,
          url,
          durationMs: headersTime - startTime,
          message: response.message
        }));
        return this.retryRequest(options, retriesRemaining, retryOfRequestLogID ?? requestLogID);
      }
      loggerFor(this).info(`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} - error; no more retries left`);
      loggerFor(this).debug(`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} (error; no more retries left)`, formatRequestDetails({
        retryOfRequestLogID,
        url,
        durationMs: headersTime - startTime,
        message: response.message
      }));
      if (isTimeout) {
        throw new APIConnectionTimeoutError();
      }
      throw new APIConnectionError({ cause: response });
    }
    const specialHeaders = [...response.headers.entries()].filter(([name]) => name === "x-request-id").map(([name, value]) => ", " + name + ": " + JSON.stringify(value)).join("");
    const responseInfo = `[${requestLogID}${retryLogStr}${specialHeaders}] ${req.method} ${url} ${response.ok ? "succeeded" : "failed"} with status ${response.status} in ${headersTime - startTime}ms`;
    if (!response.ok) {
      const shouldRetry = await this.shouldRetry(response);
      if (retriesRemaining && shouldRetry) {
        const retryMessage2 = `retrying, ${retriesRemaining} attempts remaining`;
        await CancelReadableStream(response.body);
        loggerFor(this).info(`${responseInfo} - ${retryMessage2}`);
        loggerFor(this).debug(`[${requestLogID}] response error (${retryMessage2})`, formatRequestDetails({
          retryOfRequestLogID,
          url: response.url,
          status: response.status,
          headers: response.headers,
          durationMs: headersTime - startTime
        }));
        return this.retryRequest(options, retriesRemaining, retryOfRequestLogID ?? requestLogID, response.headers);
      }
      const retryMessage = shouldRetry ? `error; no more retries left` : `error; not retryable`;
      loggerFor(this).info(`${responseInfo} - ${retryMessage}`);
      const errText = await response.text().catch((err2) => castToError(err2).message);
      const errJSON = safeJSON(errText);
      const errMessage = errJSON ? void 0 : errText;
      loggerFor(this).debug(`[${requestLogID}] response error (${retryMessage})`, formatRequestDetails({
        retryOfRequestLogID,
        url: response.url,
        status: response.status,
        headers: response.headers,
        message: errMessage,
        durationMs: Date.now() - startTime
      }));
      const err = this.makeStatusError(response.status, errJSON, errMessage, response.headers);
      throw err;
    }
    loggerFor(this).info(responseInfo);
    loggerFor(this).debug(`[${requestLogID}] response start`, formatRequestDetails({
      retryOfRequestLogID,
      url: response.url,
      status: response.status,
      headers: response.headers,
      durationMs: headersTime - startTime
    }));
    return { response, options, controller, requestLogID, retryOfRequestLogID, startTime };
  }
  getAPIList(path2, Page2, opts) {
    return this.requestAPIList(Page2, opts && "then" in opts ? opts.then((opts2) => ({ method: "get", path: path2, ...opts2 })) : { method: "get", path: path2, ...opts });
  }
  requestAPIList(Page2, options) {
    const request = this.makeRequest(options, null, void 0);
    return new PagePromise(this, request, Page2);
  }
  async fetchWithTimeout(url, init, ms, controller) {
    const { signal, method, ...options } = init || {};
    const abort = this._makeAbort(controller);
    if (signal)
      signal.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, ms);
    const isReadableBody = globalThis.ReadableStream && options.body instanceof globalThis.ReadableStream || typeof options.body === "object" && options.body !== null && Symbol.asyncIterator in options.body;
    const fetchOptions = {
      signal: controller.signal,
      ...isReadableBody ? { duplex: "half" } : {},
      method: "GET",
      ...options
    };
    if (method) {
      fetchOptions.method = method.toUpperCase();
    }
    try {
      return await this.fetch.call(void 0, url, fetchOptions);
    } finally {
      clearTimeout(timeout);
    }
  }
  async shouldRetry(response) {
    const shouldRetryHeader = response.headers.get("x-should-retry");
    if (shouldRetryHeader === "true")
      return true;
    if (shouldRetryHeader === "false")
      return false;
    if (response.status === 408)
      return true;
    if (response.status === 409)
      return true;
    if (response.status === 429)
      return true;
    if (response.status >= 500)
      return true;
    return false;
  }
  async retryRequest(options, retriesRemaining, requestLogID, responseHeaders) {
    let timeoutMillis;
    const retryAfterMillisHeader = responseHeaders?.get("retry-after-ms");
    if (retryAfterMillisHeader) {
      const timeoutMs = parseFloat(retryAfterMillisHeader);
      if (!Number.isNaN(timeoutMs)) {
        timeoutMillis = timeoutMs;
      }
    }
    const retryAfterHeader = responseHeaders?.get("retry-after");
    if (retryAfterHeader && !timeoutMillis) {
      const timeoutSeconds = parseFloat(retryAfterHeader);
      if (!Number.isNaN(timeoutSeconds)) {
        timeoutMillis = timeoutSeconds * 1e3;
      } else {
        timeoutMillis = Date.parse(retryAfterHeader) - Date.now();
      }
    }
    if (timeoutMillis === void 0) {
      const maxRetries = options.maxRetries ?? this.maxRetries;
      timeoutMillis = this.calculateDefaultRetryTimeoutMillis(retriesRemaining, maxRetries);
    }
    await sleep(timeoutMillis);
    return this.makeRequest(options, retriesRemaining - 1, requestLogID);
  }
  calculateDefaultRetryTimeoutMillis(retriesRemaining, maxRetries) {
    const initialRetryDelay = 0.5;
    const maxRetryDelay = 8;
    const numRetries = maxRetries - retriesRemaining;
    const sleepSeconds = Math.min(initialRetryDelay * Math.pow(2, numRetries), maxRetryDelay);
    const jitter = 1 - Math.random() * 0.25;
    return sleepSeconds * jitter * 1e3;
  }
  async buildRequest(inputOptions, { retryCount = 0 } = {}) {
    const options = { ...inputOptions };
    const { method, path: path2, query, defaultBaseURL } = options;
    const url = this.buildURL(path2, query, defaultBaseURL);
    if ("timeout" in options)
      validatePositiveInteger("timeout", options.timeout);
    options.timeout = options.timeout ?? this.timeout;
    const { bodyHeaders, body } = this.buildBody({ options });
    const reqHeaders = await this.buildHeaders({ options: inputOptions, method, bodyHeaders, retryCount });
    const req = {
      method,
      headers: reqHeaders,
      ...options.signal && { signal: options.signal },
      ...globalThis.ReadableStream && body instanceof globalThis.ReadableStream && { duplex: "half" },
      ...body && { body },
      ...this.fetchOptions ?? {},
      ...options.fetchOptions ?? {}
    };
    return { req, url, timeout: options.timeout };
  }
  async buildHeaders({ options, method, bodyHeaders, retryCount }) {
    let idempotencyHeaders = {};
    if (this.idempotencyHeader && method !== "get") {
      if (!options.idempotencyKey)
        options.idempotencyKey = this.defaultIdempotencyKey();
      idempotencyHeaders[this.idempotencyHeader] = options.idempotencyKey;
    }
    const headers = buildHeaders([
      idempotencyHeaders,
      {
        Accept: "application/json",
        "User-Agent": this.getUserAgent(),
        "X-Stainless-Retry-Count": String(retryCount),
        ...options.timeout ? { "X-Stainless-Timeout": String(Math.trunc(options.timeout / 1e3)) } : {},
        ...getPlatformHeaders(),
        "OpenAI-Organization": this.organization,
        "OpenAI-Project": this.project
      },
      await this.authHeaders(options),
      this._options.defaultHeaders,
      bodyHeaders,
      options.headers
    ]);
    this.validateHeaders(headers);
    return headers.values;
  }
  _makeAbort(controller) {
    return () => controller.abort();
  }
  buildBody({ options: { body, headers: rawHeaders } }) {
    if (!body) {
      return { bodyHeaders: void 0, body: void 0 };
    }
    const headers = buildHeaders([rawHeaders]);
    if (
      // Pass raw type verbatim
      ArrayBuffer.isView(body) || body instanceof ArrayBuffer || body instanceof DataView || typeof body === "string" && // Preserve legacy string encoding behavior for now
      headers.values.has("content-type") || // `Blob` is superset of `File`
      globalThis.Blob && body instanceof globalThis.Blob || // `FormData` -> `multipart/form-data`
      body instanceof FormData || // `URLSearchParams` -> `application/x-www-form-urlencoded`
      body instanceof URLSearchParams || // Send chunked stream (each chunk has own `length`)
      globalThis.ReadableStream && body instanceof globalThis.ReadableStream
    ) {
      return { bodyHeaders: void 0, body };
    } else if (typeof body === "object" && (Symbol.asyncIterator in body || Symbol.iterator in body && "next" in body && typeof body.next === "function")) {
      return { bodyHeaders: void 0, body: ReadableStreamFrom(body) };
    } else if (typeof body === "object" && headers.values.get("content-type") === "application/x-www-form-urlencoded") {
      return {
        bodyHeaders: { "content-type": "application/x-www-form-urlencoded" },
        body: this.stringifyQuery(body)
      };
    } else {
      return __classPrivateFieldGet(this, _OpenAI_encoder, "f").call(this, { body, headers });
    }
  }
};
_a2 = OpenAI, _OpenAI_encoder = /* @__PURE__ */ new WeakMap(), _OpenAI_instances = /* @__PURE__ */ new WeakSet(), _OpenAI_baseURLOverridden = function _OpenAI_baseURLOverridden2() {
  return this.baseURL !== "https://api.openai.com/v1";
};
OpenAI.OpenAI = _a2;
OpenAI.DEFAULT_TIMEOUT = 6e5;
OpenAI.OpenAIError = OpenAIError;
OpenAI.APIError = APIError;
OpenAI.APIConnectionError = APIConnectionError;
OpenAI.APIConnectionTimeoutError = APIConnectionTimeoutError;
OpenAI.APIUserAbortError = APIUserAbortError;
OpenAI.NotFoundError = NotFoundError;
OpenAI.ConflictError = ConflictError;
OpenAI.RateLimitError = RateLimitError;
OpenAI.BadRequestError = BadRequestError;
OpenAI.AuthenticationError = AuthenticationError;
OpenAI.InternalServerError = InternalServerError;
OpenAI.PermissionDeniedError = PermissionDeniedError;
OpenAI.UnprocessableEntityError = UnprocessableEntityError;
OpenAI.InvalidWebhookSignatureError = InvalidWebhookSignatureError;
OpenAI.toFile = toFile;
OpenAI.Completions = Completions2;
OpenAI.Chat = Chat;
OpenAI.Embeddings = Embeddings;
OpenAI.Files = Files2;
OpenAI.Images = Images;
OpenAI.Audio = Audio;
OpenAI.Moderations = Moderations;
OpenAI.Models = Models;
OpenAI.FineTuning = FineTuning;
OpenAI.Graders = Graders2;
OpenAI.VectorStores = VectorStores;
OpenAI.Webhooks = Webhooks;
OpenAI.Beta = Beta;
OpenAI.Batches = Batches;
OpenAI.Uploads = Uploads;
OpenAI.Responses = Responses;
OpenAI.Realtime = Realtime2;
OpenAI.Conversations = Conversations;
OpenAI.Evals = Evals;
OpenAI.Containers = Containers;
OpenAI.Skills = Skills;
OpenAI.Videos = Videos;

// codex-rs/wasm/ts/model-transport/src/responses-executor.ts
async function runResponsesStreamingExecutor(params) {
  const abortController = new AbortController();
  let cancelled = false;
  params.onRegisterCancel(
    () => {
      cancelled = true;
      abortController.abort();
    },
    () => cancelled
  );
  try {
    const client = new OpenAI({
      apiKey: params.apiKey,
      baseURL: firstResponsesApiUrl(params.baseUrl),
      defaultHeaders: params.extraHeaders ?? void 0,
      dangerouslyAllowBrowser: true
    });
    const stream = await client.responses.create(params.requestBody, {
      signal: abortController.signal
    });
    for await (const event of stream) {
      params.onEvent?.(event);
      const outputTextDelta = extractOutputTextDelta(event);
      if (outputTextDelta !== null) {
        params.onDelta?.(outputTextDelta);
      }
      const outputItem = extractOutputItemDone(event);
      if (outputItem !== null) {
        params.onOutputItemDone?.(outputItem);
      }
      if (event.type === "error") {
        const message = extractOpenAiEventMessage(event);
        params.onErrorEvent?.(message);
        throw params.createError("openaiError", message);
      }
      if (event.type === "response.completed") {
        params.onCompleted?.();
        break;
      }
      if (cancelled) {
        throw params.createError("cancelled", "model turn cancelled");
      }
    }
  } catch (error) {
    if (cancelled || params.isAbortError(error)) {
      throw params.createError("cancelled", "model turn cancelled");
    }
    throw error;
  } finally {
    params.onUnregisterCancel();
  }
}
function extractOutputTextDelta(eventPayload) {
  return eventPayload.type === "response.output_text.delta" && typeof eventPayload.delta === "string" ? eventPayload.delta : null;
}
function extractOutputItemDone(eventPayload) {
  if (eventPayload.type !== "response.output_item.done") {
    return null;
  }
  return "item" in eventPayload && eventPayload.item !== null && typeof eventPayload.item === "object" ? eventPayload.item : null;
}
function extractOpenAiEventMessage(eventPayload) {
  const error = "error" in eventPayload && eventPayload.error !== null && typeof eventPayload.error === "object" ? eventPayload.error : null;
  return error !== null && typeof error.message === "string" ? error.message : "OpenAI stream returned an error event";
}

// codex-rs/wasm/ts/model-transport/src/xrouter-request.ts
function prepareXrouterResponsesRequest(requestBody) {
  const normalizedInput = Array.isArray(requestBody.input) ? requestBody.input.map(
    (item) => normalizeResponsesInputItemForXrouter(item)
  ) : requestBody.input;
  const normalizedTools = Array.isArray(requestBody.tools) ? requestBody.tools.map((tool) => normalizeTransportToolForXrouter(tool)).filter((tool) => tool !== null) : requestBody.tools;
  return {
    ...requestBody,
    ...normalizedInput === void 0 ? {} : { input: normalizedInput },
    ...normalizedTools === void 0 ? {} : { tools: normalizedTools }
  };
}
function normalizeResponsesInputItemForXrouter(item) {
  if (item === null || typeof item !== "object" || Array.isArray(item)) {
    return item;
  }
  const record = item;
  if (record.type === "function_call" && typeof record.name === "string") {
    return normalizeFunctionCallItemForXrouter(record);
  }
  if (record.type !== "function_call_output" && record.type !== "custom_tool_call_output") {
    return item;
  }
  return {
    ...record,
    output: normalizeFunctionCallOutputForXrouter(record.output)
  };
}
function normalizeFunctionCallItemForXrouter(record) {
  const toolName = typeof record.name === "string" ? record.name : null;
  const namespace = typeof record.namespace === "string" ? record.namespace : null;
  if (toolName === null || namespace === null || toolName.startsWith(`${namespace}__`)) {
    return record;
  }
  const { namespace: _namespace, ...rest } = record;
  return {
    ...rest,
    name: qualifyDynamicToolName({
      toolNamespace: namespace,
      toolName
    })
  };
}
function normalizeFunctionCallOutputForXrouter(output) {
  if (!Array.isArray(output)) {
    return output;
  }
  const textParts = output.flatMap((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }
    const content = entry;
    if (content.type !== "input_text" || typeof content.text !== "string") {
      return [];
    }
    const text = content.text.trim();
    return text.length > 0 ? [text] : [];
  });
  if (textParts.length === 0) {
    return output;
  }
  return textParts.join("\n");
}
function normalizeTransportToolForXrouter(tool) {
  if (tool === null || typeof tool !== "object" || Array.isArray(tool)) {
    return null;
  }
  const record = tool;
  if (record.type !== "tool_search") {
    return tool;
  }
  return {
    type: "function",
    name: "tool_search",
    description: typeof record.description === "string" ? record.description : "",
    parameters: record.parameters !== void 0 && record.parameters !== null ? record.parameters : {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  };
}

// codex-rs/wasm/ts/model-transport/src/xrouter-executor.ts
async function runXrouterStreamingExecutor(params) {
  const normalizedRequestBody = withRequestHeaders(
    prepareXrouterResponsesRequest(params.requestBody),
    params.extraHeaders
  );
  let cancelled = false;
  params.onRegisterCancel(
    () => {
      cancelled = true;
      params.client.cancel(params.requestId);
    },
    () => cancelled
  );
  try {
    await params.client.runResponsesStream(
      params.requestId,
      normalizedRequestBody,
      (event) => {
        if (cancelled) {
          return;
        }
        const payload = normalizeXrouterEventPayload(params.normalizeHostValue(event));
        if (payload === null) {
          return;
        }
        params.onEvent?.(payload);
        if (payload.type === "output_text_delta" && typeof payload.delta === "string") {
          params.onDelta?.(payload.delta);
          return;
        }
        if (payload.type === "response_completed") {
          params.onCompleted?.(payload);
          return;
        }
        if (payload.type === "response_error") {
          const message = typeof payload.message === "string" ? payload.message : "xrouter request failed";
          params.onErrorEvent?.(message, payload);
        }
      }
    );
  } catch (error) {
    if (cancelled || params.isAbortError(error)) {
      throw params.createError("cancelled", "model turn cancelled");
    }
    throw error;
  } finally {
    params.onUnregisterCancel();
  }
  if (cancelled) {
    throw params.createError("cancelled", "model turn cancelled");
  }
  return normalizedRequestBody;
}
function withRequestHeaders(requestBody, extraHeaders) {
  if (extraHeaders === null) {
    return requestBody;
  }
  return {
    ...requestBody,
    headers: {
      ...extraHeaders
    }
  };
}
function createXrouterBrowserClient(params) {
  return new params.runtime.WasmBrowserClient(
    params.provider.metadata?.xrouterProvider ?? "deepseek",
    params.provider.baseUrl.length === 0 ? null : params.provider.baseUrl,
    params.apiKey.length === 0 ? null : params.apiKey
  );
}
function normalizeXrouterEventPayload(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}

// codex-rs/wasm/ts/model-transport/src/xrouter-codex.ts
function mapXrouterOutputItemToCodexResponseItem(item, fallbackAssistantItemId) {
  if (item === null || typeof item !== "object" || Array.isArray(item)) {
    return null;
  }
  const record = item;
  if (record.type === "message") {
    return {
      type: "message",
      // Xrouter streaming starts the assistant message before the final output
      // item arrives. Reuse that synthetic item id on completion so the
      // app-server closes the same assistant item instead of materializing a
      // second message with a different upstream id.
      ...typeof fallbackAssistantItemId === "string" ? { id: fallbackAssistantItemId } : typeof record.id === "string" ? { id: record.id } : {},
      role: typeof record.role === "string" ? record.role : "assistant",
      content: Array.isArray(record.content) ? record.content : [],
      end_turn: true
    };
  }
  if (record.type === "function_call" && typeof record.name === "string") {
    const callId = typeof record.call_id === "string" ? record.call_id : typeof record.id === "string" ? record.id : null;
    if (callId === null) {
      return null;
    }
    if (record.name === "tool_search") {
      return {
        type: "tool_search_call",
        id: typeof record.id === "string" ? record.id : void 0,
        call_id: callId,
        execution: "client",
        arguments: typeof record.arguments === "string" ? JSON.parse(record.arguments) : record.arguments ?? {}
      };
    }
    return {
      type: "function_call",
      id: typeof record.id === "string" ? record.id : void 0,
      call_id: callId,
      ...typeof record.namespace === "string" && record.namespace.length > 0 ? { name: record.name, namespace: record.namespace } : splitQualifiedToolNameForCodex(record.name),
      arguments: typeof record.arguments === "string" ? record.arguments : record.arguments !== void 0 ? JSON.stringify(record.arguments) : "{}"
    };
  }
  return null;
}

// codex-rs/wasm/ts/model-transport/src/browser-adapter.ts
function createBrowserModelTransportAdapter(deps) {
  return {
    async discoverModels(config) {
      const provider = deps.getProvider(config);
      if (provider.providerKind === "xrouter_browser") {
        const client = await createXrouterClient(config, deps);
        const modelIds = await client.fetchModelIds();
        if (!Array.isArray(modelIds)) {
          throw new Error("xrouter-browser returned an invalid model id list");
        }
        return {
          data: modelIds.filter((entry) => typeof entry === "string" && entry.trim().length > 0).map((id, index) => ({
            id,
            displayName: deps.modelIdToDisplayName(id),
            description: provider.name,
            isDefault: index === 0,
            showInPicker: true,
            supportsApi: true
          })),
          nextCursor: null
        };
      }
      const response = await sendJsonRequestWithFallback({
        urls: candidateApiUrls(provider.baseUrl, "models"),
        method: "GET",
        apiKey: deps.getApiKey(config),
        fallbackMessage: "failed to list models",
        createError: deps.createError
      });
      const payload = await response.json();
      return {
        data: deps.normalizeDiscoveredModels(payload, provider.providerKind === "openai"),
        nextCursor: null
      };
    },
    async runModelTurn(params) {
      const provider = deps.getProvider(params.config);
      if (provider.providerKind === "xrouter_browser") {
        return await deps.runXrouterTurn(params);
      }
      return await deps.runResponsesTurn(params);
    }
  };
}
function createResolvedBrowserModelTransportAdapter(deps) {
  return createBrowserModelTransportAdapter({
    ...deps,
    async runResponsesTurn(params) {
      const provider = deps.getProvider(params.config);
      return await deps.runResponsesTurn({
        ...params,
        provider,
        apiKey: deps.getApiKey(params.config)
      });
    },
    async runXrouterTurn(params) {
      const provider = deps.getProvider(params.config);
      return await deps.runXrouterTurn({
        ...params,
        provider,
        apiKey: deps.getApiKey(params.config)
      });
    }
  });
}
async function createXrouterClient(config, deps) {
  const runtime = await deps.loadXrouterRuntime();
  const provider = deps.getProvider(config);
  const apiKey = deps.getApiKey(config);
  return createXrouterBrowserClient({ runtime, provider, apiKey });
}

// codex-rs/wasm/ts/browser-runtime/src/transport.ts
var activeModelCancels = /* @__PURE__ */ new Map();
var OPENROUTER_APP_ATTRIBUTION_HEADERS = {
  "HTTP-Referer": "https://xcodex.chat",
  "X-OpenRouter-Title": "XCodex",
  "X-OpenRouter-Categories": "personal-agent,programming-app"
};
function createBrowserRuntimeModelTransportAdapter(deps) {
  return createResolvedBrowserModelTransportAdapter({
    getProvider(config) {
      return validateBrowserTransportProvider(
        getActiveProvider(config),
        normalizeBrowserSecurityConfig(config.browser_security)
      );
    },
    getApiKey: activeProviderApiKey,
    normalizeDiscoveredModels,
    modelIdToDisplayName,
    createError: (code, message, data) => createHostError2(code, message, data),
    loadXrouterRuntime: deps.loadXrouterRuntime,
    async runResponsesTurn(params) {
      return await runResponsesApiTurn({
        requestId: params.requestId,
        baseUrl: params.provider.baseUrl,
        apiKey: params.apiKey,
        requestBody: params.requestBody,
        extraHeaders: resolveProviderRequestHeaders(
          params.provider,
          params.extraHeaders
        ),
        emitModelEvent: params.emitModelEvent
      });
    },
    async runXrouterTurn(params) {
      return await runXrouterTurn({
        requestId: params.requestId,
        codexConfig: params.config,
        requestBody: params.requestBody,
        extraHeaders: params.extraHeaders,
        transportOptions: params.transportOptions,
        emitModelEvent: params.emitModelEvent,
        loadXrouterRuntime: deps.loadXrouterRuntime
      });
    }
  });
}
function validateBrowserTransportProvider(provider, browserSecurity = normalizeBrowserSecurityConfig(void 0)) {
  const normalizedBaseUrl = normalizeProviderBaseUrl(provider.baseUrl);
  switch (provider.providerKind) {
    case "openai":
      assertAllowedProviderBaseUrl(
        normalizedBaseUrl,
        /* @__PURE__ */ new Set(["https://api.openai.com/v1"]),
        provider
      );
      break;
    case "xrouter_browser":
      assertAllowedProviderBaseUrl(
        normalizedBaseUrl,
        /* @__PURE__ */ new Set([
          "https://api.deepseek.com",
          "https://api.openai.com/v1",
          "https://openrouter.ai/api/v1",
          "https://api.z.ai/api/paas/v4"
        ]),
        provider
      );
      break;
    case "openai_compatible":
      validateOpenAiCompatibleProviderBaseUrl(
        normalizedBaseUrl,
        provider,
        browserSecurity
      );
      break;
  }
  return {
    ...provider,
    baseUrl: normalizedBaseUrl
  };
}
function assertAllowedProviderBaseUrl(baseUrl, allowedBaseUrls, provider) {
  if (allowedBaseUrls.has(baseUrl)) {
    return;
  }
  throw createHostError2(
    "invalid_provider_base_url",
    `Provider \`${provider.name}\` (${provider.providerKind}) uses a blocked baseUrl: ${baseUrl}`,
    {
      providerKind: provider.providerKind,
      baseUrl,
      allowedBaseUrls: [...allowedBaseUrls]
    }
  );
}
function normalizeProviderBaseUrl(baseUrl) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed.length === 0) {
    throw createHostError2(
      "invalid_provider_base_url",
      "Provider baseUrl must be a non-empty string."
    );
  }
  return trimmed;
}
function validateOpenAiCompatibleProviderBaseUrl(baseUrl, provider, browserSecurity) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw createProviderBaseUrlError(
      provider,
      baseUrl,
      "invalid_url",
      "must be a valid absolute URL"
    );
  }
  if (url.protocol !== "https:") {
    throw createProviderBaseUrlError(
      provider,
      baseUrl,
      "insecure_protocol",
      "must use https"
    );
  }
  const hostname = url.hostname.toLowerCase();
  if (isLocalhostHostname2(hostname) && browserSecurity.allow_localhost !== true) {
    throw createProviderBaseUrlError(
      provider,
      baseUrl,
      "localhost_not_allowed",
      "targets localhost or loopback and browser_security.allow_localhost is false"
    );
  }
  if (isPrivateNetworkHostname2(hostname) && browserSecurity.allow_private_network !== true) {
    throw createProviderBaseUrlError(
      provider,
      baseUrl,
      "private_network_not_allowed",
      "targets a private or link-local network and browser_security.allow_private_network is false"
    );
  }
}
function createProviderBaseUrlError(provider, baseUrl, reason, detail) {
  return createHostError2(
    "invalid_provider_base_url",
    `Provider \`${provider.name}\` (${provider.providerKind}) uses a blocked baseUrl: ${baseUrl} (${detail})`,
    {
      providerKind: provider.providerKind,
      baseUrl,
      reason
    }
  );
}
function isLocalhostHostname2(hostname) {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1).toLowerCase() === "::1";
  }
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}
function isPrivateNetworkHostname2(hostname) {
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    return false;
  }
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    const normalized = hostname.slice(1, -1).toLowerCase();
    return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
  }
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    return false;
  }
  const octets = hostname.split(".").map(Number);
  const [first, second] = octets;
  if (octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) {
    return false;
  }
  return first === 10 || first === 192 && second === 168 || first === 172 && second >= 16 && second <= 31 || first === 169 && second === 254;
}
async function runResponsesApiTurn(params) {
  const modelEvents = [{ type: "started", requestId: params.requestId }];
  let eventChain = enqueueModelEvent(
    Promise.resolve(),
    params.emitModelEvent,
    modelEvents[0]
  );
  try {
    await runResponsesStreamingExecutor({
      requestId: params.requestId,
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
      requestBody: params.requestBody,
      extraHeaders: params.extraHeaders,
      onRegisterCancel(cancel) {
        activeModelCancels.set(params.requestId, cancel);
      },
      onUnregisterCancel() {
        activeModelCancels.delete(params.requestId);
      },
      onEvent(event) {
        const nextModelEvent = mapResponsesStreamEventToBrowserModelEvent(
          event,
          params.requestId
        );
        if (nextModelEvent !== null) {
          modelEvents.push(nextModelEvent);
          eventChain = enqueueModelEvent(
            eventChain,
            params.emitModelEvent,
            nextModelEvent
          );
        }
      },
      onCompleted() {
      },
      createError(code, message) {
        return createHostError2(code, message);
      },
      isAbortError
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw createHostError2("cancelled", "model turn cancelled");
    }
    throw error;
  }
  const completedEvent = { type: "completed", requestId: params.requestId };
  modelEvents.push(completedEvent);
  eventChain = enqueueModelEvent(eventChain, params.emitModelEvent, completedEvent);
  await eventChain;
  return params.emitModelEvent === void 0 ? modelEvents : [];
}
async function runXrouterTurn(params) {
  const runtime = await params.loadXrouterRuntime();
  const provider = getActiveProvider(params.codexConfig);
  const requestHeaders = resolveProviderRequestHeaders(provider, params.extraHeaders);
  const client = createXrouterBrowserClient({
    runtime,
    provider,
    apiKey: activeProviderApiKey(params.codexConfig)
  });
  const modelEvents = [{ type: "started", requestId: params.requestId }];
  let streamError = null;
  const streamState = createStreamingState(params.transportOptions);
  let eventChain = enqueueModelEvent(
    Promise.resolve(),
    params.emitModelEvent,
    modelEvents[0]
  );
  try {
    await runXrouterStreamingExecutor({
      requestId: params.requestId,
      requestBody: params.requestBody,
      extraHeaders: requestHeaders,
      client,
      onRegisterCancel(cancel) {
        activeModelCancels.set(params.requestId, cancel);
      },
      onUnregisterCancel() {
        activeModelCancels.delete(params.requestId);
      },
      onEvent(payload) {
        const nextModelEvents = mapXrouterEventToBrowserModelEvents(
          payload,
          params.requestId,
          streamState
        );
        modelEvents.push(...nextModelEvents);
        eventChain = enqueueModelEvents(
          eventChain,
          params.emitModelEvent,
          nextModelEvents
        );
      },
      onCompleted(payload) {
        const outputItems = Array.isArray(payload.output) ? payload.output : [];
        const normalizedOutputItems = outputItems.map(
          (item) => mapXrouterOutputItemToCodexResponseItem(item, streamState.assistantItemId)
        ).filter((item) => item !== null);
        for (const item of normalizedOutputItems) {
          modelEvents.push({ type: "outputItemDone", requestId: params.requestId, item });
        }
        if (!modelEvents.some((event) => isOutputItemDoneEvent(event, params.requestId))) {
          modelEvents.push({
            type: "outputItemDone",
            requestId: params.requestId,
            item: {
              type: "message",
              role: "assistant",
              content: [{ type: "output_text", text: "" }],
              end_turn: true
            }
          });
        }
        eventChain = enqueueModelEvents(
          eventChain,
          params.emitModelEvent,
          modelEvents.filter(
            (event) => event !== null && typeof event === "object" && !Array.isArray(event) && event.requestId === params.requestId && event.type === "outputItemDone"
          )
        );
        const completedEvent = {
          type: "completed",
          requestId: params.requestId
        };
        modelEvents.push(completedEvent);
        eventChain = enqueueModelEvent(eventChain, params.emitModelEvent, completedEvent);
      },
      onErrorEvent(message) {
        streamError = createHostError2("unavailable", message);
      },
      createError(code, message) {
        return createHostError2(code, message);
      },
      normalizeHostValue,
      isAbortError
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw createHostError2("cancelled", "model turn cancelled");
    }
    throw error;
  }
  if (streamError !== null) {
    throw streamError;
  }
  await eventChain;
  if (!modelEvents.some((event) => isCompletedEvent(event, params.requestId))) {
    const completedEvent = {
      type: "completed",
      requestId: params.requestId
    };
    modelEvents.push(completedEvent);
    await enqueueModelEvent(Promise.resolve(), params.emitModelEvent, completedEvent);
  }
  return params.emitModelEvent === void 0 ? modelEvents : [];
}
function resolveProviderRequestHeaders(provider, extraHeaders) {
  const providerHeaders = getProviderAttributionHeaders(provider);
  if (providerHeaders === null) {
    return extraHeaders;
  }
  if (extraHeaders === null) {
    return { ...providerHeaders };
  }
  return {
    ...providerHeaders,
    ...extraHeaders
  };
}
function getProviderAttributionHeaders(provider) {
  if (provider.providerKind === "xrouter_browser" && provider.metadata?.xrouterProvider === "openrouter" && normalizeProviderBaseUrl(provider.baseUrl) === OPENROUTER_API_BASE_URL) {
    return { ...OPENROUTER_APP_ATTRIBUTION_HEADERS };
  }
  return null;
}
function createStreamingState(transportOptions) {
  const options = transportOptions ?? {};
  const turnId = typeof options.turnId === "string" ? options.turnId : null;
  const assistantItemId = typeof options.assistantItemId === "string" ? options.assistantItemId : `${turnId ?? "turn"}:assistant`;
  return {
    assistantItemId,
    assistantModelStarted: false
  };
}
function mapResponsesStreamEventToBrowserModelEvent(event, requestId) {
  if (event.type === "response.output_item.added" && isJsonRecord(event.item)) {
    return {
      type: "outputItemAdded",
      requestId,
      item: event.item
    };
  }
  if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
    return {
      type: "delta",
      requestId,
      payload: { outputTextDelta: event.delta }
    };
  }
  if (event.type === "response.output_item.done" && isJsonRecord(event.item)) {
    return {
      type: "outputItemDone",
      requestId,
      item: event.item
    };
  }
  if (event.type === "response.reasoning_summary_text.delta" && typeof event.delta === "string") {
    return {
      type: "reasoningSummaryDelta",
      requestId,
      payload: {
        delta: event.delta,
        index: typeof event.summary_index === "number" ? event.summary_index : 0
      }
    };
  }
  if (event.type === "response.reasoning_text.delta" && typeof event.delta === "string") {
    return {
      type: "reasoningContentDelta",
      requestId,
      payload: {
        delta: event.delta,
        index: typeof event.content_index === "number" ? event.content_index : 0
      }
    };
  }
  if (event.type === "response.reasoning_summary_part.added") {
    return {
      type: "reasoningSummaryPartAdded",
      requestId,
      payload: {
        index: typeof event.summary_index === "number" ? event.summary_index : 0
      }
    };
  }
  return null;
}
function mapXrouterEventToBrowserModelEvents(payload, requestId, state) {
  if (payload.type === "output_text_delta" && typeof payload.delta === "string") {
    return [
      ...assistantStartedModelEvents(requestId, state),
      {
        type: "delta",
        requestId,
        payload: { outputTextDelta: payload.delta }
      }
    ];
  }
  return [];
}
function assistantStartedModelEvents(requestId, state) {
  if (state.assistantModelStarted) {
    return [];
  }
  state.assistantModelStarted = true;
  return [
    {
      type: "outputItemAdded",
      requestId,
      item: {
        id: state.assistantItemId,
        type: "message",
        role: "assistant",
        content: []
      }
    }
  ];
}
function isJsonRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isOutputItemDoneEvent(event, requestId) {
  return isJsonRecord(event) && event.requestId === requestId && event.type === "outputItemDone";
}
function isCompletedEvent(event, requestId) {
  return isJsonRecord(event) && event.requestId === requestId && event.type === "completed";
}
function enqueueModelEvent(chain, emitModelEvent, event) {
  return chain.then(async () => {
    await emitModelEvent?.(event);
  });
}
function enqueueModelEvents(chain, emitModelEvent, events2) {
  return events2.reduce(
    (nextChain, event) => enqueueModelEvent(nextChain, emitModelEvent, event),
    chain
  );
}

// codex-rs/wasm/ts/browser-runtime/src/layout.ts
var DEFAULT_BROWSER_CODEX_HOME = "/codex-home";
var DEFAULT_BROWSER_WORKSPACE_ROOT = DEFAULT_WORKSPACE_ROOT;
function normalizeBrowserUserCwd(_cwd) {
  return DEFAULT_BROWSER_WORKSPACE_ROOT;
}
function sanitizeStoredThreadSessionMetadata(metadata) {
  return {
    ...metadata,
    cwd: normalizeBrowserUserCwd(metadata.cwd)
  };
}
function sanitizeStoredThreadSession(session) {
  return {
    ...session,
    metadata: sanitizeStoredThreadSessionMetadata(session.metadata)
  };
}

// codex-rs/wasm/ts/browser-runtime/src/runtime-context-core.ts
async function createBrowserCodexRuntimeContextWithDeps(options, deps) {
  const transport = {
    loadRuntimeModule: options.transport?.loadRuntimeModule ?? deps.loadRuntimeModule,
    loadXrouterRuntime: options.transport?.loadXrouterRuntime ?? deps.loadXrouterRuntime
  };
  const storage = options.storage;
  const modelTransport = deps.createBrowserRuntimeModelTransportAdapter({
    loadXrouterRuntime: async () => await transport.loadXrouterRuntime()
  });
  const initialConfig = await storage.loadConfig().catch(() => structuredClone(deps.defaultConfig));
  const browserSecurity = normalizeBrowserSecurityConfig(initialConfig.browser_security);
  const authorizationContext = createBrowserToolAuthorizationContext({
    runtimeMode: initialConfig.runtime_mode ?? "agent",
    browserSecurityPolicy: {
      allowedOrigins: browserSecurity.allowed_origins,
      allowLocalhost: browserSecurity.allow_localhost,
      allowPrivateNetwork: browserSecurity.allow_private_network
    }
  });
  if (options.telemetry?.initializePageTelemetry !== false) {
    deps.initializePageTelemetry();
  }
  const host = deps.createBrowserRuntimeHostFromDeps({
    async loadBootstrap() {
      const [authState, config] = await Promise.all([
        storage.loadAuthState(),
        storage.loadConfig().catch(() => structuredClone(deps.defaultConfig))
      ]);
      const provider = deps.getActiveProvider(config);
      const apiKey = fallbackApiKey(authState) || deps.activeProviderApiKey(config);
      const runtimeMode = config.runtime_mode ?? "agent";
      return deps.buildBrowserRuntimeBootstrap({
        codexHome: options.codexHome ?? DEFAULT_BROWSER_CODEX_HOME,
        cwd: DEFAULT_BROWSER_WORKSPACE_ROOT,
        model: config.model.trim() || null,
        modelProviderId: config.modelProvider,
        modelProvider: {
          name: provider.name,
          baseUrl: provider.baseUrl,
          envKey: provider.envKey
        },
        reasoningEffort: config.modelReasoningEffort,
        personality: config.personality,
        baseInstructions: options.bootstrap?.baseInstructions ?? deps.defaultDemoInstructions.baseInstructions,
        developerInstructions: options.bootstrap?.developerInstructions ?? null,
        userInstructions: options.bootstrap?.userInstructions ?? null,
        capabilities: capabilitiesForRuntimeMode(runtimeMode),
        apiKey: apiKey || null,
        ephemeral: options.bootstrap?.ephemeral ?? false
      });
    },
    readFile: options.workspace.readFile,
    listDir: options.workspace.listDir,
    search: options.workspace.search,
    applyPatch: options.workspace.applyPatch,
    async loadUserConfig() {
      return await storage.loadUserConfig() ?? {
        filePath: `${options.codexHome ?? DEFAULT_BROWSER_CODEX_HOME}/config.toml`,
        version: "0",
        content: ""
      };
    },
    async saveUserConfig(request) {
      const record = asRecord5(request);
      if (typeof record.content !== "string") {
        throw new Error("saveUserConfig requires string content");
      }
      return await storage.saveUserConfig({
        filePath: typeof record.filePath === "string" ? record.filePath : null,
        expectedVersion: typeof record.expectedVersion === "string" ? record.expectedVersion : null,
        content: record.content
      });
    },
    async loadThreadSession(request) {
      const session = await storage.loadSession(request.threadId);
      if (session === null) {
        throw new Error(`thread session not found: ${request.threadId}`);
      }
      return { session: sanitizeStoredThreadSession(session) };
    },
    async saveThreadSession(request) {
      await storage.saveSession(sanitizeStoredThreadSession(request.session));
      return null;
    },
    async deleteThreadSession(request) {
      await storage.deleteSession(request.threadId);
      return null;
    },
    async listThreadSessions() {
      return {
        sessions: (await storage.listSessions()).map(sanitizeStoredThreadSessionMetadata)
      };
    },
    async listDiscoverableApps() {
      return [];
    },
    runNormalizedModelTurn: deps.createNormalizedModelTurnRunner({
      scope: "browser-runtime",
      loadConfig: async () => await storage.loadConfig().catch(() => structuredClone(deps.defaultConfig)),
      getProviderKind(config) {
        return deps.getActiveProvider(config).providerKind;
      },
      async runModelTurn(params) {
        return await modelTransport.runModelTurn(params);
      }
    })
  });
  const runtime = await deps.createBrowserCodexRuntime({
    runtimeModule: await transport.loadRuntimeModule(),
    host,
    deps: {
      persistence: {
        loadAuthState: async () => await storage.loadAuthState(),
        saveAuthState: async (authState) => await storage.saveAuthState(authState),
        clearAuthState: async () => await storage.clearAuthState(),
        loadConfig: async () => await storage.loadConfig().catch(() => structuredClone(deps.defaultConfig))
      },
      dynamicTools: options.dynamicTools === void 0 ? deps.createBrowserAwareToolExecutor({
        getAuthorizationContext: () => authorizationContext,
        applyPatch: async (input) => await options.workspace.applyPatch(input),
        requestApproval: options.requestBrowserToolApproval
      }) : wrapBrowserToolExecutorWithAuthorization(options.dynamicTools, {
        getAuthorizationContext: () => authorizationContext,
        requestApproval: options.requestBrowserToolApproval
      }),
      async readAccount({
        authState,
        config,
        refreshToken
      }) {
        if (options.readAccount !== void 0) {
          return await options.readAccount({
            authState,
            config,
            allowRefresh: refreshToken
          });
        }
        return defaultReadAccount({ authState, config }, deps);
      },
      async discoverModels({ config }) {
        return await modelTransport.discoverModels(config);
      },
      async refreshAuth() {
        throw new Error("Browser runtime context does not provide auth refresh.");
      },
      formatError: deps.formatError,
      requestBrowserToolApproval: options.requestBrowserToolApproval,
      async requestUserInput(request) {
        if (options.requestUserInput === void 0) {
          return { answers: [] };
        }
        const response = await options.requestUserInput(request);
        return {
          answers: response.answers.map((answer) => ({
            id: answer.id,
            value: normalizeJsonValue(answer.value)
          }))
        };
      },
      onTurnStart() {
        authorizationContext.clearTurnGrants();
      },
      logScope: "browser-runtime"
    }
  });
  return {
    runtime,
    loadConfig: async () => await storage.loadConfig().catch(() => structuredClone(deps.defaultConfig)),
    saveConfig: async (config) => await storage.saveConfig(config),
    subscribe(listener) {
      return runtime.subscribeToNotifications((notification) => {
        listener(toNotificationEnvelope(notification));
      });
    }
  };
}
function defaultReadAccount(input, deps) {
  const provider = deps.getActiveProvider(input.config);
  const apiKey = fallbackApiKey(input.authState) || deps.activeProviderApiKey(input.config);
  if (apiKey.length === 0) {
    return {
      account: null,
      requiresOpenaiAuth: provider.providerKind === "openai"
    };
  }
  return {
    account: {
      email: null,
      planType: input.authState?.chatgptPlanType ?? null,
      chatgptAccountId: input.authState?.chatgptAccountId ?? null,
      authMode: input.authState?.authMode ?? null
    },
    requiresOpenaiAuth: false
  };
}
function fallbackApiKey(authState) {
  if (authState?.authMode !== "apiKey") {
    return "";
  }
  return authState.openaiApiKey?.trim() ?? "";
}
function toNotificationEnvelope(notification) {
  const record = asRecord5(notification);
  return {
    method: typeof record.method === "string" ? record.method : "",
    params: record.params
  };
}
function normalizeJsonValue(value) {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonValue(item));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeJsonValue(entry)])
    );
  }
  return value === void 0 ? null : String(value);
}
function asRecord5(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}

// codex-rs/wasm/ts/browser-runtime/src/runtime-context.ts
async function createBrowserCodexRuntimeContext(options) {
  return await createBrowserCodexRuntimeContextWithDeps(options, {
    createBrowserCodexRuntime,
    buildBrowserRuntimeBootstrap,
    createBrowserRuntimeHostFromDeps,
    createNormalizedModelTurnRunner,
    createBrowserAwareToolExecutor,
    initializePageTelemetry,
    activeProviderApiKey,
    createBrowserRuntimeModelTransportAdapter,
    defaultConfig: DEFAULT_CODEX_CONFIG,
    defaultDemoInstructions: DEFAULT_DEMO_INSTRUCTIONS,
    formatError,
    getActiveProvider,
    loadRuntimeModule,
    loadXrouterRuntime
  });
}

// codex-rs/wasm/ts/browser-runtime/src/storage.ts
var DEFAULT_STORE_NAMES = {
  threadSessions: "threadSessions",
  authState: "authState",
  providerConfig: "providerConfig",
  userConfig: "userConfig"
};
var DEFAULT_KEYS = {
  authState: "current",
  providerConfig: "current",
  userConfig: "current"
};
function createIndexedDbCodexStorage(options) {
  const storeNames = {
    ...DEFAULT_STORE_NAMES,
    ...options.storeNames
  };
  const keys = {
    ...DEFAULT_KEYS,
    ...options.keys
  };
  async function openDb() {
    return await new Promise((resolve, reject) => {
      const request = indexedDB.open(options.dbName, options.dbVersion);
      request.onupgradeneeded = () => {
        const db = request.result;
        const legacySessionStoreName = options.legacySessionStoreName?.trim() ?? "";
        if (legacySessionStoreName.length > 0 && legacySessionStoreName !== storeNames.threadSessions && db.objectStoreNames.contains(legacySessionStoreName)) {
          db.deleteObjectStore(legacySessionStoreName);
        }
        for (const storeName of Object.values(storeNames)) {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName);
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error(`failed to open indexeddb ${options.dbName}`));
    });
  }
  async function loadSession(threadId) {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames.threadSessions, "readonly");
      const request = tx.objectStore(storeNames.threadSessions).get(threadId);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error ?? new Error("failed to load thread session"));
    });
  }
  async function saveSession(session) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames.threadSessions, "readwrite");
      const request = tx.objectStore(storeNames.threadSessions).put(session, options.getSessionId(session));
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("failed to save thread session"));
    });
  }
  async function deleteSession(threadId) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames.threadSessions, "readwrite");
      const request = tx.objectStore(storeNames.threadSessions).delete(threadId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("failed to delete thread session"));
    });
  }
  async function listSessions() {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames.threadSessions, "readonly");
      const request = tx.objectStore(storeNames.threadSessions).getAll();
      request.onsuccess = () => {
        const sessions = Array.isArray(request.result) ? request.result : [];
        resolve(sessions.map((session) => options.getSessionMetadata(session)));
      };
      request.onerror = () => reject(request.error ?? new Error("failed to list thread sessions"));
    });
  }
  async function loadAuthState() {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames.authState, "readonly");
      const request = tx.objectStore(storeNames.authState).get(keys.authState);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error ?? new Error("failed to load auth state"));
    });
  }
  async function saveAuthState(authState) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames.authState, "readwrite");
      const request = tx.objectStore(storeNames.authState).put(authState, keys.authState);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("failed to save auth state"));
    });
  }
  async function clearAuthState() {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames.authState, "readwrite");
      const request = tx.objectStore(storeNames.authState).delete(keys.authState);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("failed to clear auth state"));
    });
  }
  async function loadConfig() {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames.providerConfig, "readonly");
      const request = tx.objectStore(storeNames.providerConfig).get(keys.providerConfig);
      request.onsuccess = () => resolve(
        options.normalizeConfig(
          request.result ?? structuredClone(options.defaultConfig)
        )
      );
      request.onerror = () => reject(request.error ?? new Error("failed to load provider config"));
    });
  }
  async function saveConfig(config) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames.providerConfig, "readwrite");
      const request = tx.objectStore(storeNames.providerConfig).put(config, keys.providerConfig);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("failed to save provider config"));
    });
  }
  async function clearConfig() {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames.providerConfig, "readwrite");
      const request = tx.objectStore(storeNames.providerConfig).delete(keys.providerConfig);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("failed to clear provider config"));
    });
  }
  async function loadUserConfig() {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames.userConfig, "readonly");
      const request = tx.objectStore(storeNames.userConfig).get(keys.userConfig);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error ?? new Error("failed to load user config"));
    });
  }
  async function saveUserConfig(input) {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames.userConfig, "readwrite");
      const store = tx.objectStore(storeNames.userConfig);
      const readRequest = store.get(keys.userConfig);
      readRequest.onerror = () => reject(readRequest.error ?? new Error("failed to read current user config"));
      readRequest.onsuccess = () => {
        const current = readRequest.result ?? null;
        if (input.expectedVersion !== null && input.expectedVersion !== void 0 && current !== null && current.version !== input.expectedVersion) {
          reject(
            new Error(
              `user config version mismatch: expected ${input.expectedVersion}, got ${current.version}`
            )
          );
          return;
        }
        if (input.expectedVersion !== null && input.expectedVersion !== void 0 && current === null && input.expectedVersion !== "0") {
          reject(
            new Error(
              `user config version mismatch: expected ${input.expectedVersion}, got <missing>`
            )
          );
          return;
        }
        const nextVersion = current === null ? 1 : Number.parseInt(current.version, 10) + 1;
        const next = {
          filePath: input.filePath?.trim() || "/codex-home/config.toml",
          version: String(Number.isFinite(nextVersion) ? nextVersion : Date.now()),
          content: input.content
        };
        const writeRequest = store.put(next, keys.userConfig);
        writeRequest.onerror = () => reject(writeRequest.error ?? new Error("failed to save user config"));
        writeRequest.onsuccess = () => resolve(next);
      };
    });
  }
  return {
    loadSession,
    saveSession,
    deleteSession,
    listSessions,
    loadAuthState,
    saveAuthState,
    clearAuthState,
    loadConfig,
    saveConfig,
    clearConfig,
    loadUserConfig,
    saveUserConfig
  };
}
export {
  DEFAULT_BROWSER_CODEX_HOME,
  DEFAULT_BROWSER_SECURITY_CONFIG,
  DEFAULT_BROWSER_WORKSPACE_ROOT,
  DEFAULT_CODEX_CONFIG,
  DEFAULT_DEMO_INSTRUCTIONS,
  DEFAULT_WORKSPACE_ROOT,
  XROUTER_PROVIDER_OPTIONS,
  activeProviderApiKey,
  applyWorkspacePatch,
  createBrowserCodexRuntimeContext,
  createBrowserRuntimeModelTransportAdapter,
  createBrowserWorkspaceAdapter,
  createIndexedDbCodexStorage,
  createLocalStorageWorkspaceAdapter,
  detectTransportMode,
  formatError,
  getActiveProvider,
  listWorkspaceDir,
  loadBuildManifest,
  loadRuntimeModule,
  loadStoredWorkspaceSnapshot,
  loadXrouterRuntime,
  materializeCodexConfig,
  normalizeBrowserSecurityConfig,
  normalizeBrowserUserCwd,
  normalizeCodexConfig,
  normalizeWorkspaceDirectoryPath,
  normalizeWorkspaceFilePath,
  parentDirectory,
  readWorkspaceFile,
  sanitizeStoredThreadSession,
  sanitizeStoredThreadSessionMetadata,
  saveStoredWorkspaceSnapshot,
  searchWorkspace,
  toBrowserAssetUrl,
  toBrowserModuleUrl
};
//# sourceMappingURL=xcodex-runtime.js.map
