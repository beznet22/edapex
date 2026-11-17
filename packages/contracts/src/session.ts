import { z } from "zod";

export const SESSION_CONTRACT_VERSION = 1 as const;
export const SESSION_SYNC_BATCH_LIMIT = 100 as const;
export const SESSION_SYNC_PAYLOAD_MAX_BYTES = 700_000 as const;

const idSchema = z.string().min(1).max(200);
const cursorSchema = z.string().max(500);
const ciphertextSchema = z
  .string()
  .min(1)
  .max(SESSION_SYNC_PAYLOAD_MAX_BYTES)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, "ciphertext must be base64");
const checksumSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const sessionMessageRoleSchema = z.enum([
  "system",
  "user",
  "assistant",
  "tool"
] as const);

export const sessionMessageVersionSchema = z
  .object({
    eventId: idSchema,
    messageId: idSchema,
    text: z.string(),
    createdAtMs: z.number().int().nonnegative()
  })
  .strict();

export const sessionMessageSchema = z
  .object({
    eventId: idSchema,
    messageId: idSchema,
    dedupId: idSchema.nullable(),
    role: sessionMessageRoleSchema,
    text: z.string(),
    versions: z.array(sessionMessageVersionSchema),
    replyTo: idSchema.nullable()
  })
  .strict();

export const sessionQueueItemSchema = z
  .object({
    eventId: idSchema,
    commandId: idSchema,
    dedupId: idSchema,
    text: z.string().min(1),
    enqueuedAtMs: z.number().int().nonnegative()
  })
  .strict();

export const sessionTruncationSchema = z
  .object({
    id: idSchema,
    from: idSchema,
    active: z.boolean()
  })
  .strict();

export const sessionViewSchema = z
  .object({
    sessionId: idSchema,
    threadId: idSchema,
    deviceId: idSchema,
    clientId: idSchema,
    readOnly: z.boolean(),
    holderId: idSchema.nullable(),
    fence: z.number().int().nonnegative(),
    lastSeq: z.number().int().nonnegative(),
    messages: z.array(sessionMessageSchema),
    queue: z.array(sessionQueueItemSchema),
    truncations: z.array(sessionTruncationSchema),
    nextCursor: cursorSchema.nullable()
  })
  .strict()
  .superRefine((view, context) => {
    if (view.sessionId !== view.threadId) {
      context.addIssue({
        code: "custom",
        message: "sessionId and threadId must identify the same root conversation",
        path: ["threadId"]
      });
    }
  });

export type SessionView = z.infer<typeof sessionViewSchema>;
export type SessionMessage = z.infer<typeof sessionMessageSchema>;
export type SessionQueueItem = z.infer<typeof sessionQueueItemSchema>;
export type SessionTruncation = z.infer<typeof sessionTruncationSchema>;
export type SessionMessageRole = z.infer<typeof sessionMessageRoleSchema>;

const commandBase = {
  commandId: idSchema,
  sessionId: idSchema,
  clientId: idSchema
};

export const sessionCommandSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...commandBase,
      type: z.literal("enqueue_text"),
      threadId: idSchema,
      dedupId: idSchema,
      text: z.string().min(1)
    })
    .strict(),
  z
    .object({
      ...commandBase,
      type: z.literal("cancel_turn"),
      turnId: idSchema
    })
    .strict(),
  z
    .object({
      ...commandBase,
      type: z.literal("edit_message"),
      eventId: idSchema,
      replacementMessageId: idSchema,
      replacementDedupId: idSchema,
      text: z.string().min(1)
    })
    .strict(),
  z
    .object({
      ...commandBase,
      type: z.literal("truncate"),
      truncationId: idSchema,
      fromEventId: idSchema
    })
    .strict(),
  z
    .object({
      ...commandBase,
      type: z.literal("restore"),
      truncationId: idSchema
    })
    .strict(),
  z
    .object({
      ...commandBase,
      type: z.literal("delete_session")
    })
    .strict(),
  z
    .object({
      ...commandBase,
      type: z.literal("acquire_lease"),
      leaseTtlMs: z.number().int().positive().max(300_000)
    })
    .strict(),
  z
    .object({
      ...commandBase,
      type: z.literal("renew_lease"),
      expectedFence: z.number().int().positive()
    })
    .strict(),
  z
    .object({
      ...commandBase,
      type: z.literal("release_lease"),
      expectedFence: z.number().int().positive()
    })
    .strict()
]);

export type SessionCommand = z.infer<typeof sessionCommandSchema>;

export const sessionSyncEventKindSchema = z.enum([
  "projection",
  "core_snapshot",
  "deletion"
] as const);

export const sessionSyncEventSchema = z
  .object({
    eventId: idSchema,
    sessionId: idSchema,
    deviceId: idSchema,
    deviceSeq: z.number().int().positive(),
    kind: sessionSyncEventKindSchema,
    ciphertext: ciphertextSchema,
    checksum: checksumSchema,
    createdAtMs: z.number().int().nonnegative(),
    relayPosition: z.number().int().positive().nullable()
  })
  .strict();

export const sessionSyncPushSchema = z
  .object({
    workspaceId: idSchema,
    sessionId: idSchema,
    deviceId: idSchema,
    clientId: idSchema,
    fence: z.number().int().positive(),
    events: z.array(sessionSyncEventSchema).min(1).max(SESSION_SYNC_BATCH_LIMIT)
  })
  .strict()
  .superRefine((push, context) => {
    push.events.forEach((event, index) => {
      if (event.sessionId !== push.sessionId || event.deviceId !== push.deviceId) {
        context.addIssue({
          code: "custom",
          message: "events must belong to the push session and active device",
          path: ["events", index]
        });
      }
      if (event.relayPosition !== null) {
        context.addIssue({
          code: "custom",
          message: "relay positions are assigned by the server",
          path: ["events", index, "relayPosition"]
        });
      }
    });
  });

export const sessionSyncAcknowledgementSchema = z
  .object({
    eventId: idSchema,
    status: z.enum(["accepted", "duplicate", "stale"] as const),
    position: z.number().int().positive().nullable()
  })
  .strict();

export const sessionSyncPushResultSchema = z
  .object({
    acknowledgements: z.array(sessionSyncAcknowledgementSchema),
    nextPosition: z.number().int().nonnegative()
  })
  .strict();

export const sessionDeletionSchema = z
  .object({
    sessionId: idSchema,
    deletionEventId: idSchema,
    deletedAtMs: z.number().int().nonnegative()
  })
  .strict();

export const sessionSyncPullResultSchema = z
  .object({
    events: z.array(sessionSyncEventSchema),
    nextPosition: z.number().int().nonnegative(),
    deletion: sessionDeletionSchema.nullable()
  })
  .strict();

export type SessionSyncEvent = z.infer<typeof sessionSyncEventSchema>;
export type SessionSyncPush = z.infer<typeof sessionSyncPushSchema>;
export type SessionSyncPushResult = z.infer<typeof sessionSyncPushResultSchema>;
export type SessionSyncPullResult = z.infer<typeof sessionSyncPullResultSchema>;
export type SessionDeletion = z.infer<typeof sessionDeletionSchema>;

export function isSessionView(value: unknown): value is SessionView {
  return sessionViewSchema.safeParse(value).success;
}

export function isSessionCommand(value: unknown): value is SessionCommand {
  return sessionCommandSchema.safeParse(value).success;
}
