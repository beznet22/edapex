# 47 — Performance and Memory Budgets

**Status:** v1 implementation standard. These are release gates, not aspirations.

## Hosting decision

Cloudflare Pages supports SSR through Pages Functions, but v1 uses **static Pages + Worker API**.

- No Pages Functions or SSR in v1.
- If SSR is adopted later, use **Workers with static assets**, not Pages Functions.
- SSR is allowed only for public/SEO routes.
- Authenticated layouts, chat, editor, documents and agent surfaces remain client-rendered.
- No school data or session token is rendered into HTML or cached at the edge.

Reason: the current bottleneck is backend response time, not client rendering. SSR would move work to TTFB, lose edge caching, and add cookie/PII risk for no measured gain.

## Budgets

| Metric | Budget | Gate |
|---|---|---|
| Initial route JavaScript | ≤150 KB gzip | build size check |
| Initial route CSS | ≤30 KB gzip | build size check |
| LCP | ≤2.5 s mid-tier mobile | Lighthouse/RUM |
| INP | ≤200 ms | RUM |
| CLS | ≤0.1 | Lighthouse/RUM |
| Directory snapshot p95 | ≤800 ms | benchmark |
| Directory page change | 0 API requests | code review |
| Identity/query round trips | ≤10 per endpoint | API test |
| D1 bound parameters | ≤100 per statement | repository guard |
| Directory snapshot copies | 1 in memory | code review |
| Page working set | ≤20 MB | memory profile |
| School data in PWA/cache | 0 | security review |
| Initial document-engine bundle | 0 bytes | bundle scan |
| IronPress/PDF.js/Mammoth/docx/PapaParse | lazy chunk | bundle scan |

Current measured baseline (2026-11-09): initial JS **106 KB gzip**, CSS **6.2 KB gzip**, directory snapshot **581 rows / 200 KB**. Parallelizing the four D1 reads improved the first snapshot from **~3.7 s to ~1.9–2.5 s**, which still misses the 800 ms budget. The miss is recorded as a performance exception; the next optimization target is a single cached/read-optimized snapshot path.

## Loading rules

- Any data-bound or lazy route with a blank-layout risk must define a skeleton.
- Use **Boneyard** for table, list and panel skeletons; shadcn `Skeleton`/a static fallback is the fallback.
- Do not show a skeleton for work expected to finish in under 150–200 ms.
- If stale data exists, show stale data, not a skeleton.
- Bones must match the final layout at 375/768/1280 and must not cause layout shift.
- Respect `prefers-reduced-motion`; disable pulse/shimmer when reduced.
- Generated bones are reviewed source and fixtures use synthetic data only.
- Boneyard is a dev/build-time generator; no headless Chromium in production.
- Route-level code splitting.
- IronPress WASM, PDF.js worker/cmaps, Mammoth, `docx`, PapaParse and Tiptap extensions load only when used.
- No import of whole icon or component barrels.
- Hashed immutable assets; Brotli/HTTP3; no external font dependency.
- PWA caches the app shell only; never API responses or school data.
- HTML is `no-store` while data is dynamic.

## Directory and list rules

- One snapshot per filter set; paginate locally in memory.
- One copy of the snapshot; derive page slices.
- Default page size 50; maximum snapshot 1,000.
- Filters/search trigger one snapshot, not one request per keystroke; debounce search at 250–300 ms.
- Abort in-flight requests when filters change.
- Optimistic link revoke; refresh on explicit action or TTL.
- Do not put staff/parent PII in `localStorage`, `sessionStorage`, IndexedDB, service workers or iroh.

## Worker and D1 rules

- Run independent D1 reads in parallel.
- Select only columns the screen needs.
- Use indexes; no unbounded `IN`.
- Keep endpoints within 10 D1 statements and 100 binds.
- Cache public/reference data only; never tenant/PII data.
- Measure cold start and p95 after every Worker deploy.

## Document and editor rules

- Upload caps from `22-documents-and-artifacts.md` are hard limits.
- Parse in Web Workers; terminate workers after completion.
- Do not retain file bytes, base64, PDFs, DOCX or CSV rows longer than the open document requires.
- Release object URLs and document-engine instances on close.
- OpenUI output is bounded by `21-generative-ui-openui.md`; reject oversized surfaces.
- Tiptap remains the editor; no full formatting toolbar and no Novel package.

## Measurement

Every release records:

- build output sizes;
- directory snapshot count/bytes/p50/p95;
- Worker startup and CPU p95;
- D1 query count and rows read/written;
- LCP/INP/CLS on a defined mid-tier device;
- document-engine chunk sizes and first-export time.

Measurements are device/date-stamped. No invented benchmark numbers.

## Acceptance

- Budgets are enforced in CI or review.
- No initial document-engine bundle.
- No duplicate directory snapshot in memory.
- Snapshot p95 ≤800 ms after parallelization, or a recorded exception with an owner and follow-up.
- No Pages Functions/SSR in v1.
- No PII in client caches.
- Performance regressions are release blockers.
