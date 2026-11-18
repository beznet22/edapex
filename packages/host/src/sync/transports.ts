import type { RelayRequest, RelayResponse, RelayTransport } from "./relay-client";

/**
 * The two ways a host reaches the relay.
 *
 * Both factories take the platform primitive as an argument rather than importing
 * it, so this module stays host-agnostic: the web passes `fetch`, the native
 * hosts pass the Tauri `invoke` wrapper, and neither credential ever enters
 * `@edapex/host`.
 */

/** The subset of `fetch` this transport needs. */
export interface FetchLikeResponse {
  readonly status: number;
  json(): Promise<unknown>;
}

export interface FetchLikeInit {
  readonly method: string;
  /** Cookie-authenticated on the web; the WebView never holds a bearer token. */
  readonly credentials: "include";
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
}

export type FetchLike = (url: string, init: FetchLikeInit) => Promise<FetchLikeResponse>;

async function decodeJson(response: FetchLikeResponse): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    // A 204 or a proxy error page has no JSON body; the status still carries the
    // outcome, and the client turns a bodyless rejection into a typed error.
    return null;
  }
}

export function createFetchTransport(fetchImpl: FetchLike, baseUrl = ""): RelayTransport {
  return async (request: RelayRequest): Promise<RelayResponse> => {
    const response = await fetchImpl(`${baseUrl}${request.path}`, {
      method: request.method,
      credentials: "include",
      ...(request.body === undefined
        ? {}
        : {
            headers: { "content-type": "application/json" },
            body: JSON.stringify(request.body)
          })
    });
    return { status: response.status, body: await decodeJson(response) };
  };
}

/** `invoke` as the native host exposes it; the command is fixed by this transport. */
export type InvokeLike = (command: "relay_request", args: Record<string, unknown>) => Promise<unknown>;

function isStatusBody(value: unknown): value is { status: number; body: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    typeof value.status === "number" &&
    "body" in value
  );
}

/**
 * The native transport.
 *
 * `relay_request` returns `{ status, body }` rather than mapping a rejection to a
 * `HostError`, because 409 and 410 are protocol answers the client branches on.
 * The command is scoped to `/api/v1/agent/sessions/` on the Rust side.
 */
export function createInvokeTransport(invoke: InvokeLike): RelayTransport {
  return async (request: RelayRequest): Promise<RelayResponse> => {
    const reply = await invoke("relay_request", {
      method: request.method,
      path: request.path,
      ...(request.body === undefined ? {} : { body: request.body })
    });
    if (!isStatusBody(reply)) {
      throw new Error("relay_request returned an unexpected shape");
    }
    return { status: reply.status, body: reply.body };
  };
}
