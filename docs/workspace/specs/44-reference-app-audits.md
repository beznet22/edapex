# 44 — Reference App Audits: chatbot, OpenDuet and Novel

**Draft.** Phase 9B reference policy, updated for the 10B `apps/web` rewrite. This document is enforceable: it defines what may be copied from each upstream app and how the audit is reproduced with `gh`.

## Specification context

This spec owns **source pins, licenses, audit evidence and dependency/source gates**. It does not own visual design (`19`), UI behavior (`15`), chat state (`17`) or GenUI (`21`). A source being audited is not approval to adopt its runtime or data model.

## Decision

- **vercel/chatbot** is the Apache-2.0 UI/component substrate for `apps/web`. Reuse the App Router structure, accessible primitives and layout patterns; remove its AI SDK, Auth.js, Drizzle/Postgres, Redis, Vercel Blob, BotID, telemetry and deployment assumptions.
- **OpenDuet** is a selective **source-porting** reference. Copy only the presentation files allowed by `43-openduet-ui-vendoring.md`, under MIT, with `VENDOR.md` and retained headers. Never copy CopilotKit, A2UI, auth, query or server code.
- **Novel** is a **visual reference only**. Do not add the `novel` package, do not copy Novel source files, do not vendor its editor components, and do not add its `ai`/`@ai-sdk/*`/`openai` stack. Recreate the minimal slash/bubble/editor UI on Tiptap.
- Tiptap is the editor runtime. Novel's Tiptap version and extensions are evidence for feature parity, not a source to import.

## Pinned references

| App | Pin | License | Use |
|---|---|---|---|
| chatbot | `vercel/chatbot@a8989b522fa3672a2ae52f053105e40993b36ca1` | Apache-2.0 | UI/component substrate for `apps/web`; remove starter runtime |
| OpenDuet | `CopilotKit/OpenDuet@f52288fff5ccdbd3de428d573d9f026fce5ff480` | MIT | Selective interaction-component porting |
| Novel | `steven-tey/novel@fa95098e66476c466faebb8211baa5869c101a9c` | Apache-2.0 | Visual reference only |

Re-pin only by updating this table and the audit record. A moving branch is not a reference.

## Audit evidence (2026-11-08)

Verifier: automated `gh api` audit at the pinned SHAs, run by beznet; evidence recorded below.

### vercel/chatbot

Audited 2026-11-11 at `a8989b522fa3672a2ae52f053105e40993b36ca1`:

- License: Apache-2.0.
- Dependencies include `ai 7.0.15`, `@ai-sdk/react 4.0.16`, `next-auth 5.0.0-beta.25`, `drizzle-orm`, `postgres`, `redis`, `@vercel/blob`, `botid` and Vercel analytics.
- Audited paths: `app/layout.tsx`, `app/globals.css`, `components/ui/`, `components/ai-elements/`, `components/chat/shell.tsx`, `components/chat/messages.tsx`, `components/chat/multimodal-input.tsx`, `hooks/use-messages.tsx`.
- Conclusion: copy/adapt visual primitives and layout patterns only. Do not copy the starter provider, auth, persistence, stream or deployment layers. The current app already excludes those dependencies.

### OpenDuet

`openbot/app/package.json` contains:

- `@copilotkit/a2ui-renderer 1.77.0`
- `@copilotkit/react-core 1.77.0`
- `streamdown ^2.5.0`

The audited paths include:

- `openbot/app/src/components/channels/chat-transcript.tsx`
- `openbot/app/src/components/channels/composer/`
- `openbot/app/src/components/channels/tool-activity.tsx`
- `openbot/app/src/components/approvals/`
- `openbot/app/src/components/duet/page-view.tsx`
- `openbot/app/src/lib/copilot/a2ui.tsx`

Conclusion: copy presentation only; strip CopilotKit/A2UI; keep Streamdown; do not copy the A2UI runtime.

### Novel

`apps/web/package.json` contains:

- `ai ^3.0.12`
- `@ai-sdk/openai ^1.1.0`
- `openai ^4.28.4`
- `novel workspace:^`

`packages/headless/package.json` contains:

- `@tiptap/core ^2.11.2` and the open-source Tiptap extensions
- `@tiptap/react ^2.11.2`
- `tiptap-markdown ^0.8.10`
- `tiptap-extension-global-drag-handle ^0.1.16`

Audited paths include:

- `apps/web/components/tailwind/advanced-editor.tsx`
- `apps/web/components/tailwind/extensions.ts`
- `apps/web/components/tailwind/slash-command.tsx`
- `apps/web/components/tailwind/selectors/`
- `apps/web/components/tailwind/generative/`
- `packages/headless/src/components/editor.tsx`

Conclusion: use these as a visual/behaviour reference; do not copy source or add `ai`, `@ai-sdk/*`, `openai` or `novel`.

## Audit commands

### Pin the current upstream SHA

```bash
gh api repos/vercel/chatbot/commits/main --jq .sha
gh api repos/CopilotKit/OpenDuet/commits/main --jq .sha
gh api repos/steven-tey/novel/commits/main --jq .sha
```

Use the pinned values above, not `main`, for implementation audits.

### Inspect dependencies

```bash
gh api "repos/CopilotKit/OpenDuet/contents/openbot/app/package.json?ref=f52288fff5ccdbd3de428d573d9f026fce5ff480" \
  -H 'Accept: application/vnd.github.raw' |
  jq -r '[(.dependencies // {}), (.devDependencies // {})] | add | to_entries[] |
    select(.key|test("a2ui|copilot|streamdown|novel|tiptap|assistant";"i")) |
    "\(.key) \(.value)"'

gh api "repos/vercel/chatbot/contents/package.json?ref=a8989b522fa3672a2ae52f053105e40993b36ca1" \
  -H 'Accept: application/vnd.github.raw' |
  jq -r '[(.dependencies // {}), (.devDependencies // {})] | add | to_entries[] |
    select(.key|test("ai|auth|drizzle|postgres|redis|blob|botid|next";"i")) |
    "\(.key) \(.value)"'

gh api "repos/steven-tey/novel/contents/apps/web/package.json?ref=fa95098e66476c466faebb8211baa5869c101a9c" \
  -H 'Accept: application/vnd.github.raw' |
  jq -r '[(.dependencies // {}), (.devDependencies // {})] | add | to_entries[] |
    select(.key|test("ai|tiptap|prosemirror|novel|openai";"i")) |
    "\(.key) \(.value)"'

gh api "repos/steven-tey/novel/contents/packages/headless/package.json?ref=fa95098e66476c466faebb8211baa5869c101a9c" \
  -H 'Accept: application/vnd.github.raw' |
  jq -r '[(.dependencies // {}), (.devDependencies // {})] | add | to_entries[] |
    select(.key|test("tiptap|prosemirror|markdown|drag";"i")) |
    "\(.key) \(.value)"'
```

### Fetch upstream licenses

```bash
gh api "repos/CopilotKit/OpenDuet/license" --jq '.license.spdx_id, .html_url'
gh api "repos/steven-tey/novel/license" --jq '.license.spdx_id, .html_url'
```

The MIT claim in `43-openduet-ui-vendoring.md` is evidenced by this fetch, not asserted.

### Inspect reference paths

```bash
gh api "repos/CopilotKit/OpenDuet/git/trees/f52288fff5ccdbd3de428d573d9f026fce5ff480?recursive=1" \
  --jq '.tree[].path' |
  rg -i 'a2ui|chat-transcript|composer|tool-activity|approval|page-view'

gh api "repos/steven-tey/novel/git/trees/fa95098e66476c466faebb8211baa5869c101a9c?recursive=1" \
  --jq '.tree[].path' |
  rg -i 'editor|slash|bubble|generative|selectors'
```

### Read one file before copying

```bash
gh api "repos/CopilotKit/OpenDuet/contents/openbot/app/src/components/channels/chat-transcript.tsx?ref=f52288fff5ccdbd3de428d573d9f026fce5ff480" \
  -H 'Accept: application/vnd.github.raw' | sed -n '1,220p'
```

Never scrape the rendered GitHub page; always audit the pinned SHA with `gh api`.

## Enforcement

### Dependency gate

Fail if the web app or the active workspace packages add:

- `novel`
- `ai` or `@ai-sdk/*` outside the legacy root app
- `openai` for editor completion
- `@copilotkit/*`
- `@assistant-ui/*`
- `@a2ui/*`
- `next-auth`, `drizzle-orm`, `postgres`, `redis`, `@vercel/blob` or `botid` in `apps/web`

Run:

```bash
rg -n '"novel"|"@ai-sdk/|"@copilotkit/|"@assistant-ui/|"@a2ui/|"next-auth"|"drizzle-orm"|"postgres"|"redis"|"@vercel/blob"|"botid"' \
  apps/web/package.json packages/chat/package.json packages/contracts/package.json \
  packages/genui/package.json packages/documents/package.json pnpm-lock.yaml
```

Expected: no match. The legacy root app's AI SDK dependencies are not part of the new web client; do not use a repo-wide match as the gate.

### Source-copy gate

Fail if Novel source or paths are copied:

```bash
rg -n 'from "novel"|novel/|components/tailwind/generative|useCompletion|@ai-sdk' \
  apps packages --glob '*.{ts,tsx,js,jsx}'
```

Expected: no matches. Novel is a visual reference, not a source dependency.

### Documentation gate

`Novel` may appear only as:

- visual reference/rejected dependency rationale;
- this audit document;
- the pin in `43`/`17`.

It must not appear as an installation step or chosen editor.

### OpenDuet porting gate

- `VENDOR.md` lists every copied/ported path, upstream SHA and modification.
- MIT notice/header retained.
- No `@copilotkit/*`, A2UI, auth, query or server code copied.
- Run against source only, not the audit prose that names the excluded packages:

```bash
rg -n '@copilotkit|a2ui|@openbot/shared' \
  apps packages --glob '*.{ts,tsx,js,jsx}'
```

## Audit record

For each audit, record:

- app and pinned SHA;
- inspected paths;
- dependency evidence;
- decision (copy/adapt/reference-only/reject);
- verifier and date.

Update this file when the pin changes. Do not silently re-pin.

## Acceptance

- The dependency and source-copy gates pass.
- chatbot has an Apache-2.0 notice and a recorded source map; OpenDuet has `VENDOR.md`; Novel does not.
- Tiptap is the only editor runtime.
- No `ai`/`@ai-sdk/*`/`openai` editor completion path exists in `apps/web` or the active workspace packages.
- The audit commands reproduce the evidence at the pinned SHAs.
