/* tslint:disable */
/* eslint-disable */

export interface BrowserBootstrap {
    codexHome: string;
    cwd?: string | null;
    model?: string | null;
    modelProviderId?: string | null;
    modelProvider?: unknown;
    serviceTier?: unknown;
    approvalPolicy?: unknown;
    sandboxPolicy?: unknown;
    reasoningEffort?: unknown;
    reasoningSummary?: unknown;
    personality?: unknown;
    baseInstructions?: string | null;
    developerInstructions?: string | null;
    userInstructions?: string | null;
    workspaceTools?: boolean;
    planningTools?: boolean;
    appTools?: boolean;
    apiKey?: string | null;
    modelCatalog?: unknown;
    ephemeral?: boolean;
}

export interface BrowserRuntimeHost {
    loadBootstrap(request: unknown): Promise<BrowserBootstrap>;
    readFile?(request: unknown): Promise<unknown>;
    listDir?(request: unknown): Promise<unknown>;
    search?(request: unknown): Promise<unknown>;
    applyPatch?(request: unknown): Promise<unknown>;
    loadUserConfig?(request: unknown): Promise<unknown>;
    saveUserConfig?(request: unknown): Promise<unknown>;
    loadThreadSession?(request: unknown): Promise<unknown>;
    saveThreadSession?(request: unknown): Promise<unknown>;
    deleteThreadSession?(request: unknown): Promise<unknown>;
    listThreadSessions?(request: unknown): Promise<unknown>;
    listDiscoverableApps?(request: unknown): Promise<unknown>;
    runModelTurn?(request: unknown, onEvent?: (event: unknown) => void): Promise<unknown>;
    emitNotification?(notification: unknown): Promise<void>;
    resolveMcpOauthRedirectUri?(request: unknown): Promise<unknown>;
    waitForMcpOauthCallback?(request: unknown): Promise<unknown>;
}



export class WasmBrowserRuntime {
    free(): void;
    [Symbol.dispose](): void;
    contractVersion(): string;
    enqueueNotification(notification: any): Promise<void>;
    constructor(host: any);
    nextMessage(): Promise<any>;
    runtimeInfo(): any;
    send(message: any): Promise<any>;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmbrowserruntime_free: (a: number, b: number) => void;
    readonly wasmbrowserruntime_contractVersion: (a: number, b: number) => void;
    readonly wasmbrowserruntime_enqueueNotification: (a: number, b: number) => number;
    readonly wasmbrowserruntime_new: (a: number, b: number) => void;
    readonly wasmbrowserruntime_nextMessage: (a: number) => number;
    readonly wasmbrowserruntime_runtimeInfo: (a: number, b: number) => void;
    readonly wasmbrowserruntime_send: (a: number, b: number) => number;
    readonly __wasm_bindgen_func_elem_5981: (a: number, b: number) => void;
    readonly __wasm_bindgen_func_elem_7474: (a: number, b: number) => void;
    readonly __wasm_bindgen_func_elem_1993: (a: number, b: number) => void;
    readonly __wasm_bindgen_func_elem_7475: (a: number, b: number, c: number, d: number) => void;
    readonly __wasm_bindgen_func_elem_7533: (a: number, b: number, c: number, d: number) => void;
    readonly __wasm_bindgen_func_elem_1994: (a: number, b: number, c: number) => void;
    readonly __wasm_bindgen_func_elem_5982: (a: number, b: number) => void;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export3: (a: number) => void;
    readonly __wbindgen_export4: (a: number, b: number, c: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
