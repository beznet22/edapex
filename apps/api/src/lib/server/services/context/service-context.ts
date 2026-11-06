import * as academics from "../../repository/academics";
import * as accounts from "../../repository/accounts";
import * as assessments from "../../repository/assessments";
import * as attendance from "../../repository/attendance";
import * as communications from "../../repository/communications";
import * as fees from "../../repository/fees";
import * as profiles from "../../repository/profiles";
import * as queries from "../../repository/queries";
import * as reference from "../../repository/reference";
import * as school from "../../repository/school";
import type {
  ConfigCache,
  RepositoryContext,
  ScopedRepositoryContext,
  TenantContext,
  UnscopedRepositoryContext
} from "../../repository/base/repository-context";
import { TenantScopeError } from "../errors";
import type { ServicePorts } from "../ports";
import type { Logger } from "./logger";

/** The environment keys the service layer consumes; the rest stays in HTTP. */
export interface ServiceEnv {
  readonly DB: D1Database;
  readonly MEDIA?: R2Bucket;
  readonly EMAIL?: unknown;
  readonly EMAIL_FROM?: string;
  readonly GMAIL_CLIENT_ID?: string;
  readonly GMAIL_CLIENT_SECRET?: string;
  readonly GMAIL_REFRESH_TOKEN?: string;
  readonly GMAIL_SENDER_EMAIL?: string;
  readonly GMAIL_SENDER_NAME?: string;
  readonly MISTRAL_API_KEY?: string;
  readonly MISTRAL_OCR_MODEL?: string;
  readonly MISTRAL_API_BASE_URL?: string;
}

/**
 * Aggregate namespaces plus the bound repository context. Services import no
 * repository module directly; they receive this handle from the context.
 */
export interface RepositoryAccess {
  readonly ctx: RepositoryContext;
  readonly accounts: typeof accounts;
  readonly profiles: typeof profiles;
  readonly school: typeof school;
  readonly assessments: typeof assessments;
  readonly attendance: typeof attendance;
  readonly academics: typeof academics;
  readonly communications: typeof communications;
  readonly reference: typeof reference;
  readonly queries: typeof queries;
  readonly fees: typeof fees;
}

export function createRepositoryAccess(ctx: RepositoryContext): RepositoryAccess {
  return Object.freeze({
    ctx,
    accounts,
    profiles,
    school,
    assessments,
    attendance,
    academics,
    communications,
    reference,
    queries,
    fees
  });
}

/** Request-scoped cache; an instance field, never module state. */
export class ServiceCache {
  private readonly entries = new Map<string, unknown>();

  has(key: string): boolean {
    return this.entries.has(key);
  }

  get(key: string): unknown {
    return this.entries.get(key);
  }

  set(key: string, value: unknown): void {
    this.entries.set(key, value);
  }

  async getOrLoad(key: string, loader: () => Promise<unknown>): Promise<unknown> {
    if (this.entries.has(key)) return this.entries.get(key);
    const value = await loader();
    this.entries.set(key, value);
    return value;
  }
}

export interface ServiceContext {
  readonly repos: RepositoryAccess;
  readonly ports: ServicePorts;
  readonly config: ConfigCache;
  readonly cache: ServiceCache;
  readonly logger: Logger;
  readonly tenant: TenantContext | null;
}

export function requireScopedContext(ctx: RepositoryContext): ScopedRepositoryContext {
  if (ctx.tenant === null) {
    throw new TenantScopeError();
  }
  return ctx;
}

export function requireUnscopedContext(ctx: RepositoryContext): UnscopedRepositoryContext {
  if (ctx.tenant !== null) {
    throw new TenantScopeError("This operation requires a pre-tenant context");
  }
  return ctx;
}
