# Mastra Native API Verification Report

**Package:** `@mastra/core@1.32.1`
**Also installed:** `@mastra/libsql@1.10.0`, `@mastra/schema-compat`
**Date:** Task 1.0 verification
**References:** Requirements 19.1–19.6

---

## 1. Web Search / Web Fetch Tools

**Question:** Does Mastra have a native tool for web search/fetch?

**Finding:** NO native built-in web search/fetch tool in `@mastra/core/tools`.

The `@mastra/core/tools` export provides only the `createTool` factory, `Tool` class, type utilities, and `ToolStream`. There are no pre-built web search or fetch tools bundled with the core package.

**Official plugin packages exist but are NOT suitable:**
- `@mastra/tavily` — wraps the Tavily API (requires `TAVILY_API_KEY`, paid service). Not aligned with our zero-cost TinyFish/DuckDuckGo design.
- Mastra docs also reference `exa-js` (Exa) and OpenAI's native `webSearch` tool as alternatives, but these require paid API keys or specific model providers.

**Decision:** BUILD CUSTOM — Proceed with custom `tinyfish-client.ts` + `ddg-scraper.ts` + `global-tools.ts` using `createTool` from `@mastra/core/tools`. No native Mastra API covers our free-tier, dual-fallback requirement.

**Module comment:** `// Verified: no native Mastra web search/fetch tool as of @mastra/core@1.32.1. Official @mastra/tavily exists but requires paid API key — not suitable for zero-cost fallback chain design.`

---

## 2. Workflow Event Streaming (SSE)

**Question:** Does Mastra have a built-in SSE/event streaming mechanism for workflow progress?

**Finding:** PARTIAL — Mastra has a native workflow streaming system, but it is NOT SSE-based and does NOT directly serve browser clients.

**What Mastra provides natively:**
- `workflow.createRun().stream()` — returns a `ReadableStream` of `WorkflowStreamEvent` chunks
- `workflow.watch(cb)` / `workflow.watchAsync(cb)` — server-side callback for `WorkflowStreamEvent` (marked `@internal`)
- `WorkflowStreamEvent` types include: `workflow-start`, `workflow-finish`, `workflow-step-start`, `workflow-step-finish`, `workflow-step-result`, `workflow-step-suspended`, `workflow-step-progress`, `workflow-step-waiting`, `workflow-canceled`, `workflow-paused`
- `WorkflowOptions.onFinish` — server-side callback when workflow completes (success, failed, suspended, tripwire)
- `WorkflowOptions.onError` — server-side callback on workflow failure
- `writer` argument in step `execute` — allows custom events to be pushed into the workflow stream

**What Mastra does NOT provide:**
- No built-in SSE endpoint or HTTP streaming adapter
- No client-side `EventSource` integration
- No keepalive mechanism for browser connections
- No reconnection/catchup logic for late-joining clients
- The `watch()` method is `@internal` and designed for server-side use only

**Decision:** BUILD CUSTOM SSE MANAGER — but **adapt to use native `watch()` as the event source** rather than building a fully custom event system. The SSE Manager will be a thin adapter that:
1. Uses `workflow.watch(cb)` to receive `WorkflowStreamEvent` from Mastra's native workflow engine
2. Translates those events into our SSE format (step-progress, step-complete, step-error, workflow-complete)
3. Manages browser SSE connections, keepalive, and catchup logic

This is simpler than the original design which assumed no native event hooks existed.

**Module comment:** `// Uses native Mastra API: workflow.watch() for WorkflowStreamEvent subscription. Custom SSE adapter layer handles browser delivery, keepalive, and reconnection.`

---

## 3. Run History / Observability Storage

**Question:** Does Mastra have a native run storage adapter or telemetry module that persists step traces?

**Finding:** YES — Mastra has a native workflow run storage system via the `WorkflowsStorage` domain.

**What Mastra provides natively:**
- `WorkflowsStorage` abstract class with: `persistWorkflowSnapshot()`, `loadWorkflowSnapshot()`, `listWorkflowRuns()`, `getWorkflowRunById()`, `deleteWorkflowRunById()`, `updateWorkflowState()`, `updateWorkflowResults()`
- `@mastra/libsql` implements `WorkflowsLibSQL` which stores runs in a `mastra_workflow_snapshot` table
- `StorageListWorkflowRunsInput` supports filtering by `workflowName`, `fromDate`, `toDate`, `resourceId`, `status`, with pagination (`perPage`, `page`)
- `WorkflowRun` type contains: `workflowName`, `runId`, `snapshot` (full `WorkflowRunState`), `createdAt`, `updatedAt`, `resourceId`
- `WorkflowRunState` contains: `runId`, `status`, `result`, `error`, `context` (with per-step results), `serializedStepGraph`, `activePaths`, `suspendedPaths`, `timestamp`
- Full observability system via `@mastra/observability` package (traces, logs, metrics) — but this is a separate paid/cloud feature

**What Mastra does NOT provide:**
- No per-step table with individual step inputs/outputs/duration/errors as separate queryable rows
- No tenant-scoped filtering (schoolId, classId, sectionId) — only `resourceId` and `workflowName`
- The snapshot is a single JSON blob, not normalized step-by-step records
- No built-in UI component for run history display

**Decision:** HYBRID APPROACH — Use Mastra's native `listWorkflowRuns()` / `getWorkflowRunById()` as the data source, but add a custom query layer that:
1. Reads from Mastra's native workflow storage (no custom `mastra_runs` table needed for basic run listing)
2. Parses the `WorkflowRunState.context` to extract per-step results, errors, and timing
3. Adds tenant-scoped filtering by storing `schoolId/classId/sectionId` in the workflow's `resourceId` field (composite key pattern)
4. The `mastra_run_steps` table from the design is still needed for denormalized step-level queries with proper indexing

**IMPORTANT UPDATE:** The `mastra_runs` table in the design can be simplified. We should store a composite `resourceId` (e.g., `school:1:class:5:section:2:user:10`) when creating workflow runs, then filter using Mastra's native `resourceId` filter. For step-level detail, we parse the snapshot's `context` field which contains all step results.

**Module comment:** `// Uses native Mastra API: WorkflowsStorage.listWorkflowRuns() and getWorkflowRunById() via @mastra/libsql. Custom query layer adds tenant-scoped filtering and step-level extraction from WorkflowRunState.context.`

---

## 4. Memory / Thread Metadata for Context Injection

**Question:** Does Mastra's Memory or Thread metadata system support dynamic context fields that could replace custom @mention context injection?

**Finding:** PARTIAL — Mastra has thread metadata but it is NOT suitable for replacing the @mention context switching system.

**What Mastra provides natively:**
- `StorageThreadType.metadata?: Record<string, unknown>` — arbitrary metadata on threads
- `MastraMemory.createThread({ metadata })` — can store custom metadata when creating threads
- `MastraMemory.listThreads({ filter: { metadata: { key: value } } })` — can filter threads by metadata
- Working Memory system — persistent scratchpad for agent context across conversations
- Thread-scoped vs resource-scoped memory isolation

**What Mastra does NOT provide:**
- No concept of "TenantContext" or multi-field context switching (schoolId, classId, sectionId, studentId, academicId, examId)
- No @mention parsing or entity resolution
- No role-based category filtering
- No context cache busting mechanism
- No validation that entities belong to a user's school
- Thread metadata is static per-thread, not dynamically switched per-message

**Decision:** BUILD CUSTOM — The @mention system requires:
1. Real-time entity search against the school database
2. Role-based category filtering (Coordinator vs Class Teacher)
3. Per-message context switching with validation
4. Cache busting on context change
5. Left-to-right override semantics for multiple mentions

None of these are addressable by Mastra's thread metadata system. The existing `TenantContext` + `TenantContextCache` architecture is the correct approach.

**Module comment:** `// Verified: no native Mastra API for @mention entity resolution or dynamic per-message context switching as of @mastra/core@1.32.1. Thread metadata is static per-thread, not suitable for real-time context injection.`

---

## 5. Caching

**Question:** Does Mastra provide a caching utility or does a `@mastra/cache` package exist?

**Finding:** YES — Mastra has a native `InMemoryServerCache` in `@mastra/core/cache`.

**What Mastra provides natively:**
- `MastraServerCache` abstract base class with: `get()`, `set()`, `delete()`, `clear()`, `listPush()`, `listLength()`, `listFromTo()`, `increment()`
- `InMemoryServerCache` concrete implementation with `maxSize` and `ttlMs` options
- Default: 1000 max items, 300000ms (5 min) TTL

**What Mastra does NOT provide:**
- No LRU eviction semantics (it has `maxSize` but the eviction strategy is not documented as LRU)
- No per-key TTL (single global TTL)
- The API is async (`Promise<unknown>`) — designed for Redis-compatible backends, not optimized for synchronous in-memory access
- No typed generics (returns `unknown`)

**Decision:** BUILD CUSTOM LRU CACHE — The design requires:
1. LRU eviction (least-recently-used, not FIFO or random)
2. Per-instance TTL with different values (15 min for search, 24 hours for fetch)
3. Synchronous access for in-memory use (no async overhead)
4. Type-safe generics (`LRUCache<T>`)
5. Lightweight implementation without the `MastraBase` class overhead

Mastra's `InMemoryServerCache` is designed for a different use case (server-wide cache with async interface for Redis compatibility). Our LRU cache is a simple, synchronous, typed utility.

**Module comment:** `// Verified: Mastra provides InMemoryServerCache (@mastra/core/cache) but it lacks LRU eviction, per-key TTL, synchronous access, and type generics. Custom LRUCache<T> built for search/fetch caching requirements.`

---

## 6. HTML-to-Markdown

**Question:** Does any `@mastra/*` package provide content extraction or HTML-to-markdown utilities?

**Finding:** NO — No `@mastra/*` package provides HTML-to-markdown conversion.

**What exists in the ecosystem:**
- `@mastra/tavily` has an `extract` tool that returns page content in markdown format, but this is a remote API call (Tavily does the conversion server-side), not a local utility
- No `@mastra/html-to-markdown`, `@mastra/content`, or similar package exists
- The Mastra docs reference Firecrawl for web scraping but as an external service, not a local library

**Decision:** BUILD CUSTOM — Proceed with custom `html-to-markdown.ts` using `linkedom` for DOM parsing. This keeps the bundle small and avoids external API dependencies for content extraction.

**Module comment:** `// Verified: no native Mastra HTML-to-markdown utility as of @mastra/core@1.32.1. Custom implementation using linkedom for lightweight server-side content extraction.`

---

## Summary Table

| Subsystem | Native Mastra API? | Decision | Impact on Design |
|-----------|-------------------|----------|-----------------|
| Web Search/Fetch Tools | No (only `createTool` factory) | BUILD CUSTOM | No change — proceed as designed |
| Workflow Event Streaming | Partial (`watch()` + `WorkflowStreamEvent`) | ADAPT — use `watch()` as event source | SSE Manager simplifies to thin adapter over native events |
| Run History / Observability | Yes (`WorkflowsStorage` with `listWorkflowRuns`) | HYBRID — use native storage + custom query layer | May eliminate custom `mastra_runs` table; parse snapshot for step details |
| Memory / Context Injection | No (thread metadata is static) | BUILD CUSTOM | No change — proceed with custom `processMentions()` |
| Caching | Partial (`InMemoryServerCache`) | BUILD CUSTOM | No change — native cache lacks LRU, sync access, generics |
| HTML-to-Markdown | No | BUILD CUSTOM | No change — proceed with `linkedom` implementation |

---

## Design Adaptations Required

1. **SSE Manager (Task 7.1):** Instead of building a fully custom event emission system, wire the SSE Manager to subscribe to workflow events via `workflow.watch(cb)`. The manager translates `WorkflowStreamEvent` types to our SSE event format.

2. **Run History (Task 9.5):** Consider using Mastra's native `listWorkflowRuns()` as the primary data source. Store tenant context as a composite `resourceId` string. Parse `WorkflowRunState.context` for step-level details instead of maintaining a separate `mastra_run_steps` table. However, if query performance requires denormalized step data, the custom table remains valid.

3. **Workflow `onFinish` callback (Task 7.1):** Use `WorkflowOptions.onFinish` for server-side completion handling alongside `watch()` for real-time streaming.
