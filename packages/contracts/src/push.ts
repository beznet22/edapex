import { z } from "zod";

/**
 * Push delivery contracts.
 *
 * One event, one audience, one rendered string. The string is rendered on the
 * server because a lock screen cannot run code: it shows what it was given or it
 * shows nothing.
 *
 * The rules here are pure so both sides of the wire agree on them. A quiet-hour
 * check that lives only in the sender is a rule the composer will contradict.
 */

export const PUSH_KINDS = [
  "approval.requested",
  "approval.decided",
  "marks.published",
  "result.published",
  "run.finished",
  "run.failed",
  "routine.due",
  "school.announcement"
] as const;

export type PushKind = (typeof PUSH_KINDS)[number];

/**
 * Waking someone at 23:40 is sometimes the point.
 *
 * An approval blocks work until it is answered, so it is the one kind that is
 * allowed through quiet hours. Everything else waits for 06:30.
 */
export const QUIET_EXEMPT_KINDS: ReadonlySet<PushKind> = new Set<PushKind>(["approval.requested"]);

/** School-local, minutes since midnight. */
export const QUIET_START_MINUTES = 21 * 60;
export const QUIET_END_MINUTES = 6 * 60 + 30;

/** Above this many recipients one event becomes one digest, not N pushes. */
export const DIGEST_RECIPIENT_THRESHOLD = 50;

/** Same `kind` inside this window collapses too: a class is not 40 headlines. */
export const STORM_WINDOW_SECONDS = 60;

/** A hard ceiling per person per hour, digests included. */
export const HOURLY_PUSH_CEILING = 20;

export type PushPlatform = "android" | "web" | "ios";

export type PushRole = "parent" | "student" | "teacher" | "admin";

/**
 * Who a push is for, expressed as a query rather than a list.
 *
 * The sender resolves it against the school tables. A resolved list would be a
 * snapshot that goes stale between composing and sending.
 */
export interface PushAudience {
  readonly role: PushRole;
  readonly classId?: string;
  readonly sectionId?: string;
  readonly studentIds?: readonly string[];
  readonly userIds?: readonly string[];
}

const audienceSchema = z.object({
  role: z.enum(["parent", "student", "teacher", "admin"]),
  classId: z.string().min(1).optional(),
  sectionId: z.string().min(1).optional(),
  studentIds: z.array(z.string().min(1)).min(1).optional(),
  userIds: z.array(z.string().min(1)).min(1).optional()
});

/**
 * The wire envelope, produced by `cowork-api` and accepted by `sms-api`.
 *
 * `id` is the idempotency root: the same event delivered twice must not notify
 * twice, so job keys are derived from it rather than from a timestamp.
 */
export const pushEventSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(PUSH_KINDS),
  schoolId: z.string().min(1),
  actorUserId: z.string().min(1),
  audience: audienceSchema,
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
  /** Path inside the app, without scheme or host: `/marks/…`, `/approval/…`. */
  route: z.string().startsWith("/"),
  params: z.record(z.string(), z.string()).optional()
});

export type PushEvent = z.infer<typeof pushEventSchema>;

/** What a device registers. One row per install, revocable without touching the account. */
export const pushDeviceSchema = z.object({
  platform: z.enum(["android", "web", "ios"]),
  token: z.string().min(8).max(4096),
  /** Web Push only; FCM and APNs carry their own. */
  keys: z.object({ p256dh: z.string(), auth: z.string() }).optional(),
  /** The app's own install id, so a re-register updates instead of duplicating. */
  installId: z.string().min(1).max(128)
});

export type PushDevice = z.infer<typeof pushDeviceSchema>;

/**
 * Preferences are opt-outs, not opt-ins.
 *
 * A new kind is delivered by default; the alternative is a feature that silently
 * reaches nobody until every person visits settings.
 */
export const notificationPrefsSchema = z.object({
  mutedKinds: z.array(z.enum(PUSH_KINDS)).default([]),
  quietHours: z.boolean().default(true)
});

export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  mutedKinds: [],
  quietHours: true
};

/**
 * Whether this event may be delivered at this local minute.
 *
 * The window wraps midnight, which is the whole reason this is a function: an
 * `end > start` comparison is the bug that ships every time.
 */
export function isQuietTime(kind: PushKind, localMinutes: number): boolean {
  if (QUIET_EXEMPT_KINDS.has(kind)) return false;
  const minute = ((localMinutes % 1440) + 1440) % 1440;
  return minute >= QUIET_START_MINUTES || minute < QUIET_END_MINUTES;
}

/**
 * Collapse this delivery: too many people, or the same kind again within a minute.
 *
 * A digest is one push saying "3 students' marks were published", not 400 pushes
 * saying one each. The threshold is on recipients, not on size of change.
 */
export function shouldDigest(input: {
  readonly kind: PushKind;
  readonly recipientCount: number;
  readonly sameKindInWindow: number;
}): boolean {
  // An approval is never digested: "some approvals are waiting" is not answerable.
  if (QUIET_EXEMPT_KINDS.has(input.kind)) return false;
  return (
    input.recipientCount > DIGEST_RECIPIENT_THRESHOLD ||
    input.sameKindInWindow >= STORM_WINDOW_SECONDS
  );
}

/** The idempotency root for one recipient. Hashed by the sender before it is stored. */
export function pushJobKey(eventId: string, userId: string): string {
  return `${eventId}:${userId}`;
}

/**
 * The in-app destination, derived from the kind so a sender cannot invent one.
 *
 * The app owns the scheme; the server only names the path. Anything unexpected
 * falls back to the inbox rather than to a dead link.
 */
export function pushRoute(kind: PushKind, subjectId: string): string {
  switch (kind) {
    case "approval.requested":
    case "approval.decided":
      return `/approval/${subjectId}`;
    case "marks.published":
      return `/marks/${subjectId}`;
    case "result.published":
      return `/student/${subjectId}`;
    case "run.finished":
    case "run.failed":
      return `/thread/${subjectId}`;
    case "routine.due":
      return `/routine/${subjectId}`;
    case "school.announcement":
      return `/notice/${subjectId}`;
  }
}

/** A muted kind is dropped per person, after fan-out, never before it. */
export function isMuted(prefs: NotificationPrefs, kind: PushKind): boolean {
  return prefs.mutedKinds.includes(kind);
}
