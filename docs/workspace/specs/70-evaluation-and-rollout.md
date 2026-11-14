# 70 — Evaluation and Rollout

**Draft.** No implementation in Phase 9B.

## Gates before v1 implementation

1. Phase 8 signed: 24-hour watch, owner POC login, checklist.
2. Phase 9A complete: 04a, claim retirement, digest cleanup, retention dry-run.
3. Phase 9B docs approved.
4. Phase 10 capability contract approved.

## Benchmarks

### Tauri

- cold start and app size on desktop/Android/iOS
- WebView memory and frame time
- local SQLite/workspace I/O
- iroh pairing and sync on slow networks
- update/rollback behavior

### Needle 3

- tool selection and argument accuracy per role
- confidence calibration; `ungrounded` handling
- 4/8/20-layer quality
- cold load, peak RSS, decode latency, battery
- low-end Android, mid iPhone, desktop

### xcodex local

- native vs local WASM WebView fallback
- model provider latency
- tool-call loop and cancellation
- dynamic-tool round trip (`web_search`, `web_fetch`, `ocr_extract`)
- approval mapping (`allow_once`, `allow_for_session`, `deny`, `abort`)
- memory and long-session stability

### Capability layer

- RustO OCR on the synthetic fixture and the tenant-safe AY4 benchmark; record CER/WER, numeric recall, p50/p95, peak RSS and model size.
- Mistral fallback only with explicit consent; verify no image reaches the API on the local path.
- Mobile camera on physical iOS and Android: permission allow/deny, front/back, flash, rotation, background/resume, cancel/retake and EXIF GPS strip.
- Desktop PKCE: system-browser login, one-time code, keychain storage, refresh/logout, no token in WebView storage.
- WebSearch/WebFetch: TinyFish primary, Tavily fallback, quota `429`, SSRF rejection and no query/URL logging.
- Contract fixtures parse in TypeScript and Rust; no drift.

### Workflows

- IR validation and rejection cases
- condition/loop correctness
- sandbox escape tests
- approval/idempotency tests
- deterministic replay

### xcodex local

- native vs local WASM WebView fallback
- model provider latency
- tool-call loop and cancellation
- dynamic-tool round trip (`web_search`, `web_fetch`, `ocr_extract`)
- approval mapping (`allow_once`, `allow_for_session`, `deny`, `abort`)
- memory and long-session stability

### Capability layer

- RustO OCR on the synthetic fixture and the tenant-safe AY4 benchmark; record CER/WER, numeric recall, p50/p95, peak RSS and model size.
- Mistral fallback only with explicit consent; verify no image reaches the API on the local path.
- Mobile camera on physical iOS and Android: permission allow/deny, front/back, flash, rotation, background/resume, cancel/retake and EXIF GPS strip.
- Desktop PKCE: system-browser login, one-time code, keychain storage, refresh/logout, no token in WebView storage.
- WebSearch/WebFetch: TinyFish primary, Tavily fallback, quota `429`, SSRF rejection and no query/URL logging.
- Contract fixtures parse in TypeScript and Rust; no drift.

- Build from the approved release branch, never `main`; verify `_headers`/`_redirects`.
- CSP allows `api.llacademy.ng`, WASM and PDF.js workers; no arbitrary frames.
- Hashed assets cache correctly; `index.html` revalidates.
- IronPress/PDF.js chunks load only on demand; measure first-export latency.
- PWA offline shell does not cache school data/API responses.
- Preview deployment check plus production smoke on `app.llacademy.ng`.

### Documents and artifacts

See `22-documents-and-artifacts.md`.

- IronPress first PDF, time and memory on desktop, mobile and web; native vs WASM parity.
- PDF.js preview/extraction on large, multi-column and scanned PDFs; no-text-layer failure.
- DOCX import fidelity and warnings against Word/Google Docs/LibreOffice samples.
- CSV streaming on large files; row/column caps; formula-injection export tests.
- Report/transcript PDF and DOCX visual parity with the Gold templates.
- Inline/side-panel minimal Tiptap: slash/bubble menu, AI proposal, Undo/Accept, autosave/version, mobile sheets.
- No school-data rendition in local/P2P storage; export audit.

### iroh

- pairing, conflict, offline, revocation
- no school data/token leakage
- relay failure and recovery
- iroh-first transport with CF `AGENT_DB` authority: direct path, relay path, CF store-and-forward fallback, cursor convergence
- no school image, token or provider key in sync state
- iroh-first transport with CF `AGENT_DB` authority: direct path, relay path, CF store-and-forward fallback, cursor convergence
- no school image, token or provider key in sync state

### GenUI (OpenUI)

See `21-generative-ui-openui.md`. Run a 50-prompt benchmark across admin, teacher, parent and student roles, covering at least:

- Student 360, class/cohort comparison, attendance exceptions, fee status, timetable;
- report/transcript summary, data-quality triage, approval preflight;
- one assisted action that opens a fixed form or requests an operation.

Measure:

- system-prompt and output tokens per surface;
- time to first visible component and full render;
- structural validity and render success;
- fallback rate and reason;
- action correctness, unauthorized-action count and approval behavior;
- human rating against the fixed tool-card baseline.

Also run malformed/adversarial OpenUI Lang: unknown components, oversized trees, nested expressions, `query`/`mutation` attempts, unsafe links and action-ID spoofing. A2UI is deferred and is not the v1 comparison arm.

## Rollout

- desktop pilot first
- web PWA second
- Tauri mobile third, including the native camera/OCR smoke
- persistence/sync is a separate follow-on gate (`41`/`42`); do not block the capability layer on iroh
- v2 native mobile only after a separate gate
- GenUI starts read-only, then assisted actions; no authoritative GenUI writes
- no big-bang migration of school data or sessions

## Acceptance

A release is not accepted until the security review, role/capability tests, error paths, audit and rollback are documented and exercised. GenUI also needs the `70` render/action/fallback benchmark and the `21` acceptance checks before it is enabled for a role. Documents need the `22` acceptance checks plus the PDF/DOCX/CSV benchmarks above.
