# EdApex (eduprime)

A SvelteKit-based school management platform with a built-in multi-agent AI assistant. EdApex gives schools a tenant-isolated workspace where staff can run structured AI workflows (extract, generate, validate, publish) against live academic data, with explicit workspace boundaries enforced on every tool call.

## Highlights

- **Multi-agent AI chat** powered by [Mastra](https://mastra.ai) — a `supervisor` delegates every user request to an `assistant` agent that, in turn, orchestrates specialised sub-agents (`title`, `editorEdit`, `editorGenerate`, `editorCopilot`, `result-mapper`) under tenant-scoped request context.
- **Sovereign AI storage** on `libSQL` (`mastra.db`) — thread memory, agent routing, and encrypted provider credentials live outside the legacy MySQL `ai_*` tables.
- **Multi-provider gateway** with automatic failover — OpenAI, Anthropic, Groq, DeepSeek, Mistral, NVIDIA NIM, OpenCode, and the OpenGateway (keyless) endpoint all run through one `EdApexGateway`.
- **Tenant isolation** — every Drizzle query and every AI tool is bound to the active `TenantContext` (`schoolId`, `classId`, `staffId`, ...) through `ScopedRepositoryProvider`. Default-tenant singletons are forbidden.
- **Slash-command tools** — eight atomic tools (`searchEntity`, `onboardEntity`, `manageResults`, `assignEntity`, `patchEntity`, `manageAccess`, `switchWorkspace`, `systemStatus`) exposed in chat as `/search`, `/enroll`/`/admit`/`/transfer`, `/grade`/`/mark`/`/attendance`, `/update`, `/suspend`, `/switch`, and `/context`. Plus four workflow tools (`/extract`, `/generate`, `/validate`, `/publish`). A 90% confidence gate is required for any state-mutating intent, 70% for read-only.
- **Skills system** — versioned SKILL.md files in `src/lib/server/mastra/skills/` are hot-reloaded into a per-session `SkillRegistry`.
- **Workspace enforcement** — `route-guard.ts` redirects unauthenticated users to `/login` and unassigned staff to `/pending-assignment`.
- **Rich editor + PDF viewer** — Tiptap-based WYSIWYG editor with markdown round-trip, `@embedpdf` for in-browser PDF rendering.
- **Progressive Web App** — `service-worker.ts` + `PWAContext` for offline-capable install, with a dismissible install prompt.

## Tech Stack

| Layer | Choice |
|---|---|
| App framework | SvelteKit 2 + Svelte 5 (runes) |
| Language | TypeScript 5.9 |
| Primary DB | MySQL via `mysql2` + Drizzle ORM 0.44 |
| AI storage | libSQL (`@libsql/client`) — Mastra Memory + LibSQLStore |
| AI framework | Mastra 1.32 (`@mastra/core`, `@mastra/libsql`, `@mastra/memory`, `@mastra/ai-sdk`) |
| LLM SDK | Vercel AI SDK 6 |
| Auth | Custom session service on Drizzle + `jose` (JWT/JWE) for token signing |
| Editor | Tiptap 3 + `tiptap-markdown` |
| PDF | `@embedpdf/*` 2.14 |
| UI | shadcn-svelte (`bits-ui`, `tailwind-variants`) + bespoke "Gold on Slate" `oklch` tokens in `src/routes/layout.css` |
| Email | `nodemailer` (SMTP) |
| Testing | Vitest 4 + `fast-check` for property tests |
| Adapter | `@sveltejs/adapter-node` (standalone Bun/Node server) |
| Runtime | Bun (build/start) |

## Repository Layout

```
src/
  routes/
    (auth)/                  # /login, /signup, /forgot-password, /google, /signout
    (chat)/                  # authenticated chat surface
      chat/[chatId]/         # individual thread view
      demo/                  # sandboxed demo flow
      filestore/             # file-store landing page
    api/                     # server-side endpoints
      ai/                    # AI runtime (chat, discover, providers, settings)
      auth/                  # session / sign-in RPC
      chat/                  # chat history, sidebars, mentions
      file/                  # file upload + PDF artifact endpoints
      mentions/              # @-mention resolver endpoint
      models/                # model registry
      results/               # assessment results publish flow
      settings/              # user settings
      student-files/         # per-student file storage
      uploads/               # bulk upload endpoints
  lib/
    components/              # shadcn-svelte + ai-elements + prompt-kit UI
    server/
      db/                    # MySQL Drizzle schema + connection pool
      repository/            # Drizzle repositories (BaseRepository, scoped factory)
      service/               # AssessmentService, auth.service, etc.
      mastra/                # agents, tools, workflows, gateway, storage
        agents/              # supervisor + 6 specialised agents
        tools/               # 8 atomic + 4 workflow tools
        workflows/           # editor-command, extraction, generate, publish, validation
        skills/              # *.skill.md — hot-reloaded skill definitions
        gateway.ts           # EdApexGateway (per-request, multi-provider)
        tenant-context.ts    # TenantContext + buildMastraToolContext bridge
        scoped-repository.ts # per-request repo factory
        storage.ts           # singleton libSQL storage
    workers/                 # web-worker entry points
tests/                       # end-to-end test suite
docs/                        # responsive_design, agent migration prompt, plans
drizzle/                     # generated MySQL migrations
storage/                     # runtime uploads + mastra.db (gitignored)
```

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 9+
- A reachable MySQL 8 instance
- Optional: Bun (used by `pnpm start`)

### Install

```sh
pnpm install
```

### Configure

Copy `.env.example` to `.env` and fill in:

```sh
DATABASE_URL="mysql://user:password@host:3306/edapex"
JWT_SIGN_SECRET="<random 32+ chars>"
JWE_ENC_SECRET="<random 32+ chars>"
FILE_SHARE_SECRET="<random 32+ chars>"

# AES-256 key for encrypting user-supplied provider API keys in libSQL
TOKEN_ENCRYPTION_KEY="<base64 from: node -e \"console.log(crypto.randomBytes(32).toString('base64'))\">"

# LLM providers (at least one)
GROQ_API_KEY=...
DEEPSEEK_API_KEY=...
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...

# SMTP for outbound mail
SMTP_HOST=...
SMTP_USER=...
SMTP_PASS=...
```

### Database

```sh
pnpm db:generate    # generate a Drizzle migration from schema diffs
pnpm db:migrate     # apply migrations to DATABASE_URL
pnpm db:studio      # browse data in Drizzle Studio
```

### Develop

```sh
pnpm dev            # start the Vite dev server (default :5173)
```

### Build & Run (production)

```sh
pnpm build          # bundles the SvelteKit app and the worker
pnpm start          # runs the built server with Bun
```

A production-ready `Dockerfile` and `compose.yml` are included — the image is published to `ghcr.io/beznet22/edapex:latest` and expects `STORAGE_DIR`, `DATABASE_URL`, and the JWT/SMTP secrets mounted as env.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Vite dev server with HMR |
| `pnpm build` | SvelteKit production build + worker build |
| `pnpm start` | Run the built Node/Bun server |
| `pnpm check` | `svelte-kit sync` + `svelte-check` (TypeScript) |
| `pnpm check:watch` | Same, in watch mode |
| `pnpm test` | Vitest single-run (CI) |
| `pnpm db:generate` | Generate a Drizzle migration from schema changes |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:push` | Push schema directly (dev only) |
| `pnpm db:studio` | Open Drizzle Studio |

## Testing

The project has **606 passing tests** organised by concern:

```sh
pnpm test src/lib/server/mastra/__tests__/gateway.test.ts   # one suite
pnpm test tests/sidebar-threads.test.ts                      # another suite
pnpm test                                                    # all 35 suites
```

Test DB files are written to `tests/.tmp/` (gitignored) — see [Test directories](#test-directories) below.

### Test layout

- `src/lib/server/mastra/__tests__/` — bridge, gateway, workflows, tools, agents
- `src/lib/server/__tests__/` — singleton / migration regressions
- `src/lib/server/service/__tests__/` — service-layer contracts
- `src/lib/server/repository/__tests__/` — repository contracts
- `tests/` — cross-cutting integration and module-shape tests

### Test directories

Auto-generated test artifacts land in `tests/.tmp/` (gitignored). This includes SQLite `.db`, `.db-shm`, and `.db-wal` files produced by libSQL-backed suites. The directory is created on first test run.

## Architecture Notes

### Tenant isolation

Every request that touches data or AI is expected to flow through a single `TenantContext` (`src/lib/server/mastra/tenant-context.ts`). The `ScopedRepositoryProvider` (`scoped-repository.ts`) caches per-tenant Drizzle repositories so that callsites never see a default-tenant fallback. The `AssessmentService` is constructed per-request via `createAssessmentServiceForRequest(tenant)` rather than imported as a singleton.

The one documented exception is `authRepo`, which is a singleton because auth operates on session data, not tenant data. This is called out in `src/lib/server/service/auth.service.ts` and `src/lib/api/auth.remote.ts`.

### Mastra gateway lifecycle

`EdApexGateway` extends `MastraModelGateway` and is registered per-request via `mastra.addGateway(gateway)` from route handlers. It never lives in service code. The libSQL storage underneath the Mastra singleton is also per-process (singleton) because SQLite does not support multiple concurrent writers — tenant isolation happens at the `threadId` / `resourceId` level, not the connection level.

### Slash-command confidence gate

State-mutating tool intents (anything other than `/search`, `/status`, `/get`, `/fetch`) require the supervisor to reach **>= 0.9** confidence before the bridge will execute. Read-only intents are gated at **0.7**. This is enforced in `src/lib/server/mastra/router.ts` and the per-tool `*Logic` functions.

### Hot-reloaded skills

SKILL.md files in `src/lib/server/mastra/skills/` are watched by `skill-watcher.ts`; the `SkillRegistry` reloads them on change, so a skill can be edited and verified without restarting the dev server.

## Contributing

See [`AGENTS.md`](./AGENTS.md) for the full agent / contributor contract — package manager choice, file-scoped commands, the EdApex Mastra migration conventions, and the non-negotiable code quality rules. Project-specific design constraints live under [`docs/`](./docs/).
