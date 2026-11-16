/**
 * Proactive-work contracts: briefs, greetings, chips, checklist.
 *
 * The dedupe shape here is the important one. A single "has this been done" flag
 * is not enough: if the device that claimed a brief crashes, a plain flag leaves
 * the day permanently claimed and **no device can ever produce that brief**. Claim
 * and completion are separate facts, and only completion is permanent.
 */

/** One brief per person per calendar day, in their own timezone. */
export interface BriefIdentity {
  readonly workspaceId: string;
  readonly userId: string;
  /** `YYYY-MM-DD` in the person's local time. */
  readonly localDate: string;
}

export function briefKey(identity: BriefIdentity): string {
  return `brief:${identity.workspaceId}:${identity.userId}:${identity.localDate}`;
}

/**
 * A claim row. Mirrors `brief_claims` in the server schema.
 *
 * `completedAt` is the only permanent field. The lease exists so a crash does not
 * lose the day.
 */
export interface BriefClaim {
  readonly key: string;
  readonly claimedByDevice: string;
  readonly claimedAt: number;
  readonly leaseUntil: number;
  readonly completedAt: number | null;
}

export const BRIEF_LEASE_SECONDS = 5 * 60;

export type BriefClaimResult =
  | { readonly kind: "claimed"; readonly takeover: boolean }
  | { readonly kind: "held_by_other" }
  | { readonly kind: "already_complete" };

/**
 * The claim decision, as one pure function.
 *
 * Four states, four meanings — and `already_complete` vs `held_by_other` matters
 * because the first is permanent while the second resolves in minutes.
 */
export function decideClaim(
  existing: BriefClaim | null,
  nowSeconds: number
): BriefClaimResult {
  if (existing === null) return { kind: "claimed", takeover: false };
  if (existing.completedAt !== null) return { kind: "already_complete" };
  if (existing.leaseUntil > nowSeconds) return { kind: "held_by_other" };
  // Lease expired with nothing completed: the claimant died. Take over.
  return { kind: "claimed", takeover: true };
}

/**
 * A device may not claim tomorrow's key to get a second brief today.
 *
 * The local date is supplied by the device, so it is checked against UTC rather
 * than trusted. ±1 day tolerates every real timezone; more than that is a clock or
 * a deliberate bypass.
 */
export function isPlausibleLocalDate(
  localDate: string,
  nowMilliseconds: number,
  toleranceDays = 1
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return false;
  const claimed = Date.parse(`${localDate}T00:00:00Z`);
  if (Number.isNaN(claimed)) return false;
  const today = new Date(nowMilliseconds);
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.abs(claimed - todayUtc) <= toleranceDays * 86_400_000;
}

/**
 * The first-day greeting loses every race to the person.
 *
 * A greeting appearing above someone's typed question is the worst version of this
 * feature, so the conditions are explicit rather than implied by render order.
 */
export function shouldSendGreeting(input: {
  readonly greetingSentBefore: boolean;
  readonly composerHasContent: boolean;
  readonly hasSentMessage: boolean;
  readonly threadExists: boolean;
}): boolean {
  return (
    !input.greetingSentBefore &&
    !input.composerHasContent &&
    !input.hasSentMessage &&
    !input.threadExists
  );
}

/** Two variants, chosen by connector state, never by inference at render time. */
export type GreetingVariant = "mail_connected" | "no_mail";

export function greetingVariant(mailConnected: boolean): GreetingVariant {
  return mailConnected ? "mail_connected" : "no_mail";
}

/**
 * A reply chip fills the composer; it never sends.
 *
 * A chip is a shortcut for typing, not an action. Selecting one must not start a
 * turn, or the person loses the chance to edit a suggestion they did not write.
 */
export interface ReplyChip {
  readonly id: string;
  readonly label: string;
  /** Inserted into the composer verbatim. */
  readonly text: string;
}

export const MAX_REPLY_CHIPS = 4;

export function replyChips(items: readonly ReplyChip[]): readonly ReplyChip[] {
  // A wall of chips is a menu, and a menu in a conversation means the conversation
  // failed. Four is the cap; order is preserved so the source decides emphasis.
  return items.slice(0, MAX_REPLY_CHIPS);
}

/** Setup checklist, derived from real state so it cannot claim false progress. */
export const SETUP_STEPS = [
  "answer_first_task",
  "connect_calendar",
  "create_routine",
  "run_routine"
] as const;

export type SetupStep = (typeof SETUP_STEPS)[number];

export interface SetupSignals {
  readonly resolvedAnyTask: boolean;
  readonly hasConnectedAccount: boolean;
  readonly hasRoutine: boolean;
  readonly hasRunRoutine: boolean;
}

export function setupProgress(signals: SetupSignals): {
  readonly steps: readonly { readonly step: SetupStep; readonly done: boolean }[];
  readonly complete: boolean;
  readonly doneCount: number;
} {
  const steps: { step: SetupStep; done: boolean }[] = [
    { step: "answer_first_task", done: signals.resolvedAnyTask },
    { step: "connect_calendar", done: signals.hasConnectedAccount },
    { step: "create_routine", done: signals.hasRoutine },
    { step: "run_routine", done: signals.hasRunRoutine }
  ];
  const doneCount = steps.filter((entry) => entry.done).length;
  return {
    steps,
    // Disappears entirely once complete rather than lingering as a 100% bar.
    complete: doneCount === steps.length,
    doneCount
  };
}
