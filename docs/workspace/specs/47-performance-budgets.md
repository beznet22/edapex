# 47 — Performance and Memory Budgets

**Status:** v1 implementation standard. These are release gates.

## Specification context

This spec owns **measured budgets and release gates**. It does not choose product behavior. `15` owns UI behavior, `17` owns chat state, `19` owns visual primitives and `21` owns generated-UI bounds. When a budget conflicts with a behavior spec, record an exception or change the implementation; do not silently relax the budget.

## Hosting decision

`apps/web` is a **vinext Worker with static assets** at `app.llacademy.ng`. The previous static Pages deployment remains the rollback until the cutover gate.

- No Pages Functions.
- The Worker may render the application shell, but authenticated school data is fetched client-side from `api.llacademy.ng`.
- No school data, session token or private API response is embedded in server-rendered HTML, cached at the edge or stored by the service worker.
- Public/SEO pages may be server-rendered; authenticated surfaces must not depend on SSR for authorization.
- The service worker caches static assets, icons and the offline shell only.

Reason: the web client now shares one React app across PWA and Tauri; a Worker keeps routing and asset deployment together. The prior Pages static-only decision is retained as rollback, not as the target architecture.

## OCR and camera rules

- Local OCR models are assets, not network fetches; missing models fail closed before the first capture.
- Do not hold decoded camera frames after the preview closes. Write one JPEG to app cache, import it, then release the native session.
- Local OCR returns structured lines/confidence; do not send the image to the API for cache hits.
- Cloud OCR is a separate user action and is measured separately; it is not part of the local OCR budget.
- No camera preview on desktop or PWA; no school image in PWA cache, IndexedDB, iroh or git.
- Measure mobile camera cold start, capture-to-OCR latency and peak RSS on the device matrix in `70`; record device/date/build SHA.

## OCR and camera rules

- Local OCR models are assets, not network fetches; missing models fail closed before the first capture.
- Do not hold decoded camera frames after the preview closes. Write one JPEG to app cache, import it, then release the native session.
- Local OCR returns structured lines/confidence; do not send the image to the API for cache hits.
- Cloud OCR is a separate user action and is measured separately; it is not part of the local OCR budget.
- No camera preview on desktop or PWA; no school image in PWA cache, IndexedDB, iroh or git.
- Measure mobile camera cold start, capture-to-OCR latency and peak RSS on the device matrix in `70`; record device/date/build SHA.

## Measurement profile

Release gates are measured with Lighthouse CI mobile emulation (Moto G Power-class device, 4× CPU throttle) on the production Worker build; Pages remains the rollback comparison. Field data via Cloudflare Web Analytics (RUM). Every measurement records device, date and build SHA.

## Budgets

| Metric | Budget | Gate |
|---|---|---|
| Initial route JavaScript | ≤150 KB gzip | build size check |
| Initial route CSS | ≤30 KB gzip | build size check |
| LCP | ≤2.5 s mid-tier mobile | Lighthouse/RUM |
| INP | ≤200 ms | RUM |
| CLS | ≤0.1 | Lighthouse/RUM |
| Directory snapshot p95 | ≤800 ms | benchmark: 581-row production directory, web Worker/PWA build, date-stamped in PROGRESS |
| Directory page change | ≤1 API request (next-page fetch) | code review |
| Identity/query round trips | ≤10 per endpoint | API test |
| D1 bound parameters | ≤100 per statement | repository guard |
| Route working set | ≤20 MB | memory profile |
| School data in PWA/cache | 0 | security review |
| Initial document-engine bundle | 0 bytes | bundle scan |
| IronPress/PDF.js/Mammoth/docx/PapaParse | lazy chunk | bundle scan |

Current measured baseline (2026-11-09, Pages rollback build): initial JS **106 KB gzip**, CSS **6.2 KB gzip**, directory **581 rows / 200 KB**. The 10B vinext build is measured separately; do not treat the Pages number as the Worker build's evidence. Parallelizing four reads (five D1 statements; the directory read fans into staff + parents) improved the first page from **~3.7 s to ~1.9–2.5 s**, which still misses the 800 ms budget. Recorded exception — owner: backend lead (beznet); follow-up: evaluate a cached, read-optimized directory endpoint at 10B close-out.

RustO baseline (2026-11-11, i7-8850H Linux x86_64, 16 AY4 images, 1 warmup + 3 runs): p50 **1,219 ms**, p95 **1,289 ms**, peak RSS **256.5 MiB**, models **6.1 MiB**, mean CER **0.1479**, numeric recall **0.9251**. ocrs was rejected at CER **0.3654** and numeric recall **0.2543**. These are desktop measurements, not mobile guarantees.

### Decision — initial route JS budget (2026-11-14)

**Supersedes** the 150 KB (153,600 B) initial-JS target for the web workspace. That
number came from the Pages rollback build (106 KB JS), which is a different bundler
and a different dependency graph; it was never evidence for the Worker build.

**Measured:** 181,599 B JS gzip and 10,735 B CSS gzip on the vinext build
(Node 26.13.1) for `/workspace`.

**Why the old target could not be met.** The framework floor is 143,211 B on its own:

| Component | gzip |
|---|---|
| `react-dom` | 67,510 |
| vinext runtime | 44,283 |
| vinext browser entry | 31,418 |
| **framework floor** | **143,211** |
| app code | 11,667 |
| `lucide` icons | 10,851 |
| other chunks | 15,870 |

Deleting every icon *and* all application code would still land near 159 KB. The
target was therefore not a stretch goal, it was arithmetic that could not close
without replacing React — a rewrite this project is not making.

**New budget, in two parts.** A single total lets a framework upgrade consume the
whole allowance silently, and a gate that can never pass gets ignored. So the
budget separates the fixed cost from the controllable cost:

- **Hard ceiling: 200 KB (204,800 B) initial JS.** Measured 181,599 B. Catches a
  stray dependency or a route that pulls the document editor onto the initial path.
- **Controllable ceiling: 60 KB (61,440 B).** Measured 38,388 B, computed as total
  minus the recorded framework floor. This is the number the team is accountable
  for, and the one chunk 4 should be measured against.
- **CSS: 30 KB.** Measured 10,735 B.

The framework floor is recorded in `apps/web/budget.json` and re-measured on a
framework upgrade. The lazy document engine (188 KB gzip) stays out of both figures
because it loads only when the artifact panel opens.

**Is 181 KB acceptable for a school on a phone?** First visit transfers roughly
192 KB compressed JS+CSS. The service worker precaches the shell, so repeat visits
are served locally. The agent runtime (134 KB gzip) is fetched lazily on the first
turn and is never precached. This is a considered trade, not an oversight: the
alternative was hand-rolling a framework, and the measured cost is one second on a
good connection.

**Owner:** platform lead (beznet). **Revisit:** when chunk 4 adds the Task/Make
dashboards, or on any framework upgrade, whichever comes first.

## Loading rules

- Any data-bound or lazy route with a blank-layout risk must define a skeleton.
- The workspace boot skeleton must mirror the compact or desktop shell at the current breakpoint (430px column below 1024px; rail + 760px canvas above). Do not render the mobile column on a desktop viewport; that produces a visible layout shift when the shell resolves.
- Use **Boneyard** for table, list and panel skeletons (`apps/web/boneyard.config.json`, breakpoints 375/768/1280; `app/bones` is not yet generated — generation is a 10B build task). If Boneyard bones don't fit the layout, use shadcn `Skeleton` or a static fallback. Existing hand-written skeletons (`DirectorySkeleton.tsx`, `WorkspaceBoot`) are Modify targets for token variables and reduced-motion guards.
- Do not show a skeleton for work expected to finish in under 150 ms (team decision; validate against RUM in `70-evaluation-and-rollout.md`).
- If stale data exists, show stale data, not a skeleton.
- Bones must match the final layout at 375/768/1280 and must not cause layout shift.
- Respect `prefers-reduced-motion`; disable pulse/shimmer when reduced.
- Generated bones are reviewed source and fixtures use synthetic data only.
- Boneyard is a dev/build-time generator; no headless Chromium in production.
- Route-level code splitting.
- IronPress WASM, PDF.js worker/cmaps, Mammoth, `docx`, PapaParse and Tiptap extensions load only when used.
- The agent runtime WASM (`crates/agent-wasm`) is **lazily fetched on first turn** and is **never precached**. It does not count toward the ≤2 MB PWA shell, and it must not appear in the initial route budget.
- No import of whole icon or component barrels.
- Hashed immutable assets; Brotli/HTTP3; no external font dependency.
- PWA caches static assets, icons and the offline shell only; never API responses, transcripts, session data or school records.
- HTML is `no-store` while data is dynamic.
- Android ships an **AAB with per-ABI splits**, not a universal APK; a universal APK is roughly four times the per-ABI payload.

## Directory and list rules

- Directory listing uses server-side pagination per `45-admin-claim-links.md` (default 50, max 100 per page; the 581-row directory is ~6 pages). Filter changes fetch page 1.
- Filters/search trigger one request, not one request per keystroke; debounce search at 250 ms (team decision; validate against RUM in `70`).
- Abort in-flight requests when filters change.
- Optimistic link revoke; refresh on explicit action or after the link TTL recorded in `45-admin-claim-links.md`.
- Do not put staff/parent PII in `localStorage`, `sessionStorage`, IndexedDB, service workers or any sync transport.

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

## OCR and camera rules

- Local OCR models are assets, not network fetches; missing models fail closed before the first capture.
- Do not hold decoded camera frames after the preview closes. Write one JPEG to app cache, import it, then release the native session.
- Local OCR returns structured lines/confidence; do not send the image to the API for cache hits.
- Cloud OCR is a separate user action and is measured separately; it is not part of the local OCR budget.
- No camera preview on desktop or PWA; no school image in PWA cache, IndexedDB, iroh or git.
- Measure mobile camera cold start, capture-to-OCR latency and peak RSS on the device matrix in `70`; record device/date/build SHA.

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

- Budgets are enforced in CI: `apps/web/budget.json` (size limits per route chunk) wired into the build check; Lighthouse CI on the production Worker build with the measurement profile above.
- No initial document-engine bundle.
- Snapshot p95 ≤800 ms after parallelization, or a recorded exception with an owner and follow-up (current exception recorded above).
- No Pages Functions; the Worker does not embed school data or session tokens in HTML or edge caches.
- No PII in client caches, service-worker caches or SSR HTML.
- Any budget miss blocks release unless a recorded exception with an owner and follow-up exists.
