# 17 — Chat Runtime and Generative UI Framework

**Draft.** Phase 10 recommendation. No dependency is installed by this document.

## Recommendation

Use the **vendored OpenDuet chat shell** as the presentation layer, a **custom xcodex runtime adapter** as the only chat state/runtime, **OpenUI Lang** for generated surfaces, **Streamdown** for streaming Markdown, and **Tiptap** for editable document artifacts.

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

- OpenDuet already provides the transcript, composer, tool activity, approval cards, queue/following states and narrow-shell geometry we need.
- assistant-ui would require a second runtime adapter and its own component styling, duplicating the OpenDuet shell.
- Its optional Cloud/persistence features are unnecessary and must not be used.
- OpenUI covers generated surfaces without a second chat runtime.
- The remaining work is the xcodex adapter, not a third-party chat state model.

Do not add `@assistant-ui/*`, `@assistant-ui/react-markdown`, assistant-cloud or AI SDK `UIMessage` rows. If the vendored shell cannot express a required state, extend the custom runtime; do not reintroduce a second chat layer.

## Options

| Option | Strengths | Limits | Role |
|---|---|---|---|
| **OpenDuet vendored shell + custom xcodex runtime** | Exact interaction/state parity; no CopilotKit runtime; Gold on Slate; one chat layer | Must strip upstream imports and build the adapter; upstream drift is manual | **Chosen** |
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
| generated surface | `surface` part; OpenUI `SurfaceRenderer` |
| run start/finish | `runs` row; turn-level busy/follow state |
| cancellation | `stopped/error`; restore draft where the source does |

Do not map xcodex events through AI SDK `UIMessage` or assistant-ui runtime types. Define one EdApex message-part contract in `packages/contracts`.

## Message parts

Use typed parts, not an untyped content blob:

```ts
type MessagePart =
  | { kind: "text"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "tool"; toolCallId: string }
  | { kind: "approval"; approvalRequestId: string }
  | { kind: "surface"; surface: SurfacePart }
  | { kind: "artifact"; artifactId: string; version: number };
```

- `surface` is defined in `21-generative-ui-openui.md`.
- `message_parts` is the canonical storage table; `41-storage-sync.md` and `42-agent-db-schema.md` must agree.
- Ordering is explicit (`ordinal`); do not rely on object key order.
- Unknown activity types render nothing; do not invent UI for an unregistered activity.

## Chat state

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

Use **Streamdown** for streaming agent Markdown and artifact preview.

- OpenDuet already depends on Streamdown 2.5 and its transcript uses it.
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
- Options follow OpenDuet: Allow once, Always allow, Refuse; destructive/bulk EdApex actions may not offer Always allow until policy allows it.
- A refusal is `declined`, not `failed`; a policy refusal is `refused/blocked`.
- Approval tokens and idempotency keys are server-issued/validated.
- The UI never auto-approves and never mints authority.

## Acceptance

- No `@assistant-ui/*`, assistant-cloud, AI SDK `UIMessage` or CopilotKit runtime dependency.
- No `novel` package, Novel source copy or `ai`/`@ai-sdk/*` completion path; Tiptap is the only editor runtime.
- The custom adapter maps every xcodex event in the table above.
- Queue/following, stop, history restore and approval states match `15`.
- Streamdown renders incomplete Markdown safely; Tiptap remains the artifact editor.
- OpenUI surfaces render from a typed catalog and closed actions.
- No school data or session token is persisted or synced.
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
