# 43 — OpenDuet UI Vendoring

**Draft.** Phase 9B decision; Message/Skeleton primitives and the selected shell/composer/tool-activity/approval presentation are ported into `apps/web` and `packages/chat`; Tasks/Make data behavior remains 10D.

## Specification context

This spec owns **what may be copied or adapted from OpenDuet, and under what attribution**. It does not define EdApex interaction behavior; that is `15`/`17`. It does not define visual tokens; that is `19`. It does not define generated-UI format; that is `21`.

- A copied component is evidence of source reuse, not authority over the product contract.
- If upstream behavior conflicts with 15/17/19/21, the EdApex spec wins and the copy is modified.
- `44-reference-app-audits.md` owns the pinned evidence and enforcement commands.

## Decision

Yes: **selectively copy, modify and enhance OpenDuet's presentation components.** Do not fork or import the whole app.

Source pin:

```text
CopilotKit/OpenDuet
f52288fff5ccdbd3de428d573d9f026fce5ff480
```

License: **MIT**, Copyright (c) 2026 CopilotKit. Retain the notice in all adapted files and add a `VENDOR.md` with source paths, commit and modifications.

## Why this fits

The upstream app is already:

- React 19;
- Tailwind CSS 4.3.x with `@tailwindcss/vite`;
- shadcn/Base UI components;
- Vite;
- MIT licensed;
- the same interaction model documented in `extracted-ui-spec.md`.

The differences are runtime and product, not React/Tailwind.

## Copy boundary

### Copy and adapt

- App shell / centered column / screen viewport.
- Header, tab bar, page header, sidebar.
- PageShell / ScreenScroll / dialog / sheet primitives.
- MessageScroller, Message, Bubble, attachments/lightbox presentation.
- Transcript layout, bubble geometry, thinking/seen/error presentation.
- Composer visual shell, attachment picker UI, queue presentation.
- Tool activity grouping/disclosure presentation.
- Approval card presentation and decided states.
- Task cards, Make/page cards, reply chips.
- Motion/accessibility helpers where reusable.

### Copy with major adaptation

- `chat-transcript`: upstream imports Streamdown, CopilotKit, query and approval data. Keep the layout and state presentation; replace the data/runtime with the xcodex adapter and keep Streamdown as the Markdown renderer.
- `composer`: upstream imports `@copilotkit/react-core` attachments. Replace with the EdApex attachment store and xcodex adapter.
- `tool-activity`: upstream imports CopilotKit context and Streamdown. Keep grouping/rows; replace the data source.
- Approvals: keep visual states; bind to EdApex `approval_requests`, not CopilotKit.
- Tasks/pages cards: keep presentation; map to the OpenDuet-domain schema in `42-agent-db-schema.md`.
- Activity rendering: replace the A2UI/CopilotKit activity path with the OpenUI `SurfaceRenderer`; see below.

### Do not copy

- CopilotKit provider/runtime hooks and `@copilotkit/*` dependencies.
- `@copilotkit/a2ui-renderer`, `a2ui.tsx`, `a2ui.css` and `a2uiProviderOptions`.
- `@openbot/shared` server-coupled types.
- App routes, auth, server APIs or database access.
- `@/lib/auth`, `@/lib/approval*` query layers.
- OpenDuet theme colors/fonts.
- Full app shell with CopilotKit/A2UI runtime.
- Server-side persistence or app-specific environment config.
- The sandboxed HTML/JS generative-UI runtime (`sandboxed-tools.tsx`); EdApex v1 uses OpenUI, not iframe GenUI.

Do not add `@copilotkit/*` or `@assistant-ui/*` just to make copied components compile. Strip the runtime and adapt.

## A2UI removal checklist

OpenDuet's A2UI path is CopilotKit-specific and must not be carried into EdApex. Remove or replace:

| Upstream path | Action |
|---|---|
| `openbot/app/package.json` `@copilotkit/a2ui-renderer` | Remove dependency |
| `openbot/app/src/lib/copilot/a2ui.tsx` | Do not copy |
| `openbot/app/src/lib/copilot/a2ui.css` | Do not copy |
| `openbot/app/src/lib/copilot/provider.tsx` `a2uiProviderOptions` | Remove provider option/import |
| `openbot/server/src/copilot.ts` `a2ui` config | Remove server config |
| `openbot/agent-bot/src/history.ts` A2UI catalog instructions | Remove; use OpenUI catalog instructions |
| `openbot/agent-langgraph/src/history.ts` A2UI catalog instructions | Remove; use OpenUI catalog instructions |
| `openbot/docs/configuration.md` `OPENBOT_GENERATIVE_UI` A2UI/iframe text | Do not copy; document `GENUI_ENABLED` for OpenUI only |
| `openbot/app/src/components/channels/chat-transcript.tsx` `open-generative-ui` activity | Replace with `openui-surface` activity |
| `openbot/app/src/lib/copilot/sandboxed-tools.tsx` iframe GenUI | Do not copy; artifact HTML preview is separate and sandboxed |

Do not leave an A2UI fallback path in the chat runtime. If an `openui-surface` cannot render, show a text/tool-card fallback; do not enable an iframe or A2UI renderer.

## Runtime boundary

```text
OpenDuet vendored components (presentation)
  ↑ props/adapters
EdApex chat store + xcodex adapter ← xcodex Rust
  ↑
OpenUI SurfaceRenderer (packages/genui)
  ↑
AGENT_DB/local store + sync
```

- The chat state/runtime is EdApex-owned; no assistant-ui, CopilotKit or AI SDK agent runtime.
- Copy OpenDuet presentational components; do not let them call CopilotKit or fetch directly.
- Use xcodex event mapping for messages/tools/approvals.
- Use OpenUI for generated surfaces; do not create a second agent runtime.
- Use Streamdown for chat Markdown; do not add assistant-ui's Markdown layer.
- Keep approvals and mutation authorization in the EdApex/Rust layer; the UI renders the decision.

## Activity mapping

OpenDuet uses `activityType="open-generative-ui"` for its generated interfaces. EdApex uses:

```text
activityType = "openui-surface"
content      = SurfacePart from 21-generative-ui-openui.md
```

- The transcript asks the activity registry for a renderer. If none is registered, it draws nothing; do not invent a blank row.
- The OpenUI renderer validates the catalog version and surfaces a safe fallback on parse/validation failure.
- Unknown activity types remain unrendered, matching OpenDuet's behavior.
- Do not map `open-generative-ui` to an iframe or A2UI renderer.

## Artifact boundary

OpenDuet's `openduet_pages` are structured page/slides/dashboard/doc/design/design-system JSON rendered by `page-view.tsx`. They are not office files and have no PDF/DOCX/CSV export.

OpenDuet attachments support text/markdown/json/csv and images; PDF and DOCX are unsupported, and text extraction truncates at 120k characters. Do not present the OpenDuet attachment path as a document engine.

EdApex adds `packages/documents` and `packages/artifacts` for:

- Tiptap documents (minimal inline/side-panel UI);
- IronPress PDF and `docx` Word generation;
- PDF.js preview/text extraction and Mammoth/Turndown DOCX import;
- PapaParse CSV parse/generate;
- artifact renditions/imports and the download menu.

See `22-documents-and-artifacts.md` and `44-reference-app-audits.md`. OpenDuet is the only source-vendoring reference; Novel is visual reference only.

## Tailwind and shadcn

- Upstream uses Tailwind v4 and shadcn, so copy classes/structures without a v3 migration.
- Map all colors/spacing/typography to Gold on Slate; do not reuse OpenDuet tokens.
- Remove duplicate primitives where `packages/ui` already owns the component.
- Add `@source` entries for Streamdown and enabled plugins.
- Keep `components.json`/shadcn registry in our repo; do not copy upstream build config.

## License and maintenance

- Add `VENDOR.md` at `apps/web/components/openduet/VENDOR.md` with:
  - upstream repo/commit;
  - copied paths;
  - modifications;
  - MIT notice.
- Preserve copyright headers in each copied/ported file.
- Copy only the required files; do not vendor the whole app.
- Track upstream manually; no automatic sync.
- A later upstream change is a deliberate port, not a merge.
- Record visual/interaction tests so drift is visible.

## Audit commands

The pinned-SHA `gh api` audit commands live once in `44-reference-app-audits.md` §Audit commands; use them there rather than reprinting them here.

Before copying each file, inspect its imports for `@copilotkit`, `@openbot/shared`, `@/lib`, query clients, auth, `a2ui` and `assistant-ui`. If present, adapt or skip.

## Phase

- Phase 9B: this vendoring decision only.
- Phase 10B: shell, transcript, composer, tool activity and approval presentation ported into `apps/web`; shared primitives in `packages/chat`.
- Phase 10B/10D: Tasks/Make composition and the OpenUI activity/action bridge.
- No full OpenDuet route tree or runtime is copied.

## Risks

- Upstream drift: tracking is manual; a later upstream change is a deliberate port, not a merge.
- Strip-import errors: copied files that import CopilotKit/A2UI/query layers must be adapted or skipped, never patched with new dependencies.
- The ported surface is deliberately scoped: shell/composer/transcript/tool-activity/approval presentation plus Message/Skeleton primitives. Tasks/Make composition and the OpenUI activity bridge remain later work; do not read this as full OpenDuet parity.

## Acceptance

- The ported components carry no `@copilotkit/*`, `@copilotkit/a2ui-renderer`, `@assistant-ui/*`, `@a2ui/*` or A2UI provider imports.
- The transcript renders `openui-surface` through `packages/genui`; unknown activities draw nothing.
- Streamdown remains the target chat Markdown renderer; the current 10B shell renders plain text until that integration lands.
- Tiptap is the minimal artifact editor.
- OpenDuet pages remain structured JSON; they are not converted to a Tiptap document.
- OpenDuet attachments accept text/markdown/json/csv and images only; PDF/DOCX import and document generation live in `22-documents-and-artifacts.md`.
- OpenDuet-derived components consume EdApex props/adapters and never fetch or approve directly.
- The MIT notice and `VENDOR.md` are present for every copied/ported file.
