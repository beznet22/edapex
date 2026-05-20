# Implementation Plan: Mastra Orchestration Finalization

## Overview

This plan implements five interconnected subsystems to finalize the EdApex Mastra orchestration migration: Global Tools (web_search/web_fetch with TinyFish + DuckDuckGo fallback), HTML-to-Markdown middleware, SSE workflow status push, Workspace Panel extensions (Extraction Inspector, Publish Viewer, Run History, file sharing), and @Mention system redesign with role-based entity resolution. All work builds on the existing SvelteKit + Mastra modular monolith architecture.

## Tasks

- [x] 1. Set up infrastructure and shared utilities
  - [x] 1.0 Mastra docs verification for all subsystems
    - Before writing any code, consult the Mastra documentation (`https://mastra.ai/docs`) and inspect `@mastra/core` package exports to verify:
      - Whether Mastra has a native tool for web search/fetch (check `@mastra/core/tools` or official tool packages)
      - Whether Mastra has a built-in SSE/event streaming mechanism for workflow progress (check Workflow hooks: `onStepSuccess`, `onStepError`, `onComplete`)
      - Whether Mastra has a native run history/observability storage adapter (check `@mastra/core` storage or telemetry modules)
      - Whether Mastra has a built-in memory/thread metadata system that could replace custom @mention context injection
      - Whether any `@mastra/*` plugin packages exist for HTML-to-markdown, caching, or web fetching
    - Document findings in a brief comment at the top of each new module: "Verified: no native Mastra API for X as of @mastra/core@{version}" or "Uses native Mastra API: {api name}"
    - Do NOT proceed with custom implementations if a native API exists — adapt the design to use it
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6_

  - [x] 1.1 Install dependencies and configure test environment
    - Add `fast-check` and `linkedom` as devDependencies via pnpm
    - Update `vitest.config.ts` to include `**/*.property.test.ts` pattern and set `testTimeout: 30000`
    - _Requirements: Design Testing Strategy_

  - [x] 1.2 Implement LRU Cache module
    - Create `src/lib/server/mastra/tools/lru-cache.ts`
    - Implement generic `LRUCache<T>` class with `maxSize`, `ttlMs` constructor params
    - Implement `get(key)`, `set(key, value)`, `has(key)`, `size`, `clear()` methods
    - Evict least-recently-used entry when capacity exceeded; skip expired entries on lookup
    - _Requirements: 2.6, 4.7_

  - [x]* 1.3 Write property tests for LRU Cache (Property 4, Property 37)
    - **Property 4: Search cache LRU invariant** — cache never exceeds maxSize; 101st entry evicts LRU; expired entries not returned
    - **Property 37: Fetch cache keyed by URL and mode** — same URL with different mode yields separate cache entries
    - **Validates: Requirements 2.6, 4.7**

  - [x] 1.4 Add `mastra_runs` and `mastra_run_steps` tables to DB schema
    - Extend `src/lib/server/mastra/db/schema.ts` with `mastraRuns` and `mastraRunSteps` table definitions per design
    - Include all columns: id, workflowId, schoolId, classId, sectionId, userId, status, startedAt, completedAt, totalSteps, completedSteps, failedSteps, durationMs, error
    - Include step columns: id, runId (FK), stepName, stepIndex, status, inputPayload, outputPayload, error, stackTrace, durationMs, createdAt
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 2. Implement HTML-to-Markdown middleware
  - [x] 2.1 Create HTML-to-Markdown conversion module
    - Create `src/lib/server/mastra/tools/html-to-markdown.ts`
    - Implement `htmlToMarkdown(html: string): string` — strip script/style/nav/header/footer/aside, walk DOM via `linkedom`, convert headings/paragraphs/links/images/lists/tables/code to markdown equivalents, collapse whitespace
    - Implement `parseSearchResults(html: string, maxResults: number): SearchResult[]` — extract DuckDuckGo result containers
    - Return empty string for null/empty/unparseable input
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7_

  - [x]* 2.2 Write property tests for HTML-to-Markdown (Property 7, Property 8)
    - **Property 7: HTML-to-markdown conversion correctness** — output contains no prohibited elements; preserves link URLs; converts headings; collapses blank lines
    - **Property 8: HTML-to-markdown size reduction** — output at least 60% smaller than input for documents >= 1KB with body element
    - **Validates: Requirements 16.1, 16.2, 16.3, 16.4, 16.5**

- [x] 3. Implement TinyFish client and DuckDuckGo scraper
  - [x] 3.1 Create TinyFish client module
    - Create `src/lib/server/mastra/tools/tinyfish-client.ts`
    - Implement sliding-window rate limiter (5 search/min, 25 fetch/min)
    - Implement `tinyfishSearch(query, options)` — GET to `https://api.search.tinyfish.ai` with `X-API-Key` header, 10s timeout
    - Implement `tinyfishFetch(url, options)` — POST to `https://api.fetch.tinyfish.ai` with JSON body, 15s timeout
    - Read `TINYFISH_API_KEY` from `$env/dynamic/private`; throw `TinyfishUnavailableError` if unset
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6_

  - [x]* 3.2 Write property test for TinyFish rate limiting (Property 36)
    - **Property 36: TinyFish rate limiting** — at most 5 search calls and 25 fetch calls per minute; excess calls skip to fallback
    - **Validates: Requirements 18.5**

  - [x] 3.3 Create DuckDuckGo scraper module
    - Create `src/lib/server/mastra/tools/ddg-scraper.ts`
    - Implement `ddgSearch(query, options)` — POST to `https://html.duckduckgo.com/html` with form body, standard Chrome UA, 10s timeout
    - Parse result containers via `linkedom`, extract title/URL/description
    - Detect bot-challenge pages and throw `DDGBotChallengeError`
    - Pass snippets through `htmlToMarkdown` for cleaning
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.7_

  - [x]* 3.4 Write property test for DuckDuckGo HTML extraction (Property 3)
    - **Property 3: DuckDuckGo HTML extraction produces clean structured results** — extracts at most min(N, requestedCount) results with non-empty fields, no nav/ads/tracking
    - **Validates: Requirements 2.3, 2.5**

- [x] 4. Implement Global Tools module
  - [x] 4.1 Create Global Tools with web_search and web_fetch
    - Create `src/lib/server/mastra/tools/global-tools.ts`
    - Implement `webSearchTool` via `createTool` with Zod input schema (query 1-500 chars, count 1-10, optional region)
    - Execute logic: validate input → check cache → try TinyFish → fallback to DDG → cache result
    - Implement `webFetchTool` via `createTool` with Zod input schema (url HTTPS, extractMode, maxChars 1-100000)
    - Execute logic: SSRF validation → check cache → try TinyFish fetch → fallback to HTTP GET + htmlToMarkdown → truncate → cache
    - SSRF: reject non-HTTPS, localhost, private IPs (10/8, 172.16/12, 192.168/16); allow HTTPS→HTTP redirects
    - Export `globalTools` object for Gateway injection
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [x]* 4.2 Write property tests for web_search input validation (Property 1)
    - **Property 1: Web search input validation** — accepts query 1-500 chars + count 1-10; rejects all others without API call
    - **Validates: Requirements 1.5, 1.6**

  - [x]* 4.3 Write property tests for web_search result normalization (Property 2)
    - **Property 2: Web search result structure normalization** — title ≤200 chars, snippet ≤300 chars, non-empty URL and domain
    - **Validates: Requirements 1.3**

  - [x]* 4.4 Write property tests for web_fetch URL validation (Property 5)
    - **Property 5: Web fetch URL validation and SSRF protection** — rejects non-HTTPS, localhost, private IPs; accepts valid HTTPS
    - **Validates: Requirements 3.4, 3.5**

  - [x]* 4.5 Write property tests for web_fetch output formatting (Property 6)
    - **Property 6: Web fetch output formatting with truncation** — truncates at limit with flag; includes title, URL, charCount metadata
    - **Validates: Requirements 3.3, 3.6**

- [x] 5. Integrate Global Tools into Gateway
  - [x] 5.1 Wire Global Tools into EdApexGateway
    - Import `globalTools` in `src/lib/server/mastra/gateway.ts`
    - Modify `resolveToolsForIntent()` to always spread `globalTools` into the base tools object
    - Ensure Global Tools don't count toward 4-tool-per-skill limit
    - Add conflict detection in SkillRegistry to reject skills declaring `web-search` or `web-fetch`
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

  - [x]* 5.2 Write property tests for Global Tools availability (Property 34, Property 35)
    - **Property 34: Global Tools don't count toward skill tool limit** — skill with N tools gets N + globalTools count total
    - **Property 35: Skill registration conflict detection** — skills declaring web-search/web-fetch are rejected
    - **Validates: Requirements 15.3, 15.5**

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement SSE Manager and workflow events endpoint
  - [x] 7.1 Create SSE Manager module
    - Create `src/lib/server/mastra/sse-manager.ts`
    - Implement `SSEManager` class with client registry (`Map<string, SSEClient>`), completed steps buffer (`Map<string, StepEvent[]>`)
    - Implement `registerClient`, `removeClient`, `emitProgress`, `emitStepComplete`, `emitStepError`, `emitWorkflowComplete`, `emitCatchup`
    - Implement 30-second keepalive interval; terminate connection on write failure
    - Format events as SSE: `event: {type}\ndata: {json}\n\n`
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_

  - [x]* 7.2 Write property tests for SSE events (Property 28, Property 29, Property 30, Property 31)
    - **Property 28: SSE step event structure** — contains runId, stepName, stepIndex (1-based), totalSteps, status ≤200 chars
    - **Property 29: SSE error event truncation** — error message ≤500 chars with canContinue boolean
    - **Property 30: SSE workflow-complete event structure** — contains runId, status, totalDurationMs, stepsCompleted, stepsFailed
    - **Property 31: SSE catchup event for in-progress workflows** — contains currentStepIndex, totalSteps, completed steps array
    - **Validates: Requirements 13.2, 13.3, 13.4, 13.5, 13.7**

  - [x] 7.3 Create SSE endpoint route
    - Create `src/routes/api/workflow/events/+server.ts`
    - Implement GET handler: parse `runId` from query, validate tenantContext from locals
    - Create ReadableStream, register client with SSEManager, send connected event, emit catchup
    - Set headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
    - Clean up on stream cancel
    - _Requirements: 13.1, 13.6, 13.7_

- [x] 8. Implement SSE client and workflow status UI
  - [x] 8.1 Create WorkflowEventSource client context
    - Create `src/lib/context/workflow-events.svelte.ts`
    - Implement `WorkflowEventSource` class with reactive state: `currentStep`, `completedSteps`, `workflowStatus`, `connectionStatus`, `error`
    - Implement `connect(runId)`, `disconnect()`, reconnection with exponential backoff (1s, 2s, 4s... max 30s, max 10 attempts)
    - Handle events: `connected`, `catchup`, `step-progress`, `step-complete`, `step-error`, `workflow-complete`
    - _Requirements: 14.4, 14.5_

  - [x]* 8.2 Write property test for reconnection backoff (Property 32)
    - **Property 32: Reconnection exponential backoff** — delays follow min(1000 * 2^attempt, 30000) for max 10 attempts
    - **Validates: Requirements 14.4**

  - [x] 8.3 Create WorkflowStatusBadge component
    - Create `src/lib/components/workspace/WorkflowStatusBadge.svelte`
    - Display current workflow phase (Idle, Extracting, Awaiting Validation, Validating, Awaiting Publish, Publishing, Complete, Error)
    - Show action prompt for "Awaiting Validation" (`/validate`) and "Awaiting Publish" (`/publish`)
    - Update within 1 second of SSE event; derive state from SSE events only
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

  - [x] 8.4 Integrate workflow running indicators into WorkspacePane and ChatComposer
    - Add persistent status pill at bottom of WorkspacePane showing workflow name + "Running..." with pulse animation
    - Stack up to 3 pills for concurrent workflows
    - Show completion summary (auto-dismiss after 10s) on workflow-complete
    - Show "Connection Lost — Reconnecting..." on SSE drop; show "Connection Failed" with retry button after 10 attempts
    - Block duplicate workflow slash commands in ChatComposer while same type is active
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_

  - [x]* 8.5 Write property test for duplicate workflow blocking (Property 33)
    - **Property 33: Duplicate workflow blocking** — ChatComposer blocks slash commands for same workflow type while active; does not queue
    - **Validates: Requirements 14.6**

- [x] 9. Implement Workspace Panel extension views
  - [x] 9.1 Create Extraction Inspector component
    - Create `src/lib/components/workspace/ExtractionInspector.svelte`
    - Render tabular preview from Mastra workflow state: per-student rows with name, extracted fields, confidence indicator
    - Source data exclusively from workflow state (not DB)
    - Show "Awaiting Validation" status with run ID while suspended
    - Update on `/validate` to show per-student pass/fail with field-level failure reasons
    - Show error message if workflow state contains no student data
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x]* 9.2 Write property test for Extraction Inspector rendering (Property 9)
    - **Property 9: Extraction Inspector renders all students from workflow state** — N students → exactly N rows with name, fields, confidence
    - **Validates: Requirements 5.2**

  - [x] 9.3 Create Publish Viewer component
    - Create `src/lib/components/workspace/PublishViewer.svelte`
    - Render PDFs inline via EditorCanvas with type `pdf`; provide prev/next navigation for batches
    - Show progress indicator with current step name during publish workflow
    - Show completion summary: PDF count, email count, failed count, per-student errors (max 50)
    - Handle partial failures: show available PDFs + warning for failed generations
    - Show action prompt for `/publish` to proceed or `/cancel` to abort while suspended
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x]* 9.4 Write property test for Publish completion summary (Property 10)
    - **Property 10: Publish completion summary correctness** — displays exactly P PDFs, E emails, F failures, max 50 error entries
    - **Validates: Requirements 6.4**

  - [x] 9.5 Create Run History component
    - Create `src/lib/components/workspace/RunHistory.svelte`
    - List workflow runs from `mastra_runs` table filtered by TenantContext (schoolId, classId, sectionId)
    - Display max 50 runs sorted by startedAt descending
    - Show step-by-step execution markers (success/failure) on run selection
    - Show collapsible raw JSON inputs/outputs per step (truncated to 10KB); show error + stack trace (truncated to 5KB) for failed steps
    - Restrict access to Coordinator (designationId 5) and IT_User (designationId 1)
    - Show empty state when no runs exist
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x]* 9.6 Write property tests for Run History (Property 11, Property 12, Property 13, Property 14)
    - **Property 11: Run History sorting and pagination** — max 50 runs sorted by startedAt descending
    - **Property 12: Run History payload truncation** — input/output ≤10000 chars; stack trace ≤5000 chars
    - **Property 13: Run History tenant isolation** — only returns runs matching current TenantContext
    - **Property 14: Run History access control** — accessible only for designationId 1 or 5
    - **Validates: Requirements 7.1, 7.3, 7.4, 7.5, 7.6**

- [x] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement file-as-context and file sharing
  - [x] 11.1 Add hover "Add as Context" button to FileTree
    - In `src/lib/components/workspace/FileTree.svelte`, render `MessageSquarePlusIcon` as a hover-visible icon button on each file/directory item
    - On click, call `onToggleReference(entry)` to add/remove file reference in ChatComposer
    - Enforce max 5 references — show notification when limit reached
    - _Requirements: 9.1, 9.2, 9.6_

  - [x]* 11.2 Write property test for max file references (Property 20)
    - **Property 20: Max file references enforcement** — prevents adding more than 5 references; 6th rejected
    - **Validates: Requirements 9.6**

  - [x] 11.3 Implement file-as-context injection in Gateway
    - Add `injectFileContext()` function to Gateway: read up to 5 referenced files (max 50KB each), inject text content into agent context
    - For binary files (image/*, application/pdf), inject metadata only (name, type, size)
    - For missing files, exclude with error indication
    - Truncate text files exceeding 50KB with notice
    - Wire into `stream()` and `generate()` methods before routing to assistant
    - _Requirements: 9.4, 9.5, 9.7, 9.8_

  - [x]* 11.4 Write property tests for file context injection (Property 19, Property 21)
    - **Property 19: File-as-context injection with size limit** — injects ≤50KB; truncates with notice; excludes missing files
    - **Property 21: Binary file metadata-only injection** — binary MIME types get metadata only, no raw content
    - **Validates: Requirements 9.4, 9.5, 9.7, 9.8**

  - [x] 11.5 Implement file name validation
    - Add validation function: accept 1-255 chars, alphanumeric + hyphens + underscores + dots + spaces only
    - Integrate into `submitInlineAction()` in WorkspacePane — show inline error on failure, retain input
    - _Requirements: 8.1, 8.2_

  - [x]* 11.6 Write property test for file name validation (Property 15)
    - **Property 15: File name validation** — accepts valid names (1-255 chars, allowed chars); rejects all others
    - **Validates: Requirements 8.1**

  - [x] 11.7 Implement file share API endpoint
    - Create `src/routes/api/file/share/+server.ts`
    - POST handler: accept `{ key, workspace }`, generate signed URL with 7-day expiration
    - Return `{ url, expiresAt }` response
    - Add share button to FileTree dropdown menu; copy URL to clipboard with toast confirmation
    - _Requirements: 8.9_

  - [x]* 11.8 Write property test for share URL expiration (Property 18)
    - **Property 18: Share URL expiration** — embedded expiration is exactly 604800 seconds after creation
    - **Validates: Requirements 8.9**

  - [x]* 11.9 Write property tests for upload constraints (Property 16, Property 17)
    - **Property 16: File content round-trip** — text file save then read returns identical content
    - **Property 17: Upload constraint enforcement** — rejects files >50MB or batches >20 files; accepts otherwise
    - **Validates: Requirements 8.4, 8.6, 8.7**

- [x] 12. Implement @Mention system redesign
  - [x] 12.1 Create @Mention search API endpoint
    - Create `src/routes/api/mentions/search/+server.ts`
    - GET handler: parse `q`, `category`, `limit` (max 10) from query params
    - Implement `getAllowedCategories(designationId)` — Coordinator/IT: all 6 categories; Class Teacher: students, academic_year, term
    - Return 403 if category not in allowed list
    - Implement `searchEntities()` — query school DB scoped to user's schoolId, return max 10 results sorted by relevance
    - _Requirements: 10.1, 10.2, 11.1, 11.2_

  - [x]* 12.2 Write property test for @Mention entity filtering (Property 22)
    - **Property 22: @Mention entity filtering and result cap** — returns ≤10 results scoped to schoolId, sorted by relevance
    - **Validates: Requirements 10.2, 12.3**

  - [x] 12.3 Redesign MentionDropdown component
    - Rewrite `src/lib/components/chat/MentionDropdown.svelte` with category-based UI
    - Show categories based on user role (all 6 for Coordinator/IT, 3 for Class Teacher)
    - Fetch results from `/api/mentions/search` with 200ms debounce
    - Implement keyboard navigation: Up/Down arrows, Enter/Tab to confirm, Escape to dismiss, wrap navigation
    - Display entity name (truncated to 40 chars), type badge, parent context
    - Show "No results found" or "Unable to load suggestions" (on 3s timeout/failure)
    - Dismiss on Escape, click outside, or deletion of `@` trigger
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8_

  - [x]* 12.4 Write property test for entity name truncation (Property 27)
    - **Property 27: Entity name display truncation** — names >40 chars displayed truncated with ellipsis
    - **Validates: Requirements 12.5**

  - [x] 12.5 Implement @Mention context processing in Gateway
    - Add `processMentions()` function to Gateway: parse mention tags from message, validate entity belongs to user's schoolId
    - Map category to TenantContext field (school→schoolId, class→classId, section→sectionId, student→studentId, academic_year→academicId, term→examId)
    - Apply left-to-right override for multiple mentions
    - Bust context cache and re-hydrate on class change
    - Reject with `WORKSPACE_MISMATCH` if entity not in user's school; preserve existing context
    - Block all context updates until validation completes
    - For Class Teachers: restrict student mentions to assigned class/section; update only studentId (not classId/sectionId)
    - _Requirements: 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 11.3, 11.4, 11.5, 11.6_

  - [x]* 12.6 Write property tests for @Mention context mapping (Property 23, Property 24, Property 25, Property 26)
    - **Property 23: @Mention entity-to-context mapping with left-to-right override** — applies in order, later overrides earlier for same field
    - **Property 24: @Mention cross-school validation** — rejects with WORKSPACE_MISMATCH if schoolId mismatch
    - **Property 25: Class Teacher student scoping** — only students in assigned class/section; rejects others
    - **Property 26: Class Teacher partial context update** — updates studentId only, not classId/sectionId
    - **Validates: Requirements 10.4, 10.5, 10.7, 10.8, 11.2, 11.3, 11.6**

- [x] 13. Final integration and wiring
  - [x] 13.1 Wire SSE events to Workspace Panel views
    - Connect `WorkflowEventSource` to `ExtractionInspector`, `PublishViewer`, and `WorkflowStatusBadge`
    - Mount correct view based on workflow phase: ExtractionInspector for extraction/validation, PublishViewer for publish
    - Integrate RunHistory into WorkspacePane with role-based visibility
    - _Requirements: 5.1, 6.1, 17.1_

  - [x] 13.2 Wire @Mention tags into chat message submission
    - Update chat API route to extract mention tags from submitted messages
    - Call `processMentions()` before routing to Gateway
    - Pass updated TenantContext to Gateway for agent execution
    - _Requirements: 10.4, 11.3_

  - [x] 13.3 Wire file references into chat message submission
    - Update chat API route to extract file reference keys from submitted messages
    - Call `injectFileContext()` with references before routing to Gateway
    - Prepend file context to agent system prompt or user message
    - _Requirements: 9.4_

  - [x]* 13.4 Write integration tests for full search fallback chain
    - Test TinyFish → DuckDuckGo → error flow end-to-end
    - Test TinyFish → HTTP fetch → htmlToMarkdown → truncation flow
    - _Requirements: 1.7, 2.1, 4.1_

  - [x]* 13.5 Write integration tests for SSE and @Mention flows
    - Test SSE connection lifecycle: connect → events → disconnect → reconnect
    - Test @Mention flow: type @ → search → select → context update → cache bust
    - Test file-as-context flow: add reference → send message → content injected
    - _Requirements: 13.1, 10.6, 9.4_

- [x] 14. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Install @mastra/ai-sdk and create Mastra Instance Factory
  - [x] 15.1 Install `@mastra/ai-sdk` package
    - Run `pnpm add @mastra/ai-sdk`
    - Verify `handleChatStream` is exported from the package
    - _Requirements: 21.1_

  - [x] 15.2 Create `createMastraInstance()` factory module
    - Create `src/lib/server/mastra/instance.ts`
    - Import `Mastra` from `@mastra/core` and `createMastraStorage` from `./storage`
    - Implement `createMastraInstance()` that returns `{ mastra, storage }` with centralized libSQL storage
    - Per-request instantiation (NOT a singleton) — each request gets a fresh instance
    - Agents within the supervisor hierarchy inherit storage automatically
    - Throw on init failure with connection details (URL, error type, timeout > 5s)
    - _Requirements: 25.1, 25.2, 25.3, 25.4, 25.5, 25.6, 25.7_

- [x] 16. Refactor Gateway to Mastra Native Supervisor Pattern
  - [x] 16.1 Refactor `EdApexGateway.stream()` to use supervisor `agents` property
    - In `src/lib/server/mastra/gateway.ts`, replace the manual `executeOrchestration()` two-step pattern
    - Create supervisor agent with `agents: [assistantAgent]` property for native delegation
    - Register routing tools (e.g., `getContext`) on the supervisor, domain tools on child agents
    - Replace separate classification + Assistant instantiation with a single `supervisor.stream()` call
    - Pass `abortSignal` from `request.signal` directly to `supervisor.stream()` options
    - Configure memory via instance-level storage inheritance (remove per-agent `new Memory({ storage })`)
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 22.1, 22.5, 22.6_

  - [x] 16.2 Update `EdApexGateway.generate()` to match supervisor pattern
    - Apply the same refactoring to the `generate()` method
    - Use `supervisor.generate()` with `abortSignal` and memory options
    - Remove `executeOrchestration()` usage from generate path
    - _Requirements: 20.1, 20.3_

  - [x] 16.3 Remove `executeOrchestration()` method
    - Delete the `executeOrchestration()` private method entirely
    - Remove the confidence gate logic from Gateway (move to supervisor instructions if needed)
    - Clean up unused imports (classification Zod schema, etc.)
    - _Requirements: 20.3_

- [x] 17. Refactor Chat API to use handleChatStream
  - [x] 17.1 Replace manual stream reader loops with `handleChatStream`
    - In `src/routes/api/chat/+server.ts`, import `handleChatStream` from `@mastra/ai-sdk`
    - Remove the `vResult.toUIMessageStream` branch
    - Remove the `vResult.fullStream` manual reader loop (switch on `reasoning-start`, `text-delta`, etc.)
    - Remove the `vResult.textStream` fallback reader loop
    - Remove manual `consumeStream()` calls
    - For non-rejected results: call `handleChatStream(result, { abortSignal: request.signal })` and use `writer.merge(chatStream)` to combine with custom events
    - Preserve manual writer for rejected responses (confidence gate async generator)
    - Preserve custom `data-chat`, `data-workflow`, `data-confirmation` events via `writer.write()`
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.6_

  - [x] 17.2 Add AbortSignal propagation to `gateway.stream()` call
    - Pass `request.signal` as `abortSignal` in the options to `gateway.stream()`
    - Ensure abort terminates the stream within 1 second of signal activation
    - On abort: close any open message parts, emit `finish` with `finishReason: "stop"`
    - Do NOT persist partial messages to Mastra memory on abort
    - _Requirements: 22.1, 22.2, 22.3, 22.4_

  - [x]* 17.3 Write property test for abort stream cleanup (Property 38)
    - **Property 38: Abort stream cleanup emits proper close events** — for any combination of open parts (text-start, reasoning-start), abort SHALL close all open parts and emit `finish` with `finishReason: "stop"`
    - **Validates: Requirements 22.3**

- [x] 18. Checkpoint - Ensure supervisor pattern and streaming work
  - Ensure all tests pass, ask the user if questions arise.

- [x] 19. Implement message persistence and page server retrieval
  - [x] 19.1 Wire Mastra Memory auto-persistence via supervisor
    - Ensure the supervisor agent's `stream()` call includes `memory: { thread: { id: threadId }, resource: resourceId }` option
    - Verify that Mastra Memory auto-persists both user and assistant messages to the thread
    - Remove any manual message persistence logic if present
    - Handle persistence failure gracefully: log error, continue streaming (don't block response)
    - _Requirements: 23.1, 23.4, 23.5, 23.6_

  - [x] 19.2 Update page server to load messages from Mastra storage
    - In `src/routes/(chat)/chat/[chatId]/+page.server.ts`, use `storage.getMessages({ threadId: chatId, limit: 200 })` to retrieve persisted messages
    - Order messages by creation time ascending (most recent last)
    - Return messages as `initialMessages` compatible with AI SDK `useChat` hook
    - Return empty messages array and null chat on storage failure (don't throw HTTP error)
    - _Requirements: 23.2, 23.7, 23.9_

  - [x] 19.3 Implement private thread access control in page server
    - Check thread visibility: if "private" and requesting user's `resourceId` doesn't match thread's `resourceId`, return 404
    - Allow access for non-private threads or matching `resourceId`
    - _Requirements: 23.8_

  - [x]* 19.4 Write property test for message persistence round-trip (Property 39)
    - **Property 39: Message persistence round-trip preserves all parts** — persist a message with text/reasoning/tool-call parts, retrieve it, verify all parts intact
    - **Validates: Requirements 23.5**

  - [x]* 19.5 Write property test for private thread access control (Property 40)
    - **Property 40: Private thread access control** — private thread + mismatched resourceId → 404; matching resourceId or non-private → success
    - **Validates: Requirements 23.8**

  - [x]* 19.6 Write property test for thread message pagination (Property 41)
    - **Property 41: Thread message pagination limit** — for N messages, retrieve exactly min(N, 200) ordered by createdAt ASC
    - **Validates: Requirements 23.9**

- [x] 20. Implement sidebar chat history from Mastra storage
  - [x] 20.1 Create sidebar thread fetching data layer
    - In `src/lib/components/sidebar-history/`, implement `fetchSidebarThreads(storage, resourceId)` function
    - Fetch threads using `storage.getThreadsByResourceId(resourceId, { limit: 50, orderBy: 'createdAt', order: 'desc' })`
    - Implement `groupThreadsByDate(threads)` — partition into Today, Yesterday, Last 7 days, Last 30 days, Older
    - Each thread in exactly one group; total across groups equals input count (max 50)
    - _Requirements: 24.1, 24.2, 24.3_

  - [x] 20.2 Wire reactive updates on `data-chat` events
    - In `chat-context.svelte.ts` `#onData` handler, when a `data-chat` event arrives:
      - If thread ID not in sidebar list → prepend new thread to top (increase list length by 1)
      - If thread ID already in list → update title in place (no duplicate, no length change)
    - _Requirements: 24.4, 24.5_

  - [x] 20.3 Handle empty state and error fallback
    - Display empty state message when no threads exist
    - Show skeleton loading placeholders during fetch
    - Fall back to empty state on storage error (10s timeout)
    - _Requirements: 24.6, 24.7_

  - [x]* 20.4 Write property test for sidebar thread date grouping (Property 42)
    - **Property 42: Sidebar thread date grouping** — threads partitioned into exactly 5 groups, each thread in exactly one group, total equals input count (max 50)
    - **Validates: Requirements 24.2**

  - [x]* 20.5 Write property test for sidebar reactive updates (Property 43)
    - **Property 43: Sidebar reactive thread list updates** — new thread ID → prepend (length +1); existing thread ID → update title in place (same length, no duplicates)
    - **Validates: Requirements 24.4, 24.5**

- [x] 21. Implement navigation fix
  - [x] 21.1 Fix `#onFinish` to prevent duplicate `goto()` after `replaceState`
    - In `src/lib/context/chat-context.svelte.ts`, update the `#onFinish` handler:
      - If no `data-chat` event was received during stream → skip `goto()` entirely
      - If `window.location.pathname === '/chat/${chatData.id}'` → skip `goto()` (replaceState already handled it)
      - Otherwise → call `goto()` as before (e.g., navigated from a different route during stream)
    - Result: zero additional history entries during normal stream lifecycle
    - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5_

  - [x]* 21.2 Write property test for navigation guard (Property 44)
    - **Property 44: Navigation guard — conditional goto after replaceState** — `goto()` called if and only if data-chat received AND current pathname ≠ `/chat/${chatId}`; skipped in all other cases
    - **Validates: Requirements 26.1, 26.2, 26.3, 26.5**

- [x] 22. Final checkpoint - Ensure all new tasks pass
  - Ensure all tests pass, ask the user if questions arise.

  - [x]* 22.1 Write integration tests for supervisor pattern + handleChatStream
    - Test full flow: message → supervisor.stream() → handleChatStream → SSE response
    - Test abort flow: trigger abort → verify clean close events + no partial persistence
    - Test rejected response: confidence gate → manual writer → proper finish event
    - _Requirements: 20.2, 21.1, 22.3_

  - [x]* 22.2 Write integration tests for message persistence and sidebar
    - Test persistence round-trip: send message → reload page → messages present
    - Test sidebar update: new chat → data-chat event → sidebar prepends thread
    - Test private thread: wrong resourceId → 404
    - _Requirements: 23.1, 23.2, 24.4, 23.8_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- **Task 1.0 is a hard prerequisite** — it gates all subsequent implementation. If Mastra provides native APIs for any subsystem (e.g., workflow events, web tools, observability), the design and tasks MUST be adapted before proceeding.
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (44 total)
- Unit tests validate specific examples and edge cases
- All code uses TypeScript within the existing SvelteKit + Mastra modular monolith
- Use `linkedom` for server-side HTML parsing (no full browser engine)
- Use `fast-check` for property-based testing via vitest
- Tasks 15-22 cover Requirements 20-26 (Mastra native supervisor, handleChatStream, AbortSignal, message persistence, sidebar history, storage config, navigation fix)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.0"] },
    { "id": 1, "tasks": ["1.1", "1.4"] },
    { "id": 2, "tasks": ["1.2", "2.1"] },
    { "id": 3, "tasks": ["1.3", "2.2", "3.1", "3.3"] },
    { "id": 4, "tasks": ["3.2", "3.4", "4.1"] },
    { "id": 5, "tasks": ["4.2", "4.3", "4.4", "4.5", "5.1"] },
    { "id": 6, "tasks": ["5.2", "7.1"] },
    { "id": 7, "tasks": ["7.2", "7.3", "8.1"] },
    { "id": 8, "tasks": ["8.2", "8.3", "8.4"] },
    { "id": 9, "tasks": ["8.5", "9.1", "9.3", "9.5"] },
    { "id": 10, "tasks": ["9.2", "9.4", "9.6", "11.1", "11.5", "11.7", "12.1"] },
    { "id": 11, "tasks": ["11.2", "11.3", "11.6", "11.8", "11.9", "12.2", "12.3"] },
    { "id": 12, "tasks": ["11.4", "12.4", "12.5"] },
    { "id": 13, "tasks": ["12.6", "13.1", "13.2", "13.3"] },
    { "id": 14, "tasks": ["13.4", "13.5"] },
    { "id": 15, "tasks": ["15.1", "15.2"] },
    { "id": 16, "tasks": ["16.1", "16.2"] },
    { "id": 17, "tasks": ["16.3", "17.1"] },
    { "id": 18, "tasks": ["17.2", "17.3"] },
    { "id": 19, "tasks": ["19.1", "19.2", "19.3"] },
    { "id": 20, "tasks": ["19.4", "19.5", "19.6", "20.1"] },
    { "id": 21, "tasks": ["20.2", "20.3", "21.1"] },
    { "id": 22, "tasks": ["20.4", "20.5", "21.2", "22.1", "22.2"] }
  ]
}
```
