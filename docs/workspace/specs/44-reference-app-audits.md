# 44 — Reference App Audits: OpenDuet and Novel

**Draft.** Phase 9B reference policy. This document is enforceable: it defines what may be copied from each upstream app and how the audit is reproduced with `gh`.

## Decision

- **OpenDuet** is a selective **source-vendoring** reference. Copy only the presentation files allowed by `43-openduet-ui-vendoring.md`, under MIT, with `VENDOR.md` and retained headers. Never copy CopilotKit, A2UI, auth, query or server code.
- **Novel** is a **visual reference only**. Do not add the `novel` package, do not copy Novel source files, do not vendor its editor components, and do not add its `ai`/`@ai-sdk/*`/`openai` stack. Recreate the minimal slash/bubble/editor UI on Tiptap.
- Tiptap is the editor runtime. Novel's Tiptap version and extensions are evidence for feature parity, not a source to import.

## Pinned references

| App | Pin | Use |
|---|---|---|
| OpenDuet | `CopilotKit/OpenDuet@f52288fff5ccdbd3de428d573d9f026fce5ff480` | Selective vendoring |
| Novel | `steven-tey/novel@fa95098e66476c466faebb8211baa5869c101a9c` | Visual reference only |

Re-pin only by updating this table and the audit record. A moving branch is not a reference.

## Audit evidence (2026-11-08)

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

Fail if any workspace package adds:

- `novel`
- `ai`
- `@ai-sdk/*`
- `openai` for editor completion
- `@copilotkit/*`
- `@assistant-ui/*`
- `@a2ui/*`

Run:

```bash
rg -n '"novel"|"ai"|"@ai-sdk/|"openai"|"@copilotkit/|"@assistant-ui/|"@a2ui/' \
  package.json apps packages pnpm-lock.yaml
```

Expected: no match for Novel/AI SDK/CopilotKit/A2UI/assistant-ui. A match must be justified in `VENDOR.md` and approved; none is approved for v1.

### Source-copy gate

Fail if Novel source or paths are copied:

```bash
rg -n 'from "novel"|novel/|components/tailwind/generative|useCompletion|@ai-sdk' \
  apps packages
```

Expected: no matches. Novel is a visual reference, not a source dependency.

### Documentation gate

`Novel` may appear only as:

- visual reference/rejected dependency rationale;
- this audit document;
- the pin in `43`/`17`.

It must not appear as an installation step or chosen editor.

### OpenDuet vendoring gate

- `VENDOR.md` lists every copied path, upstream SHA and modification.
- MIT notice/header retained.
- No `@copilotkit/*`, A2UI, auth, query or server code copied.
- `rg -n '@copilotkit|a2ui|@openbot/shared' apps packages` returns no vendored runtime import.

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
- OpenDuet has `VENDOR.md`; Novel does not.
- Tiptap is the only editor runtime.
- No `ai`/`@ai-sdk/*`/`openai` editor completion path exists.
- The audit commands reproduce the evidence at the pinned SHAs.
