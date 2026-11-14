# `@edapex/documents`

The document editor used by the artifact panel. Tiptap 3 with React, plus the
floating and bubble menus.

| | |
|---|---|
| Package | `@edapex/documents` (library, never deployed) |
| Runtime deps | `@tiptap/*` 3.33, `@floating-ui/dom`, `lucide-react` |
| Peer dep | `react` 19 |
| Consumed by | `apps/web` (via `components/artifacts/ArtifactHost.tsx`) |

## Why it is a separate package

The editor is the heaviest client dependency in the workspace. Isolating it means
`ArtifactHost` can `dynamic()`-import it, so a person who never opens an artifact
never downloads it. That keeps the initial JS inside the budget in
`docs/workspace/specs/47`.

## Modules

| Module | Responsibility |
|---|---|
| `DocumentEditor.tsx` | The editor surface and its toolbar |
| `index.ts` | Public exports |

## Hosting contract

The editor is hosted, not embedded. `ArtifactHost` owns the layout decision —
a 38/62 split at `lg` and above, a sheet below — and mounts either this editor or
the chat beside it. The editor itself does not decide its container width, and it
does not own the Escape key or focus restoration; the host does.

Content styling uses the artifact tokens (`--artifact-paper`, `--artifact-ink`,
`--artifact-line`), not the workspace palette, because an artifact is a document
that should look the same regardless of the shell's theme.

## Working on it

```bash
pnpm --dir packages/documents exec tsc --noEmit
```

Editing must stay keyboard-complete: every action reachable from the toolbar is
also reachable from the keyboard, and the bubble menu only appears on a non-empty
selection.
