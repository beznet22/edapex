# Telegram Parent Chat → Mastra-Native Migration

> **Code Snippet Disclaimer**: All code blocks in this document are illustrative examples showing intent and approach. They are **not authoritative** — the implementation agent must re-read the actual source files at implementation time and write production code that matches prevailing conventions, type signatures, and real API surfaces.

## Mission

Migrate the parent Telegram chat feature from raw Telegram API calls (MySQL-backed) to the Chat SDK (`@chat-adapter/telegram`) with libSQL-backed identity storage. The agent must research, verify, plan, and implement.

## Ground Rules

- **DO NOT skip verification.** Every claim below must be re-verified against the live codebase and the linked docs before implementation.
- **DO NOT write placeholder or TODO code.** Every file must be production-ready.
- **DO NOT leave stale types/exports.** Remove everything replaced by the new approach.
- **Commit discipline**: one commit per logical step (schema → deps → connect-tokens → bot/gateway → webhook → backfill script). Do not squash.

## Current Architecture (must verify each claim)

Read these files and verify the analysis is accurate:

### Files to read
- `src/lib/server/telegram/bot.ts` — raw `callTelegram<T>()` fetch wrapper, `sendMessage()`, `setWebhook()`
- `src/lib/server/telegram/gateway.ts` — manual `handleTelegramUpdate()`, text parsing for `/connect`/`/start`, MySQL parent lookup, `RequestContext` injection, `agent.stream()` with buffer loop
- `src/lib/server/telegram/connect-tokens.ts` — MySQL-backed `ConnectTokenStore` using `getDatabase()` + raw `sql` templates
- `src/routes/api/telegram/webhook/+server.ts` — SvelteKit endpoint that JSON-parses the update and calls `handleTelegramUpdate()`
- `src/routes/api/parents/connect-telegram/+server.ts` — creates connect token for web UI
- `src/routes/telegram/connect/+page.server.ts` — validates token on page load
- `src/routes/telegram/connect/+page.svelte` — UI for "Open Telegram" button
- `src/lib/server/mastra/storage/libsql/app-db.ts` — libSQL Drizzle client singleton (`getAppDb()`)
- `src/lib/server/mastra/storage/libsql/app-db.schema.ts` — existing libSQL tables
- `src/lib/server/mastra/tools/internal/parent-permissions.ts` — `ParentContext` class
- `src/lib/server/mastra/tools/operations/parent/index.ts` — `readParentContext()` reads from `requestContext`
- `src/lib/server/mastra/storage/libsql/migrations/1730000000_telegram.sql` — MySQL migration adding telegram columns + connect_tokens
- `src/lib/server/mastra/index.ts` — Mastra singleton setup
- `src/lib/server/mastra/agents/assistant.ts` — assistant agent definition
- `package.json` — verify no `@chat-adapter/*` packages exist

### Claims to verify

1. **`getDatabase()` returns `MySQLDrizzleClient`** — check `src/lib/server/db/index.ts`
2. **`getAppDb()` returns `LibSQLDatabase<typeof schema>`** — check `app-db.ts`, verify it's synchronous (no await), verify WAL pragmas
3. **`connect_tokens` is a MySQL table** — check the migration SQL file and confirm no libSQL equivalent exists
4. **`sm_parents.telegram_chat_id` is a MySQL column added by raw SQL** — verify it's NOT in the Drizzle schema (`sms-schema.ts`), only in the migration SQL
5. **Parent tools read context via `readParentContext(ctx)` which calls `ctx.requestContext?.get("tenantContext")`** — verify the entire injection chain
6. **No `@chat-adapter/*` packages exist** — check `node_modules` and `package.json`

## Target Architecture (verify each claim against linked docs)

### Chat SDK Telegram adapter
Docs: https://chat-sdk.dev/adapters/official/telegram

Verify:
- `createTelegramAdapter()` auto-reads `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` from env
- `mode: "auto"` uses webhook in production, polling in dev
- `bot.webhooks.telegram(request)` returns a `Response` — one-liner for SvelteKit handler
- `onSlashCommand("connect", ...)` receives the token as an argument array
- `onDirectMessage` fires for ALL private chat messages (Telegram `chat.type === "private"`)
- DM messages do NOT route to `onSlashCommand` — slash commands are intercepted before DM routing
- `thread.post(result.fullStream)` streams to Telegram using `sendRichMessageDraft` in private chats, then persists with `sendRichMessage`
- `thread.id` format: verify it includes the Telegram chat_id (likely `telegram:<chat_id>`)

### Chat SDK streaming
Docs: https://chat-sdk.dev/docs/streaming

Verify:
- `fullStream` preserves step boundaries with paragraph breaks
- Telegram private chat streaming uses `sendRichMessageDraft` (not post+edit)
- No buffering needed — pass `AsyncIterable` directly to `thread.post()`
- Markdown healing auto-fixes incomplete syntax during streaming

### Chat SDK thread state
Docs: https://chat-sdk.dev/docs/api/thread

Verify:
- `thread.state` returns cached state or `null`
- `await thread.setState(state)` stores per-thread state
- 30-day TTL on state
- `createMemoryState()` from `@chat-adapter/state-memory` persists state across restarts
- Without state adapter: thread state resets on restart

### Chat SDK Chat class
Docs: https://chat-sdk.dev/docs/api/chat

Verify:
- Constructor accepts `{ userName, adapters, state }`
- `onDirectMessage(thread, message)` fires for Telegram DMs
- `onSlashCommand(command, handler)` — verify the handler signature
- `bot.webhooks.telegram(request)` returns `Response`

### LibSQL Drizzle client
Read `src/lib/server/mastra/storage/libsql/app-db.ts`:
- Verify `getAppDb()` returns a singleton `LibSQLDatabase<typeof schema>`
- Verify it uses `drizzle-orm/libsql` (not `drizzle-orm/mysql2`)
- Verify schema import path

## Implementation Steps

Execute in order. Do NOT proceed to step N+1 until step N is complete and verified.

### Step 1: Install packages

> **Disclaimer**: This code is illustrative. Re-read source files and write production code.
```bash
pnpm add chat @chat-adapter/telegram @chat-adapter/state-memory
```

Verify they appear in `package.json` and `pnpm-lock.yaml`.

### Step 2: Add libSQL tables

**File**: `src/lib/server/mastra/storage/libsql/app-db.schema.ts`

Add two tables using `sqliteTable` from `drizzle-orm/sqlite-core`:

> **Disclaimer**: This code is illustrative. Re-read source files and write production code.
```typescript
export const telegramParentLink = sqliteTable('telegram_parent_link', {
  chatId: text('chat_id').primaryKey(),
  parentId: integer('parent_id').notNull(),
  userId: integer('user_id').notNull(),
  schoolId: integer('school_id').notNull(),
  schoolName: text('school_name'),              // from sm_schools, for failure contact
  schoolPhone: text('school_phone'),            // from sm_schools, for failure contact
  schoolEmail: text('school_email'),            // from sm_schools, for failure contact
  childIds: text('child_ids').notNull(),        // JSON: [101, 102]
  childNames: text('child_names').notNull(),    // JSON: ["Jane", "John"]
  linkedAt: text('linked_at').notNull().default(sql`(datetime('now'))`),
});

export const connectTokens = sqliteTable('connect_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  parentId: integer('parent_id').notNull(),
  token: text('token').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  usedAt: text('used_at'),
  schoolId: integer('school_id').notNull().default(1),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});
```

Export infer types:
> **Disclaimer**: This code is illustrative. Re-read source files and write production code.
```typescript
export type TelegramParentLink = typeof telegramParentLink.$inferSelect;
export type ConnectToken = typeof connectTokens.$inferSelect;
```

Verify: `pnpm run svelte-check --workspace path/to/app-db.schema.ts`

### Step 3: Rewrite `connect-tokens.ts`

**File**: `src/lib/server/telegram/connect-tokens.ts`

Replace MySQL `getDatabase()` with libSQL `getAppDb()`. Use Drizzle query builder (not raw SQL).

> **Disclaimer**: This code is illustrative. Re-read source files and write production code.
```typescript
import { randomBytes } from "node:crypto";
import { getAppDb } from "$lib/server/mastra/storage/libsql/app-db";
import { connectTokens } from "$lib/server/mastra/storage/libsql/app-db.schema";
import { eq, and, isNull, sql } from "drizzle-orm";

// class ConnectTokenStore (singleton pattern, same public API)
//   createToken(parentId, schoolId, ttlHours = 24): Promise<string>
//     → db.insert(connectTokens).values({ parentId, token, expiresAt, schoolId })
//   lookupToken(token): Promise<{parentId, schoolId, expiresAt} | null>
//     → db.select().from(connectTokens).where(and(eq(token), isNull(usedAt), expiresAt > datetime('now')))
//   consumeToken(token): Promise<{parentId, schoolId} | null>
//     → same select → db.update().set({ usedAt: sql`datetime('now')` })
```

Key differences from current:
- `getDatabase()` → `getAppDb()` (synchronous, no await)
- `NOW()` → `datetime('now')` (SQLite syntax)
- raw `sql` templates → Drizzle query builder
- Remove `as unknown` casting — Drizzle returns typed results
- Remove `Array.isArray(result)` / `result.rows` branching — Drizzle query builder returns consistent shape

Verify: `pnpm run svelte-check --workspace src/lib/server/telegram/connect-tokens.ts`

### Step 4: Rewrite `bot.ts`

**File**: `src/lib/server/telegram/bot.ts`

Replace entire file:

> **Disclaimer**: This code is illustrative. Re-read source files and write production code.
```typescript
import { createTelegramAdapter } from "@chat-adapter/telegram";

export const telegramAdapter = createTelegramAdapter();
export const TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME ?? "";
```

Remove: `callTelegram<T>()`, `sendMessage()`, `setWebhook()`, `TelegramUpdate` interface, `TelegramApiResponse` interface, all env var parsing, all `fetch()` calls.

Verify the adapter auto-detects env vars by reading `@chat-adapter/telegram` docs.
Verify: `pnpm run svelte-check --workspace src/lib/server/telegram/bot.ts`

### Step 5: Rewrite `gateway.ts`

**File**: `src/lib/server/telegram/gateway.ts`

Replace with Chat SDK `Chat` instance. This is the largest change.

Structure:

> **Disclaimer**: This code is illustrative. Re-read source files and write production code.
```typescript
import { Chat } from "chat";
import { createMemoryState } from "@chat-adapter/state-memory";
import { telegramAdapter, TELEGRAM_BOT_USERNAME } from "./bot";
import { ConnectTokenStore } from "./connect-tokens";
import { getAppDb } from "$lib/server/mastra/storage/libsql/app-db";
import { telegramParentLink } from "$lib/server/mastra/storage/libsql/app-db.schema";
import { getDatabase } from "$lib/server/db";
import { sql, eq } from "drizzle-orm";
import { RequestContext } from "@mastra/core/request-context";
import { mastra } from "$lib/server/mastra";
import { ParentContext } from "$lib/server/mastra/tools/internal/parent-permissions";

const bot = new Chat({
  userName: TELEGRAM_BOT_USERNAME,
  adapters: { telegram: telegramAdapter },
  state: createMemoryState(),
});
```

**Handler: `/start`**
> **Disclaimer**: This code is illustrative. Re-read source files and write production code.
```typescript
bot.onSlashCommand("start", async (thread) => {
  await thread.post("👋 Welcome to EdApex! Open the school portal and click 'Connect Telegram' to link your account.");
});
```

**Handler: `/connect <token>`**
> **Disclaimer**: This code is illustrative. Re-read source files and write production code.
```typescript
bot.onSlashCommand("connect", async (thread, _message, [token]) => {
  const consumed = await ConnectTokenStore.getInstance().consumeToken(token);
  if (!consumed) {
    await thread.post("❌ Invalid or expired link.");
    return;
  }

  // One-time MySQL reads for parent data + school contact info + children
  const db = await getDatabase();
  const [parentRows] = await db.execute(
    sql`SELECT id, user_id, school_id FROM sm_parents WHERE id = ${consumed.parentId} LIMIT 1`
  );
  const [schoolRows] = await db.execute(
    sql`SELECT school_name, phone, email FROM sm_schools WHERE id = ${consumed.schoolId} LIMIT 1`
  );
  const [childRows] = await db.execute(
    sql`SELECT id, full_name FROM sm_students WHERE parent_id = ${consumed.parentId} AND active_status = 1 ORDER BY id ASC`
  );

  // Parse MySQL result (handle both array and {rows} shapes)
  const parent = Array.isArray(parentRows) ? parentRows[0] : (parentRows as any).rows?.[0];
  if (!parent) {
    await thread.post("❌ Parent record not found.");
    return;
  }
  const school = Array.isArray(schoolRows) ? schoolRows[0] : (schoolRows as any).rows?.[0];
  const children = Array.isArray(childRows) ? childRows : ((childRows as any).rows ?? []);
  const childIds = children.map((r: any) => r.id);
  const childNames = children.map((r: any) => r.full_name).filter(Boolean);

  // Store in libSQL (including denormalized school contact info for failure messages)
  const appDb = getAppDb();
  await appDb.insert(telegramParentLink).values({
    chatId: thread.id,
    parentId: consumed.parentId,
    userId: parent.user_id,
    schoolId: consumed.schoolId,
    schoolName: school?.school_name ?? null,
    schoolPhone: school?.phone ?? null,
    schoolEmail: school?.email ?? null,
    childIds: JSON.stringify(childIds),
    childNames: JSON.stringify(childNames),
  });

  await thread.post("✅ Your Telegram account is now linked to EdApex. Send any question to chat with the assistant.");
});
```

**Handler: DM messages**
> **Disclaimer**: This code is illustrative. Re-read source files and write production code.
```typescript
bot.onDirectMessage(async (thread, message) => {
  // 1. Try cache
  const state = await thread.state as Record<string, unknown> | null;

  let parentId: number;
  let userId: number;
  let schoolId: number;
  let schoolName: string | null;
  let schoolPhone: string | null;
  let schoolEmail: string | null;
  let childIds: number[];
  let childNames: string[];

  if (state?.parentId) {
    parentId = state.parentId as number;
    userId = state.userId as number;
    schoolId = state.schoolId as number;
    schoolName = (state.schoolName as string) ?? null;
    schoolPhone = (state.schoolPhone as string) ?? null;
    schoolEmail = (state.schoolEmail as string) ?? null;
    childIds = state.childIds as number[];
    childNames = state.childNames as string[];
  } else {
    // 2. Cache miss — read from libSQL
    const appDb = getAppDb();
    const [link] = await appDb.select()
      .from(telegramParentLink)
      .where(eq(telegramParentLink.chatId, thread.id))
      .limit(1);

    if (!link) {
      await thread.post("⚠️ Your account is not linked. Open the school portal and click 'Connect Telegram' to link it.");
      return;
    }

    parentId = link.parentId;
    userId = link.userId;
    schoolId = link.schoolId;
    schoolName = link.schoolName;
    schoolPhone = link.schoolPhone;
    schoolEmail = link.schoolEmail;
    childIds = JSON.parse(link.childIds);
    childNames = JSON.parse(link.childNames);

    // 3. Cache in thread state
    await thread.setState({
      parentId, userId, schoolId,
      schoolName, schoolPhone, schoolEmail,
      childIds, childNames,
    });
  }

  // 4. Build context and call agent
  const parentContext: ParentContext = {
    parentId,
    userId,
    schoolId,
    schoolName,
    schoolPhone,
    schoolEmail,
    childIds,
    telegramChatId: thread.id,
    phoneNumber: undefined,
    verifiedAt: new Date().toISOString(),
  };

  const requestContext = new RequestContext();
  requestContext.set("tenantContext", parentContext);
  requestContext.set("forcedToolGroup", "parent");
  requestContext.set("lastMessage", message.text);
  requestContext.set("isSlashCommand", false);

  const agent = mastra.getAgent("assistant");
  try {
    const result = await agent.stream(message.text, {
      requestContext: requestContext as never,
      memory: {
        thread: `telegram-parent-${parentId}`,
        resource: `parent-${parentId}`,
      },
      maxSteps: 30,
    });

    // 5. Iterate fullStream to detect PDF tool calls, then stream text
    let pdfOutput: { base64: string; filename: string } | null = null;
    for await (const event of result.fullStream) {
      if (event.type === 'tool-result' && event.toolName === 'download-child-pdf') {
        const r = event.result as Record<string, unknown>;
        if (typeof r.pdfBase64 === 'string' && r.pdfBase64.length > 0) {
          pdfOutput = {
            base64: r.pdfBase64,
            filename: (r.filename as string) ?? 'report-card.pdf',
          };
        }
      }
    }

    // Post the stream (parent sees text in real-time via Telegram draft streaming)
    await thread.post(result.fullStream);

    // Send PDF as a native Telegram document with caption
    if (pdfOutput) {
      await thread.post({
        markdown: '',  // caption already rendered in the text stream above
        files: [{
          data: Buffer.from(pdfOutput.base64, 'base64'),
          filename: pdfOutput.filename,
          mimeType: 'application/pdf',
        }],
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[telegram/gateway] agent error: ${msg}`);

    // Single fallback failure message with school contact
    const schoolContact = [
      schoolName ?? 'the school',
      schoolPhone ? `📞 ${schoolPhone}` : null,
      schoolEmail ? `📧 ${schoolEmail}` : null,
    ].filter(Boolean).join('\n');
    await thread.post(
      `I'm sorry, I can't process that request. Please contact ${schoolContact}`
    );
  }
});

export { bot };
```

Remove all old exports (`handleTelegramUpdate`, `findParentByChatId`, `resolveChildIds`, `getChildrenNames`, `linkParentToChat`, `truncateForTelegram`).

Verify: `pnpm run svelte-check --workspace src/lib/server/telegram/gateway.ts`

### Step 5b: Extend `ParentContext` with school contact info

**File**: `src/lib/server/mastra/tools/internal/parent-permissions.ts`

Add school contact fields for the fallback failure message:

> **Disclaimer**: This code is illustrative. Re-read source files and write production code.
```typescript
export class ParentContext {
  parentId = 0;
  userId = 0;
  schoolId = 0;
  schoolName?: string;    // NEW: from sm_schools, shown in failure contact message
  schoolPhone?: string;   // NEW: from sm_schools
  schoolEmail?: string;   // NEW: from sm_schools
  childIds: number[] = [];
  telegramChatId?: string;
  phoneNumber?: string;
  verifiedAt?: string;
}
```

The instruction builder in `instructions.ts` reads `requestContext.get("tenantContext")` which is the `ParentContext`. School contact fields are now available for the fallback failure message template.

### Step 5c: Extend `downloadChildPdfTool` with PDF buffer + auto-generate

**File**: `src/lib/server/mastra/tools/operations/parent/download-child-pdf.ts`

Extend output schema to include base64-encoded PDF and filename:

> **Disclaimer**: This code is illustrative. Re-read source files and write production code.
```typescript
outputSchema: z.object({
  url: z.string(),
  storagePath: z.string(),
  pdfBase64: z.string(),      // NEW: base64-encoded PDF content for Telegram file upload
  filename: z.string(),       // NEW: human-readable filename like "jane-smith-mid-term-2025.pdf"
})
```

Add import for the generate tool:
> **Disclaimer**: This code is illustrative. Re-read source files and write production code.
```typescript
import { generateResultPdfTool } from "$lib/server/mastra/tools/operations/reporting/generate-result-pdf";
```

Replace the `execute` body — instead of throwing `PDF_NOT_READY` when the file is missing, auto-generate the PDF on the fly using the existing reporting tool:

> **Disclaimer**: This code is illustrative. Re-read source files and write production code.
```typescript
execute: async (input, ctx) => {
  const parent = readParentContext(ctx);
  assertParentOwnsStudent(parent, input.studentId);

  const tenant = toTenantContext(parent);
  const storagePath = `exams/examType-${input.examTypeId}/pdfs/${input.studentId}.pdf`;

  const reqCtx = new RequestContext();
  reqCtx.set("tenantContext", { ...tenant, examTypeId: input.examTypeId });
  const fs = await tenantWorkspace.resolveFilesystem({ requestContext: reqCtx as never });
  if (!fs) {
    throw new Error("WORKSPACE_UNAVAILABLE: tenant workspace filesystem is not configured");
  }

  // Auto-generate PDF if it doesn't exist yet
  const exists = await fs.exists(storagePath);
  if (!exists) {
    const genCtx = {
      requestContext: {
        get: <T = unknown>(key: string): T | undefined => {
          if (key === 'tenantContext') return { ...tenant, examTypeId: input.examTypeId } as T;
          return undefined;
        },
      },
    };
    const genResult = await generateResultPdfTool.execute(
      { studentId: input.studentId, examTypeId: input.examTypeId },
      genCtx as never,
    );
    if (genResult.status === 'error') {
      throw new Error(`PDF_GENERATION_FAILED: ${genResult.error ?? 'unknown error'}`);
    }
  }

  // Read PDF buffer for Telegram file upload
  const pdfBuffer = await fs.readFile(storagePath);
  const pdfBase64 = pdfBuffer.toString('base64');

  // Build human-readable filename from student name
  const db = await getDatabase();
  const [studentRow] = await db
    .select({ fullName: smStudents.fullName })
    .from(smStudents)
    .where(eq(smStudents.id, input.studentId))
    .limit(1);
  const studentName = studentRow?.fullName?.toLowerCase().replace(/\s+/g, '-')
    ?? `student-${input.studentId}`;

  const token = base64url(JSON.stringify({ studentId: input.studentId, examTypeId: input.examTypeId }));
  return {
    url: `/api/results/${token}`,
    storagePath,
    pdfBase64,
    filename: `${studentName}-exam-${input.examTypeId}.pdf`,
  };
},
```

The `generateResultPdfTool` writes to the exact same `storagePath`. Subsequent calls skip generation and read the cached PDF.

### Step 5d: Wire school contact info into agent instructions

**File**: `src/lib/server/mastra/agents/instructions.ts`

Verify that the instruction builder reads `schoolName`, `schoolPhone`, `schoolEmail` from `requestContext.get("tenantContext")` and injects them into the system prompt as available variables for the fallback contact message. If they are not present, add them:

> **Disclaimer**: This code is illustrative. Re-read source files and write production code.
```typescript
// Inside buildAssistantInstructions():
const pc = requestContext.get("tenantContext") as ParentContext | undefined;
const schoolName = pc?.schoolName;
const schoolPhone = pc?.schoolPhone;
const schoolEmail = pc?.schoolEmail;
// These are available to the skill instructions for the failure contact template
```

### Step 6: Simplify webhook

**File**: `src/routes/api/telegram/webhook/+server.ts`

> **Disclaimer**: This code is illustrative. Re-read source files and write production code.
```typescript
import type { RequestHandler } from "@sveltejs/kit";
import { bot } from "$lib/server/telegram/gateway";

export const POST: RequestHandler = async ({ request }) => {
  return bot.webhooks.telegram(request);
};
```

Remove: `handleTelegramUpdate` import, `TelegramUpdate` import, manual JSON parsing, validation, manual response.

Verify: `pnpm run svelte-check --workspace src/routes/api/telegram/webhook/+server.ts`

### Step 7: No changes to connect API

**File**: `src/routes/api/parents/connect-telegram/+server.ts`

No code changes needed. `ConnectTokenStore.getInstance().createToken()` was updated in Step 3 to write to libSQL. The MySQL read for `sm_parents` (selecting by user_id) is correct — it's a one-time read per parent.

Verify the file compiles: `pnpm run svelte-check --workspace src/routes/api/parents/connect-telegram/+server.ts`

### Step 8: No changes to connect page

**Files**: `src/routes/telegram/connect/+page.server.ts`, `src/routes/telegram/connect/+page.svelte`

No code changes needed. The page calls `connectTokenStore.lookupToken()` which was updated in Step 3.

### Step 9: Create backfill script

**File**: `scripts/migrate-telegram-links.ts`

One-time script that:
1. Reads all `sm_parents` with non-null `telegram_chat_id` and `active_status = 1`
2. Reads school contact info from `sm_schools` for each parent's `school_id`
3. For each: reads child IDs/names from `sm_students`
4. INSERTs into libSQL `telegram_parent_link` (including school contact)
5. Reads all unconsumed, non-expired `connect_tokens` from MySQL
6. INSERTs into libSQL `connect_tokens`

Use `getDatabase()` for MySQL reads and `getAppDb()` for libSQL writes. Handle the MySQL result shape (array vs `{rows}`).

Include `main()` wrapper with error handling and logging.

### Step 10: Remove MySQL artifacts

After backfill verified:
1. Drop MySQL `connect_tokens` table
2. Optionally: ALTER TABLE `sm_parents` DROP COLUMN `telegram_chat_id`, `telegram_phone`, `telegram_linked_at`
3. Delete the raw SQL migration file at `src/lib/server/mastra/storage/libsql/migrations/1730000000_telegram.sql`

## Verification Checklist

After each step, run:

> **Disclaimer**: This code is illustrative. Re-read source files and write production code.
```bash
pnpm run svelte-check --workspace <changed-file>
pnpm run lint <changed-file>
```

Final verification:
> **Disclaimer**: This code is illustrative. Re-read source files and write production code.
```bash
pnpm run svelte-check
pnpm run lint
```

## Rollback Plan

If anything breaks:
- Revert the step's commit
- MySQL `connect_tokens` table still exists with data (until Step 10)
- `sm_parents.telegram_chat_id` still has the original chat IDs (until Step 10)
- Old `gateway.ts` and `bot.ts` can be restored from git

## UX & Persona

### Agent Persona

Replace the identity statement in `parent.skill.md` with:

> You are a **School Concierge** — a knowledgeable, warm guide serving guardians of currently enrolled students through Telegram. You represent [School Name]'s commitment to parent partnership. You only surface information the parent is entitled to: their own children's data and school-wide bulletins. You never guess; every answer comes from official school records. Your role is to help parents understand their child's academic journey — results, attendance, fees, timetable — with clarity and empathy, while upholding the school's data integrity and privacy policies.

### School Contact Info Injection

At connect time (`/connect <token>` handler), read school contact info from MySQL `sm_schools` and store in `telegramParentLink`:

> **Disclaimer**: This code is illustrative. Re-read source files and write production code.
```sql
SELECT school_name, phone, email FROM sm_schools WHERE id = ${parent.schoolId}
```

These fields are added to the `telegramParentLink` table and flow into `ParentContext` → agent instructions.

### Failure Handling

Single fallback message for all failure scenarios (tool errors, out-of-scope requests, agent errors):

> I'm sorry, I can't process that request. Please contact [School Name]:
> 📞 [school phone]
> 📧 [school email]

The school name, phone, and email come from the `ParentContext` (injected at connect time).

### PDF Delivery

`downloadChildPdfTool` extended to return PDF buffer as base64 for Telegram file upload:

> **Disclaimer**: This code is illustrative. Re-read source files and write production code.
```typescript
outputSchema: z.object({
  url: z.string(),              // web URL (fallback)
  storagePath: z.string(),
  pdfBase64: z.string(),        // base64-encoded PDF buffer
  filename: z.string(),         // human-readable filename like "jane-smith-mid-term-2025.pdf"
})
```

The tool reads the PDF from the workspace filesystem and includes it in the output. The gateway's `onDirectMessage` handler iterates `fullStream`, detects `tool-result` events for `download-child-pdf`, extracts `pdfBase64`, and sends via Chat SDK file upload:

> **Disclaimer**: This code is illustrative. Re-read source files and write production code.
```typescript
// In onDirectMessage, after agent.stream():
const result = await agent.stream(message.text, { ... });
let pdfOutput: { base64: string; filename: string } | null = null;

for await (const event of result.fullStream) {
  if (event.type === 'tool-result' && event.toolName === 'download-child-pdf') {
    const r = event.result as any;
    if (r?.pdfBase64) {
      pdfOutput = { base64: r.pdfBase64, filename: r.filename || 'report-card.pdf' };
    }
  }
}

// Post the stream (parent sees text in real-time via Telegram draft streaming)
await thread.post(result.fullStream);

// Send PDF as a file with caption (second message, automatically grouped by Telegram)
if (pdfOutput) {
  await thread.post({
    markdown: '',  // caption already in the text stream
    files: [{
      data: Buffer.from(pdfOutput.base64, 'base64'),
      filename: pdfOutput.filename,
      mimeType: 'application/pdf',
    }],
  });
}
```

This sends the PDF as a native Telegram document with the agent's response text as the caption.

### No marksheet template

The LLM formats exam results naturally from the tool output shape. The existing skill instructions ("plain-language summary first, raw data second", code blocks for tables) provide sufficient guidance.

## Design Decisions (DO NOT REVERSE WITHOUT EXPLICIT APPROVAL)

1. **Child IDs as JSON in `telegramParentLink`**: Staleness window of 30 days (thread state TTL) when new children are enrolled. Acceptable — rare event.
2. **One-time MySQL reads at connect time**: 3 queries (`sm_parents` + `sm_students` + `sm_schools`) per parent, ever. The hot path is MySQL-free.
3. **`schoolId` cached in link table**: Changing schools is extremely rare. TTL self-heals. No special invalidation.
4. **`createMemoryState()`**: In-memory state survives graceful restarts. Lost on process crash. Acceptable for single-process deployment.
5. **No `Telegraf` or other bot framework**: Chat SDK is the chosen abstraction. Do not introduce additional Telegram SDKs.
6. **PDF via tool base64**: `downloadChildPdfTool` embeds the PDF buffer in its output. Gateway detects the tool result and sends via Chat SDK file upload. Base64 doubles memory but avoids fetching the PDF a second time.
7. **Single fallback failure message**: One consistent message with school contact info for all error types. Simple, predictable, and tells the parent exactly what to do.

## File-by-File Change Summary

| File | Action |
|------|--------|
| `package.json` | Add 3 deps (`chat`, `@chat-adapter/telegram`, `@chat-adapter/state-memory`) |
| `app-db.schema.ts` | Add 2 tables (`telegramParentLink` + `connectTokens`) with school contact fields |
| `bot.ts` | Full rewrite → export `createTelegramAdapter()` |
| `gateway.ts` | Full rewrite → Chat SDK `Chat` instance with handlers, thread state, PDF detection |
| `connect-tokens.ts` | Full rewrite → libSQL Drizzle query builder |
| `parent-permissions.ts` | Add `schoolName`, `schoolPhone`, `schoolEmail` to `ParentContext` class |
| `download-child-pdf.ts` | Extend output → add `pdfBase64` + `filename` fields |
| `instructions.ts` | Verify school contact fields are injected into agent instructions |
| `parent.skill.md` | Replace persona with School Concierge framing |
| `webhook/+server.ts` | Simplify to one-liner `bot.webhooks.telegram(request)` |
| `connect-telegram/+server.ts` | No change (token store swapped internally) |
| `connect/+page.server.ts` | No change |
| `connect/+page.svelte` | No change |
| `scripts/migrate-telegram-links.ts` | New file — backfill from MySQL |
| `1730000000_telegram.sql` | Delete (after backfill verified) |
| MySQL `connect_tokens` table | Drop (after backfill verified) |
