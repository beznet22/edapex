# EdApex → Hono on Cloudflare: port specification suite

Low-level specs for porting the EdApex backend to a Hono API on Cloudflare Workers with D1. Each document is written to be implementable without reference to the conversation that produced it.

**Implementing the port?** Start with [ROADMAP.md](./ROADMAP.md) — it contains the working agreement for coding agents and one executable brief per phase, with gates. **Progress** is tracked in [PROGRESS.md](./PROGRESS.md); **port code** lands in [`apps/api/`](../../apps/api/README.md) (service README, agent rules in [apps/api/AGENTS.md](../../apps/api/AGENTS.md)).

**Current status:** Phase 8 is complete. Phase 9 platform is preview-deployed: migration `0006` applied, Worker `bfa72530` live, Pages at `edapex-web.pages.dev`. `app.llacademy.ng` is attached but pending DNS/certificate. `/claim` and shared password digests are intentionally retained until workspace **10G.2**; student-code issuance, duplicate-email resolution and staff/parent coverage are **10G.1**.

## Porting scope is defined by the catalog

[`schema-catalog.md`](./schema-catalog.md) is the **authoritative list of legacy SMS tables**. The 49 tables it catalogs plus the 13 FK-closure tables it recommends are the only ones migrated from MySQL — **62 legacy tables**.

The *target* schema is larger, because the redesign introduces new tables (auth, promotion, archive, jobs). Those are expected. What is forbidden is porting legacy tables that are not in the catalog.

Rules, to prevent scope drift between code, schema, and migration:

1. **Only the 62 cataloged legacy tables may be migrated from MySQL.** A table outside this set is not ported even if it exists in the dump.
2. **New tables are allowed when a spec owns them.** `auth_*`, `promotion_batches`, `promotion_outcomes`, `archive_objects`, `session_jobs`, `session_result_summary`, and `migration_resolutions` are declared by `04`, `05`, and `06`. They never import data from MySQL.
3. No cataloged legacy table may be dropped silently — removal is a catalog change first, reviewed as such.
4. A code change that appears to need a new *legacy* table updates the catalog and the closure count **before** the migration; until then it is out of scope.
5. After any table or route change, regenerate the generated artifacts: `01b`, `03b`, the migration order, and the integrity report.
6. CI enforces the boundary: the catalog verifier reports 49 rows, the specs assert **62 legacy tables**, and the new-table list matches the owning specs.
7. If a spec and the catalog disagree about which **legacy** tables exist, the catalog wins and the spec is wrong.

## Decisions of record

| Decision | Value |
|---|---|
| Runtime | Hono on Cloudflare Workers |
| Persistence | **D1 (SQLite)** — not MySQL/Hyperdrive |
| Port surface | **62 legacy tables** = 49 cataloged + 13 FK-closure; redesigned tables are specified separately |
| Out of scope | `newsletters` (declared, absent from DB) and the five legacy `ai_*` tables (present, decommissioned) |
| Deployment | **Workers Free** — Gmail OAuth2 delivers mail; no Paid fallback. D1 writes are account-wide and capped at 100k/day. |
| CPU target | Claim flow designed to **10 ms** per invocation |
| Auth | Two-phase: transitional claim flow, then social sign-in + magic link + student codes |
| Hashing | No bcrypt anywhere; SHA-256 for high-entropy tokens; **no KDF on the claim path** |
| Repository layout | `accounts/` + `profiles/{student,staff,parent}` + `reference/` + domain folders |
| Path naming | Existing tree stays at `src/lib/server/repository/` (singular); new code uses `src/lib/server/services/` (plural) — avoids churning 47+ importers mid-port; revisit after cutover |
| Report cards | Draft → reviewed → published; corrections create a new version, never mutate the issued one |
| Grade changes | Locked after term closure; admin override requires a reason and writes an audit row |
| Retention | Transcripts permanent; attendance/homework/chat ~7 years; parents read-only |
| Archive deletion | Two admins + typed confirmation + audit; blocked during restores |
| Repository layout | `apps/api/` is the **EdApex API service** — a deployable, UI-less backend consumed by the frontend apps — and becomes a pnpm workspace package. `apps/` is the deployable bucket; no separate repository or extraction step |

## Spec index

| Document | Status | Covers |
|---|---|---|
| [`ROADMAP.md`](./ROADMAP.md) | ✅ done | Agent instructions, phase order (0–9), per-phase briefs, gates |
| [`PROGRESS.md`](./PROGRESS.md) | ✅ done | Live phase status, gate checklists, change log, blockers |
| [`schema-catalog.md`](./schema-catalog.md) | ✅ done | The 49 in-use tables, their keys, relations, rationale, and the 23 recommended additions |
| [`01a-d1-optimization.playbook.md`](./01a-d1-optimization.playbook.md) | ✅ done | D1 limits (tier split), the 50-vs-1,000 measurement task, five optimization tiers, chunk helpers, `sm_general_settings` split, CPU/hashing budget |
| [`01-repository-layer.spec.md`](./01-repository-layer.spec.md) | ✅ done | Target tree, aggregate→table mapping, rules R1–R9, base-class redesign, tenancy, errors, transactions, DX, testing |
| [`01b-repository-migration-map.md`](./01b-repository-migration-map.md) | ✅ done | Every repository method → destination module → D1 hazard flag |
| [`04-auth-identity.spec.md`](./04-auth-identity.spec.md) | ✅ done | Target auth: identity, magic link, social, student codes, sessions |
| [`04a-auth-cutover.spec.md`](./04a-auth-cutover.spec.md) | ✅ done | Transitional claim flow, one-time password reset, admin duplicate utility, risk controls, exit criteria |
| [`02-service-layer.spec.md`](./02-service-layer.spec.md) | ✅ done | Service scope (5 catalog-facing services), eight principles, dependency matrix, ports/adapters, 53-method mapping, runtime replacements, error ownership |
| [`03-http-layer.spec.md`](./03-http-layer.spec.md) | ✅ done | Hono routes, middleware order, flat error envelope, 422 contract, RPC DX, security, 20 in-scope endpoint mappings |
| [`03b-endpoint-map.md`](./03b-endpoint-map.md) | ✅ done | Generated inventory of 44 route files / 55 handlers with scope classification |
| [`05-d1-migration.spec.md`](./05-d1-migration.spec.md) | ✅ done | Source-of-truth rules, what moves/archives, integrity gate, transform rules, load tiers, bootstrap endpoint, class-by-class promotion, cutover |
| [`06-archive-and-retrieval.spec.md`](./06-archive-and-retrieval.spec.md) | ✅ done | R2 object layout, assembled-marksheet archive, report-card versioning, marksheet/transcript retrieval, archive/restore/purge, retention |

## Design principles

The rules below apply to every document in the suite. Where a rule has an ID, the linked spec is authoritative — this section is the index, not a second source of truth.

### Layering and dependencies

| Principle | Rule | Authority |
|---|---|---|
| One direction | routes → services → repositories; `domain/` depends on nothing; adapters implement ports | [02 §3](./02-service-layer.spec.md) |
| No leakage | handlers contain no SQL; services contain no SQL; repositories contain no orchestration | [01 R2](./01-repository-layer.spec.md), [03 H1](./03-http-layer.spec.md) |
| One construction path | `ServiceContext` built per request; `createService` is the only factory; no module singletons | [02 P3](./02-service-layer.spec.md) |
| No service-to-service imports | composition happens in the context or via an injected interface | [02 P4](./02-service-layer.spec.md) |
| Tenant-first queries | every query carries `school_id` from the request context; there is no fallback tenant | [01 R5](./01-repository-layer.spec.md), [03 H6](./03-http-layer.spec.md) |
| Ports at the edge | email, OCR, report storage and clock are interfaces with one adapter each | [02 P2](./02-service-layer.spec.md) |
| Pure domain modules | computation (marks, grades, OCR mapping) has no I/O and needs no runtime to test | [02 P1](./02-service-layer.spec.md) |
| No thin passthroughs | a service method that forwards one repository call is deleted; routes call the repository | [02 P5](./02-service-layer.spec.md) |

### Platform rules (D1)

| Principle | Rule | Authority |
|---|---|---|
| Batch, never `BEGIN` | no `db.transaction`; multi-statement writes go through `db.batch` | [01 R6](./01-repository-layer.spec.md) |
| Chunked binds | ≤95 ids per `IN`, ≤100 bound parameters per statement | [01a O4](./01a-d1-optimization.playbook.md) |
| Column cap | every table ≤100 columns; `sm_general_settings` is split | [01a O3](./01a-d1-optimization.playbook.md) |
| Query budget | ≤10 statements per endpoint | [01a O15](./01a-d1-optimization.playbook.md) |
| Keyset pagination | `{ rows, nextCursor }`; no `OFFSET` | [01a O10](./01a-d1-optimization.playbook.md) |
| One date encoding | integer epoch timestamps, ISO date text — never mixed | [01a O20](./01a-d1-optimization.playbook.md) |

### Contracts and integrity

| Principle | Rule | Authority |
|---|---|---|
| Type safety | no `any`/`as any`; explicit return types; row and input types inferred from Drizzle/Zod | [01 R4](./01-repository-layer.spec.md) |
| Error ownership | repositories raise `Db*`; services raise validation/auth/permission/tenant errors; HTTP maps once | [01 §7](./01-repository-layer.spec.md), [02 §7](./02-service-layer.spec.md) |
| One flat envelope | `{ error, message, requestId }`, including the 422 tenant contract | [03 §5.3](./03-http-layer.spec.md) |
| Issued documents are immutable | report cards are versioned; corrections supersede, never overwrite | [06 §4](./06-archive-and-retrieval.spec.md) |
| Dual control for destruction | archive wipe needs two admins, a typed confirmation, and an audit row | [06 §6](./06-archive-and-retrieval.spec.md) |
| Generated, not hand-maintained | inventories and maps come from scripts and are regenerated after schema or route changes | [README](#verification) |
| Justified renames | allowed only after an exhaustive call-site audit; old → new recorded in the migration map | [02 Renaming policy](./02-service-layer.spec.md) |

### File-size caps

| Layer | Soft cap | Rationale | Authority |
|---|---|---|---|
| Repository file | **300 lines** | one aggregate; `student.repo.ts` at 1,275 lines is the cautionary example | [01 R7](./01-repository-layer.spec.md) |
| Service file | **400 lines** | carries orchestration, error translation and port calls, so it gets modest headroom | [02 P8](./02-service-layer.spec.md) |
| Route module | **300 lines** | one aggregate per module; handlers stay ≤15 lines each | [03 H10](./03-http-layer.spec.md) |
| Domain module | ~200 lines | pure functions; split by concept (marks, grades, mapping) | [02 §4](./02-service-layer.spec.md) |
| Spec document | no cap | length is allowed, but inventories belong in generated companions (`01b`, `03b`) | this README |

Exceeding a cap is a signal that the file owns more than one responsibility — split it rather than raising the limit. A documented exception is acceptable for repositories and services; there is no exception for route modules or domain modules.

## Measured baseline

Numbers below come from read-only introspection of the development database, not estimates.

| Metric | Value | Source |
|---|---|---|
| Tables in database / declared in schema | 316 / 311 | `scripts/introspect-mysql.mjs` |
| Ported subset | 74.0 MB of 161.7 MB | same |
| Indexes in DB / declared in schema | 1,041 / 4 (**222 missing from schema** on ported tables) | same |
| Widest table | `sm_general_settings`, **106 columns** (D1 cap: 100) | same |
| Hottest table | `sm_mark_stores`, 119,484 rows / 43.2 MB / 9 missing indexes | same |
| Unindexed join table | `chat_group_users`, 10,740 rows, **0 secondary indexes** | same |
| Users / with email | 1,610 / 713 (688 distinct → **25 email collisions**) | auth probe |
| Staff / parents / students | 87 (all emailed) / 567 (489 linked) / 900 (**0 emailed**) | auth probe |
| Password hashes to retire | 1,566 | auth probe |
| SHA-256 / PBKDF2-10k cost | **0.004 ms** / **6.1 ms** | local benchmark |

Raw inventory: `docs/cloudflare-port/audit/db-inventory.json`.

## Reading order

1. `01a` first — the platform limits shape every other decision.
2. `01` then `01b` — architecture before the method-level map.
3. `04a` before `04` — the cutover is what actually ships first; the target auth lands after.

## Verification

```bash
node scripts/verify-schema-catalog.mjs        # catalog rows, anchors, links
node scripts/introspect-mysql.mjs             # refresh the measured baseline
grep -rn 'TBD\|TODO' docs/cloudflare-port/    # must return nothing
```

## Ground rules for every spec in this suite

- Every number is measured or cited; no "should be fine".
- Every file reference is a clickable `path#Lline` link.
- No unresolved `TBD`.
- Anything excluded is named and the reason stated — silent omissions are treated as defects.
