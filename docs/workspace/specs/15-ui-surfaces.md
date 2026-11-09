# 15 — UI Surfaces: Web, Desktop, Mobile and v2 Native

**Draft.** Defines the UI platform contract; implementation belongs to Phase 10.

## Source of truth

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

## Design authority

- **Visual language:** EdApex Gold on Slate in `src/routes/layout.css`.
- **Interaction/state model:** OpenDuet spec, where it does not conflict with EdApex.
- **Do not** copy OpenDuet's purple/Inter visual identity.
- **Do not** treat OpenDuet's route tree as EdApex's route tree.

## v1 platform matrix

| Surface | Shell | Main content | Notes |
|---|---|---|---|
| Web PWA | Browser | Centered app column, max 430px | Same React UI; responsive safe areas; no native APIs |
| Tauri desktop | Tauri 2 window | Centered app column, max 430px; wider PageShell for admin tables | Resizable window; keyboard/mouse; desktop file dialogs |
| Tauri mobile | Tauri 2 mobile | Full viewport, safe-area aware | System WebView; touch; mobile keyboard |
| v2 native | RN/Lynx/Flutter | Native components | Not v1; see `80-v2-native-mobile.md` |

The main cowork runtime stays narrow on desktop for parity. Admin/settings tables may use wider page shells (768px/960px) without turning Chat into a desktop dashboard.

Artifact editing is the exception: opening a document artifact enters a resizable split view (chat left, artifact right; default 38/62, min chat 360px, artifact 480px). The artifact panel may use the available desktop width; Chat itself does not become a dashboard.

## v1 screens

### Core

- Chat transcript and composer
- Tasks list/detail
- Approvals / ActionBar
- Tool activity and step detail
- Issue cards and admin issue detail
- Settings/profile

### v1 OpenDuet surface

This is the v1 surface contract: the complete set of in-scope workspace routes. It does not include every enterprise/admin route in the upstream repository.

| Area | Routes / surfaces | v1 |
|---|---|---|
| Tabs | Chat `/`, Tasks `/tasks`, Make `/make` | In |
| Chat | channels, channel/group conversations, transcript, composer, approvals | In |
| Tasks | task list/detail, task questions, needs-input count | In |
| Make | pages, page viewer, artifacts | In |
| Bots | bots list/detail, setup, sharing, access, approvals, memory, reach, routines, responsibilities | In |
| Team Bots | publications, audience, assignments, consents | In |
| Connections | connected accounts, MCP servers/tools, reachability | In |
| Capabilities | capability list, memory, skills | In |
| Routines | routines, runs, run-now/status | In |
| Responsibilities | list/detail, runs, source bindings, triggers | In |
| Skills | skill list/detail, skill tools | In |
| Memory | memory facts/sources | In |
| Inbox | delivery inbox, notifications, approvals | In |
| Activity | activity/history view | In |
| Settings | profile, approvals, connected accounts, memory, notifications, setup | In |
| Admin | people, audit, approvals, skills, plugins/connections, capabilities | In |
| Public | applicant forms/status, parent/student read-only | In |

Out of v1 scope unless separately approved:

- enterprise settings, SSO/identity providers, SCIM;
- computers;
- learning;
- shared-use/team accounts;
- saved passwords/sign-in requests;
- voice sessions;
- admin Component Playground/gallery and sandboxed components;
- Composio/Arcade and other paid brokers;
- deployment packages, intelligence mappings and demonstrations.

Implementation is sequenced: the core shell lands first, then the remaining surfaces. They are not deferred to a later product milestone. The exact route list must be re-verified against the pinned OpenDuet SHA before implementation.

### Legacy EdApex UI reuse

| Legacy surface | Treatment |
|---|---|
| `src/routes/layout.css` Gold on Slate oklch tokens | Copy values; do not copy Svelte/Tailwind classes |
| `template/ResultTemplate`, `TranscriptTemplate`, headers, student info, records tables, summaries, remarks | Reimplement as React print components with Gold print CSS; reuse field order/data grouping |
| `filestore/+page.svelte` categories, grid/list, upload/drop, shared photos, manifest status | Product reference; reimplement with OpenDuet cards/sheets |
| `workspace/ArtifactViewer`, `editor-canvas`, `MobileArtifactBrowser` | Product reference; replace EmbedPDF with PDF.js and use minimal Tiptap |
| `chat/pdf-link-card`, `student-result-card`, `ArtifactCard` states | Reference for inline cards; use OpenDuet presentation |
| `class-roster`, `admin/parents`, school identity/report-template/academic-calendar settings | Domain/product reference; reimplement in React |
| Svelte `ui/*`, AI Elements, prompt-kit, chat shell, nav/sidebar, auth, provider settings | Do not copy |
| `bin/html2pdf`, server `pdf-generator.ts`, Svelte server-rendered reports | Do not copy; replace with the local document engine |

### Document/artifact surfaces

- Inline artifact card in chat: minimal Tiptap quick edit for documents; double-diagonal-arrow opens the side panel.
- Side panel: split view, minimal Tiptap, header Document dropdown/copy/undo/redo/download/expand/close.
- Reports/pages: fixed viewer/panel; no Tiptap.
- CSV: table editor; PDF: PDF.js viewer.
- Downloads by type: document MD/DOCX/PDF; report PDF/DOCX; data CSV/PDF; page PDF.
- See `16-artifacts.md` and `22-documents-and-artifacts.md`.

### Admin/public

- Admin issue queue with filters and plan/apply approval
- Public applicant form, draft resume, status and notifications
- Parent/student read-only views
- Staffing and placement resolution views

## Runtime states

Use the OpenDuet distinctions:

`restoring`, `idle`, `thinking`, `tool running`, `tool complete`, `tool failed`, `refused/blocked`, `declined`, `waiting for person`, `queued`, `following`, `stopped/error`, `completed`.

Approval cards are never hidden inside a collapsed tool group. A decision in one surface updates all surfaces.

## Composer and input

- Enter and send share validation.
- Busy state swaps send/stop without moving the primary control.
- Queueing is in-memory per tab; no durable outbox.
- Attachments via picker/drop/paste; per-message caps; restore on failure.
- Voice/dictation only where a provider exists.
- Approval-required actions are not sent as ordinary chat text.

## Responsive and accessibility

- Test 320–430px and wide desktop.
- Touch targets ≥44px.
- Keyboard focus order and focus restoration.
- Screen-reader live regions for step/status changes.
- Reduced motion; no auto-scroll on every token.
- Safe-area insets on mobile WebView.
- No document-level scroll in the app shell.

## State and data

- React UI; no Svelte imports.
- Shared Rust core via Tauri invoke on native and WASM on web.
- CF Workers are the only EdApex data/session authority.
- No school data persisted locally.
- Agent session/workspace state may be local; sync via iroh only if policy allows.
- Mobile auth uses tokens in Keychain/Keystore; web uses cookie/session.

## v2 native

RN, Lynx and Flutter reuse the interaction model, not the DOM components. Each must provide:

- native tab/navigation primitives
- equivalent composer, transcript, tool activity and approval behavior
- the v1 OpenDuet surface defined above; native GenUI parity is gated by `80-v2-native-mobile.md`
- Gold on Slate tokens adapted to native styling
- accessibility, safe areas and reduced motion
- the same capability/approval semantics

No v2 runtime is selected here.

## Chat restoration and first-use behavior

Reference: `extracted-ui-spec.md` §4.1–4.2; source `openbot/app/src/components/shell/chat-screen.tsx` and `channels/channel-chat.tsx`.

1. Resolve the primary agent/channel. If no conversation exists, show the first-use path; otherwise render the conversation in the Chat surface.
2. Restore durable history before showing the complete transcript. Use skeleton placeholders; do not stream historical rows into view as if they were new.
3. Merge durable history with locally streamed rows without duplication. Preserve server ordering and IDs.
4. Follow runs started in another tab, device, or server continuation. The current tab must show the turn as busy and may queue input.
5. The first-day greeting is a Bot-started turn. A person's first message takes precedence. EdApex must not copy OpenDuet's Gmail-specific greeting assumptions; the EdApex greeting is a product/agent prompt decision.
6. History unavailable is a distinct state with a warning; do not silently show an empty conversation.

### Transcript composition

Reference: §4.3; source `channels/chat-transcript.tsx` and `conversation-view.tsx`.

- Transcript max width: 672px outside the shell; inside the 430px shell it fills the content column.
- Chat top offset: 100px; reserve measured space for the floating composer/dock.
- User bubble: right-aligned, max 85% width, accent-tinted.
- Agent bubble: left-aligned, max 82% width, neutral.
- Bubble radius: 20px; padding: 16px horizontal/12px vertical.
- User text is pre-wrapped plain text; agent text streams as Markdown and may split by paragraph/thought into separate bubbles.
- Do not replay entry animation for every streamed token.
- Attachments: equal-size square tiles before caption, aligned to the person's message.
- Loading: skeleton placeholders; no partial historical cascade.
- "Thinking" appears under the person's last message only while busy and no text/tool row exists yet.
- A failed turn's explanatory sentence occupies the answer slot; do not render it as an ordinary agent answer.
- "Seen" appears on the newest unanswered person message after a short settle delay.
- Recent history may stagger in (up to 12 rows, 40ms apart); live rows must not use that history cascade.
- Cards and reply chips are reordered to the end of their turn.

## Composer behavior

Reference: §4.4; source `channels/composer/composer.tsx`, `channels/conversation-view.tsx`.

- The composer remains editable while the agent is working.
- If queueing is enabled, submit parks the draft and attachments as a queued user bubble; it does not start a second simultaneous turn.
- Queued bubble shows a "Queued" footer and Remove control.
- The queue is in-memory per tab, not a durable outbox. Server-queued messages may also appear.
- Queue drains after the current turn. A failed drained send restores the draft to the queue and waits for a person to initiate another turn; no automatic retry loop.
- Attachments can arrive from picker, drop, or clipboard. Screen/refuse unsupported files, show upload state, enforce per-message caps, and clean staged rows.
- Enter and the primary button share one submit path; busy/disabled/read-only/over-cap state must be the same for keyboard and pointer.
- `@` and `/` tokens represent agents/skills where available. A per-message mention does not silently rebind the channel's Bot unless the product explicitly supports it.
- Dictation, voice call and attachment-only sends follow the source rules; they are not required for EdApex v1 unless implemented.
- Focus restoration must not steal focus on every busy/idle transition.

## Tool activity

Reference: §5.1; source `channels/tool-activity.tsx`.

- Adjacent plain tool calls are grouped into one disclosure row.
- Browser, connector and generic server tools may be folded.
- App-rendered tools and questions for the person stay outside the disclosure.
- Group summary: what happened, activity icons, issue count.
- Expanded group: ordered steps with tool input/output, connector name, page links and status.
- Step statuses: In progress, Waiting for you, Not completed, Blocked, Didn't work.
- Browser steps are page actions with page title/host and failure reason.
- Never hide an approval or required human decision inside a collapsed group.

## Approval and human control

Reference: §5.2–5.3; source `approvals/inline-approval.tsx`, `server/src/approvals/policy.ts`, `examples/openduet/agents.yaml`.

- Approval requests render inline beside the originating tool when appropriate.
- Inline and inbox approvals use the same owner-scoped source; a decision in one surface updates all surfaces.
- After a decision, replace the pending card with a compact decided card and restore the tool's own renderer/result.
- Pending approval cards for grouped browser steps render outside the collapsed group.
- Do not block every click/type automatically. The server decides using safety policy, settings, rules and review.
- For high-impact actions, the agent invokes the action and lets the gate present the approval; it must not ask the same confirmation twice in chat.
- Approval options: Allow once, Always allow, Refuse; destructive/bulk EdApex actions may not offer Always allow until policy allows it.
- A refusal is `declined`, not `failed`; a policy refusal is `refused/blocked`.
- Secret/browser handoff is a waiting workflow, not prose pretending to request access. The secret goes to the destination; do not put it in the transcript.
- Server remains authoritative for grants, policy, approvals and audit. The UI never auto-approves.

### EdApex-specific approval rules

- Parent/student: no school-data writes.
- Teacher: attendance/marks/report actions within their class; approval for bulk or destructive actions.
- Admin: staffing, placement, enrollment, shared-email and promotion plans require plan/dry-run and human apply.
- Never auto-apply the 237 unplaced/no-current, 15 unstaffed, 24 shared-email, 5 missing-record or 1 placement-mismatch items.
- Approval token and idempotency key are server-issued/validated; the browser cannot mint authority.

## Cards and generated UI

Reference: §5.3.

- Handoff, task, task-suggestion, page and reply-chip cards preserve their source state: pending/completed/refused/failed.
- A task card opens its own task conversation; Chat stays short.
- A reply chip sends a person turn.
- An activity without a registered renderer does not draw; do not invent UI for an unknown activity.
- OpenDuet's source uses AG-UI terminology because CopilotKit supplies that transport. EdApex maps xcodex events to the same activity contract; **v1 does not depend on AG-UI as a runtime protocol**.
- Generated interfaces use `activityType = "openui-surface"` and the OpenUI renderer in `packages/genui`. A2UI, CopilotKit's `open-generative-ui` runtime and iframe HTML/JS are not v1 renderers.
- OpenUI surfaces are read-only or assisted. Marksheets, fees, approvals and record edits open fixed React forms; generated buttons emit closed actions, never arbitrary HTTP requests.
- The surface source, catalog version and data class are stored in `message_parts`; `edapex-ephemeral` data is not persisted as a PII snapshot. See `21-generative-ui-openui.md` and `42-agent-db-schema.md`.
- EdApex v1 includes Make/page cards and the v1 surface matrix above; implementation order may phase them, but they are not deferred.

## Runtime state machine

Reference: §6; source `channel-chat.tsx` and `conversation-view.tsx`.

The source distinguishes **turn-level busy** from a single AG-UI run. The header and composer use turn/follow state; Stop is available only when the client has an abortable run.

```text
restoring ──► idle
restoring ──► following
restoring ──► error (history unavailable)

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
thinking/tool_* ──abort──► stopped/error
completed ──► idle
```

| State | Trigger | Presentation |
|---|---|---|
| Restoring | History/thread load | Skeleton or existing history; no replay cascade |
| Idle | No owned/followed turn | Composer accepts input |
| Thinking | Turn active, no text/tool yet | "Thinking" under the last person message |
| Tool running | Call args, no result | Shimmer/in-progress row |
| Tool complete | Result exists | Success/detail, continue transcript |
| Tool failed | Allowed tool failed | Amber/error distinction with reason |
| Refused/blocked | Server policy/boundary | Not a successful action |
| Declined | Person refused | "You declined"; not tool failure |
| Waiting for person | Approval or secret handoff | Visible decision; never hidden |
| Queued | Person submitted while busy | Faded person bubble, Queued, Remove |
| Following | Run started elsewhere | Busy status; follow stream; queue if supported |
| Stopped/error | Turn failed/stopped | Explanation in answer slot; restore draft where source does |
| Completed | Final text/cards/chips | Clear busy status |

## Platform mapping

| Behavior | Web PWA | Tauri desktop | Tauri mobile | v2 native |
|---|---|---|---|---|
| Shell | Centered app column | Centered/narrow window | Full viewport | Native navigation |
| History restore | Same | Same | Same | Same semantics |
| Composer queue | In-memory tab | In-memory tab | In-memory tab | Native queue; no durable outbox |
| Approvals | Inline + ActionBar | Inline + ActionBar | Inline + ActionBar | Native cards, same state |
| Tool activity | Disclosure groups | Disclosure groups | Disclosure groups | Native equivalents |
| Scroll anchoring | Person turn | Person turn | Person turn | Native list anchoring |
| Safe area | CSS env() | Window bounds | Mobile safe insets | Native insets |
| Stop | Abortable run only | Abortable run only | Abortable run only | Same contract |

## Source pin and gh-cli audit

The local extracted reference is pinned to OpenDuet commit:

```text
f52288fff5ccdbd3de428d573d9f026fce5ff480
```

The authoritative detailed analysis remains `extracted-ui-spec.md` §4–§6. It is a source extraction, not the source code. Every implementation claim must be re-verified at the pinned commit.

### Audit commands

Do not scrape the rendered GitHub page. Use `gh api` against the pinned SHA.

```bash
UPSTREAM=CopilotKit/OpenDuet
SHA=f52288fff5ccdbd3de428d573d9f026fce5ff480

gh api "repos/$UPSTREAM/git/trees/$SHA?recursive=1" \
  --jq '.tree[].path' | grep 'openbot/app/src/components/channels'

gh api "repos/$UPSTREAM/contents/openbot/app/src/components/channels/chat-transcript.tsx?ref=$SHA" \
  -H 'Accept: application/vnd.github.raw' | sed -n '2082,2259p'

gh api "repos/$UPSTREAM/contents/openbot/app/src/components/channels/composer/composer.tsx?ref=$SHA" \
  -H 'Accept: application/vnd.github.raw' | sed -n '331,405p;1131,1269p'

gh api "repos/$UPSTREAM/contents/openbot/app/src/components/channels/tool-activity.tsx?ref=$SHA" \
  -H 'Accept: application/vnd.github.raw' | sed -n '32,91p;139,395p;434,563p'

gh api "repos/$UPSTREAM/contents/openbot/app/src/components/approvals/inline-approval.tsx?ref=$SHA" \
  -H 'Accept: application/vnd.github.raw' | sed -n '1,120p'

gh api "repos/$UPSTREAM/contents/openbot/server/src/approvals/policy.ts?ref=$SHA" \
  -H 'Accept: application/vnd.github.raw' | sed -n '1,120p'
```

### Audit record

For each behavior change, record:

- pinned SHA;
- source path and line range;
- local extracted-spec section;
- EdApex decision/adapter;
- date and verifier.

If the upstream source differs from the extracted spec, update the extracted spec and this document first. Do not silently drift. Evidence-gap update from the pinned source:

1. **Resolved:** MenuSheet and the secondary route hierarchy are now verified from `openbot/app/src/components/shell/menu-sheet.tsx` and `openbot/app/src/routes/_authed/_app/`. MenuSheet exposes Everything, channels, New channel, Archived, Manage (Bots, Connections, Capabilities, Routines, Approval rules) and Settings; the tab bar is Chat/Tasks/Make; the route tree includes Team Bots, Pages, Inbox, Activity, Skills, Memory, Responsibilities and Group chats.
2. The full Chat/Tasks/Make component tree is still partially verified.
3. Screenshots and viewport comparisons are still not inspected.
4. Exact token/layout values for secondary routes are still incomplete.
5. The complete connector/tool catalogue is still open.
6. No app-wide event catalogue was established; do not invent one. The xcodex adapter owns the EdApex event map.

Remaining gaps 2–6 must be closed from the pinned source before claiming visual parity. They do not block the v1 surface contract.

## Acceptance

- UI matches Gold on Slate tokens.
- Chat/Tasks/approvals/tool activity are usable at 320–430px.
- Desktop admin tables are usable without stretching Chat.
- Approval state is consistent across inline and task surfaces.
- State transitions match the table above, including declined vs failed vs blocked and queued vs following.
- History restoration does not duplicate or replay rows; streamed rows do not cascade like history.
- Tool groups never hide an approval/question.
- No school data or session token is written to local/P2P storage.
- Web/desktop/mobile share contracts; visual code is platform-specific where necessary.
- OpenUI surfaces render through the typed catalog; unknown activities draw nothing; no A2UI/iframe GenUI path is enabled.
- Every generated action is a closed ID and never a direct mutation; authoritative workflows open fixed React.
- Every source claim has a pinned-commit audit reference; no screenshot or event behaviour is invented.

