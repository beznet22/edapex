/**
 * Tenant package contracts.
 *
 * A tenant package controls brand, bots, channels, the allowed model set and the
 * skills offered. The rule that shapes the schema: **a non-school package must load
 * without code changes**. That is why nothing here names a school, an academic year
 * or a class — the school pack is one instance of this schema, not a special case in
 * the loader.
 *
 * The other rule: a package is a **ceiling**, not a grant. It says what may exist for
 * the tenant. An agent's grant is a selection inside it, validated by
 * `packages/contracts/src/agents.ts`.
 */

import { z } from "zod";

import { AGENT_KINDS } from "./agents";

/** A brand is tokens, not markup: the UI owns presentation. */
export const brandSchema = z.object({
  name: z.string().min(1),
  accent: z.enum(["gold", "jade", "indigo"]),
  /** Optional wordmark text; the icon stays a product constant. */
  wordmark: z.string().min(1).optional(),
  /** Shown on the surface so a tenant can see which pack is active. */
  tagline: z.string().min(1).optional()
});

export const botSchema = z.object({
  /** Stable key; used for the seed row and never shown to a person. */
  key: z.string().regex(/^[a-z0-9_-]+$/, "lowercase, digits, dash or underscore"),
  name: z.string().min(1),
  purpose: z.string().min(1),
  kind: z.enum(AGENT_KINDS).default("local"),
  /** Operations this bot ships with. Re-validated against the pack on every load. */
  operations: z.array(z.string().min(1)).min(1),
  /** Presentation only; the server decides what is actually offered. */
  channel: z.string().min(1).optional()
});

export const channelSchema = z.object({
  key: z.string().regex(/^[a-z0-9_-]+$/),
  name: z.string().min(1),
  /** Which surfaces the channel appears on. */
  surfaces: z.array(z.enum(["chat", "tasks", "make"])).min(1)
});

export const modelSchema = z.object({
  /** An allowlist, never a wildcard: a model name reaches a third party. */
  allowed: z.array(z.string().min(1)).min(1),
  default: z.string().min(1),
  /** Per-tenant output cap, enforced by `model-router`. */
  maxOutputTokens: z.number().int().positive().max(32_000).default(4_096)
});

export const skillSchema = z.object({
  key: z.string().regex(/^[a-z0-9_-]+$/),
  name: z.string().min(1),
  /** Invoked as `/key` in the composer. */
  description: z.string().min(1),
  operations: z.array(z.string().min(1)).default([])
});

export const tenantPackageSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  version: z.string().min(1),
  /**
   * `school` enables the first-party school pack. `generic` enables nothing, which
   * is the tier-1 case: the workspace still boots and connectors still work.
   */
  template: z.enum(["school", "generic"]),
  brand: brandSchema,
  bots: z.array(botSchema).default([]),
  channels: z.array(channelSchema).default([]),
  model: modelSchema,
  skills: z.array(skillSchema).default([])
});

export type TenantPackage = z.infer<typeof tenantPackageSchema>;
export type PackageBot = z.infer<typeof botSchema>;

export interface PackageIssue {
  readonly path: string;
  readonly message: string;
}

/**
 * Validates a package and reports every problem rather than the first.
 *
 * A loader that stops at the first error makes fixing a package a sequence of
 * round trips; a person editing YAML needs the whole list.
 */
export function validatePackage(input: unknown): {
  readonly ok: boolean;
  readonly package?: TenantPackage;
  readonly issues: readonly PackageIssue[];
} {
  const parsed = tenantPackageSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    };
  }

  const value = parsed.data;
  const issues: PackageIssue[] = [];

  // The default model must be in the allowlist, or every turn fails at the router
  // with a message that points nowhere near the package.
  if (!value.model.allowed.includes(value.model.default)) {
    issues.push({
      path: "model.default",
      message: `default model "${value.model.default}" is not in the allowlist`
    });
  }

  const botKeys = new Set<string>();
  for (const [index, bot] of value.bots.entries()) {
    if (botKeys.has(bot.key)) {
      issues.push({ path: `bots.${index}.key`, message: `duplicate key "${bot.key}"` });
    }
    botKeys.add(bot.key);
  }

  const channelKeys = new Set<string>();
  for (const [index, channel] of value.channels.entries()) {
    if (channelKeys.has(channel.key)) {
      issues.push({
        path: `channels.${index}.key`,
        message: `duplicate key "${channel.key}"`
      });
    }
    channelKeys.add(channel.key);
  }

  for (const [index, bot] of value.bots.entries()) {
    if (bot.channel !== undefined && !channelKeys.has(bot.channel)) {
      issues.push({
        path: `bots.${index}.channel`,
        message: `references unknown channel "${bot.channel}"`
      });
    }
  }

  if (issues.length > 0) return { ok: false, package: value, issues };
  return { ok: true, package: value, issues: [] };
}

/**
 * The features a package enables.
 *
 * `generic` returns an empty list, which every consumer treats as "no first-party
 * pack". That is the whole tier-1 requirement in one line: no school scope, no
 * `academicId`, and the workspace still resolves.
 */
export function packageFeatures(value: TenantPackage): readonly string[] {
  if (value.template === "generic") return [];
  return ["people", "academics", "assessment", "attendance"];
}
