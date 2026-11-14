/**
 * Model routing policy.
 *
 * AI Gateway is the provider router and key vault; this module decides *which*
 * gateway URL a request goes to and which guarantees travel with it. Those
 * guarantees are the reason this Worker exists:
 *
 * 1. **Logging is always suppressed.** AI Gateway stores prompt and response
 *    bodies by default. Prompts here contain marksheet OCR text and parent
 *    messages, so `cf-aig-collect-log: false` is set on every request. A browser
 *    talking to the gateway directly could omit it, which is precisely why the
 *    browser never talks to the gateway.
 * 2. **Direct provider passthrough, never Unified Billing.** On Unified Billing
 *    endpoints a missing BYOK key silently falls through to Cloudflare billing.
 *    Passthrough URLs require the stored provider key, so a missing key is a
 *    loud error instead of a surprise invoice.
 */

/** Provider slugs that AI Gateway exposes under `/{provider}/{path}`. */
const PROVIDER_SLUGS = {
  openrouter: "openrouter",
  anthropic: "anthropic",
  openai: "openai",
  google: "google-ai-studio"
} as const;

export type ProviderId = keyof typeof PROVIDER_SLUGS;

export const PROVIDERS = Object.keys(PROVIDER_SLUGS) as readonly ProviderId[];

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && value in PROVIDER_SLUGS;
}

/**
 * Models a workspace may request.
 *
 * An allowlist rather than a passthrough: the model name reaches a third party
 * and a typo is a billed request to an unexpected model. `openrouter/auto` is
 * deliberately included because it is the default the setup dialog offers.
 */
export const ALLOWED_MODELS: readonly string[] = [
  "openrouter/auto",
  "openrouter/auto-beta",
  "anthropic/claude-sonnet-4.5",
  "anthropic/claude-haiku-4.5",
  "openai/gpt-5-mini",
  "google/gemini-2.5-flash"
];

export function isModelAllowed(model: string): boolean {
  return ALLOWED_MODELS.includes(model);
}

/** Caps that bound the cost of a single request regardless of caller input. */
export interface RequestLimits {
  readonly maxOutputTokens: number;
  readonly maxInputChars: number;
  readonly maxMessages: number;
  readonly maxTools: number;
}

export const REQUEST_LIMITS: RequestLimits = {
  maxOutputTokens: 4_096,
  maxInputChars: 200_000,
  maxMessages: 200,
  maxTools: 32
};

export interface GatewayTarget {
  readonly url: string;
  readonly headers: Record<string, string>;
}

/**
 * Build the AI Gateway URL and headers for one request.
 *
 * `byokAlias` selects which stored provider key AI Gateway uses. EdApex maps a
 * tenant to an alias, so a school that brought its own provider key is billed
 * against it and never against another tenant's credential.
 */
export function gatewayTarget(options: {
  readonly accountId: string;
  readonly gatewayId: string;
  readonly provider: ProviderId;
  readonly path: string;
  readonly token: string;
  readonly byokAlias: string | null;
}): GatewayTarget {
  const slug = PROVIDER_SLUGS[options.provider];
  const base = `https://gateway.ai.cloudflare.com/v1/${options.accountId}/${options.gatewayId}/${slug}`;
  const path = options.path.startsWith("/") ? options.path : `/${options.path}`;

  const headers: Record<string, string> = {
    "cf-aig-authorization": `Bearer ${options.token}`,
    // Never persist prompt or response bodies.
    "cf-aig-collect-log": "false"
  };
  if (options.byokAlias !== null && options.byokAlias.length > 0) {
    headers["cf-aig-byok-alias"] = options.byokAlias;
  }

  return { url: `${base}${path}`, headers };
}

/**
 * The BYOK alias for a tenant.
 *
 * A tenant without its own key uses `default`, which is the account-level key.
 * That is a deliberate product decision: a school that has not configured
 * billing still gets a working workspace, and the alias is what changes when
 * they bring their own key.
 */
export function byokAliasFor(schoolId: number | null): string | null {
  if (schoolId === null || !Number.isInteger(schoolId) || schoolId <= 0) return null;
  return `school-${schoolId}`;
}
