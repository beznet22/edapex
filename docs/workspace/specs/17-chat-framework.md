# 17 — Chat Runtime and Generative UI Framework

**Draft.** Phase 10 recommendation. `packages/chat` now owns the normalized runtime/queue state; the xcodex adapter, streaming Markdown and artifact events are still pending 10B/10C work.

## Specification context

This spec owns the **chat runtime and normalized state**: message parts, run/turn states, queue drain, restore/follow/stop, approval mapping and the xcodex adapter boundary.

- `15-ui-surfaces.md` owns how those states are presented, routed and made responsive.
- `19-design-system.md` owns the visual primitives and tokens used to render them.
- `21-generative-ui-openui.md` owns generated-surface parsing, catalog and actions.
- `43`/`44` own reference-source reuse and audit rules.

Do not solve a visual placement problem in this spec, and do not define a second runtime in the UI spec.

## Recommendation

Use the **ported OpenDuet interaction layer** as the presentation layer, a **custom xcodex runtime adapter** as the only chat state/runtime, **OpenUI Lang** for generated surfaces, **Streamdown** for streaming Markdown, and **Tiptap** for editable document artifacts.

```text
xcodex Rust local agent
  → XcodexChatAdapter
  → message parts / runs / tool calls / approvals
  → OpenDuet-derived transcript + composer + ActionBar
  → OpenUI SurfaceRenderer for generated cards
  → Streamdown for Markdown
  → Tiptap for editable document artifacts
  → PDF.js/IronPress/docx/PapaParse for document import/export
```

- **xcodex is the agent runtime.** There is no AI SDK agent runtime and no server-side xcodex.
- **OpenDuet owns the interaction model**, not the data model. Strip CopilotKit, A2UI, query clients and auth before vendoring.
- **OpenUI owns generated presentation**, not chat state and not data access. See `21-generative-ui-openui.md`.
- **The server remains authoritative** for EdApex mutations, approvals and capability grants.

## Why assistant-ui was rejected

assistant-ui was the earlier single-chat-layer choice. It is no longer used because:

- OpenDuet already provides the transcript, composer, tool activity, approval cards, queue/following states and the narrow-shell geometry required by the platform matrix.
- assistant-ui would require a second runtime adapter and its own component styling, duplicating the OpenDuet shell.
- Its optional Cloud/persistence features are unnecessary and must not be used.
- OpenUI covers generated surfaces without a second chat runtime.
- The remaining work is the xcodex adapter, not a third-party chat state model.

Do not add `@assistant-ui/*`, `@assistant-ui/react-markdown`, assistant-cloud or AI SDK `UIMessage` rows. If the vendored shell cannot express a required state, extend the custom runtime; do not reintroduce a second chat layer.

## Options

| Option | Strengths | Limits | Role |
|---|---|---|---|
| **OpenDuet ported interaction + custom xcodex runtime** | Exact interaction/state parity; no CopilotKit runtime; Gold on Slate; one chat layer | Must strip upstream imports and build the adapter; upstream drift is manual | **Chosen** |
| **OpenUI Lang** | Compact, streaming-first, React renderer, token-efficient; registered components | Web-only; no native renderer; vendor-led; needs catalog/action controls | **GenUI surfaces only** |
| **Streamdown** | Streaming Markdown, incomplete blocks, GFM/code/math/Mermaid; already used by OpenDuet | Markdown only; sanitize and pin | **Chat Markdown + artifact preview** |
| **Tiptap** | Headless ProseMirror editor, MIT, active, already used by legacy EdApex | Must build the minimal Novel-style UI; use open-source extensions only | **Artifact editor** |
| **Novel** | Notion-style Tiptap UI, Apache-2.0 | Adds Vercel AI SDK completion and an opinionated UI; conflicts with xcodex | **Visual reference only; no package/source copy** |
| **CopilotKit** | AG-UI, shared state, human-in-the-loop; OpenDuet reference | Server/runtime layer; duplicates xcodex and CF authority | **Reference only** |
| **assistant-ui** | React chat primitives, runtime adapters, tool UI | Duplicate shell/runtime; paid Cloud risk; removed | **Rejected** |
| **AI SDK UI/RSC** | Stable React chat hooks; RSC `streamUI` | `streamUI` is experimental and Next.js/RSC-specific; AI SDK agent runtime is not local xcodex | **Rejected for v1** |
| **shadcn AI Elements** | shadcn-native chat patterns | Duplicates the OpenDuet chat layer | **Not used** |

## Runtime contract

The adapter is local: Tauri invoke/WASM on native, WASM on web. It maps xcodex app-server/thread/tool events into EdApex message parts.

```text
xcodex event
  → normalized chat event
  → local transaction (message/run/tool/approval/activity)
  → syncable event (unless edapex-ephemeral)
  → UI projection
```

Required mappings:

| xcodex event | EdApex projection |
|---|---|
| thread/message text delta | `text` message part; Streamdown |
| reasoning/thinking | `thinking` part; never mistaken for final text |
| tool call start/args | `tool_call` part, `running` |
| tool result | `tool_call` part, `completed` / `failed` / `blocked` |
| approval request | `approval_request` + `ActionBar`/inline approval |
| approval decision | decided card; restore tool renderer/result |
| generated surface | `surface` part; OpenUI `SurfaceRenderer`; renderer validates `catalogVersion` |
| attachment upload | `attachment` part via local transaction |
| artifact tool-call deltas | `artifact_start/delta/finish/error` events → `ArtifactPart` + artifact store; turn stays `tool_running` (contract: `16-artifacts.md`) |
| run start/finish | `runs` row; turn-level busy/follow state |
| cancellation | `stopped/error`; restore draft where the source does |

Do not map xcodex events through AI SDK `UIMessage` or assistant-ui runtime types. Define one EdApex message-part contract in `packages/contracts`.

Native xcodex uses the same projection through a typed `AgentEvent` channel (`48-local-capability-layer.md`). Its app-server dynamic tools (`web_search`, `web_fetch`, `ocr_extract`) are executed in process by the Tauri host and do not appear as MCP child processes. Browser WASM uses the same tool names and schemas. A tool that the host cannot execute is not advertised.

## Message parts

Use typed parts, not an untyped content blob. The normative union is `ChatMessagePart` in `packages/contracts/src/chat.ts`; no spec reprints it. The live contract carries `text`, `thinking`, `tool` (with `name`, `status`, `summary`), `approval` (with `status`, `title`, `description`, `risk`, `decisionSource`), `surface` and `attachment` parts, plus `ToolCallStatus` = `running | completed | failed | blocked | declined | refused | waiting_for_person`.

10B adds one outstanding Modify entry to `packages/contracts`:

- `ArtifactPart` — `{ kind: "artifact"; artifactId: string; version: number }` — the chat-side pointer into the artifact store (`16-artifacts.md`); required before artifact persistence.

`SurfacePart.expiresAt` is now present as `readonly expiresAt?: number` (epoch ms); storage drops the surface content after expiry and keeps the part shell. Required by `60-security-privacy.md`.

- `surface` is defined in `21-generative-ui-openui.md` (normative type: `packages/contracts`).
- `message_parts` is the canonical storage table; `41-storage-sync.md` and `42-agent-db-schema.md` must agree.
- Ordering is explicit (`ordinal`); do not rely on object key order.
- Unknown activity types render nothing; do not invent UI for an unregistered activity.

## Chat state

The contract enum is `WorkspaceRunState` in `packages/contracts` (`restoring`, `history_unavailable`, `idle`, `thinking`, `following`, `tool_running`, `waiting_for_person`, `completed`, `stopped`, `error`). Presentation states in `15` map onto it:

| 15 presentation state | Contract |
|---|---|
| Tool running / tool complete / tool failed | `tool_running` (tool completion is a `ToolCallStatus`, not a run state) |
| Queued | message-level `queueState` (`queued`/`sending`), not a run state |
| Declined / refused/blocked | `ToolCallStatus` values surfaced during `waiting_for_person` |
| Stopped/error | `stopped` or `error` |
| Restoring, idle, thinking, following, waiting for person, completed | same-named `WorkspaceRunState` values |

Decline semantics (normative): declining one approval records `declined` on that part and the turn continues (`thinking`) if other actions remain, else ends `stopped`. Refusing ends the turn `stopped`.

Preserve the OpenDuet distinctions in `15-ui-surfaces.md`:

- turn-level busy vs individual run status;
- queue vs following;
- restoring vs empty history;
- waiting for person vs tool running;
- declined vs failed vs refused/blocked;
- stop only when an abortable run exists.

The custom runtime owns:

- thread restore/pagination;
- message/part assembly;
- run cancellation;
- queue drain;
- approval projection;
- local persistence and sync event emission.

It does **not** own:

- capability grants;
- tenant scope;
- approval tokens;
- mutation authorization;
- school-record data.

## Markdown

Use **Streamdown (React package)** for streaming agent Markdown and artifact preview.

- The upstream OpenDuet reference uses Streamdown in its React transcript. The legacy EdApex app's `svelte-streamdown` is Svelte-only and not reusable; the React package is a new `packages/chat` dependency (10B decision, see `22`).
- Keep incomplete-block handling, GFM, code, math and Mermaid support where configured.
- Pin the version; apply the Streamdown security controls and allowlist links/images.
- Tailwind v4 requires `@source` entries for `streamdown` and any plugins.
- Do not use assistant-ui's Markdown renderer; it is not in v1.
- Tiptap is the document editor; Streamdown is the preview, not the editor.
- The minimal inline/side-panel editor, document engine, download menu and artifact renditions are defined in `16-artifacts.md` and `22-documents-and-artifacts.md`.

## Generative UI boundary

- OpenUI Lang renders in `packages/genui`; it does not own chat state.
- The generated surface receives data from a tool result, not from its own query/mutation.
- Actions are closed `GenUIAction` IDs; no `{ method, path, body }`.
- GenUI is read-only or assisted; authoritative workflows stay in fixed React.
- Do not use MCP Apps, iframe HTML or CopilotKit's `open-generative-ui` runtime.
- See `21-generative-ui-openui.md`.

## Persistence

- Local SQLite/OPFS is the primary chat store.
- Cloud sync uses the separate `AGENT_DB`; no school records, sessions or provider secrets.
- `edapex-ephemeral` message parts (including generated surfaces with school data) never sync a PII snapshot.
- No assistant-cloud, hosted persistence or paid seat is used.
- The store/adapters are defined in `41-storage-sync.md` and `42-agent-db-schema.md`.

## Approvals

- Approval cards come from OpenDuet presentation, bound to EdApex `approval_requests`.
- Options map to the typed decisions `allow_once`, `allow_for_session`, `deny` and `abort`; destructive/bulk EdApex actions may not offer session approval until policy allows it.
- A refusal is `declined`, not `failed`; a policy refusal is `refused/blocked`.
- Approval tokens and idempotency keys are server-issued/validated.
- The UI never auto-approves and never mints authority.

## Risks

- Streamdown's Markdown extensions increase the HTML/Markdown attack surface; sanitize, allowlist links/images, and pin the version.
- Upstream OpenDuet drift is manual once vendored; re-audit against the pinned SHA before each vendoring change (`44-reference-app-audits.md`).
- The xcodex event map is adapter-owned; no app-wide event catalogue exists upstream — do not invent one.
- Artifact event emission couples `packages/chat` to the artifact store; the mapping table above is the single source.

## Acceptance

- Streamdown is the target chat Markdown renderer; the current 10B shell renders plain text until the integration lands.
- No `@assistant-ui/*`, assistant-cloud, AI SDK `UIMessage` or CopilotKit runtime dependency.
- No `novel` package, Novel source copy or `ai`/`@ai-sdk/*` completion path; Tiptap is the only editor runtime.
- The custom adapter maps every xcodex event in the table above.
- Queue/following, stop, history restore and approval states match `15`.
- Streamdown renders incomplete Markdown safely; Tiptap remains the artifact editor.
- OpenUI surfaces render from a typed catalog and closed actions.
- No authoritative school-record store or durable API-response cache is persisted or synced; session-derived content follows `60`'s retention policy. No session token is persisted or synced.
- The same contracts work on web PWA, Tauri desktop and Tauri mobile WebView.

## Sources

- OpenDuet pinned source: `CopilotKit/OpenDuet@f52288fff5ccdbd3de428d573d9f026fce5ff480`
- OpenDuet interaction reference: `docs/workspace/extracted-ui-spec.md`
- OpenUI: `21-generative-ui-openui.md`
- Streamdown: <https://github.com/vercel/streamdown>
- Tiptap: <https://github.com/ueberdosis/tiptap>
- Novel (visual reference only; enforced by `44-reference-app-audits.md`): <https://github.com/steven-tey/novel>
- xcodex: <https://github.com/olegische/xcodex>

Agents must pin versions and verify current APIs before implementation. No dependency is approved by this draft.
