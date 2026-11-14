# OpenDuet Runtime Desktop UI/UX Porting Specification

## 1. Porting target and parity objective

**The porting target is the authenticated OpenDuet operating application—not the Tauri setup wizard.** The product workspace is implemented in `openbot/app`, with runtime and policy behavior in `openbot/server`, `openbot/shared`, `openbot/toolkit`, and the agent packages.

A key visual constraint in the **source**: OpenDuet's main runtime experience is mobile-first and phone-width even in a desktop window. The authenticated shell centers a column capped at **430 px** on a wide viewport; its Chat, Tasks, and Make navigation floats at the foot of that column. [AppShell](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/shell/app-shell.tsx#L26-L128)

> **EdApex diverges here deliberately.** This document is a **reference port**, not the product mandate. EdApex keeps the measured chat column (430px on a phone, up to 760px on a desktop canvas) but the **shell adapts**: a tab bar below 1024px and an inset sidebar plus canvas at or above it, with dashboards as wide bento grids. Do **not** reproduce the phone-width-in-a-desktop-window composition. The binding rule is `15-ui-surfaces.md` §15.4 "Adaptation vs. measure".

**Parity goal:** reproduce the same route hierarchy, content order, interaction states, motion, and agent-runtime feedback. Responsive **geometry** follows the EdApex divergence above, not the source's fixed phone column. Treat the source as the authority for interaction; this document does not redefine EdApex's identity.

**Evidence note:** the inspected source establishes the overall shell, Chat, transcript, composer, and representative agent/approval behavior. I did not run the app or inspect screenshots; some secondary page details are identified as not yet verified. Code-search results may be incomplete; [browse more repository code results](https://github.com/CopilotKit/OpenDuet/search?q=tool_activity&type=code).

### Table of contents

1. Porting target and parity objective
2. Application frame, layout, and navigation
3. Runtime screen inventory
4. Chat and agent-runtime UI
5. Tool activity, approvals, and human control
6. Runtime state and event behavior
7. Design system and interaction rules
8. Implementation priorities and parity checklist
9. Evidence gaps

---

## 2. Application frame, layout, and navigation

### 2.1 Authenticated app shell

The app is wrapped by the authentication route, which redirects signed-out visitors to `/sign` and users who need onboarding to `/onboarding`. The CopilotKit provider is mounted **inside** that authenticated boundary and uses `/api/copilotkit` with session credentials. [Auth route](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/routes/_authed.tsx#L1-L31), [Copilot provider](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/lib/copilot/provider.tsx#L55-L118)

```text
Authenticated app: one viewport, no document-level scroll
┌──────────────────────────────────────────┐
│          centered app column             │
│                                          │
│      floating header / chat-status        │
│                                          │
│      screen’s own scrollable content      │
│                                          │
│      floating composer in Chat            │
│                                          │
│          floating 3-tab bar               │
└──────────────────────────────────────────┘
```

**Verified layout rules:**

- Shell height: `100svh`; outer frame uses `overflow-hidden`.
- Main tab column: centered, `width: 100%`, `max-width: 430px`, flex column.
- Tabs: Chat, Tasks, Make.
- Tab bar: bottom-floating, 344 px wide, max-width viewport minus 32 px, 64 px high, 22 px from bottom. Its actual covered height is measured and written to `--duet-tab-space` so content/composer can clear it.
- Screen content scrolls inside the viewport; it is not the page body.
- Main Chat header floats over content with a gradient fade; Chat composer also floats over the transcript and is measured to establish transcript bottom padding.
- Routes outside the three tabs appear as pages over the app with a distinct page header and no tab bar.

Sources: [AppShell and columns](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/shell/app-shell.tsx#L56-L179), [TabBar](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/shell/tab-bar.tsx#L12-L113), [ConversationView layout](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/channels/conversation-view.tsx#L143-L178).

### 2.2 Main and pushed-page chrome

**Tab-shell header:** three controls in a row: menu disc at left, OpenDuet mic orb centered, user-initial disc at right. The orb links to Chat and changes according to chat presence; a floating status pill under it displays the current step. Header controls are 46 px discs. [ShellHeader](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/shell/header.tsx#L22-L95)

**Pushed-page header:** back disc on left, centered title pill, optional action/“More” disc at right. No menu, avatar, or tab bar. Back uses browser history when available, otherwise the page’s configured return route. A left-edge swipe (starts within 24 px, travels at least 64 px, mostly horizontally) also goes back. [PageHeader and back behavior](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/shell/header.tsx#L134-L183), [edge-swipe behavior](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/shell/app-shell.tsx#L157-L213)

### 2.3 Tab and route behavior

`tabForPath` maps:

- `/` and `/channels/:channelId` → Chat
- `/tasks` and `/tasks/:taskId` → Tasks
- `/make` and `/make/:pageId` → Make
- Other routes → pushed pages, no tabs

This means a task detail or page detail keeps its parent tab selected underneath. A channel opened from the roster is a pushed page, unlike a Chat-tab channel. [Tab route mapping](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/shell/tab-bar.tsx#L25-L41)

The tab bar’s Tasks badge counts work needing the person, including relevant approvals, and uses the same count logic as the Tasks page. Selection is a sliding capsule; the badge animates in/out and changes digits. Reduced motion changes animations to simpler transitions/fades. [TabBar](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/shell/tab-bar.tsx#L43-L113)

### 2.4 Sidebar and configuration-page layout

The app shell exposes a menu sheet; configuration screens use `SidebarShell` and `PageShell`. Sidebar state is persisted in local storage. Main app roster width is **340 px**; admin/settings navigation width is **300 px**. On narrow screens the sidebar becomes a sheet. [SidebarShell](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/layout/sidebar-shell.tsx#L10-L62)

`PageShell` configuration content defaults to a centered **768 px** (`max-w-3xl`) prose column, with **960 px** (`max-w-5xl`) reserved for wide tables such as Audit. The scroll area belongs inside the shell because the main app is viewport-locked. Sections begin with a 48 px top margin; row groups are bordered cards. [PageShell](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/layout/page-shell.tsx#L25-L39), [PageShell layout and sections](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/layout/page-shell.tsx#L90-L205)

---

## 3. Runtime screen inventory

The route tree identifies a broad runtime surface. The list below is a **route inventory**, not a claim that every route’s detailed visual treatment was inspected.

| Area | Route/source examples | Porting notes |
|---|---|---|
| Chat | `/`, `/channels/:channelId` | Primary Bot conversation; channel routes use the same chat runtime. |
| Tasks | `/tasks`, `/tasks/:taskId`, `/tasks/questions/:questionId` | Task list/detail and a question-answer surface. |
| Make | `/make`, `/make/:pageId`, `/pages` | Created pages and page detail; page cards open over the app. |
| Bots | `/bots`, `/bots/:agentId`, `/bots/:agentId/access`, `/approvals`, `/memory`, `/reach`, `/responsibilities`, `/routines`, `/setup`, `/sharing` | Bot profile/configuration surfaces. `/approvals` redirects to the current approvals destination; inspect current sidebar and route mappings before porting. |
| Connections | `/connections`, `/connections/:key` | Connected apps and details. |
| Capabilities | `/capabilities`, `/capabilities/memory`, `/capabilities/skills` | Skills/memory settings and capability configuration. |
| Inbox | `/inbox` | Person-facing incoming work/questions. |
| Activity | `/activity` | Legacy route redirects to Make; do not implement as a current standalone Activity page based on this route. |
| Groups | Group route directory | Multi-person/Bot conversations. Exact route set requires further inspection. |
| Onboarding | `/onboarding` | Authenticated onboarding route, enforced before other authenticated routes. |
| Admin | `/admin/...` | Admin screens, shared page shell; complete subroute inventory not inspected. |
| Sign-in | `/sign` and sign-in route directory | Authentication. |
| Pushed pages | app overlays such as task/page detail | Back disc/page title chrome; underlying tab retained where applicable. |

Sources: [authenticated app routes listing](https://github.com/CopilotKit/OpenDuet/tree/main/openbot/app/src/routes/_authed/_app), [app route shell](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/routes/_authed/_app.tsx#L5-L23), [Tasks route](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/routes/_authed/_app/tasks.tsx#L1-L16), [Make route](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/routes/_authed/_app/make.tsx#L1-L16), [legacy Activity redirect](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/routes/_authed/_app/activity.tsx#L1-L11).

---

## 4. Chat and agent-runtime UI

### 4.1 Chat screen and first-use behavior

`ChatScreen` locates the primary Bot and its ongoing channel. It paginates channel history if needed. If no conversation exists—or the latest channel has never had a message—it shows the first-message path. Otherwise it renders `ChannelChat` inside the Chat tab. [ChatScreen](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/shell/chat-screen.tsx#L42-L103)

On first use, the app may send a first-day greeting request as a Bot-started turn. It waits for the account and relevant Gmail connection state; it chooses a mail-connected or no-mail version accordingly. A person typing first takes precedence over the greeting. [First-message flow](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/shell/chat-screen.tsx#L178-L319)

### 4.2 Conversation column

`ChannelChat`:

- Binds the runtime agent to channel ID/thread ID.
- Restores stored messages and joins the realtime runtime.
- Merges durable history with locally streamed messages.
- Follows turns started elsewhere (for example after an approval, from another tab/device, or server-run work).
- Tracks turn-level busy state separately from a single AG-UI run.
- Observes approval inbox changes and follows server-side continuation.
- Sends user messages, attachments, skill instructions, voice context, and component-triggered actions through shared `say`/`deliver` logic.
- Renders `ConversationView` with transcript, status, composer, notices, voice-call widget, and in-shell positioning.

Source: [`ChannelChat`](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/channels/channel-chat.tsx#L363-L430), [send and turn lifecycle](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/channels/channel-chat.tsx#L1011-L1301), [conversation rendering](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/channels/channel-chat.tsx#L1649-L1874).

### 4.3 Transcript geometry and ordering

The transcript lives inside a `MessageScroller`. Its content is centered at **max-width 672 px** (`max-w-2xl`) with 16 px horizontal padding; the shell adds a Chat-specific content class, increasing the top offset to 100 px and reserving bottom space for the measured floating dock. Tool rows are grouped and cards/chips are reordered to the end of their turn. [Transcript scroller](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/channels/chat-transcript.tsx#L2082-L2259), [Chat dock positioning](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/channels/conversation-view.tsx#L566-L715).

**Message appearance:**

- User: right-aligned, up to 85% width, accent-tinted bubble.
- Agent: left-aligned, up to 82% width, neutral bubble.
- Both use 20 px corner radius, 16 px horizontal and 12 px vertical padding.
- User content is plain pre-wrapped text; agent prose is streaming-aware Markdown.
- Agent text is split into separate bubbles by thought/paragraph; streaming should not replay entry animation.
- Attachments appear as equal-size square tiles, aligned with the user’s message, before caption text.
- Transcript loading uses skeleton placeholders; there is a specific warning when prior history is unavailable/unreadable.
- “Thinking” appears below the person’s last message only while the agent is busy and has not yet produced a text/tool row.
- A failed turn’s sentence appears in the transcript slot where its answer was expected.
- “Seen” appears on the newest unanswered person message after a brief settle delay.
- Recent history rows stagger in (up to 12 items, 40 ms apart); live streaming rows should enter without that history cascade.

Sources: [bubble styling and restoring state](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/channels/chat-transcript.tsx#L139-L226), [message rendering](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/channels/chat-transcript.tsx#L853-L1001), [loading and message rendering](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/channels/chat-transcript.tsx#L1938-L2259).

### 4.4 Composer

The shell’s compact composer is a floating, rounded pill/card with a frosted treatment. In compact mode, the control row contains attach (`+`), text editor, dictation/microphone, and one primary circular action. That action changes among Send, Stop, voice call, and voice-sheet entry based on state. On a non-shell screen, the composer is a conventional bordered card with editor above the action row. [Composer layout](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/channels/composer/composer.tsx#L138-L215), [compact composer markup](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/channels/composer/composer.tsx#L1563-L1699).

Functional parity requirements:

- Composer remains editable while a channel Bot is working.
- If queueing is enabled, submit parks the draft instead of starting another simultaneous turn; the queued user bubble and its attachments are visible with a “Queued” footer and Remove control.
- The queue is in-memory for that tab, **not a durable outbox**. Server-queued messages may also appear.
- Queue drains after the current turn; failed drained work is restored to the queue and held until a person initiates another turn (no automatic retry loop).
- Attachment entry is through picker, drop, and clipboard paths, with screening/refusal text, upload states, per-message caps, and staged-row cleanup.
- Enter and send button share a submit path; busy/disabled/read-only and over-cap states must be consistent across keyboard and pointer.
- `@` and `/` tokens represent agents/skills when available; the route currently notes that a per-message mention is not yet a change to the channel’s Bot binding.
- Dictation, voice call, and attachment-only sends are supported in the relevant contexts.

Source: [Composer state/submit behavior](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/channels/composer/composer.tsx#L331-L405), [submit and queue behavior](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/channels/composer/composer.tsx#L1131-L1269), [queue and composer integration](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/channels/conversation-view.tsx#L481-L564).

---

## 5. Tool activity, approvals, and human control

### 5.1 Activity grouping and detail

Adjacent plain tool calls are grouped into a single disclosure row; browser, connector, and otherwise generic server tools can be folded, while app-rendered tools and questions for the person remain visible outside the disclosure. This avoids hiding a required user decision. [Grouping rules](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/channels/tool-activity.tsx#L32-L91)

A grouped row summarizes what happened (“searched the web,” “read N pages,” “browsed N pages,” “searched your email,” etc.), stacks icons by activity kind, shows an issue count, and expands into ordered steps. Step details can include tool inputs, outputs, connector names, page links, and statuses (“In progress,” “Waiting for you,” “Not completed,” “Blocked,” “Didn’t work”). Browser steps are labeled as page actions and include the page title/host and failure reason. [Step derivation and summary](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/channels/tool-activity.tsx#L139-L395), [step rows and grouped activity](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/channels/tool-activity.tsx#L434-L563).

### 5.2 Approval UI

Approval requests render inline beside the originating tool call when appropriate. The same owner-scoped inbox is used by inline cards and the inbox surfaces, so a decision in one place updates the other. After a decision, the pending card becomes a compact decided card and the tool’s own renderer/result is restored. Grouped browser steps render pending approval cards outside the collapsed group. [Inline approvals](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/approvals/inline-approval.tsx#L10-L87).

Do not treat every computer click/type as automatically approval-blocked; the server decides based on safety requirements, settings, rules, and review. For high-impact actions, the product’s tenant prompt instructs the agent to invoke the action directly and let the gate present the approval, rather than asking twice in chat. [Approval policy](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/server/src/approvals/policy.ts#L1-L83), [OpenDuet prompt](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/examples/openduet/agents.yaml#L43-L87).

### 5.3 Handoff/task/page cards

- **Handoff:** show target Bot, task, constraints, expected result, pending/completed/refused state.
- **Task card:** `start_task` leaves a card in Chat and runs in a separate conversation; user opens it to inspect/steer.
- **Task suggestion:** `add_tasks` adds cards to Tasks; the user starts or hides them.
- **Page card:** `make_page` produces content in Make/a page view; chat stays short and links to the card.
- **Reply chips:** rendered as selectable chips after the answer; selecting one sends it as a person turn.
- **Generated UI:** AG-UI activity messages are passed to registered activity renderers; if there is no renderer, the activity does not draw.

Tool-specific UI renderers are registered in [`CopilotProvider`](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/lib/copilot/provider.tsx#L82-L114). The transcript’s activity and tool renderer paths are in [`chat-transcript.tsx`](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/channels/chat-transcript.tsx#L1550-L1683).

---

## 6. Runtime state and event behavior

### State distinctions that matter for parity

| UI/runtime state | Trigger and presentation |
|---|---|
| Restoring | Channel/thread history is being loaded; do not stream old replay rows into view piecemeal. Show skeleton placeholders or existing stand-in history. |
| Idle | No turn is owned/followed; composer accepts new input. |
| Thinking | Turn is active, latest transcript row is the person’s message/attachment, and no tool/text response is yet visible. |
| Tool running | Tool call has arguments but no result; show shimmer/in-progress row. |
| Tool complete | Result exists; show success/detail and continue transcript. |
| Tool failed | Tool was allowed but failed; amber/error distinction, include useful result/reason. |
| Refused/blocked | Server policy/boundary refusal; do not show as successful action. |
| Declined | Person refused approval; show “You declined” semantics; do not imply tool failure. |
| Waiting for person | Approval or browser/secret handoff is pending. Keep decision visible, don’t bury it inside a collapsed group. |
| Queued | Person typed while the conversation is occupied. Render their message as a faded user bubble with “Queued” and Remove. |
| Following | A run started elsewhere or by server continuation. Show busy status and follow its stream; queue input if supported. |
| Stopped/error | Turn failed, stopped, or could not continue. Show explanatory text in the transcript’s answer position; restore drafts where source does so. |
| Completed | Final text and any associated cards/chips are shown; clear busy status. |

The source differentiates **turn-level busy** from **individual AG-UI run status** because frontend tools can end one run and start a continuation while the overall task is still active. The header status pill and composer behavior must use the turn/follow state, while Stop must only be available when there is a run the client can actually abort. [Channel turn/run handling](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/channels/channel-chat.tsx#L958-L985), [composer busy/stoppable contract](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/channels/conversation-view.tsx#L88-L127).

### Runtime update mechanisms

- CopilotKit React v2 uses `/api/copilotkit` with session cookies.
- AG-UI events update the agent’s message state and drive text/tool/activity transcript projections.
- A shell-level channel event connection keeps conversation-list activity and working indicators current.
- Chat follows runs not started in the current tab and reloads durable history after they finish.
- Group conversations use a 1.5-second TanStack Query polling interval while queued/running or awaiting a first reply.
- Approval state is queried from the inbox and reflected in both inline cards and other approval surfaces.
- Activity-in-transcript is not the same as the durable audit record.

No single app-wide WebSocket event catalogue was established in this investigation. Do not invent one.

---

## 7. Design system and interaction rules

### 7.1 Color, typography, and geometry

Use the app tokens rather than the desktop setup wizard’s styles. [Theme token source](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/lib/theme-tokens.ts#L29-L79), [stylesheet tokens](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/styles.css#L65-L114).

| Role | Light | Dark |
|---|---|---|
| Surface | `#f6f6f8` | `#111113` |
| Card | `#ffffff` | `#1c1c1f` |
| Agent bubble | `#ececf0` | `#26262b` |
| Tile | `#f1f1f4` | `#26262b` |
| Ink | `#18181b` | `#f4f4f5` |
| Secondary ink | `#55555e` | `#a1a1aa` |
| Accent | `#6430ab` | `#b49ae8` |
| Success | `#147a3a` | `#4ade80` |
| Needs attention | `#a34a06` | `#fbbf24` |
| Working | `#1d4ed8` | `#7aa2ff` |
| Problem | `#b91c1c` | `#f87171` |

- Font: variable Inter.
- Type scale: display 24/28 px 600; nav 18/22 px 500; body 17/23 px 400; sub 15/20 px 400; caption 13/16 px 400.
- Bubble/card radius 20 px; field radius 22 px; tile radius 10 px; pills/buttons fully rounded.
- Main side gutter: 16 px.
- Touch controls: at least 44 px (shell uses a `duet-touch` floor).
- Main shell max width: 430 px (EdApex: the chat measure, not the shell — see §1).
- Chat transcript: 672 px max width outside shell, but shell Chat expands the transcript to its 430 px column.
- Page-shell configuration column: 768 px default, 960 px for wide tables.

### 7.2 Motion and accessibility

The motion vocabulary is centralized: tap 120 ms, swap 200 ms, entrance 250 ms, sheet 350 ms; strong ease-out `[0.23, 1, 0.32, 1]`. Reduced-motion preference removes/slows movement and avoids staggered history. [Motion tokens](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/lib/motion.ts#L1-L40).

Porting parity should preserve:

- Semantic button/input controls and accessible labels.
- Focus ring and keyboard-operable controls.
- Dialog focus management and Escape handling.
- Live-region announcements for agent step/status updates without repeated announcements.
- Reduced-motion behavior.
- Correct reading/focus order, not only visual order.
- Scroll anchoring to the person’s turn while the answer arrives; do not auto-scroll every token indiscriminately.
- Single-line activity summaries with details behind disclosure where appropriate.

The dialog primitive centers a max-85vh panel with a scrollable body and close control; sheet primitives slide from the selected edge and simplify animation for reduced motion. [Dialog](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/ui/dialog.tsx#L24-L112), [Sheet](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/ui/sheet.tsx#L1-L54).

### 7.3 Global navigation and page layout

The tab bar is the only persistent bottom navigation for Chat, Tasks, and Make. The header is floating on tabs. Configuration/profile routes use a pushed page header; ordinary settings/admin pages may use a sidebar and `PageShell`. `ScreenScroll` reserves 100 px above content and bottom room for the floating tab bar. [Screen layout](https://github.com/CopilotKit/OpenDuet/blob/f52288fff5ccdbd3de428d573d9f026fce5ff480/openbot/app/src/components/shell/screen.tsx#L1-L41).

---

## 8. Implementation priorities and parity checklist

Use this as the port’s acceptance checklist:

### Frame and navigation
- [ ] App occupies one viewport with internal scrolling, not document scrolling.
- [ ] Shell adapts: tab bar below 1024 px, inset sidebar + canvas at or above; the chat column stays measured (see §1 divergence).
- [ ] Chat, Tasks, Make tab bar floats at bottom; correct active capsule and Tasks waiting badge.
- [ ] Tab routes preserve selection for task/page detail overlays.
- [ ] Pushed pages use back/title/action chrome and omit the tab bar.
- [ ] Back disc and edge-swipe behavior are equivalent.
- [ ] Menu sheet, new-channel sheet, and route transitions close/open correctly.

### Chat
- [ ] Chat loads the primary Bot’s ongoing channel and paginates to find it.
- [ ] First message/greeting logic does not duplicate or race the person’s first send.
- [ ] Transcript restores durable history before displaying the full conversation.
- [ ] User and agent bubble alignment, colors, radii, text treatment, and attachment order match.
- [ ] AG-UI tool calls pair with results by ID; missing result remains running.
- [ ] Server tool groups collapse adjacent plain activity but never hide a user decision.
- [ ] Thinking, tool-in-progress, stopped/error, seen, queued, and history-unavailable states are distinct.
- [ ] Cards and reply chips appear after the answer/turn they belong to.
- [ ] Attachments are equal-size tiles, open images in an in-app lightbox, and show honest unavailable state.

### Composer
- [ ] Compact floating composer uses the `+`, editor, dictation/voice, primary-action geometry.
- [ ] Primary action swaps between send/stop/voice modes without moving the button.
- [ ] Keyboard Enter and button submit share validation.
- [ ] Queueing is enabled only where the parent conversation can retain queued messages.
- [ ] Queued messages are visibly faded, removable, and retain attachments.
- [ ] Failed sends restore words/files; failed queue drains do not auto-loop.
- [ ] Attachment picker/drop/paste produce consistent validation and refusal messages.
- [ ] `/` skill chips and `@` mentions appear and serialize as structured input.
- [ ] Focus restoration does not steal focus on every busy/idle transition.

### Runtime events, tool execution, and approvals
- [ ] Text deltas render without rerendering/reanimating all prior messages.
- [ ] Tool row has concise label, progress/success/refusal/failure distinction, and expandable details.
- [ ] Grouped tool summaries preserve event ordering and individual step detail.
- [ ] Approval card appears inline or adjacent to the relevant grouped steps; decisions update across surfaces.
- [ ] Browser actions are visibly reported and use current snapshot refs.
- [ ] Human takeover/secret entry is a waiting workflow, not prose pretending to request access.
- [ ] Server remains authoritative for grants, policy, approvals, and audit.

### Visual and motion
- [ ] Match app light/dark token values, Inter type scale, radii, spacing, and card/bubble treatment.
- [ ] Match tab/header/composer positioning and safe-area behavior.
- [ ] Honor reduced motion.
- [ ] Keep touch targets at least 44 px and preserve keyboard/focus access.
- [ ] Test at 320–430 px and in a wide desktop viewport; the wide viewport adapts the shell (rail + canvas) while the chat column stays measured — see the EdApex divergence in §1.

---

## 9. Evidence gaps

The following work is still necessary before calling the document a complete pixel-level port reference:

1. **Partially resolved:** `MenuSheet` and the shell navigation labels are verified from `openbot/app/src/components/shell/menu-sheet.tsx` (Everything, channels, New channel, Archived, Manage: Bots, Connections, Capabilities, Routines, Approval rules; Settings) and `tab-bar.tsx` (Chat, Tasks, Make). The full Chat/Tasks/Make component tree and detail sheets still need a line-level pass.
2. **Partially resolved:** the route tree is verified from `openbot/app/src/routes/_authed/_app/` and includes Bots, Team Bots, Connections, Capabilities, Routines, Responsibilities, Skills, Memory, Inbox, Pages, Group chats, Activity, Approvals and Settings. The per-route component hierarchy is still incomplete.
3. Inspect the remaining design tokens and components in `styles.css`, particularly tab/header glass, spacing, surfaces, responsive/mobile rules, and motion values.
4. Capture screenshots or run the application at common viewport sizes; compare positions, heights, scroll anchoring, and overlay placement.
5. Inspect current generated route tree and test snapshots to verify current route list and expected render states.
6. Build a full connector/tool catalogue from the plugin catalogue and connector package definitions; the computer tool list in this document is verified but not exhaustive.

These gaps matter for the specific goal of **visual and layout positioning parity**: the source establishes key dimensions and interaction contracts, but exact positioning of every secondary route should be confirmed from its component and runtime rendering before implementation.