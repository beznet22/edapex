/**
 * Governed MCP client.
 *
 * A connector is **server-side reach**, not browser control. This package is
 * imported only by `services/cowork-api`; the boundary test in `apps/web` fails
 * the build if it ever appears in an app bundle.
 *
 * Two rules the shape of this module enforces:
 *
 * 1. The Worker is an MCP *client*. It dials a configured server. It never spawns
 *    a process and never accepts a server named by model output at runtime.
 * 2. A tool is a `write` unless it is positively classified as a read. Everything
 *    here defaults to the safe direction.
 */

import { classifyAccess, type ConnectorAccess, type ConnectorToolView } from "@edapex/contracts";

/** Allowlisted hosts. A model cannot introduce a new one at runtime. */
export interface McpServerConfig {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  /** Tools to expose; anything absent is not callable even if the server offers it. */
  readonly allowTools: readonly string[];
  /** Tools known to be reads. Everything else is treated as a write. */
  readonly readTools: readonly string[];
}

export interface McpCallResult {
  readonly ok: boolean;
  readonly value?: unknown;
  readonly error?: string;
  readonly bytes?: number;
}

export interface FetchLike {
  (input: string, init?: RequestInit): Promise<Response>;
}

/**
 * Validates a configured URL.
 *
 * HTTPS only, and no private or link-local hosts: an MCP server is dialled from
 * inside the Worker, so a misconfigured URL is a server-side request forgery
 * primitive pointed at the Cloudflare network.
 */
export function validateServerUrl(raw: string): { ok: true; url: string } | { ok: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: "not a URL" };
  }

  if (parsed.protocol !== "https:") return { ok: false, reason: "https required" };
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    return { ok: false, reason: "credentials in the URL are not allowed" };
  }

  // `URL` keeps the brackets on an IPv6 literal, so `[::1]` is what arrives
  // rather than `::1`. Stripping them also covers the unspecified and
  // unique-local forms, which are just as reachable from inside the Worker.
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const blocked =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "::" ||
    host.startsWith("fe80:") ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    host === "169.254.169.254";

  if (blocked) return { ok: false, reason: "private or link-local host" };
  return { ok: true, url: parsed.toString() };
}

/** A tool is a read only when the config says so. Absence means write. */
export function accessFor(server: McpServerConfig, toolName: string): ConnectorAccess {
  return classifyAccess(toolName, server.readTools.includes(toolName) ? "read" : "write");
}

/**
 * Filters the server's advertised tools to the allowlist.
 *
 * The catalogue a server returns is untrusted input: a compromised server could
 * advertise `delete_everything` and hope the client surfaces it. Only configured
 * tools become callable, and only they appear in a UI.
 */
export function toConnectorTools(
  server: McpServerConfig,
  advertised: readonly { name: string; description?: string; inputSchema?: Record<string, unknown> }[]
): ConnectorToolView[] {
  return advertised
    .filter((tool) => server.allowTools.includes(tool.name))
    .map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      access: accessFor(server, tool.name),
      inputSchema: tool.inputSchema ?? { type: "object", properties: {} }
    }));
}

/**
 * Calls one tool over JSON-RPC.
 *
 * The response is returned as **data**. It is never interpreted as instructions:
 * a tool result is untrusted content, the same framing web pages get.
 */
export async function callTool(
  fetchImpl: FetchLike,
  server: McpServerConfig,
  input: { readonly toolName: string; readonly arguments: Record<string, unknown> }
): Promise<McpCallResult> {
  if (!server.allowTools.includes(input.toolName)) {
    return { ok: false, error: `Tool ${input.toolName} is not allowed for this connector.` };
  }

  const validated = validateServerUrl(server.url);
  if (!validated.ok) return { ok: false, error: `Connector URL rejected: ${validated.reason}` };

  let response: Response;
  try {
    response = await fetchImpl(validated.url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method: "tools/call",
        params: { name: input.toolName, arguments: input.arguments }
      })
    });
  } catch {
    return { ok: false, error: "The connector could not be reached." };
  }

  if (!response.ok) {
    return { ok: false, error: `The connector returned ${response.status}.` };
  }

  const body = (await response.json()) as {
    result?: unknown;
    error?: { message?: string };
  };

  if (body.error !== undefined) {
    return { ok: false, error: body.error.message ?? "The connector rejected the call." };
  }

  const serialised = JSON.stringify(body.result ?? null);
  return { ok: true, value: body.result, bytes: serialised.length };
}

/** The catalogue, for display. Never includes a credential. */
export function catalogue(servers: readonly McpServerConfig[]): {
  id: string;
  name: string;
  tools: string[];
}[] {
  return servers.map((server) => ({
    id: server.id,
    name: server.name,
    tools: [...server.allowTools]
  }));
}
