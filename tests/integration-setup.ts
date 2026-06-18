// Global setup for *.integration.test.ts files.
// Mocks SvelteKit virtual modules so the real DB / libSQL code paths
// (which import $env/dynamic/private, $app/server, $app/environment)
// resolve under plain vitest without SvelteKit's transform pipeline.
import { vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({
	env: {
		DATABASE_URL:
			process.env["DATABASE_URL"] ??
			"mysql://devuser:paxxw0rd@2791@127.0.0.1:3306/devdb",
		LIBSQL_URL: process.env["LIBSQL_URL"] ?? "file:tests/.tmp/test.db",
		LIBSQL_AUTH_TOKEN: process.env["LIBSQL_AUTH_TOKEN"] ?? "",
		TOKEN_ENCRYPTION_KEY:
			process.env["TOKEN_ENCRYPTION_KEY"] ?? "test-encryption-key-32-chars-ok!",
		TINYFISH_API_KEY: process.env["TINYFISH_API_KEY"] ?? "test-key",
		DEEPSEEK_API_KEY: process.env["DEEPSEEK_API_KEY"] ?? "test-key",
	},
}));

vi.mock("$env/dynamic/public", () => ({
	env: {
		PUBLIC_STORAGE_PATH: process.env["PUBLIC_STORAGE_PATH"] ?? "/tmp/test-storage",
		PUBLIC_ALLOW_ANONYMOUS_CHATS:
			process.env["PUBLIC_ALLOW_ANONYMOUS_CHATS"] ?? "false",
	},
}));

vi.mock("$app/server", () => ({
	getRequestEvent: () => null,
}));

vi.mock("$app/environment", () => ({
	dev: true,
	browser: false,
}));