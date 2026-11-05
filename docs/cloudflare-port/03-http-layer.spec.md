# 03 — HTTP Layer Specification (Hono)

API surface for the EdApex Hono backend on Cloudflare Workers. Handlers are thin: validate, call a service, return a DTO. No handler touches the database.

Generated inventory: [03b-endpoint-map.md](./03b-endpoint-map.md).

---

## 1. Scope

### 1.1 Measured current surface

| Metric | Value |
|---|---|
| Files scanned | 44 |
| Endpoint handler exports | **55** (GET 21, POST 31, PUT 1, DELETE 2) |
| In scope — catalog only | 8 |
| In scope — mixed catalog + app-db | 16 |
| Out of scope — app-db/Mastra only | 20 |

**Scope rule:** an endpoint is in scope when its request needs catalog data, even if it also touches app-db. Mixed endpoints are in scope because they cannot function without the ported tables.

### 1.2 Deferred to the app-db/edge spec

Four mixed endpoints touch catalog tables incidentally — a single import for a lookup — while their primary data path is app-db or object storage. They are listed as deferred rather than silently dropped, and each states the measured reason:

| Endpoint | Catalog imports | Primary data path | Decision |
|---|---|---|---|
| `rpc:agent` | 1 (`smGeneralSettings`) | app-db credentials, model visibility | Deferred |
| `rpc:chat` | 1 (`smStudents`, for mentions) | Mastra threads/messages | Deferred |
| `/api/file/[...path]` | 1 | R2 object storage | Deferred |
| `/api/format-document` | 1 | document formatting | Deferred |

Everything else in the generated "in" and "in (mixed)" rows is in scope for this spec.

### 1.3 What this layer owns

Routing, request validation, authentication and tenant resolution, response shaping, status codes, CORS, rate limiting, and the error envelope.

It does **not** own: business rules ([02](./02-service-layer.spec.md)), data access ([01](./01-repository-layer.spec.md)), or persistence ([01a](./01a-d1-optimization.playbook.md)).

---

## 2. Principles

| Rule | Statement | Enforcement |
|---|---|---|
| **H1** | A handler validates input, calls one service method, and returns a DTO. No SQL, no `c.env.DB`, no business branching beyond mapping a service result to a status. | Import-boundary test: `http/routes/**` may not import `repository/` or `db/` |
| **H2** | Every request input is parsed by `zValidator` for `json`, `query`, or `param`. Bare `await c.req.json()` is banned. | grep ban + review |
| **H3** | Route declarations are **method-chained** (`.get().post()…`) and `AppType` is exported from `app.ts`. Without chaining, `hc<AppType>` infers nothing. | Type test asserting every path exists on the client type |
| **H4** | One error envelope produced centrally by `app.onError`; handlers never build error JSON. | Error-mapping tests per status (§5.3) |
| **H5** | Auth and tenant reach handlers only through context variables (`c.get('user')`, `c.get('tenant')`). No handler reads a cookie or header directly. | grep ban on `c.req.header('cookie')` in routes |
| **H6** | No fallback tenant. Missing class/section returns **422 `TENANT_SCOPE_REQUIRED`** with the existing body shape. | Contract test against the current client helper ([tenant-scope.ts](../../src/lib/api/tenant-scope.ts)) |
| **H7** | Responses are explicit DTOs. DB rows are never serialized directly. | DTO snapshot tests; lint ban on returning `$inferSelect` objects |
| **H8** | List endpoints use the keyset contract `{ rows, nextCursor }` from [01 §9.3](./01-repository-layer.spec.md). | Response-schema test |
| **H9** | Status codes are limited to: 200, 201, 204, 400, 401, 403, 404, 409, 422, 429, 502. | Error-mapping tests |
| **H10** | Route modules mirror service aggregates and stay under ~300 lines. | Review + tree in §3 |
| **H11** | Public token routes live on a separate unauthenticated router with signed, expiring tokens and strict rate limits. | Router isolation test: the public router has no auth middleware |
| **H12** | CORS is an explicit origin allowlist with credentials. No wildcard on authenticated routes. | Config test |

---

## 3. Application structure

```text
src/lib/server/http/
  app.ts                  // Hono app, chained, exports AppType
  middleware/
    request-id.ts         // c.set('requestId', crypto.randomUUID())
    logger.ts             // structured JSON, no PII, no bodies
    cors.ts               // allowlist + credentials
    body-limit.ts         // reject oversized payloads before parsing
    rate-limit.ts         // D1/KV-backed counters
    auth.ts               // session cookie → c.set('user')
    tenant.ts             // → c.set('tenant'), 422 when incomplete
    error-handler.ts      // app.onError → envelope
    not-found.ts          // app.notFound → 404 envelope
  routes/
    index.ts              // mounts aggregate routers under /api/v1
    accounts.routes.ts
    profiles.routes.ts
    academics.routes.ts
    assessments.routes.ts
    attendance.routes.ts
    fees.routes.ts
    school.routes.ts
    communications.routes.ts
    public.routes.ts      // token routes, no auth
    health.routes.ts
  schemas/                // zod request + response schemas per aggregate
  dto/                    // row → response mappers per aggregate
src/worker.ts             // export default app (Workers entry)
src/lib/http/client.ts    // hc<AppType> browser client
```

### 3.1 Path conventions

| Rule | Example |
|---|---|
| Versioned base | `/api/v1` |
| Plural nouns for resources | `/api/v1/students`, `/api/v1/exams` |
| Verbs only for non-CRUD actions | `POST /api/v1/results/:id/publish` |
| Nested one level for owned resources | `/api/v1/students/:id/records` |
| Query parameters for filtering and pagination | `?classId=6&sectionId=3&limit=50&cursor=…` |
| Public token URLs are opaque and unversioned | `/r/:token` |

### 3.2 Handler shape

```ts
export const assessments = new Hono<{ Variables: AppVariables }>()
  .post('/results/:id/publish',
    zValidator('param', z.object({ id: z.coerce.number().int().positive() })),
    zValidator('json', publishBodySchema),
    async (c) => {
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');
      const result = await createService(PublishService, c.get('ctx')).publish(id, body);
      return c.json(toPublishDto(result), 200);
    }
  );
```

The handler has no try/catch: failures propagate to `app.onError` (H4).

## 4. Middleware chain

Order matters. Each row states why it sits where it does and what skips it.

| # | Middleware | Sets | Why here | Skipped by |
|---|---|---|---|---|
| 1 | `request-id` | `c.set('requestId', uuid)` | The logger and the error envelope both need it | — |
| 2 | `logger` | duration, status, path | Must wrap everything downstream, including failures | — |
| 3 | `cors` | allowlist headers; answers `OPTIONS` early | Preflight carries no cookies, so it must run before auth | — |
| 4 | `body-limit` | — | Reject oversized payloads before any parsing cost | upload route raises the limit explicitly |
| 5 | `rate-limit` | — | Runs before auth so brute-force attempts are counted even when unauthenticated | `health` |
| 6 | `auth` | `c.set('user', …)` | Needs the rate-limit decision already made | public router, `health` |
| 7 | `tenant` | `c.set('tenant', …)` | Needs a resolved user | public router, `health` |
| 8 | router | — | — | — |

`app.onError` and `app.notFound` are **not** middleware; they are the outermost boundary and run for every failure, including middleware failures. Handlers therefore contain no `try/catch` (H4).

---

## 5. Contracts

### 5.1 Input validation

- `zValidator('param', …)` and `zValidator('query', …)` schemas use `z.coerce.number()` where the wire type is a string.
- Bodies use `zValidator('json', …)` with `.strict()` objects — unknown keys are rejected rather than silently ignored.
- No handler calls `c.req.json()`, `c.req.parseBody()`, or reads `c.req.header()` directly (H2, H5).
- Body limit: 1 MB JSON; the upload route declares its own multi-megabyte limit.

### 5.2 Success responses

- Return the DTO directly — no `{ success: true }` wrapper. HTTP status carries success.
- `201` for creates that return a representation; `204` with no body for deletes.
- `Cache-Control: private, max-age=60` for user-scoped reads; `no-store` for auth responses.

> The current endpoints wrap payloads in `{ success, … }`. That wrapper is **not** carried forward: it duplicates information the status code already carries and forces every client call site to unwrap.

### 5.3 Error envelope

Flat, matching the existing tenant-scope contract so the current client keeps working:

```json
{ "error": "NOT_FOUND", "message": "Student 42 not found", "requestId": "9f2c…" }
```

| Code | Status | Raised by |
|---|---|---|
| `VALIDATION_FAILED` | 400 | validator middleware |
| `UNAUTHENTICATED` | 401 | auth middleware |
| `FORBIDDEN` | 403 | authorization service |
| `TENANT_MISMATCH` | 403 | tenant / workspace checks |
| `NOT_FOUND` | 404 | `DbEntityNotFoundError` |
| `CONFLICT` | 409 | unique-constraint translation |
| `AMBIGUOUS_EMAIL` | 409 | identity linking ([04 §5](./04-auth-identity.spec.md)) |
| `TENANT_SCOPE_REQUIRED` | **422** | tenant middleware, exact legacy body |
| `RATE_LIMITED` | 429 | rate-limit middleware |
| `INTERNAL_ERROR` | 500 | unhandled |
| `UPSTREAM_FAILURE` | 502 | `PortError` from email/OCR adapters |

The 422 body is byte-compatible with today's contract:

```json
{ "error": "TENANT_SCOPE_REQUIRED", "message": "Pick a class and section to continue." }
```

No stack traces, SQL fragments, or driver messages ever reach the client; the `requestId` is the join key to server logs.

### 5.4 Pagination

```ts
{ rows: T[], nextCursor: string | null }
```

`limit` is clamped server-side (default 50, max 200). `cursor` is opaque. `OFFSET` is not accepted ([01a O10](./01a-d1-optimization.playbook.md)).

### 5.5 Content types

- `application/json` for everything except the upload route.
- `multipart/form-data` only on `/api/v1/uploads`, which streams to R2 and never buffers the whole file.
- Responses set `Content-Type` explicitly; `c.json` handles this.

---

## 6. Authentication and tenancy

### 6.1 Session

- Cookie `__Host-edapex_session`: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, no `Domain`.
- The value is an opaque 256-bit token; the server stores only its SHA-256 ([04 §2.2](./04-auth-identity.spec.md)).
- `auth` middleware hashes the cookie value, looks up one indexed row, and sets `c.var.user`. One query, inside the ≤10 budget.

### 6.2 Context variables

```ts
interface AppVariables {
  requestId: string;
  user: { id: number; schoolId: number; roleId: number | null; designationId: number | null } | null;
  tenant: TenantContext | null;
  ctx: ServiceContext;
}
```

`ServiceContext` is built once, after tenant resolution, and shared by every handler in the request ([02 §4.2](./02-service-layer.spec.md)).

### 6.3 How the tenant arrives

The active class/section is **not** part of the session; a teacher can switch classes without re-authenticating. It travels as explicit request headers:

| Header | Required for | Validation |
|---|---|---|
| `X-Academic-Id` | all tenant-scoped routes | positive integer, belongs to `schoolId` |
| `X-Class-Id` | routes needing class scope | positive integer, belongs to `schoolId` |
| `X-Section-Id` | routes needing section scope | positive integer, belongs to class |

Decision: headers rather than query parameters, because they apply identically to `GET` and `POST` and keep payload schemas free of ambient context.

> Compatibility note: the upload route currently accepts `classId`/`sectionId` as form fields ([uploads/+server.ts:75](../../src/routes/api/uploads/+server.ts#L75)). That fallback survives only for the upload endpoint during migration.

### 6.4 Missing tenant scope

When a route requires class/section and the headers are absent, `tenant` middleware short-circuits with **422 `TENANT_SCOPE_REQUIRED`** and the legacy message. The client already branches on this exact shape ([tenant-scope.ts](../../src/lib/api/tenant-scope.ts)), so the contract is preserved rather than redesigned.

### 6.5 Public router

`public.routes.ts` is mounted outside the auth middleware chain and serves token URLs (`/r/:token`). It enforces: signed opaque token, expiry check, single resource scope, strict rate limit, and `Cache-Control: no-store`. It never receives `c.var.user` or `c.var.tenant` — a test asserts the middleware chain is absent (H11).

---

## 7. Route modules

| Module | Owns | Mounted at |
|---|---|---|
| `accounts.routes.ts` | session, claim/login, OAuth callback, profile, logout | `/api/v1/auth`, `/api/v1/me` |
| `profiles.routes.ts` | students, parents, staff, roster search, photos | `/api/v1/students`, `/api/v1/parents`, `/api/v1/staff` |
| `academics.routes.ts` | classes, sections, subjects, assignments, timetable | `/api/v1/classes`, `/api/v1/subjects` |
| `assessments.routes.ts` | exams, setups, marks, results, publish, transcript, feedback | `/api/v1/exams`, `/api/v1/results` |
| `attendance.routes.ts` | student and class attendance | `/api/v1/attendance` |
| `fees.routes.ts` | groups, masters, assignments, payments | `/api/v1/fees` |
| `school.routes.ts` | general settings, academic calendar, report templates, academic years | `/api/v1/settings` |
| `communications.routes.ts` | notices, events, holidays | `/api/v1/notices` |
| `public.routes.ts` | token-scoped result/transcript links | `/r` |
| `health.routes.ts` | liveness, no auth | `/health` |

Each module mirrors the service aggregate it calls ([02 §4](./02-service-layer.spec.md)).

---

## 8. Endpoint mapping

The authoritative per-file inventory is [03b-endpoint-map.md](./03b-endpoint-map.md). This table maps every **in-scope** endpoint to its destination.

### 8.1 In-scope endpoints (20)

| Current route | Methods | Destination | Note |
|---|---|---|---|
| `rpc:auth` | 6 remote exports | `accounts.routes` | `signup`, `updatePassword`, `requestReset` retire ([04a](./04a-auth-cutover.spec.md)); `login` becomes the claim flow |
| `/api/[authType]` | POST | `accounts.routes` | Retired; replaced by claim/OAuth |
| `/google` | GET | `accounts.routes` | OAuth callback ([04 §3.2](./04-auth-identity.spec.md)) |
| `rpc:assessment` | 4 commands | `assessments.routes` | PDF, publish, assign, extraction |
| `/api/commit` | POST | `assessments.routes` | Marksheet commit |
| `/api/results/generate-pdf` | POST | `assessments.routes` | |
| `/api/results/[token]` | GET | `public.routes` | Token access, separate unauthenticated router |
| `/api/settings/academic-calendar` | GET, POST | `school.routes` | |
| `/api/settings/general` | GET, POST | `school.routes` | |
| `/api/settings/report-templates` | GET, POST | `school.routes` | `ReportSettingsStore` port |
| `/api/class-roster/toggle-status` | POST | `profiles.routes` | Student activation |
| `/api/photos/claim` | POST | `profiles.routes` | Photo ownership claim |
| `/api/parents/connect-telegram` | POST | `profiles.routes` | Writes app-db link; catalog read for parent |
| `/api/mentions/search` | GET | `profiles.routes` | Student search |
| `/api/uploads` | POST, DELETE | uploads route | Streams to R2; higher body limit |
| `/api/demo/admit` | POST | **retired** | Demo suite removed |
| `/api/demo/commit` | POST, GET | **retired** | |
| `/api/demo/generate` | POST, GET | **retired** | |
| `/api/demo/publish` | POST, GET | **retired** | |
| `/api/demo/validate` | POST, GET | **retired** | |

### 8.2 Deferred endpoints (4)

`rpc:agent`, `rpc:chat`, `/api/file/[...path]`, `/api/format-document` — catalog imports are incidental (measured: 1 each); their primary data path is app-db or R2. Handled by the app-db/edge spec.

### 8.3 Out of scope (20)

AI/editor, chat streaming, model registry, platform providers, potluck, telegram webhooks, OCR direct, `file/share`, `file/shared`, and the remaining demo and settings endpoints. All listed in [03b](./03b-endpoint-map.md) with their scope column.

### 8.4 Page loaders (9)

| Loader | Destination |
|---|---|
| `(auth)/[authType]` | Retired — replaced by the target sign-in page |
| `(auth)/signout` | `POST /api/v1/auth/logout` |
| `(chat)/admin/parents` | `GET /api/v1/parents` |
| `(chat)/class-roster` | `GET /api/v1/students?classId&sectionId` |
| `(chat)/admin/connect-codes` | Out of scope (app-db parent codes) |
| `(chat)/chat`, `(chat)/chat/[chatId]` | Deferred (Mastra threads) |
| `(chat)/filestore` | Deferred (storage spec) |
| `telegram/connect` | Out of scope (app-db) |

Loaders do not become endpoints by default: the SPA calls the same versioned API through `hc<AppType>`.

---

## 9. Migration notes

- **Demo suite retires** — five endpoints removed, not ported.
- **Auth endpoints are replaced, not translated** — `[authType]`, `google`, and the auth remote functions are superseded by [04a](./04a-auth-cutover.spec.md) then [04](./04-auth-identity.spec.md).
- **`{ success }` wrappers are dropped** (§5.2); clients read the status code.
- **Uploads move to R2** with signed URLs; the endpoint keeps `multipart/form-data` and streams.
- **Page loaders become client calls** — the SPA fetches through the typed client, so SSR-specific data shapes disappear.

---

## 10. Developer experience

### 10.1 RPC types without codegen

```ts
// app.ts
export const app = new Hono<{ Variables: AppVariables }>()
  .route('/api/v1', accounts)
  .route('/api/v1', profiles)
  .route('/api/v1', assessments);

export type AppType = typeof app;
```

```ts
// src/lib/http/client.ts
import { hc } from 'hono/client';
import type { AppType } from '$lib/server/http/app';

export const api = hc<AppType>('/');
```

Constraints, both verified against the Hono docs:

1. **Routes must be method-chained.** Declaring `app.get(…)` and `app.post(…)` as separate statements produces a client type with no routes. H3 makes this a review rule and a type test.
2. **Status must be explicit** in `c.json(body, status)` for the response type to be inferred.

### 10.2 Shared schemas

Zod schemas live in `schemas/` and are imported by both the validator and the client where a form is involved. One definition drives runtime validation and compile-time types; no OpenAPI generation step is required.

### 10.3 Client error handling

The envelope is flat, so a single helper works everywhere:

```ts
const res = await api.api.v1.students.$get({ query: { classId: '6' } });
if (!res.ok) {
  const body = await res.json();   // { error, message, requestId }
  throw new ApiError(body.error, body.message, body.requestId);
}
```

`422 TENANT_SCOPE_REQUIRED` flows through the same helper and can be branched on by code ([tenant-scope.ts](../../src/lib/api/tenant-scope.ts) does exactly this today).

### 10.4 Local development

- `wrangler dev` runs the Worker and a local D1; no separate server process.
- `app.request('/api/v1/…')` runs a route in a test with no network and no port.
- No codegen and no OpenAPI dependency in the critical path. If an OpenAPI document is wanted later, `@hono/zod-openapi` can be layered on without changing handlers.

---

## 11. Security

| Control | Requirement |
|---|---|
| CORS | Explicit origin allowlist from env; `credentials: true`; never `*` on authenticated routes |
| Preflight | Answered before auth (middleware order §4); `OPTIONS` never returns 401 |
| CSRF | Cookie auth uses `SameSite=Lax` plus an `Origin` check on every mutating request; a double-submit token is added if the SPA ever becomes cross-site |
| Rate limits | Auth and claim: 5/min per IP and per email; public token routes: 30/min; general API: 120/min per user |
| Request size | 1 MB JSON default; upload route declares its own limit and streams |
| Headers | `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` |
| Token routes | Signed, expiring, single-resource; `no-store`; no session required |
| Error leakage | No stack traces, SQL, or driver messages; `requestId` correlates to logs |
| Tenant isolation | Every tenant-scoped query derives `school_id` from `c.var.tenant`, never from the payload |

---

## 12. Testing and acceptance

### 12.1 Test layers

| Layer | Tool | Covers |
|---|---|---|
| Route unit | `app.request()` under `@cloudflare/vitest-plugin` | Validation, status codes, DTO shape |
| Contract | same | Every status in §5.3, including the exact 422 body |
| Type | `tsc` | `hc<AppType>` exposes every route |
| Boundary | static | No `repository/` or `db/` import inside `http/routes/**` |
| Middleware | `app.request()` | CORS preflight succeeds unauthenticated; public router has no auth |

### 12.2 Mandatory tests

1. **422 contract** — missing `X-Class-Id` returns `{ error: 'TENANT_SCOPE_REQUIRED', message: 'Pick a class and section to continue.' }` with status 422, byte-identical to today.
2. **Validation** — unknown JSON keys and wrong types return 400 `VALIDATION_FAILED` with the field path.
3. **Type coverage** — a test file calls every route through `hc<AppType>`; deleting a route breaks compilation.
4. **Boundary** — a route handler importing `repository` or `db` fails the build.
5. **Public router isolation** — `/r/:token` works without a session; a forged/expired token returns 404, not 401.
6. **CORS** — preflight from an allowlisted origin returns 204 before auth; a non-allowlisted origin gets no CORS headers.

### 12.3 Acceptance criteria

- [ ] `AppType` exported; `hc<AppType>` compiles for every route
- [ ] Every route method-chained (H3)
- [ ] All 20 in-scope endpoints mapped or explicitly retired
- [ ] Flat error envelope everywhere; 422 body unchanged
- [ ] No handler imports `repository/` or `db/`
- [ ] Middleware order matches §4
- [ ] Public router mounted outside auth
- [ ] Contract, type, boundary, and CORS tests green

### 12.4 What this spec does not cover

The app-db/edge endpoints (agent, chat, files, formatting), the service implementations ([02](./02-service-layer.spec.md)), the repository layer ([01](./01-repository-layer.spec.md)), and the D1 migration runbook (`05`).
