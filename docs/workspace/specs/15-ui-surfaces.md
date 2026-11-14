# 15 — UI Surfaces: Web, Desktop, Mobile and v2 Native

**Draft.** Defines the UI platform contract and deployment boundary. Implementation belongs to Phase 10. The starting point is `vercel/chatbot`; it supplies UI and application patterns to evaluate, not the agent runtime, product design authority, or deployment architecture.

## 15.1 Purpose and decisions

This spec defines how EdApex UI behaves across web, desktop, mobile, and a future native app. The platforms share interaction and state contracts while using appropriate platform-specific presentation.

**Specification context.** This spec owns routes, shell/navigation, responsive and platform placement, restore/queue/approval/artifact behavior, and PWA scope. It does **not** own visual tokens (19), chat state/message parts (17), GenUI parsing/catalog (21), source-reuse rules (43/44), or measured budgets (47). Where those specs are more specific, they win for their layer.

Decisions:

- Start from the React/Next.js UI in [`vercel/chatbot`](https://github.com/vercel/chatbot), selectively reusing components after an integration, accessibility, and license review.
- Target Cloudflare Workers for web deployment. Evaluate vinext against the actual app and pin a tested version before production use.
- Treat [`olegische/xcodex`](https://github.com/olegische/xcodex), on its `wasm` branch, as a candidate for the browser/WASM agent runtime—not as a proven package or drop-in integration.
- Use OpenDuet as a reference for Chat, Tasks, Make, tool activity, approvals, and runtime-state interactions. Do not copy its route tree or visual identity.
- Use OpenUI and A2UI as **distinct generated-UI formats with separate adapters and renderers** if both are enabled. OpenUI does not natively render A2UI payloads.
- Use EdApex Gold on Slate visual tokens. Neither the Vercel chatbot nor OpenDuet visual style is the product identity.
- Do not use the Vercel AI SDK as the UI/runtime interaction contract.
- Keep the narrow cowork layout at 430px maximum width on desktop; admin tables may use wider page shells.
- Treat server-side policy, approvals, and school-data authorization as authoritative. Client-side or WASM runtime state is not authority.

## 15.2 Source of truth and source pins

`extracted-ui-spec.md` is the **OpenDuet interaction reference**, not a complete EdApex platform spec. It establishes:

- the authenticated OpenDuet shell
- Chat, Tasks and Make
- tool activity, approvals and runtime states
- mobile-first 430px composition
- OpenDuet visual tokens and motion/accessibility rules
- its own evidence gaps

It does **not** define:

- EdApex Gold on Slate tokens
- Tauri desktop/mobile behavior
- PWA behavior
- EdApex admin/public screens
- native mobile components for v2
- component/state architecture for this repository

This document defines those missing surfaces.

| Concern | Source of truth |
|---|---|
| Starting web UI | Pinned commit of `vercel/chatbot` |
| Web deployment | Pinned, tested vinext version and Cloudflare Worker configuration |
| Browser runtime candidate | Pinned commit of `olegische/xcodex`, `wasm` branch |
| Interaction patterns | OpenDuet source at a pinned commit, plus EdApex decisions in this spec |
| Visual design | EdApex Gold on Slate tokens from `src/routes/layout.css` |
| OpenUI format and renderer | Pinned OpenUI package/repository version and local catalog |
| A2UI format and renderer | Pinned A2UI protocol/spec and compatible renderer version |
| Security and retention | `60-security-privacy.md` |
| Artifact behavior | `16-artifacts.md` and `22-documents-and-artifacts.md` |
| Event/state mapping | `17-chat-framework.md` |
| Generated UI data model | `21-generative-ui-openui.md` and `42-agent-db-schema.md` |

The inspected `vercel/chatbot` package snapshot resolves to commit `a8989b522fa3672a2ae52f053105e40993b36ca1`. This is an inspection reference, not yet the approved implementation pin. Confirm the chosen commit, license obligations, and any newer required fixes before forking or copying files.

The inspected starter is a Next.js App Router application with React, Tailwind, shadcn/Radix components, AI SDK dependencies, Auth.js, Drizzle/Postgres, Redis, Vercel Blob, and artifact modules for text, code, image, and sheets. The starter therefore requires more than a hosting configuration change: its provider, persistence, auth, stream, and deployment assumptions need an explicit migration plan.

## 15.3 Starter reuse and replacement boundary

### Reuse candidates

Review and selectively adapt:

- React UI primitives and accessible component patterns;
- composer, message-list, and scroll behavior where decoupled from AI SDK message types;
- artifact presentation and editor concepts for text, code, image, and sheet content;
- existing component styling only as implementation reference, after replacing product tokens;
- applicable tests and interaction edge cases.

Reusing a file does not imply reusing its data model, server action, provider, or storage assumptions.

### Replace or isolate

Audit and remove or replace as needed:

- AI SDK hooks, message/part types, stream protocol, and server-side generation pipeline;
- Vercel AI Gateway and provider integrations;
- Vercel Blob and Vercel-specific functions/telemetry;
- starter-specific persistence and schema assumptions that conflict with EdApex policies;
- Auth.js beta configuration and session behavior if not adopted as the EdApex auth boundary;
- Vercel-specific setup, deployment buttons, environment instructions, and project configuration;
- any starter artifact actions that directly assume its original AI or storage backend.

Do not perform a broad mechanical rewrite before the UI/data/runtime boundaries are defined. First map existing starter components to the target contracts; then replace integrations behind adapters.

## 15.4 Platform matrix

| Surface | Shell | Cowork content | Platform-specific behavior |
|---|---|---|---|
| Web PWA | Browser | Adaptive: tab bar below 1024px, inset rail + canvas at or above | Installable where supported; browser-safe file access; CSS safe areas |
| Tauri desktop | Tauri 2 window | Adaptive: rail + canvas; transcript measured, not device-detected | Resizable; keyboard/mouse; desktop file dialogs; wider admin PageShells |
| Tauri mobile | Tauri 2 mobile | Full viewport; measured transcript | System WebView; safe-area and keyboard handling; touch and native pickers |
| v2 native | RN/Lynx/Flutter, TBD | Native navigation and components | Native equivalents with shared state, policy, and accessibility contracts |

### Adaptation vs. measure

Three separate concerns; do not conflate them.

1. **The shell adapts to the device.** Below 1024px the primary navigation is a tab bar. At or above 1024px it is an inset sidebar that collapses to icons, plus a canvas. Admin and settings PageShells may widen to 768px or 960px.
2. **The chat column is capped for readability.** 430px on a phone; up to 760px on a desktop canvas. This is a **typographic measure, not a media query** — long lines are harder to read, and a 1920px-wide transcript is worse, not more modern.
3. **Dashboard surfaces are wide.** Tasks, Make, Settings and Admin render as bento grids inside their PageShell and are not constrained by the chat measure.

The cap in item 2 never constrains item 3, and it never disables adaptation in item 1. A wide viewport does **not** keep the phone-width app composition; it keeps a readable chat column inside a desktop shell.

### PWA definition

> A PWA here is **one highly responsive, mobile-first web application that runs in-browser and adapts to the user's device — phone, tablet or desktop — and is installable with an offline app shell.**

- Mobile-first describes authoring order, not a mobile-only product.
- Test band: **320, 375, 430, 768, 1024, 1280, 1920**.
- Installability is a property (manifest, maskable icons, standalone display, start URL, screenshots), not the definition.
- The service worker caches **static assets, icons and the offline shell only** — never API responses, transcripts, school data or session tokens.
- Safe-area insets, keyboard/viewport resize handling, 44px touch targets, focus restoration and reduced-motion support are required at every size.

### Artifact editing exception

- Tauri desktop document editing uses a resizable split view: chat left, artifact right; default 38% chat / 62% artifact; minimum chat width 360px and artifact width 480px.
- Web PWA and Tauri mobile editing use a full-screen sheet within the app column.
- Fixed reports/pages use a viewer or panel, not the document editor.
- If the desktop window is narrower than the split-view minimums, use a full-screen artifact panel rather than forcing unusable columns.
- Panes are separated by **elevation, not border lines**. A hard divider between chat and artifact is not the target treatment.

## 15.5 Shell, navigation, and screen scope

### Primary navigation

The v1 primary workspace surfaces are:

- Chat `/`
- Tasks `/tasks`
- Make `/make`

The platform shell provides consistent identity, active-workspace context, navigation, notifications/needs-input affordances, and user settings. Each platform can adapt the navigation presentation—for example, a desktop rail or mobile tab bar—without changing route or state semantics.

Secondary routes must be reached through an intentional navigation hierarchy, not added as a second, competing primary shell. Verify the final route list against the pinned OpenDuet source and the EdApex route plan before implementation.

### v1 surface matrix

| Area | Routes / surfaces | Scope |
|---|---|---|
| Tabs | Chat, Tasks, Make | In |
| Chat | Channels, conversations, transcript, composer, approvals | In |
| Tasks | Task list/detail, task questions, needs-input count | In |
| Make | Pages, page viewer, artifacts | In |
| Bots | Bots list/detail, setup, sharing, access, approvals, memory, reach, routines, responsibilities | 10D |
| Team Bots | Publications, audience, assignments, consents | 10D |
| Connections | Connected accounts, MCP servers/tools, reachability | 10D |
| Capabilities | Capability list, memory, skills | 10D |
| Routines | Routines, runs, run-now/status | 10D |
| Responsibilities | List/detail, runs, source bindings, triggers | 10D |
| Skills | Skill list/detail, skill tools | 10D |
| Memory | Memory facts/sources | 10D |
| Inbox | Delivery inbox, notifications, approvals | 10D |
| Activity | Activity/history | Out; legacy redirect |
| Settings | Profile, approvals, connected accounts, memory, notifications, setup | In |
| Admin | People, audit, approvals, skills, plugins/connections, capabilities | In |
| Public | Applicant forms/status, parent/student read-only, staffing/placement resolution | In |

`In` means in-scope, not necessarily delivered in the first shell milestone. `10C` and `10D` indicate later workstreams, each gated on its family stub spec. `Out` means not built unless separately approved.

Out of scope unless approved separately: enterprise SSO/identity providers/SCIM; computers; learning; shared-use/team accounts; saved passwords/sign-in requests; voice sessions; admin component playground/gallery and sandboxed components; paid brokers; deployment packages, intelligence mappings, and demonstrations.

## 15.6 Cloudflare Workers and vinext

Cloudflare Workers is the target web deployment platform. Vinext is a candidate migration path for the Next.js starter, not a compatibility guarantee and not a dependency of the browser runtime.

### Migration requirements

Before selecting vinext for production:

1. Pin the starter commit, vinext version, Node/package-manager versions, and Worker compatibility date.
2. Run vinext’s compatibility tooling on the actual app.
3. Build and deploy a minimal representative branch to a Cloudflare preview environment.
4. Verify the app’s actual routing, rendering, and runtime needs:
   - App Router routes and layouts;
   - React Server Components;
   - server actions and route handlers;
   - middleware/auth/session behavior;
   - streaming responses and disconnect/abort handling;
   - file uploads and downloads;
   - caching, revalidation, and invalidation;
   - image/font behavior;
   - database and object-storage drivers;
   - Worker bindings and environment configuration;
   - error reporting, logs, and deployment rollback.
5. Turn compatibility outcomes into repeatable CI checks and smoke tests.
6. Document unsupported features and temporary workarounds. Unsupported behavior must fail clearly; it must not silently change security or data semantics.

If vinext fails a required capability, choose a documented alternative deployment adapter, such as a Worker-native frontend or separately hosted static/client app plus Worker API. Keep UI contracts independent of the selected framework/deployer so this choice does not rewrite chat and activity components.

### Cloudflare responsibility boundaries

- Cloudflare Worker endpoints may provide authorized model access, session/history APIs, policy, approval, audit, and other server-owned operations as defined by backend specs.
- The browser is not the authority for school records, approval decisions, grants, audit, or identity.
- Model-provider and privileged tool credentials remain server-side.
- Do not assume vinext hosting means every server-side Node package or starter service is Worker-compatible. Review each database, auth, blob, Redis, telemetry, and AI dependency individually.
- Bindings, secrets, and environment configuration are server-side. Never expose them in client bundles.
- Keep a rollback path to the last known-good Worker deployment.

## 15.7 UI/runtime architecture and contracts

The UI communicates through an EdApex-owned app contract. It must not depend directly on runtime-specific internals, provider SDK types, or the AI SDK transport.

```text
React screens and components
        │
EdApex UI commands + normalized app events
        │
Runtime adapter ───────── Server/API adapter
        │                         │
Browser/WASM runtime         Cloudflare Worker
        │                         │
Allowlisted local tools      Auth, model gateway, persistence,
                             policy, approvals, audit
```

### UI commands

Commands are typed requests from the user interface, for example:

- submit person turn;
- remove queued message;
- stop an abortable run;
- approve/refuse an action;
- open task, conversation, or artifact;
- propose/apply/revert an artifact edit;
- invoke a registered generated-surface action.

A command is not evidence that an action succeeded. The UI updates from validated runtime/server events.

### Normalized events

Events identify their source and stable IDs, and include appropriate session, turn, message, activity, and timestamp identifiers. The contract covers:

- history restoration and sync;
- person/agent messages and message parts;
- turn lifecycle and follow state;
- tool calls, results, errors, and disclosure metadata;
- approval requests and decisions;
- task and notification changes;
- artifact versions and proposed edits;
- OpenUI and A2UI surface payloads, if enabled;
- explicit error and unsupported-state events.

Exact event schemas and mappings belong in `17-chat-framework.md`. UI components consume normalized app events and do not branch on raw xCodex protocol details.

### Runtime placement and limits

- A browser Worker/Web Worker may host compatible WASM runtime work to keep the UI responsive.
- Browser runtime capabilities are constrained to browser APIs and explicitly granted permissions. Do not assume unrestricted filesystem, process, shell, or OS access.
- Runtime work that needs secrets, privileged tools, authoritative persistence, approvals, policy, or records goes through an authorized server-side service.
- Tauri native capabilities are exposed through a narrow, allowlisted bridge, separate from the web adapter.
- The in-browser runtime is not an authorization boundary.

## 15.8 Chat restoration, transcript, and first use

1. Resolve the authenticated user, workspace, primary agent, and channel.
2. If there is no conversation, render the first-use path; otherwise restore the selected conversation.
3. Restore durable history before presenting a complete transcript. Show skeleton placeholders while loading; do not make historical rows appear as newly streamed content.
4. Merge local stream events and restored history using stable IDs. Preserve server ordering and do not duplicate messages.
5. Follow turns started on another tab, device, or server continuation. Show the turn as busy/following and allow queueing if enabled.
6. An agent-started greeting is a product decision. The user’s first message takes precedence. Do not copy Gmail-specific assumptions from a reference app.
7. History unavailable is an explicit warning/error state, not an empty conversation.
8. Keep historical content, live content, optimistic user submissions, and queued submissions distinguishable in state and rendering.

Transcript geometry—message widths, attachment tiles, top offsets, loading indicators, seen state, and end-of-turn ordering—must be measured in the EdApex shell. Record differences from any reference instead of claiming visual parity without inspection.

## 15.9 Composer and turn queue

- Composer remains editable while a turn is active unless policy or a specific state disables it.
- Busy state swaps Send and Stop without moving the primary control.
- Stop is available only when this client owns an abortable run. Following another device’s run does not imply local abort authority.
- Queueing is enabled by default for v1. A submission during a busy/followed turn becomes a queued person bubble; it does not start a parallel turn.
- Queued items display a “Queued” footer and Remove control.
- Client queue is in-memory per tab; it is not a durable outbox. Server-queued items may also appear and are merged by creation time and stable ID.
- Maximum queue size is 20. Reject the 21st submission with a visible notice.
- Drain each queued item as a distinct person turn in creation order after the active turn ends. Never concatenate queued messages.
- If a drained send fails, restore it to the queue and wait for an explicit person action; do not retry in a loop.
- Attachments remain associated with the queued message and follow the same limits and validation as direct submissions.
- Enter and the primary button use the same submit command and validation path.
- Disabled/read-only/busy/over-cap/unsupported states must match for keyboard and pointer input.
- `@` and `/` tokens may select agents or skills when enabled. A per-message mention does not silently rebind the channel’s primary agent.
- Dictation, voice calls, and attachment-only sends are optional and must follow separate capability and permission policies.
- Focus restoration must not steal focus on each busy/idle transition.

## 15.10 Tool activity, approvals, and human control

### Tool activity

- Adjacent plain tool calls may be grouped into a disclosure.
- Browser, connector, and generic server-tool calls may be folded when no human action is pending.
- App-rendered tools and questions for the person stay outside collapsed groups.
- Group summaries describe what happened and expose relevant status and issue count.
- Expanded groups show ordered steps and only the tool input/output allowed by policy, plus connector identity, page title/host, links, status, and failure reason as appropriate.
- Use consistent step statuses such as In progress, Waiting for you, Not completed, Blocked, and Didn’t work.
- Never hide an approval, required question, or other human decision inside a collapsed group.
- Unknown activities without a registered renderer do not draw as arbitrary content.

### Approval behavior

- Inline and inbox approvals refer to the same owner-scoped source. A decision in one surface updates the others.
- Pending approval cards appear beside the originating action where useful and remain visible outside collapsed activity groups.
- Once decided, replace the pending card with a compact decision record and restore the originating tool’s renderer/result.
- Server policy decides whether approval is required. The UI does not create its own authorization policy or auto-approve.
- Do not ask for the same confirmation in chat and in the approval card.
- Options may include Allow once, Always allow, and Refuse only when server policy permits them. Destructive/bulk actions do not offer Always allow by default.
- Person refusal is `declined`, not `failed`; policy refusal is `refused/blocked`.
- Secret/browser handoff is an explicit waiting workflow. Secret values must not be copied into transcript text.
- The server validates grants, policy, approval tokens, idempotency, and audit records. The browser cannot mint authority.

### EdApex role constraints

- Parent/student views are read-only for school records.
- Teacher actions are constrained to their authorized classes; bulk or destructive actions require approval.
- Admin staffing, placement, enrollment, shared-email, and promotion operations require a plan/dry-run and human apply.
- Never auto-apply unplaced/no-current, unstaffed, shared-email, missing-record, or placement-mismatch items.
- Live issue counts belong in the admin issue queue, not in this UI contract.

## 15.11 Runtime state machine and presentation

Turn-level busy state is distinct from a single tool call or runtime invocation. `queued` and `declined` are presentation/part-level states; their canonical mapping is owned by `17-chat-framework.md`.

```text
restoring ──► idle
restoring ──► following
restoring ──► stopped/error (history unavailable)

idle ──person submit──► thinking
thinking ──tool call──► tool_running
tool_running ──result──► tool_complete ──► thinking
tool_running ──failure──► tool_failed ──► thinking | stopped/error
thinking ──approval/secret──► waiting_for_person
waiting_for_person ──allow──► thinking
waiting_for_person ──decline──► declined ──► stopped/error
idle/thinking/following ──person submit while busy──► queued
queued ──current turn ends──► thinking
following ──run starts here──► thinking
thinking ──final text/cards──► completed
thinking/tool_* ──abort──► stopped/error
completed ──► idle
```

| State | Trigger | Required presentation |
|---|---|---|
| Restoring | History/thread load | Skeleton or existing history; no replay cascade |
| Idle | No owned/followed turn | Composer accepts input |
| Thinking | Turn active, no text/tool yet | Thinking indicator under last person message |
| Tool running | Call has started, result absent | In-progress activity row |
| Tool complete | Result exists | Result/status and continued transcript |
| Tool failed | Allowed tool failed | Failure reason; not successful completion |
| Refused/blocked | Server policy/boundary | Explicit blocked/refused state |
| Declined | Person refused | “You declined”; not tool failure |
| Waiting for person | Approval or handoff needed | Visible action, never hidden |
| Queued | Person submitted while busy | Faded bubble, Queued label, Remove |
| Following | Turn runs elsewhere | Busy state; follow stream; queue when supported |
| Stopped/error | Aborted or turn failed | Explanation; restore draft when appropriate |
| Completed | Final text/cards/chips | Clear busy state |

Status changes should be announced accessibly, but token-by-token output should not flood the live region.

## 15.12 Generated UI: OpenUI and A2UI

OpenUI and A2UI are separate formats. They must not be treated as interchangeable or sent to the wrong renderer. If both are enabled, each has its own validated adapter, schema/version, component catalog, and renderer.

### Shared safety requirements

- Generated interfaces are read-only or assisted by default.
- Validate payload size, schema, version, component identifiers, and action payloads before rendering.
- Only allow catalog-registered components. Unknown or invalid content renders nothing and produces safe diagnostics.
- Render generated content in the app’s trusted component tree; never execute generated scripts or arbitrary HTML.
- Actions use closed IDs and typed payloads. They do not make arbitrary HTTP requests or directly mutate authoritative data.
- Marksheets, fees, approvals, and record edits open fixed React forms and use server-authorized workflows.
- Persist source format, source/catalog version, and data class as specified in the data model. Apply privacy and retention rules before persisting any payload.

### OpenUI adapter

- OpenUI-generated interfaces use the OpenUI-specific activity contract, for example `activityType = "openui-surface"`.
- Bind each supported OpenUI surface to the pinned OpenUI parser/renderer and EdApex component catalog.
- Treat model output as untrusted input. Validate and constrain it to allowed components, properties, and actions.
- Do not enable iframe HTML/JS rendering as a fallback.

### A2UI adapter

- If A2UI is in scope, use a compatible A2UI parser/renderer for A2UI payloads; do not pass A2UI payloads to the OpenUI renderer.
- Define an explicit A2UI activity type, protocol version, catalog mapping, action allowlist, and fallback state.
- Any translation between A2UI and OpenUI must be a separately specified, tested adapter. It must preserve meaning and must not broaden allowed actions or permissions.
- Keep A2UI execution limited to declarative UI payloads. No generated code execution, arbitrary HTML/JS, or direct data mutation.
- Enable A2UI only after security, accessibility, catalog, and cross-platform parity reviews pass.

Unknown activities without an approved renderer draw nothing; do not invent a generic UI interpretation.

## 15.13 Artifacts and AI-assisted editing

### Artifact types

- **Documents:** minimal Tiptap editor; quick edit in an inline card where appropriate; expanded editor in a side panel/sheet.
- **Reports/pages:** fixed viewer or panel; no Tiptap editor.
- **CSV/data:** table viewer/editor with explicit row/cell edit policy.
- **PDF:** PDF.js viewer.
- **Code:** starter code-editor components may be evaluated; editing and execution permissions remain explicit and separate.
- **Images:** preview and approved image operations; do not presume generative image modification is available.

### Editor controls and layout

- Inline document card offers a concise preview and an expand action.
- Expanded document view provides appropriate document actions, such as copy, undo/redo, download, expand, and close.
- Desktop can use the split-view layout described above; web/mobile use a full-screen sheet.
- Preserve the app shell’s scroll ownership and restore focus to the invoking control when the panel closes.
- Report/page viewers and protected record screens must not masquerade as editable documents.

### AI-assisted artifact workflow

AI actions may include propose, rewrite, summarize, continue, transform, and explain. Each operation must:

1. Identify the artifact and version being edited.
2. Identify the selection or scope, if any.
3. Produce a proposal or a new artifact version; never silently overwrite user content.
4. Show generation, diff/proposal, error, and stale-version states.
5. Require an explicit user action to apply the proposal.
6. Support undo/revert where the underlying document model allows it.
7. Revalidate versions and permissions before saving.
8. Route protected school-record edits through fixed forms and server-authorized workflows, not generated artifact actions.

Downloads by type: document MD/DOCX/PDF; report PDF/DOCX; data CSV/PDF; page PDF, subject to implemented export capabilities and server policy.

## 15.14 Responsive behavior and accessibility

- Test the bands **320, 375, 430, 768, 1024, 1280 and 1920px**.
- The **shell adapts** across those bands; the **chat column stays measured**; dashboards are wide (see §15.4 "Adaptation vs. measure").
- Touch targets are at least 44px at every size.
- Support keyboard navigation, visible focus, logical focus order, and focus restoration after dialogs/sheets close.
- Use screen-reader live regions for meaningful step/status changes. Avoid per-token announcements.
- Respect reduced-motion preferences. Do not auto-scroll on every token.
- Keep app-shell scrolling contained; prevent accidental document-level scroll.
- Use CSS safe-area insets in mobile browser/WebView and native inset APIs in native applications.
- Handle mobile keyboard resize/viewport changes without covering the composer or approval controls.
- Ensure dialogs, sheets, disclosures, and split-view controls work with keyboard, touch, and assistive technology.
- Provide accessible names and status text for icon-only buttons and activity indicators.
- Never communicate success, error, blocked or approval-required states by colour alone.
- Theme selection is user-controlled (`system`, light, dark, accent presets) and persists across reload without a flash of the wrong theme.

## 15.15 State, storage, and privacy

- React UI; no Svelte imports.
- Do not persist authoritative school records, durable API-response caches, or session tokens in browser/P2P storage.
- Session-derived content (transcripts, tool results, artifacts) persists only under `60-security-privacy.md` retention rules.
- Local agent workspace/session state is allowed only where policy permits and must follow data-class rules.
- Sync through a server-mediated sync service only if the relevant policy explicitly allows the data class and retention behavior. Device sync v1 uses `AGENT_DB`; iroh is deferred (`41-storage-sync.md`).
- Web authentication uses secure cookie/session mechanisms. Mobile native authentication uses Keychain/Keystore where applicable.
- No provider secret or privileged tool credential ships in the browser bundle or local WASM package.
- Every native bridge capability is allowlisted, platform-scoped, and validated; web cannot invoke Tauri APIs.
- The server rechecks authorization for all protected mutations even when the UI has already hidden or disabled a control.
- Clear or expire local transient state on logout, session expiry, workspace change, or policy-directed purge.

## 15.16 v2 native contract

Native implementation framework remains undecided. Selection and implementation details belong in `80-v2-native-mobile.md`.

v2 native must preserve:

- route and workspace semantics;
- message, activity, task, artifact, and approval IDs;
- the same normalized event and command contract;
- state distinctions, queue rules, and history restoration semantics;
- server-owned authorization and human decision requirements;
- generated UI catalogs and action restrictions where the native renderer supports them;
- accessible status announcements, focus/selection behavior, and equivalent decision affordances.

Native interaction patterns may differ from web—for example, native navigation, menus, sheets, and pickers—but may not change policy, approval meaning, authorization, or data semantics. No native runtime is selected by this document.

## 15.17 Implementation sequence and gates

1. **Audit and pin sources:** record starter commit, licenses, runtime and UI references, and the versions under evaluation.
2. **Inventory the starter UI:** map routes, components, state, AI SDK dependencies, persistence, auth, and artifact modules.
3. **Prove deployment path:** build and deploy a representative slice to Cloudflare; record vinext compatibility and limits.
4. **Define app contracts:** finalize event, command, state, artifact, and generated-surface schemas.
5. **Build the shared shell:** implement navigation, responsive column, theme tokens, routing, and accessibility baseline.
6. **Replace chat interaction:** connect the app contract to a mock runtime first, then a browser/runtime adapter.
7. **Implement restoration and turn lifecycle:** cover history, follow, queue, stop, errors, and duplicate prevention.
8. **Implement activity and approvals:** ensure all human decisions remain visible and synchronized.
9. **Implement artifacts:** viewers/editors, proposals, version checks, exports, and platform-specific presentation.
10. **Add generated surfaces:** ship OpenUI and, if approved, a separately rendered A2UI adapter after their gates.
11. **Add desktop/mobile shells:** connect Tauri-specific capabilities through narrow bridges and test keyboard, touch, insets, and files.
12. **Evaluate v2 native:** select a framework only after shared contracts and parity tests are stable.

Each workstream must have automated tests, a documented failure mode, and a way to disable or roll back the feature without breaking ordinary chat.

## 15.18 Audit record

For each adopted upstream behavior or compatibility claim, record:

- repository, branch, pinned SHA or package version;
- source path and line range, where applicable;
- local spec section;
- EdApex decision and adapter;
- date and verifier;
- automated test or reproducible command;
- known limitations and migration notes.

Do not scrape rendered GitHub pages as audit evidence. Do not claim visual parity based only on package descriptions, README statements, or uninspected screenshots. Re-verify source behavior at pinned revisions before implementation.

## 15.19 Acceptance criteria

- The starter-derived web UI builds and deploys to Cloudflare Workers using a pinned, tested vinext release or a documented alternative.
- CI runs compatibility checks, production builds, deployment smoke tests, and critical-route tests.
- The app works without Vercel AI SDK hooks or message/stream protocols as its UI interaction contract.
- The UI uses EdApex Gold on Slate tokens; the shell adapts at 320–1920px while the chat column stays measured.
- Chat, Tasks, composer, approvals, and activity are usable at 320–430px **and** at desktop widths without retaining a phone-width composition.
- Dashboard surfaces (Tasks, Make, Settings, Admin) use wide bento grids inside their PageShell.
- Desktop tables use wider PageShells without stretching the cowork transcript.
- Theme selection survives reload with no flash of the wrong theme; `system`, light, dark and accent presets all render.
- Borders are not used as the primary surface separator; elevation and concentric radii carry the hierarchy.
- History restoration does not duplicate or replay messages; following and queued turns are visibly distinct.
- Queue limits, removal, draining order, and failure restoration match this contract.
- Approvals remain consistent across inline, inbox, and task surfaces; no approval is hidden or auto-applied.
- Declined, failed, blocked, queued, following, and completed states remain distinct.
- Artifact AI creates explicit, versioned proposals and requires user-controlled apply/revert.
- OpenUI payloads use the OpenUI renderer; A2UI payloads, if enabled, use a separate compatible A2UI renderer. Neither format executes arbitrary code or directly mutates authoritative data.
- Unknown activities and unsupported generated components render no executable fallback.
- No authoritative school-record store, durable API-response cache, or session token is written to local/P2P storage.
- Web, Tauri desktop, and Tauri mobile share contracts while using platform-appropriate presentation.
- v2 native preserves the same event, state, approval, and data-authority semantics.
- Every source, security, and deployment compatibility claim has pinned evidence and a corresponding test where practical.

### OpenUI and A2UI distinction

OpenUI and A2UI are separate formats. If both are supported, the implementation needs distinct adapters and renderers; one renderer should not be assumed to consume the other’s payload.

Here’s the current relationship and distinctions between Thesys OpenUI and A2UI as of 2026:

**OpenUI and A2UI: Relationship & Roles**
- **OpenUI** and **A2UI** are both generative UI specifications, but they are distinct and not direct subsets or supersets of each other.
- Both are designed to let agents (usually LLMs or similar AI systems) output structured UI definitions that can be rendered by host applications, rather than just text.
- Both replace older approaches like pure JSON-based specs for AI-generated UIs, but use different formats and optimizations tailored for LLMs: OpenUI uses a line-based, code-like syntax, while A2UI uses a JSONL-based streaming format.

**Does OpenUI render A2UI protocol output?**
- **No, OpenUI does not natively render A2UI output.** Each has its own UI definition and serialization format. Renderers built for OpenUI generally do not accept A2UI payloads natively, and vice versa.
- OpenUI defines its own generative UI specification, distinct from A2UI, optimized for fewer tokens and LLM reliability. It focuses on fast parsing, easy component registration, and compactness for LLM generation and streaming.
- A2UI is focused on a cross-platform, native-first approach, with declarative "blueprints" for native UI components. It provides its own renderers (for React, Angular, Flutter, etc.). It is not built to consume OpenUI syntax; rather, an application must specifically integrate an A2UI renderer to handle A2UI-format UIs[[1]](https://malakavenu.com/articles/a2ui-protocol-generative-ui)[[2]](https://a2ui.org/roadmap/)[[3]](https://thenewstack.io/agent-ui-standards-multiply-and-google’s-a2ui/).

**Distinctness and Interoperability**
- **Distinct UI Formats:** OpenUI and A2UI are competitors (or alternatives) in the generative UI space—they represent different "content types" for describing a UI. Their syntax, rendering model, and component registration differ at a deep level.
- There is no "universal" renderer that natively consumes both OpenUI and A2UI content without some kind of translation or middleware. Some projects might try to build adapters or bridges between them in the future, but by design, each tries to optimize for its own ecosystem.
- In multi-spec environments or toolkits, you might see both supported via pluggable renderers, but one does not render the other's native output directly without translation.

**Summary Table:**

|              | OpenUI                      | A2UI                          |
|--------------|-----------------------------|-------------------------------|
| Format       | Compact, code-like, line-based | Streaming JSONL, declarative   |
| Renderer     | OpenUI-specific              | A2UI renderers                 |
| Relation     | Distinct from A2UI           | Distinct from OpenUI           |
| Interop      | Needs explicit translation   | Needs explicit translation     |

**Conclusion:**
OpenUI does *not* render A2UI protocol output, nor vice versa. Each spec defines a distinct generative UI format. If your app or agent supports both, it must implement support (via separate renderers or an interop layer) for each protocol’s output[[4]](https://www.thesys.dev/blogs/openui)[[5]](https://a2ui.org/introduction/agent-ui-ecosystem/)[[3]](https://thenewstack.io/agent-ui-standards-multiply-and-google’s-a2ui/).

---

1. [A2UI is the protocol that finally makes generative UI shippable](https://malakavenu.com/articles/a2ui-protocol-generative-ui)
2. [Roadmap | A2UI](https://a2ui.org/roadmap/)
3. [Agent UI Standards Multiply and Google’s A2UI](https://thenewstack.io/agent-ui-standards-multiply-and-google’s-a2ui/)
4. [OpenUI: The Open-Source Spec for Generative AI Interfaces](https://www.thesys.dev/blogs/openui)
5. [How Does A2UI Compare? - A2UI](https://a2ui.org/introduction/agent-ui-ecosystem/)