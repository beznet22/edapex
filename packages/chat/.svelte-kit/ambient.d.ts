
// this file is generated — do not edit it


/// <reference types="@sveltejs/kit" />

/**
 * This module provides access to environment variables that are injected _statically_ into your bundle at build time and are limited to _private_ access.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Static environment variables are [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env` at build time and then statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * **_Private_ access:**
 * 
 * - This module cannot be imported into client-side code
 * - This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured)
 * 
 * For example, given the following build time environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { ENVIRONMENT, PUBLIC_BASE_URL } from '$env/static/private';
 * 
 * console.log(ENVIRONMENT); // => "production"
 * console.log(PUBLIC_BASE_URL); // => throws error during build
 * ```
 * 
 * The above values will be the same _even if_ different values for `ENVIRONMENT` or `PUBLIC_BASE_URL` are set at runtime, as they are statically replaced in your code with their build time values.
 */
declare module '$env/static/private' {
	export const GJS_DEBUG_TOPICS: string;
	export const npm_package_devDependencies_vitest: string;
	export const PI_MCP_ADAPTER_KEYRING_RECOVERY_HELPER: string;
	export const USER: string;
	export const GIT_TRACE_REFS: string;
	export const npm_config_user_agent: string;
	export const HC_TERMINAL_ID: string;
	export const PI_SKIP_VERSION_CHECK: string;
	export const PI_MCP_ADAPTER_KEYRING_RECOVERY_NODE: string;
	export const XDG_SESSION_TYPE: string;
	export const PI_TELEMETRY: string;
	export const BUN_INSTALL: string;
	export const npm_node_execpath: string;
	export const CLUTTER_DISABLE_MIPMAPPED_TEXT: string;
	export const SHLVL: string;
	export const LESS: string;
	export const HOME: string;
	export const OLDPWD: string;
	export const DESKTOP_SESSION: string;
	export const HC_TERMINAL_SOCKET: string;
	export const LSCOLORS: string;
	export const ZSH: string;
	export const GIO_LAUNCHED_DESKTOP_FILE: string;
	export const HC_SCOPE: string;
	export const GNOME_SHELL_SESSION_MODE: string;
	export const GTK_MODULES: string;
	export const PAGER: string;
	export const GSM_SKIP_SSH_AGENT_WORKAROUND: string;
	export const DBUS_SESSION_BUS_ADDRESS: string;
	export const npm_config_engine_strict: string;
	export const COLORTERM: string;
	export const GIO_LAUNCHED_DESKTOP_FILE_PID: string;
	export const npm_package_devDependencies_typescript: string;
	export const KIMCHI_OAUTH_TEMPLATE_DIR: string;
	export const PI_CODING_AGENT_DIR: string;
	export const WAYLAND_DISPLAY: string;
	export const LOGNAME: string;
	export const npm_package_type: string;
	export const _: string;
	export const npm_package_private: string;
	export const GIT_TRACE2_EVENT: string;
	export const XDG_SESSION_CLASS: string;
	export const npm_config_registry: string;
	export const USERNAME: string;
	export const TERM: string;
	export const GNOME_DESKTOP_SESSION_ID: string;
	export const PATH: string;
	export const SESSION_MANAGER: string;
	export const npm_package_name: string;
	export const NODE: string;
	export const XDG_MENU_PREFIX: string;
	export const GNOME_SETUP_DISPLAY: string;
	export const XDG_RUNTIME_DIR: string;
	export const npm_package_dependencies__edapex_contracts: string;
	export const npm_config_frozen_lockfile: string;
	export const KIMCHI_CODING_AGENT_DIR: string;
	export const DISPLAY: string;
	export const LANG: string;
	export const XDG_CURRENT_DESKTOP: string;
	export const XMODIFIERS: string;
	export const XDG_SESSION_DESKTOP: string;
	export const XAUTHORITY: string;
	export const LS_COLORS: string;
	export const TERM_PROGRAM: string;
	export const npm_lifecycle_script: string;
	export const SSH_AUTH_SOCK: string;
	export const npm_package_scripts_test: string;
	export const SHELL: string;
	export const npm_package_version: string;
	export const npm_lifecycle_event: string;
	export const NODE_PATH: string;
	export const QT_ACCESSIBILITY: string;
	export const NDK_HOME: string;
	export const GDMSESSION: string;
	export const GJS_DEBUG_OUTPUT: string;
	export const KIMCHI_QUICKJS_WASM_PATH: string;
	export const npm_package_scripts_typecheck: string;
	export const QT_IM_MODULE: string;
	export const KIMCHI_DISABLE_BUILTIN_PROVIDERS: string;
	export const JAVA_HOME: string;
	export const PWD: string;
	export const npm_execpath: string;
	export const ANDROID_HOME: string;
	export const XDG_DATA_DIRS: string;
	export const npm_config_recursive: string;
	export const npm_command: string;
	export const PNPM_SCRIPT_SRC_DIR: string;
	export const KIMCHI_MANAGES_MCP_PROJECT_TRUST: string;
	export const PI_PACKAGE_DIR: string;
	export const PNPM_HOME: string;
	export const npm_package_exports__: string;
	export const INIT_CWD: string;
	export const TEST: string;
	export const VITEST: string;
	export const NODE_ENV: string;
	export const PROD: string;
	export const DEV: string;
	export const BASE_URL: string;
	export const MODE: string;
}

/**
 * This module provides access to environment variables that are injected _statically_ into your bundle at build time and are _publicly_ accessible.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Static environment variables are [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env` at build time and then statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * **_Public_ access:**
 * 
 * - This module _can_ be imported into client-side code
 * - **Only** variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`) are included
 * 
 * For example, given the following build time environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { ENVIRONMENT, PUBLIC_BASE_URL } from '$env/static/public';
 * 
 * console.log(ENVIRONMENT); // => throws error during build
 * console.log(PUBLIC_BASE_URL); // => "http://site.com"
 * ```
 * 
 * The above values will be the same _even if_ different values for `ENVIRONMENT` or `PUBLIC_BASE_URL` are set at runtime, as they are statically replaced in your code with their build time values.
 */
declare module '$env/static/public' {
	
}

/**
 * This module provides access to environment variables set _dynamically_ at runtime and that are limited to _private_ access.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Dynamic environment variables are defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`.
 * 
 * **_Private_ access:**
 * 
 * - This module cannot be imported into client-side code
 * - This module includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured)
 * 
 * > [!NOTE] In `dev`, `$env/dynamic` includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 * 
 * > [!NOTE] To get correct types, environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * >
 * > ```env
 * > MY_FEATURE_FLAG=
 * > ```
 * >
 * > You can override `.env` values from the command line like so:
 * >
 * > ```sh
 * > MY_FEATURE_FLAG="enabled" npm run dev
 * > ```
 * 
 * For example, given the following runtime environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { env } from '$env/dynamic/private';
 * 
 * console.log(env.ENVIRONMENT); // => "production"
 * console.log(env.PUBLIC_BASE_URL); // => undefined
 * ```
 */
declare module '$env/dynamic/private' {
	export const env: {
		GJS_DEBUG_TOPICS: string;
		npm_package_devDependencies_vitest: string;
		PI_MCP_ADAPTER_KEYRING_RECOVERY_HELPER: string;
		USER: string;
		GIT_TRACE_REFS: string;
		npm_config_user_agent: string;
		HC_TERMINAL_ID: string;
		PI_SKIP_VERSION_CHECK: string;
		PI_MCP_ADAPTER_KEYRING_RECOVERY_NODE: string;
		XDG_SESSION_TYPE: string;
		PI_TELEMETRY: string;
		BUN_INSTALL: string;
		npm_node_execpath: string;
		CLUTTER_DISABLE_MIPMAPPED_TEXT: string;
		SHLVL: string;
		LESS: string;
		HOME: string;
		OLDPWD: string;
		DESKTOP_SESSION: string;
		HC_TERMINAL_SOCKET: string;
		LSCOLORS: string;
		ZSH: string;
		GIO_LAUNCHED_DESKTOP_FILE: string;
		HC_SCOPE: string;
		GNOME_SHELL_SESSION_MODE: string;
		GTK_MODULES: string;
		PAGER: string;
		GSM_SKIP_SSH_AGENT_WORKAROUND: string;
		DBUS_SESSION_BUS_ADDRESS: string;
		npm_config_engine_strict: string;
		COLORTERM: string;
		GIO_LAUNCHED_DESKTOP_FILE_PID: string;
		npm_package_devDependencies_typescript: string;
		KIMCHI_OAUTH_TEMPLATE_DIR: string;
		PI_CODING_AGENT_DIR: string;
		WAYLAND_DISPLAY: string;
		LOGNAME: string;
		npm_package_type: string;
		_: string;
		npm_package_private: string;
		GIT_TRACE2_EVENT: string;
		XDG_SESSION_CLASS: string;
		npm_config_registry: string;
		USERNAME: string;
		TERM: string;
		GNOME_DESKTOP_SESSION_ID: string;
		PATH: string;
		SESSION_MANAGER: string;
		npm_package_name: string;
		NODE: string;
		XDG_MENU_PREFIX: string;
		GNOME_SETUP_DISPLAY: string;
		XDG_RUNTIME_DIR: string;
		npm_package_dependencies__edapex_contracts: string;
		npm_config_frozen_lockfile: string;
		KIMCHI_CODING_AGENT_DIR: string;
		DISPLAY: string;
		LANG: string;
		XDG_CURRENT_DESKTOP: string;
		XMODIFIERS: string;
		XDG_SESSION_DESKTOP: string;
		XAUTHORITY: string;
		LS_COLORS: string;
		TERM_PROGRAM: string;
		npm_lifecycle_script: string;
		SSH_AUTH_SOCK: string;
		npm_package_scripts_test: string;
		SHELL: string;
		npm_package_version: string;
		npm_lifecycle_event: string;
		NODE_PATH: string;
		QT_ACCESSIBILITY: string;
		NDK_HOME: string;
		GDMSESSION: string;
		GJS_DEBUG_OUTPUT: string;
		KIMCHI_QUICKJS_WASM_PATH: string;
		npm_package_scripts_typecheck: string;
		QT_IM_MODULE: string;
		KIMCHI_DISABLE_BUILTIN_PROVIDERS: string;
		JAVA_HOME: string;
		PWD: string;
		npm_execpath: string;
		ANDROID_HOME: string;
		XDG_DATA_DIRS: string;
		npm_config_recursive: string;
		npm_command: string;
		PNPM_SCRIPT_SRC_DIR: string;
		KIMCHI_MANAGES_MCP_PROJECT_TRUST: string;
		PI_PACKAGE_DIR: string;
		PNPM_HOME: string;
		npm_package_exports__: string;
		INIT_CWD: string;
		TEST: string;
		VITEST: string;
		NODE_ENV: string;
		PROD: string;
		DEV: string;
		BASE_URL: string;
		MODE: string;
		[key: `PUBLIC_${string}`]: undefined;
		[key: `${string}`]: string | undefined;
	}
}

/**
 * This module provides access to environment variables set _dynamically_ at runtime and that are _publicly_ accessible.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Dynamic environment variables are defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`.
 * 
 * **_Public_ access:**
 * 
 * - This module _can_ be imported into client-side code
 * - **Only** variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`) are included
 * 
 * > [!NOTE] In `dev`, `$env/dynamic` includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 * 
 * > [!NOTE] To get correct types, environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * >
 * > ```env
 * > MY_FEATURE_FLAG=
 * > ```
 * >
 * > You can override `.env` values from the command line like so:
 * >
 * > ```sh
 * > MY_FEATURE_FLAG="enabled" npm run dev
 * > ```
 * 
 * For example, given the following runtime environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://example.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { env } from '$env/dynamic/public';
 * console.log(env.ENVIRONMENT); // => undefined, not public
 * console.log(env.PUBLIC_BASE_URL); // => "http://example.com"
 * ```
 * 
 * ```
 * 
 * ```
 */
declare module '$env/dynamic/public' {
	export const env: {
		[key: `PUBLIC_${string}`]: string | undefined;
	}
}
