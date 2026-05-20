# Requirements Document

## Introduction

This feature finalizes the EdApex Mastra orchestration migration by implementing five interconnected subsystems: Global Tools (Web Search & Fetch), Mastra Workflow Context Integration with SSE-based real-time UI updates, Workspace Panel CRUD completion with file-as-context referencing, @Mention Context Switching for role-based entity resolution, and the Mastra SSE mechanism for pushing workflow status to the browser. All subsystems operate within the existing Supervisor/Assistant routing architecture (`EdApexGateway`) and respect the strict SMS/Mastra decoupling boundary — linked only via `TenantContext` injection.

## Glossary

- **Gateway**: The `EdApexGateway` class at `src/lib/server/mastra/gateway.ts` that implements Supervisor/Assistant/Default agent role routing
- **TenantContext**: Immutable per-request context object containing `schoolId`, `userId`, `designationId`, `classId`, `sectionId`, `examId`, `academicId`
- **Workspace_Panel**: The right-side panel component at `src/lib/components/workspace/WorkspacePane.svelte` housing file tree, editor, upload, and workflow views
- **ChatComposer**: The chat input component where users type messages, slash commands, and @mentions
- **Mastra_Workflow_State**: In-memory state held by a running Mastra Workflow instance, isolated from the school database until explicit commit
- **SSE**: Server-Sent Events — a unidirectional HTTP streaming protocol for pushing real-time updates from server to client
- **TinyFish**: A free external service providing structured JSON web search results and JS-rendered markdown page fetches
- **DuckDuckGo_Scraper**: An HTML-scraping fallback for web search using DuckDuckGo's HTML endpoint (no API key required)
- **HTML_To_Markdown_Middleware**: A server-side pipeline that converts raw HTML into clean, token-efficient markdown
- **Global_Tools**: Tools always available to the agent regardless of active skill — specifically Web Search and Web Fetch
- **Coordinator**: A user with designation ID 5 who has cross-class access within their school
- **IT_User**: A user with designation ID 1 who has full administrative access within their school
- **Class_Teacher**: A user with designation ID 8 restricted to their assigned class and section
- **Context_Cache**: The `TenantContextCache` at `src/lib/server/mastra/context-cache.ts` with 5-minute TTL and synchronous bust on `/switch`
- **Skill_Registry**: The file-driven skill discovery system that maps slash commands to tool bundles
- **Supervisor_Pattern**: Mastra's native multi-agent orchestration pattern where a supervisor agent is configured with child `agents` and delegates tasks internally via `supervisor.stream()`
- **handleChatStream**: The adapter function from `@mastra/ai-sdk` that bridges a Mastra Agent stream to the AI SDK's `createUIMessageStreamResponse` format for SvelteKit integration
- **Mastra_Memory**: The built-in memory system in `@mastra/core` that persists conversation messages to a configured storage backend, keyed by `threadId` and `resourceId`
- **Mastra_Instance**: The top-level Mastra framework object that holds shared configuration (storage, telemetry, agents) and is instantiated per-request in the EdApex architecture

## Requirements

### Requirement 1: TinyFish Web Search Tool (Primary)

**User Story:** As a teacher or administrator, I want the AI agent to search the web for educational resources, so that I can get current information without leaving the chat interface.

#### Acceptance Criteria

1. THE Global_Tools module SHALL expose a `web_search` tool that is available to the Gateway agent regardless of the active skill
2. WHEN a web search is requested, THE Global_Tools module SHALL invoke the TinyFish search API as the primary provider
3. WHEN TinyFish returns a successful response, THE Global_Tools module SHALL return structured JSON results containing title (maximum 200 characters), URL, snippet (maximum 300 characters), and source domain for each result
4. WHEN TinyFish returns a successful response, THE Global_Tools module SHALL NOT apply any HTML-to-markdown transformation to the results; WHEN TinyFish returns an error response containing HTML content, THE HTML_To_Markdown_Middleware SHALL transform the error response body to markdown before returning it to the agent
5. THE Global_Tools module SHALL accept a query string (1 to 500 characters), a maximum result count (integer 1-10, default 5), and an optional region parameter (ISO 3166-1 alpha-2 country code) as input
6. IF the query string is empty, exceeds 500 characters, or the result count is outside the 1-10 range, THEN THE Global_Tools module SHALL reject the request and return a structured error indicating the validation failure without calling the TinyFish API
7. IF TinyFish returns an error or does not respond within 10 seconds, THEN THE Global_Tools module SHALL proceed to the fallback search provider as defined in the DuckDuckGo fallback requirement

### Requirement 2: DuckDuckGo Web Search Fallback

**User Story:** As a teacher or administrator, I want web search to remain functional when the primary provider is unavailable, so that I am not blocked by a single point of failure.

#### Acceptance Criteria

1. IF TinyFish search returns an error or times out after 10 seconds, THEN THE Global_Tools module SHALL fall back to the DuckDuckGo_Scraper, which SHALL itself enforce a 10-second request timeout
2. WHEN the DuckDuckGo_Scraper executes, THE Global_Tools module SHALL POST to `https://html.duckduckgo.com/html` with the query string
3. WHEN the DuckDuckGo_Scraper receives an HTML response containing search results, THE HTML_To_Markdown_Middleware SHALL parse result containers, extract titles, URLs, and descriptions up to the maximum result count specified in the original query (1-10, default 5), and return them as structured JSON containing title, URL, snippet, and source domain for each result
4. IF the DuckDuckGo_Scraper encounters a bot-challenge page, a non-200 HTTP status code, a network error, or a request timeout, THEN THE Global_Tools module SHALL return a structured error with status `SEARCH_UNAVAILABLE` and a message indicating the failure reason
5. THE HTML_To_Markdown_Middleware SHALL strip all navigation elements, advertisements, and tracking parameters from DuckDuckGo results to minimize token usage
6. THE Global_Tools module SHALL cache search results for 15 minutes keyed by query and provider to reduce redundant requests, retaining a maximum of 100 cached entries using least-recently-used eviction
7. IF the DuckDuckGo_Scraper receives a valid HTML response that contains zero search result containers, THEN THE Global_Tools module SHALL return an empty results array with a metadata field indicating no results were found

### Requirement 3: TinyFish Web Fetch Tool (Primary)

**User Story:** As a teacher or administrator, I want the AI agent to fetch and read web page content, so that I can get detailed information from specific URLs referenced in search results.

#### Acceptance Criteria

1. THE Global_Tools module SHALL expose a `web_fetch` tool that is available to the Gateway agent regardless of the active skill
2. WHEN a URL fetch is requested, THE Global_Tools module SHALL invoke TinyFish fetch as the primary provider
3. WHEN TinyFish fetch returns successfully, THE Global_Tools module SHALL return the page content as markdown with navigation, advertisements, scripts, and non-content elements removed, along with metadata containing the page title, source URL, and character count of the returned content
4. THE Global_Tools module SHALL accept a URL (HTTPS only), an extract mode (`markdown` or `text`, default `markdown`), and a maximum character limit (range 1 to 100000, default 20000) as input
5. IF the provided URL does not use HTTPS protocol at the point of initial submission, or resolves to localhost (127.0.0.0/8), or resolves to a private IP range (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16), THEN THE Global_Tools module SHALL reject the request and return a structured error with status `INVALID_URL` and a human-readable reason indicating why the URL was rejected — the Global_Tools module SHALL allow HTTPS URLs that redirect to HTTP during fetch without rejecting the request
6. WHEN the returned page content exceeds the configured maximum character limit, THE Global_Tools module SHALL truncate the content to the specified limit and include a metadata flag indicating the content was truncated

### Requirement 4: HTTP Fetch Fallback with HTML-to-Markdown

**User Story:** As a teacher or administrator, I want page fetching to degrade gracefully when TinyFish is unavailable, so that basic content extraction still works for static pages.

#### Acceptance Criteria

1. IF TinyFish fetch returns an error or times out after 15 seconds, THEN THE Global_Tools module SHALL fall back to a basic HTTP GET request with Readability-based content extraction
2. WHEN the HTTP fallback executes, THE Global_Tools module SHALL send a GET request with a standard browser User-Agent header and a connection timeout of 10 seconds
3. WHEN the HTTP fallback receives an HTML response, THE HTML_To_Markdown_Middleware SHALL extract the main content using a Readability algorithm, strip navigation and ads, and convert to markdown
4. WHEN the HTTP fallback receives a non-HTML response (JSON, plain text), THE Global_Tools module SHALL return the content directly without transformation
5. IF the HTTP fallback extracts fewer than 100 characters of text content from an HTML page, THEN THE Global_Tools module SHALL return a structured error with status `FETCH_REQUIRES_JS` indicating the page requires JavaScript rendering
6. THE Global_Tools module SHALL abort the HTTP response download if the response body exceeds 750KB; IF the download is successfully aborted, THEN THE Global_Tools module SHALL truncate the final markdown output to the character limit configured in the fetch request (default 20000 characters); IF the abort fails, THEN THE Global_Tools module SHALL return the full extracted markdown without truncation
7. THE Global_Tools module SHALL cache fetched page content for 24 hours keyed by URL and extract mode
8. IF the HTTP fallback receives a non-2xx status code or encounters a network error, THEN THE Global_Tools module SHALL return a structured error with status `FETCH_FAILED` including the HTTP status code or error reason

### Requirement 5: Extraction Workflow Context Integration

**User Story:** As a teacher, I want to see a live preview of extracted data in the Workspace Panel while the extraction workflow is suspended, so that I can review OCR results before committing them to the database.

#### Acceptance Criteria

1. WHEN the extraction workflow reaches the suspended state pending validation, THE Workspace_Panel SHALL mount an Extraction Inspector view displaying the current Mastra_Workflow_State snapshot within 1 second of receiving the SSE state-change event
2. THE Extraction Inspector SHALL render the OCR-mapped markdown response from the workflow state as a tabular preview with per-student rows showing student name, extracted field values, and a per-field confidence indicator (high, medium, low)
3. THE Extraction Inspector SHALL source all displayed data exclusively from the Mastra_Workflow_State and SHALL NOT read from the school database
4. WHILE the extraction workflow is in suspended state, THE Workspace_Panel SHALL display a status indicator showing "Awaiting Validation" with the workflow run ID
5. WHEN the user issues `/validate`, THE Workspace_Panel SHALL update the Extraction Inspector within 1 second of receiving validation results via SSE to display per-student pass/fail status and, for each failed student, the field name and reason for failure
6. IF the Mastra_Workflow_State snapshot contains no student data or is malformed, THEN THE Extraction Inspector SHALL display an error message indicating the extraction produced no usable results and prompt the user to re-run the extraction workflow

### Requirement 6: Publish Workflow Context Integration

**User Story:** As a teacher, I want to preview generated PDF report cards in the Workspace Panel before they are dispatched, so that I can verify correctness before parents receive them.

#### Acceptance Criteria

1. WHEN the publish workflow generates PDF artifacts, THE Workspace_Panel SHALL mount a Publish Viewer displaying the finalized PDF report cards and SHALL suspend the workflow before the dispatch step until the user issues `/publish` to approve
2. THE Publish Viewer SHALL render PDFs inline using the existing EditorCanvas component with type `pdf` and SHALL provide navigation controls (previous/next) to browse individual report cards when the batch contains more than one PDF
3. WHILE the publish workflow is running, THE Workspace_Panel SHALL display a progress indicator showing the current step name (generating PDFs, dispatching emails, updating timelines) updated within 1 second of receiving the corresponding SSE event
4. WHEN the publish workflow completes, THE Workspace_Panel SHALL display a summary showing the total PDF count, successful email dispatch count, failed dispatch count, and a scrollable list of per-student errors (student name and failure reason) for a maximum of 50 entries
5. IF one or more PDF artifacts fail to generate during the publish workflow, THEN THE Workspace_Panel SHALL display the Publish Viewer with any successfully generated PDFs and show a warning indicating the count of failed generations with per-student error reasons; IF all PDF artifacts fail to generate, THEN THE Workspace_Panel SHALL still display the Publish Viewer showing only the warning message with zero successful PDFs and the full list of per-student error reasons
6. WHILE the publish workflow is suspended awaiting approval, THE Workspace_Panel SHALL display an action prompt indicating the user may issue `/publish` to proceed with dispatch or `/cancel` to abort the workflow

### Requirement 7: Run History and Observability

**User Story:** As a coordinator or IT user, I want to view the step-by-step execution trace of current and past workflow runs, so that I can troubleshoot batch job failures without IT intervention.

#### Acceptance Criteria

1. THE Workspace_Panel SHALL provide a Run History view that lists Mastra Workflow runs for the current workspace from the `mastra_runs` libSQL table, displaying a maximum of 50 runs per page sorted by start time descending (most recent first)
2. WHEN a user selects a workflow run, THE Run History view SHALL display step-by-step execution markers showing success or failure status for each step
3. WHEN a user selects a workflow step within a run, THE Run History view SHALL display the raw JSON inputs and outputs for that step in a collapsible panel, truncated to 10,000 characters per payload with an option to expand the full content
4. WHEN a workflow step has failed, THE Run History view SHALL visually distinguish the failed step with a failure icon and display the error message and stack trace (truncated to 5,000 characters)
5. THE Run History view SHALL filter runs by the current `TenantContext` (schoolId, classId, sectionId) to enforce workspace isolation
6. IF the user's designation role is not Coordinator (default designationId 5) or IT_User (default designationId 1), THEN THE Workspace_Panel SHALL hide the Run History view and deny access to run history data — access control SHALL reference role names with designation IDs serving as configurable defaults in the designation mapping
7. IF no workflow runs exist for the current TenantContext filter, THEN THE Run History view SHALL display an empty state message indicating no runs are available for the current workspace

### Requirement 8: Workspace Panel File CRUD Completion

**User Story:** As a teacher, I want full file management capabilities in the Workspace Panel, so that I can organize, share, and reference workspace files without leaving the application.

#### Acceptance Criteria

1. THE Workspace_Panel SHALL support creating new files and directories via inline name input within the file tree, accepting names of 1 to 255 characters containing only alphanumeric characters, hyphens, underscores, dots, and spaces
2. IF the user submits a file or directory creation request that fails validation (naming conflict at the target path, invalid characters, empty name, or name exceeding 255 characters), THEN THE Workspace_Panel SHALL display an error message indicating the specific validation failure and retain the inline input for correction
3. THE Workspace_Panel SHALL support reading file content by opening files in the EditorCanvas with type-specific rendering: plain text and code as editable text, images (PNG, JPEG, SVG, WebP, GIF) as visual preview, and PDF as embedded document view
4. THE Workspace_Panel SHALL support updating file content via the built-in editor for text-based files (markdown, plain text, JSON, CSV) and persist changes to storage on explicit save action
5. WHEN a file or directory is deleted, THE Workspace_Panel SHALL display a confirmation prompt before permanent removal; WHEN the deletion completes successfully, THE Workspace_Panel SHALL close any open editor tabs referencing the deleted item — tabs SHALL remain open if the deletion fails
6. THE Workspace_Panel SHALL support uploading files via a file picker dialog, folder upload, and drag-and-drop onto the panel, enforcing a maximum file size of 50 MB per file and a maximum of 20 files per upload batch
7. IF a file upload exceeds the maximum file size or batch count, THEN THE Workspace_Panel SHALL reject the upload and display an error message indicating which constraint was violated
8. THE Workspace_Panel SHALL support downloading individual files via a download action that triggers a browser save dialog with the original filename
9. THE Workspace_Panel SHALL support sharing files by generating an access URL with a 7-day expiration that can be copied to clipboard, and SHALL display a transient confirmation when the URL is successfully copied

### Requirement 9: File-as-Context Reference in ChatComposer

**User Story:** As a teacher, I want to reference workspace files as context in my chat messages, so that the AI agent can use file content when answering my questions or executing workflows.

#### Acceptance Criteria

1. WHEN a user hovers over a file or directory item in the Workspace_Panel file tree, THE Workspace_Panel SHALL display an "Add as Context" icon button (`<MessageSquarePlus />` from `@lucide/svelte/icons/message-square-plus`) on that item, rendered as a hover-visible action alongside the existing dropdown menu trigger
2. WHEN the user clicks the "Add as Context" icon button, THE Workspace_Panel SHALL add the file reference as a context tag in the ChatComposer input, identified by the file's storage key, display name, and type (file or directory)
3. THE ChatComposer SHALL display referenced files as removable tags showing the file name and a type-appropriate icon (file icon for files, folder icon for directories)
4. WHEN a message is sent with file context tags, THE Gateway SHALL read the referenced file content (up to 50KB per file) and inject it into the agent's context alongside the user message
5. IF a referenced file exceeds 50KB, THEN THE Gateway SHALL truncate the injected content to 50KB and append a notice indicating the content was truncated
6. IF the user attempts to add more than 5 file references to a single message, THEN THE Workspace_Panel SHALL prevent the addition and display a notification indicating the maximum of 5 file references has been reached
7. IF a referenced file is a binary type (image, PDF, or other non-text format), THEN THE Gateway SHALL inject only the file metadata (name, type, size) without the raw binary content
8. IF a referenced file no longer exists at the time the message is sent, THEN THE Gateway SHALL exclude that reference from the injected context and return an error indication for that specific file

### Requirement 10: @Mention Context Switching for Coordinator and IT Users

**User Story:** As a coordinator or IT user, I want to switch between schools, students, classes, sections, academic years, and terms using @mention syntax in the chat, so that I can quickly change my working context without navigating away.

#### Acceptance Criteria

1. WHEN a Coordinator or IT_User types `@` in the ChatComposer, THE ChatComposer SHALL display a dropdown autocomplete listing available entity categories: schools, students, classes, sections, academic_year, and term
2. WHEN the user selects an entity category and continues typing, THE ChatComposer SHALL filter the dropdown to show matching entities fetched from the school database scoped to the user's schoolId, returning a maximum of 10 results per category
3. WHEN the user selects an entity from the dropdown, THE ChatComposer SHALL insert a visual tag representing the selected entity (name and type badge)
4. WHEN a message containing an @mention entity tag is submitted, THE Gateway SHALL update the active TenantContext by mapping the entity category to its corresponding field: school to schoolId, class to classId, section to sectionId, student to studentId, academic_year to academicId, and term to examId
5. IF a message contains multiple @mention entity tags, THEN THE Gateway SHALL apply context updates in left-to-right order, with each subsequent mention overriding any conflicting field set by a prior mention in the same message
6. WHEN a message containing a class @mention entity tag is submitted, THE Context_Cache SHALL bust the current session entry and re-hydrate with the new class and section context before the Gateway routes the message to an agent
7. THE @mention entity resolution SHALL validate that the selected entity belongs to the user's schoolId before applying the context switch
8. IF the @mention entity resolution determines that the selected entity does not belong to the user's schoolId, THEN THE Gateway SHALL reject the context switch, preserve the existing TenantContext unchanged, and return a `WORKSPACE_MISMATCH` error indicating which entity failed validation
9. WHILE @mention entity validation is in progress, THE Gateway SHALL block all TenantContext updates until validation completes successfully — no context field SHALL be modified until the entity is confirmed valid

### Requirement 11: @Mention Context Switching for Class Teachers

**User Story:** As a class teacher, I want to switch between students, academic years, and terms using @mention syntax, so that I can focus on specific students or time periods within my assigned class.

#### Acceptance Criteria

1. WHEN a Class_Teacher types `@` in the ChatComposer, THE ChatComposer SHALL display a dropdown autocomplete listing only three entity categories: students, academic_year, and term
2. THE @mention dropdown for Class_Teacher users SHALL restrict student results to those enrolled in the teacher's assigned classId and sectionId, and SHALL restrict academic_year and term results to those configured for the teacher's schoolId
3. WHEN a Class_Teacher selects a student @mention, THE Gateway SHALL set the studentId field in the active TenantContext for subsequent tool executions without changing the classId or sectionId
4. WHEN a Class_Teacher selects an academic_year @mention, THE Gateway SHALL update the academicId field in the active TenantContext; WHEN a Class_Teacher selects a term @mention, THE Gateway SHALL update the examId field in the active TenantContext
5. THE ChatComposer SHALL NOT display school, class, or section entity categories for Class_Teacher users
6. IF a Class_Teacher submits a message containing a student @mention referencing a student not enrolled in the teacher's assigned classId and sectionId, THEN THE Gateway SHALL reject the context switch with a `WORKSPACE_MISMATCH` error, discard the message without executing tools, and display an inline error message in the chat indicating the student is outside the teacher's assigned class

### Requirement 12: @Mention Dropdown Autocomplete UX

**User Story:** As any authorized user, I want the @mention dropdown to be responsive and keyboard-navigable, so that I can quickly find and select entities without interrupting my typing flow.

#### Acceptance Criteria

1. WHEN the user types `@` followed by at least one character, THE ChatComposer SHALL display the autocomplete dropdown within 200ms of the last keystroke, debouncing intermediate keystrokes so that only the final input after a 200ms pause triggers the search
2. THE autocomplete dropdown SHALL support keyboard navigation using Up/Down arrow keys to move the highlight between items, Enter or Tab to confirm the highlighted selection, and wrap navigation from last item back to first
3. THE autocomplete dropdown SHALL display a maximum of 10 matching results per category, sorted by relevance (exact prefix matches first, then fuzzy matches with a minimum 2-character overlap)
4. WHEN the user presses Escape or clicks outside the dropdown, THE ChatComposer SHALL dismiss the dropdown without inserting any tag
5. THE autocomplete dropdown SHALL display each entity with its name (truncated to 40 characters with ellipsis if longer), type badge, and parent context (class name for students, school name for classes)
6. IF the autocomplete search returns zero matching results, THEN THE ChatComposer SHALL display a "No results found" message within the dropdown and keep the dropdown open until the user dismisses it or modifies the query
7. IF the entity search request fails or does not respond within 3 seconds, THEN THE ChatComposer SHALL display a "Unable to load suggestions" message within the dropdown and allow the user to continue typing without blocking input
8. WHEN the user deletes the `@` trigger character or moves the cursor to a position before the `@` character, THE ChatComposer SHALL dismiss the dropdown without inserting any tag

### Requirement 13: Mastra SSE Workflow Status Push

**User Story:** As a teacher, I want to see real-time progress updates when a workflow is running, so that I know the system is working and can estimate when results will be ready.

#### Acceptance Criteria

1. WHEN a Mastra Workflow is triggered (extract, validate, or publish), THE Gateway SHALL establish an SSE connection scoped to the requesting user's TenantContext and return the workflow run ID in the initial connection event
2. WHILE a workflow is running, THE SSE mechanism SHALL emit progress events at each step transition containing the workflow run ID, current step name, step index (1-based), total step count, and a status message of no more than 200 characters
3. WHEN a workflow step completes successfully, THE SSE mechanism SHALL emit a step-complete event with the workflow run ID, step name, and step duration in milliseconds
4. WHEN a workflow step fails, THE SSE mechanism SHALL emit a step-error event with the workflow run ID, step name, error message (max 500 characters), and a boolean indicating whether the workflow can continue to subsequent steps
5. WHEN the entire workflow completes, THE SSE mechanism SHALL emit a workflow-complete event with the workflow run ID, final status (success or partial-failure), total duration in milliseconds, count of steps completed, and count of steps failed
6. WHILE an SSE connection is open, THE Gateway SHALL send a keepalive comment every 30 seconds to prevent proxy or browser timeout; IF the Gateway fails to send a keepalive within the 30-second interval, THEN THE Gateway SHALL immediately terminate the SSE connection and require the client to re-establish
7. IF a client establishes an SSE connection for a workflow that is already in progress, THEN THE Gateway SHALL emit a catchup event containing the current step index, total steps, and the status of all previously completed steps before resuming live events

### Requirement 14: Workflow Running Indicator in UI

**User Story:** As a teacher, I want a clear visual indicator when a workflow is actively running, so that I do not accidentally trigger duplicate workflows or navigate away.

#### Acceptance Criteria

1. WHILE a workflow is running, THE Workspace_Panel SHALL display a persistent status pill at the bottom of the panel showing the workflow name and "Running..." with a pulse animation
2. WHILE a workflow is running, THE ChatComposer SHALL display the active workflow name as a visible tag or badge adjacent to the input field, sourced from the existing `activeWorkflows` state array
3. WHEN the SSE mechanism emits a workflow-complete event, THE Workspace_Panel SHALL replace the running indicator with a completion summary showing the final status (success or partial-failure) and result counts, that auto-dismisses after 10 seconds
4. IF the SSE connection drops unexpectedly, THEN THE Workspace_Panel SHALL display a "Connection Lost — Reconnecting..." indicator and attempt reconnection with exponential backoff (1s, 2s, 4s, max 30s) for a maximum of 10 attempts
5. IF reconnection attempts are exhausted without restoring the SSE connection, THEN THE Workspace_Panel SHALL display a persistent "Connection Failed" indicator with a manual "Retry" action and preserve the last known workflow state
6. WHILE a workflow is running, THE ChatComposer SHALL block submission of all slash commands that would trigger a duplicate workflow of the same type until the current workflow completes — blocked commands SHALL NOT be queued for later execution, and THE ChatComposer SHALL display a message indicating a workflow of that type is already in progress
7. WHILE multiple workflows are running concurrently, THE Workspace_Panel SHALL stack status pills vertically, displaying one pill per active workflow up to a maximum of 3 simultaneous workflows

### Requirement 15: Global Tools Availability and Skill Independence

**User Story:** As a developer, I want web search and fetch tools to be always available regardless of which skill is active, so that the agent can augment any conversation with web information.

#### Acceptance Criteria

1. THE Skill_Registry SHALL classify `web_search` and `web_fetch` as Global_Tools that are injected into every agent instantiation, including when no skill is active (default routing mode) and when any skill is active
2. WHILE any skill is active (including locked skills like `/extraction`), THE Gateway SHALL include `web_search` and `web_fetch` in the agent's available tool set alongside the skill's own tools
3. THE Global_Tools SHALL NOT count toward the maximum 4-tool-per-skill limit defined by the Micro-Skill architecture — a skill with 4 declared tools SHALL still receive both Global_Tools in addition, resulting in exactly 6 total available tools (4 skill-declared + 2 Global_Tools)
4. THE Global_Tools SHALL operate independently of TenantContext — the Gateway SHALL NOT pass schoolId, classId, or sectionId as filtering parameters to `web_search` or `web_fetch` tool invocations
5. IF a skill declares a tool with the same name as a Global_Tool (`web_search` or `web_fetch`), THEN THE Skill_Registry SHALL reject the skill registration and log a conflict error indicating the duplicate tool name
6. IF a Global_Tool fails to register during agent instantiation, THEN THE Gateway SHALL log the registration failure and proceed with agent instantiation using only the remaining successfully registered Global_Tools

### Requirement 16: HTML-to-Markdown Middleware for DuckDuckGo Path

**User Story:** As a developer, I want a lightweight HTML-to-markdown conversion pipeline optimized for low token usage, so that DuckDuckGo search results and HTTP-fetched pages consume minimal context window.

#### Acceptance Criteria

1. THE HTML_To_Markdown_Middleware SHALL strip all `<script>`, `<style>`, `<nav>`, `<header>`, `<footer>`, and `<aside>` elements and their nested content before conversion
2. THE HTML_To_Markdown_Middleware SHALL convert semantic HTML elements (headings, paragraphs, lists, links, tables, code blocks, and images) to their markdown equivalents, rendering `<img>` tags as `![alt](src)` syntax
3. THE HTML_To_Markdown_Middleware SHALL collapse multiple consecutive whitespace characters and blank lines into single separators
4. THE HTML_To_Markdown_Middleware SHALL preserve link URLs in markdown link syntax `[text](url)` for reference
5. THE HTML_To_Markdown_Middleware SHALL produce output that is at least 60% smaller in character count than the raw HTML input for any HTML document containing at least 1KB of markup with a body element
6. THE HTML_To_Markdown_Middleware SHALL complete conversion of a 100KB HTML document within 50ms on the server
7. IF the HTML input is empty, null, or cannot be parsed as valid markup, THEN THE HTML_To_Markdown_Middleware SHALL return an empty string without throwing an error

### Requirement 17: Workspace Panel Workflow State Display

**User Story:** As a teacher, I want the Workspace Panel to clearly indicate the current workflow state, so that I always know whether I am in extraction, validation, or publish phase.

#### Acceptance Criteria

1. THE Workspace_Panel SHALL display the current workflow phase (Idle, Extracting, Awaiting Validation, Validating, Awaiting Publish, Publishing, Complete, Error) as a state badge in the panel header, defaulting to "Idle" when no workflow is active, and displaying the most recently triggered workflow's state when multiple entries exist in `activeWorkflows`
2. WHEN the workflow state transitions, THE Workspace_Panel SHALL update the state badge within 1 second of receiving the SSE event
3. WHILE the workflow state is "Awaiting Validation" or "Awaiting Publish", THE Workspace_Panel SHALL display an action prompt below the state badge indicating the next required user action (`/validate` or `/publish` respectively) and remove the prompt when the state transitions away
4. THE Workspace_Panel SHALL derive workflow state exclusively from SSE events and the `activeWorkflows` reactive state — never by polling the server
5. IF a workflow step-error SSE event indicates the workflow cannot continue, THEN THE Workspace_Panel SHALL transition the state badge to "Error" and display the error message from the event beneath the badge

### Requirement 18: TinyFish API Integration Setup

**User Story:** As a developer, I want a centralized TinyFish API client configured with proper authentication and error handling, so that both web_search and web_fetch tools can share a single integration layer.

#### Acceptance Criteria

1. THE System SHALL store the TinyFish API key in the environment variable `TINYFISH_API_KEY` and read it at runtime from `$env/dynamic/private`
2. THE TinyFish search client SHALL send GET requests to `https://api.search.tinyfish.ai` with the query as a URL parameter and the API key in the `X-API-Key` header
3. THE TinyFish fetch client SHALL send POST requests to `https://api.fetch.tinyfish.ai` with a JSON body containing a `urls` array and the API key in the `X-API-Key` header
4. THE TinyFish client module SHALL be located at `src/lib/server/mastra/tools/tinyfish-client.ts` and export `tinyfishSearch(query, options)` and `tinyfishFetch(url, options)` functions
5. THE TinyFish client SHALL enforce a rate limit of 5 queries per minute for search and 25 URLs per minute for fetch as per the free tier constraints
6. IF the `TINYFISH_API_KEY` environment variable is not set, THEN THE TinyFish client SHALL skip TinyFish calls entirely and immediately fall back to the DuckDuckGo/HTTP fallback path without logging an error

### Requirement 19: Mastra Native API Verification Before Implementation

**User Story:** As a developer, I want every new module or modification to be verified against the Mastra framework documentation before implementation, so that we use native APIs and plugins where available instead of reinventing functionality.

#### Acceptance Criteria

1. BEFORE implementing any new server-side module (tools, workflows, SSE, memory, storage), THE developer SHALL consult the official Mastra documentation at `https://mastra.ai/docs` to determine if a native API, built-in utility, or official plugin exists for the required functionality
2. IF a native Mastra API exists for the required functionality (e.g., `@mastra/core` workflow events, built-in tool utilities, storage adapters, or memory providers), THEN THE implementation SHALL use the native API rather than building a custom solution
3. IF an official Mastra plugin or community package exists for the required functionality (e.g., web search tools, SSE streaming, observability), THEN THE implementation SHALL evaluate the plugin for compatibility and use it if it meets the requirements without introducing unnecessary dependencies
4. IF no native API or plugin exists, THEN THE implementation SHALL proceed with a custom solution and document the rationale for the custom approach in a code comment at the module level
5. THE developer SHALL NOT guess or assume Mastra API capabilities — all decisions SHALL be based on verified documentation lookups or inspecting the installed `@mastra/core` package exports
6. WHEN modifying existing Mastra-layer modules (gateway.ts, router.ts, workflows/*.ts), THE developer SHALL verify that the modification aligns with Mastra's documented patterns for that module type (Agent, Workflow, Tool, Memory) before making changes

### Requirement 20: Mastra Native Supervisor Pattern for Gateway

**User Story:** As a developer, I want the EdApex Gateway to use Mastra's native supervisor pattern with the `agents` property, so that `supervisor.stream()` returns a proper Mastra stream that can be consumed directly and piped correctly to the AI SDK writer.

#### Acceptance Criteria

1. THE Gateway SHALL instantiate the supervisor agent using Mastra's native supervisor pattern with the `agents` property (as documented at `https://mastra.ai/docs/agents/supervisor-agents`), passing child agents (Assistant, workflow agents) as registered sub-agents rather than manually orchestrating classification and routing
2. WHEN the supervisor streams a response, THE Gateway SHALL consume the stream using `for await (const chunk of stream.textStream)` or equivalent Mastra stream iteration — the stream returned by `supervisor.stream()` SHALL be a proper Mastra Agent stream compatible with `@mastra/ai-sdk` adapters
3. THE Gateway SHALL remove the manual `executeOrchestration` two-step pattern (separate Supervisor classification followed by Assistant instantiation) and replace it with a single `supervisor.stream()` call that delegates internally to the appropriate child agent
4. THE Gateway SHALL pass `abortSignal` from the incoming HTTP request directly to `supervisor.stream()` options (as documented at `https://mastra.ai/reference/streaming/agents/stream`) to support client-initiated cancellation via the stop button
5. IF the supervisor pattern requires tool-based routing (e.g., a `getContext` tool for dynamic context discovery), THEN THE Gateway SHALL register those tools on the supervisor agent itself, not on child agents — child agents SHALL only receive their domain-specific tools

### Requirement 21: Proper Streaming via handleChatStream from @mastra/ai-sdk

**User Story:** As a developer, I want the chat API endpoint to use `handleChatStream` from `@mastra/ai-sdk` as the adapter between Mastra's Agent stream and the AI SDK's `createUIMessageStreamResponse`, so that streaming works correctly without manual chunk-type translation.

#### Acceptance Criteria

1. THE chat API endpoint (`src/routes/api/chat/+server.ts`) SHALL import `handleChatStream` from `@mastra/ai-sdk` and use it to bridge the Mastra agent stream returned by `gateway.stream()` to the AI SDK response format, passing the stream result object directly as the first argument to `handleChatStream`
2. THE chat API endpoint SHALL remove the manual `fullStream` reader loop (the `switch` block translating `reasoning-start`, `reasoning-delta`, `reasoning-end`, `text-delta`, `text-end` chunk types into AI SDK writer events) and SHALL remove the `textStream` fallback reader loop — `handleChatStream` SHALL handle all chunk-type translation natively for non-rejected responses
3. WHEN `handleChatStream` is invoked, THE chat API endpoint SHALL NOT call `consumeStream()`, `toUIMessageStream()`, or manually iterate `textStream` on the Mastra stream result — the adapter SHALL handle stream consumption internally
4. IF the gateway returns a rejected response (confidence gate below threshold), THEN THE chat API endpoint SHALL continue to use the existing manual writer approach (emitting `text-start`, `text-delta`, `text-end`, and `finish` events) for the rejection message, since rejected responses produce an async generator rather than a Mastra agent stream
5. THE chat API endpoint SHALL continue to emit custom data events (`data-chat`, `data-workflow`, `data-confirmation`) using the AI SDK `writer` within the `createUIMessageStream` execute callback, and SHALL merge the `handleChatStream` output into the same stream using `writer.merge()` so that custom events and agent response chunks are delivered on a single response stream
6. WHEN `gateway.stream()` returns a non-rejected result, THE chat API endpoint SHALL pass `request.signal` as the `abortSignal` option to `handleChatStream` (if supported) or to `gateway.stream()` options, so that client-initiated cancellation (stop button) terminates the stream within 1 second of the abort event

### Requirement 22: AbortSignal Support in Agent Streaming

**User Story:** As a user, I want to be able to stop a running AI response by clicking the stop button, so that I can cancel long-running or unwanted generations immediately.

#### Acceptance Criteria

1. WHEN the user clicks the stop button in the chat UI, THE chat API endpoint SHALL propagate the `request.signal` (AbortSignal) to the Mastra agent's `stream()` call via the `abortSignal` option (as documented at `https://mastra.ai/reference/streaming/agents/stream`)
2. WHEN the AbortSignal is triggered, THE Mastra agent SHALL terminate the active LLM generation and close the stream without emitting error-type chunks to the client, returning the HTTP response with a 200 status code
3. IF the stream is aborted, THEN THE chat API endpoint SHALL close any open message parts (text-start without text-end, reasoning-start without reasoning-end) and emit a `finish` event with `finishReason: "stop"` to the client so the UI transitions out of the loading state
4. IF the stream is aborted, THEN THE chat API endpoint SHALL NOT persist the partial assistant message to Mastra memory for the active thread, ensuring the conversation history contains only complete messages
5. IF the AbortSignal is triggered during the supervisor classification phase (before the assistant agent begins streaming), THEN THE Gateway SHALL cancel the classification request and return without initiating the assistant stream
6. IF the supervisor pattern is active and a child agent is streaming, THEN THE Gateway SHALL propagate the `abortSignal` from the HTTP request through to the actively streaming child agent within 100ms of signal activation

### Requirement 23: Message Persistence via Mastra Memory/Thread System

**User Story:** As a user, I want my chat messages to be persisted to Mastra storage, so that when I reload the page or navigate back to a conversation, all previous messages are available.

#### Acceptance Criteria

1. WHEN the supervisor agent processes a message, THE Mastra Memory system SHALL automatically persist both the user message and the assistant response to the thread identified by `threadId` and `resourceId` — persistence SHALL happen as part of the agent's native memory integration (via the `memory` option passed to `agent.stream()` or `agent.generate()`), not as a separate manual step
2. WHEN SvelteKit loads the chat page from scratch (`src/routes/(chat)/chat/[chatId]/+page.server.ts`), THE page server SHALL retrieve persisted messages from Mastra storage via `storage.getMessages({ threadId: chatId })` and return them as an array of message objects containing role, content parts, and metadata compatible with the AI SDK `useChat` hook's `initialMessages` prop
3. THE Mastra Memory SHALL be configured on the assistant agent with the `LibSQLStore` storage adapter so that all interactions within a thread (including tool call results and multi-step reasoning) are persisted to the same thread history identified by `threadId`
4. IF a thread does not exist when the first message is sent, THEN THE Mastra Memory system SHALL create the thread automatically using the `threadId` generated by the chat API endpoint
5. THE persisted messages SHALL include all message parts (text, reasoning, tool calls, tool results) so that the full conversation context is available on page reload
6. IF Mastra storage is unavailable or throws an error during message persistence, THEN THE Gateway SHALL log the error to the server console and continue streaming the response to the user without blocking — message persistence failure SHALL NOT cause the chat response to fail
7. IF the page server fails to retrieve messages from Mastra storage (connection error or timeout), THEN THE page server SHALL return an empty messages array and a null chat object rather than returning an HTTP error response
8. WHEN the page server retrieves a thread, IF the thread's visibility is "private" and the requesting user's resource ID does not match the thread's `resourceId`, THEN THE page server SHALL return a 404 response
9. WHEN the page server loads messages for a thread, THE page server SHALL retrieve a maximum of 200 messages ordered by creation time (most recent last) to prevent unbounded memory usage on long-running conversations

### Requirement 24: Sidebar Chat History from Mastra Storage

**User Story:** As a user, I want the sidebar chat history to display my previous conversations loaded from Mastra storage, so that I can navigate between conversations and see their titles.

#### Acceptance Criteria

1. THE sidebar chat history component (`src/lib/components/sidebar-history`) SHALL fetch the list of chat threads from Mastra storage (as documented at `https://mastra.ai/docs/memory/message-history`) using the current user's `resourceId` (formatted as `user-{userId}`) as the filter
2. WHEN the sidebar loads, THE sidebar chat history SHALL retrieve threads sorted by thread creation date descending, displaying a maximum of 50 threads, and SHALL group them into relative date categories (Today, Yesterday, Last 7 days, Last 30 days, Older)
3. THE sidebar chat history SHALL display each thread with its title (from thread metadata, truncated to a single line with ellipsis if exceeding the sidebar width) and grouped under its relative date heading
4. WHEN a `data-chat` event is received in `#onData` for a thread ID not already present in the list, THE sidebar chat history SHALL prepend the new thread to the top of the list without requiring a full page reload
5. WHEN a `data-chat` event is received in `#onData` for a thread ID already present in the list, THE sidebar chat history SHALL update that thread's title in place without duplicating the entry
6. IF Mastra storage returns an empty thread list, THEN THE sidebar chat history SHALL display an empty state message indicating no previous conversations exist
7. IF Mastra storage is unavailable or returns an error, THEN THE sidebar chat history SHALL display skeleton loading placeholders during the fetch attempt and fall back to the empty state message if the request fails within 10 seconds

### Requirement 25: Storage Configuration at Mastra Instance Level

**User Story:** As a developer, I want storage to be configured at the Mastra instance level rather than per-agent, so that all agents within the supervisor hierarchy share the same storage backend and thread history.

#### Acceptance Criteria

1. THE Mastra instance SHALL be configured with a centralized storage adapter (libSQL-based) passed at the instance level (as documented at `https://mastra.ai/docs/memory/message-history` and `https://mastra.ai/docs/agents/supervisor-agents`), rather than configuring storage individually on each agent's Memory constructor
2. THE centralized storage adapter SHALL use the existing `createMastraStorage()` factory from `src/lib/server/mastra/storage.ts` to ensure consistency with the page server's storage access
3. WHEN the supervisor agent or any child agent accesses Memory, THE Mastra framework SHALL resolve storage from the instance-level configuration — individual agents SHALL NOT instantiate their own `Memory({ storage: ... })` independently
4. THE Mastra instance SHALL be instantiated per-request (not as a global singleton) to respect the modular monolith architecture and TenantContext isolation boundaries
5. IF the storage adapter fails to initialize (e.g., libSQL connection error or timeout exceeding 5 seconds), THEN THE Mastra instance SHALL throw an error at construction time that includes the storage backend URL and the nature of the failure (connection refused, timeout, or authentication error) rather than failing silently during message persistence
6. WHEN the supervisor agent writes a message to a thread and a child agent subsequently reads from the same thread within the same request, THE child agent SHALL retrieve the message written by the supervisor, confirming that both agents resolve to the same storage instance
7. IF a developer adds a new agent to the supervisor hierarchy without explicitly assigning storage, THEN THE new agent SHALL inherit the instance-level storage configuration by default without additional configuration

### Requirement 26: Navigation Fix — Prevent Duplicate goto After replaceState

**User Story:** As a user, I want the chat URL to update smoothly without unnecessary page navigations, so that creating a new chat does not cause flickering or redundant history entries.

#### Acceptance Criteria

1. WHEN `#onData` receives a `data-chat` event and calls `replaceState()` to update the URL to `/chat/[chatId]`, THE `#onFinish` handler SHALL NOT call `goto()` if the current page URL pathname equals `/chat/[chatId]` for the active `chatId`
2. IF the current page URL pathname already equals `/chat/[chatId]` for the active `chatId` at the time `#onFinish` executes, THEN THE `#onFinish` handler SHALL skip the `goto()` call and perform no navigation
3. IF `#onData` has NOT received a `data-chat` event during the stream, THEN `#onFinish` SHALL also skip the `goto()` call since the URL was already correct before the stream started
4. WHEN `replaceState` is called in `#onData`, THE system SHALL replace the current browser history entry without adding a new entry, and skipping `goto()` in `#onFinish` SHALL result in zero additional history entries being created during the entire stream lifecycle
5. WHEN the navigation fix is applied, THE system SHALL preserve existing `goto()` behavior for any case where `chatData.id` is defined but the current page URL pathname does not equal `/chat/[chatId]` for that `chatId`

## Implementation Status

### Global Tools (Req 1-4, 15-16, 18)
- **Status: NEW — Build from scratch**
- No web search or fetch tools exist in the codebase
- No TinyFish, DuckDuckGo, or HTML-to-markdown middleware exists
- The `tools/index.ts` already exports `coreTools` and `workflowTools` — Global Tools will be a new category
- The Gateway's `resolveToolsForIntent()` method already merges tool sets — Global Tools injection point exists

### Extraction/Publish/Validation Workflow Context (Req 5-6, 17)
- **Status: REFACTOR — Stub implementations exist, need full workflow logic**
- `workflows/extraction.ts`, `workflows/validation.ts`, `workflows/publish.ts` exist but are stubs
- `tools/workflow-tools.ts` has `extractLogic`, `validateLogic`, `publishLogic` returning placeholder data
- The Workspace Panel (`WorkspacePane.svelte`) already has file tree, editor canvas, upload, and status indicators
- No SSE mechanism exists — needs to be built from scratch
- The `WorkspaceStatus.svelte` component exists and shows upload status — can be extended for workflow state

### Run History (Req 7)
- **Status: NEW — Build from scratch**
- No run history UI exists in the workspace panel
- The `mastra_runs` libSQL table concept is referenced in docs but needs to be verified/created in `mastra/db/schema.ts`

### Workspace Panel CRUD (Req 8)
- **Status: MOSTLY COMPLETE — Minor gaps to fill**
- Create (inline name input): ✅ Implemented in `WorkspacePane.svelte` via `startCreate()`
- Read (open in editor): ✅ Implemented via `handleFileClick()` and `EditorCanvas`
- Update (edit text files): ⚠️ EditorCanvas exists but save-back-to-storage needs verification
- Delete (with confirmation): ✅ Implemented via `deleteFile()` with `confirm()` prompt
- Upload (file picker, folder, drag-drop): ✅ Implemented via `processUpload()`, `handleDrop()`
- Download: ✅ Implemented via `downloadFile()`
- Sharing (time-limited URL): ❌ Not implemented — needs new API endpoint

### File-as-Context Reference (Req 9)
- **Status: PARTIALLY COMPLETE — Core wiring exists, hover button missing**
- `FilesContext` already has `references` state, `addReference()`, and `removeReference()` methods
- `WorkspacePane.svelte` already has `toggleReference()` function wired to `onToggleReference` prop
- `FileTree.svelte` imports `MessageSquarePlusIcon` but does NOT render it as a hover button — it's only in the dropdown menu or not rendered at all
- ChatComposer already renders file reference tags with remove buttons
- The Gateway does NOT yet inject file content into agent context — needs server-side implementation

### @Mention Context Switching (Req 10-12)
- **Status: PARTIALLY COMPLETE — UI shell exists, backend logic missing**
- `ChatComposer.svelte` already detects `@` input and shows `MentionDropdown`
- `MentionDropdown.svelte` exists but only shows students and files — no classes, sections, academic_year, term categories
- No keyboard navigation (arrow keys, Enter/Tab) implemented in the dropdown
- No debouncing implemented — filtering is synchronous on local data
- No server-side entity search API endpoint exists
- `TenantContextCache` exists with `bustCache()` for `/switch` operations
- The Gateway does NOT process @mention tags from messages to update TenantContext

### SSE Mechanism (Req 13-14)
- **Status: NEW — Build from scratch**
- No SSE/EventSource implementation exists anywhere in the codebase
- `chat-context.svelte.ts` has `activeWorkflows` state array — can be driven by SSE events
- No `/api/workflow/events` or similar SSE endpoint exists

### Mastra Supervisor Pattern & Streaming (Req 20-22)
- **Status: REFACTOR — Major architectural change to Gateway**
- The current Gateway uses a manual two-step orchestration: Supervisor classifies, then a separate Assistant agent streams
- Needs to be replaced with Mastra's native supervisor pattern using the `agents` property
- The chat API endpoint (`+server.ts`) currently has a complex manual chunk-type translation loop for `fullStream` — this should be replaced by `handleChatStream` from `@mastra/ai-sdk`
- `@mastra/ai-sdk` package may need to be installed
- `request.signal` (AbortSignal) is already checked in the manual reader loop but needs to be passed natively to `agent.stream()` options

### Message Persistence & Storage (Req 23-25)
- **Status: PARTIALLY COMPLETE — Storage exists, persistence wiring incomplete**
- `createMastraStorage()` exists in `src/lib/server/mastra/storage.ts` and is used by the page server to load messages
- The page server (`+page.server.ts`) already calls `storage.getMessages({ threadId })` — but messages may not be persisted correctly during streaming
- Memory is currently configured per-agent (`new Memory({ storage: createMastraStorage() })`) — needs to move to Mastra instance level
- No Mastra instance-level configuration exists yet — agents are instantiated directly in the Gateway
- Sidebar chat history component exists but its data source needs verification against Mastra storage

### Navigation Fix (Req 26)
- **Status: BUG FIX — Small targeted change**
- `#onFinish` in `chat-context.svelte.ts` currently always calls `goto()` when `chatData.id` exists
- `#onData` already calls `replaceState()` to update the URL when a `data-chat` event arrives
- The fix requires `#onFinish` to check if the URL was already updated before calling `goto()`
