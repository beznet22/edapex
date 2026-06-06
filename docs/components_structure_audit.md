# Components Directory Structure Audit & Reorganization

## Scope
Audit and reorganize all custom files under: `src/lib/components/`

## Exclusions — DO NOT TOUCH
The following directories are **installed library components** managed by package tooling (`pnpx`, `pnpm dlx`). They must be excluded from this audit entirely — do not move, rename, restructure, or modify any file within them:

- `src/lib/components/ui/*` — shadcn-svelte primitives
- `src/lib/components/ai-elements/*` — AI chat element components
- `src/lib/components/prompt-kit/*` — prompt input components
- `src/lib/components/file-drop-zone/*` — file drop zone components

If you are unsure whether a file is library-managed, check for a generation header comment or whether the component is documented in the shadcn-svelte / prompt-kit / ai-elements registry. When in doubt, **leave it alone**.

---

## Mission
Analyze the current layout of all **custom** component files. Identify files that are misplaced, orphaned, or lack clear domain grouping. Propose and execute a reorganization into a feature-driven folder structure following Svelte 5 / SvelteKit component architecture best practices.

## Current State (Reference)
```
components/
├── ui/                            # ⛔ EXCLUDED — shadcn-svelte
├── ai-elements/                   # ⛔ EXCLUDED — ai-elements
├── prompt-kit/                    # ⛔ EXCLUDED — prompt-kit
├── file-drop-zone/                # ⛔ EXCLUDED — file drop zone
│
├── chat/                          # Chat feature components
│   ├── CommandDropdown.svelte
│   ├── MentionDropdown.svelte
│   ├── intent-validation-card.svelte
│   ├── pdf-link-card.svelte
│   ├── student-result-card.svelte
│   └── validation-summary.svelte
├── editor/                        # Tiptap editor feature
│   ├── AiStreamView.svelte
│   ├── CopilotWidget.svelte
│   ├── EditorModeToggle.svelte
│   ├── WysiwygBubbleMenu.svelte
│   ├── WysiwygEditor.svelte
│   ├── WysiwygSlashMenu.svelte
│   └── extensions/
│       ├── ai-stream-node.ts
│       ├── copilot.ts
│       ├── mention-menu.ts
│       └── slash-menu.ts
├── file-drop-zone/                # File upload drop zone
│   ├── file-drop-zone.svelte
│   ├── index.ts
│   └── types.ts
├── shared/                        # Shared utilities
│   └── responsive-sheet.svelte
├── sidebar-history/               # Chat history sidebar
│   ├── history.svelte
│   ├── index.ts
│   ├── item.svelte
│   └── sidebar-threads.ts
├── template/                      # Result template components
│   ├── RecordsTable.svelte
│   ├── ResultHeader.svelte
│   ├── ResultTemplate.svelte
│   ├── ScoreSummary.svelte
│   ├── StudentInfo.svelte
│   ├── StudentRatings.svelte
│   ├── TeacherRemark.svelte
│   ├── result-email.svelte
│   └── style.css
├── workspace/                     # Workspace feature (largest)
│   ├── ArtifactView.svelte
│   ├── EditorTabs.svelte
│   ├── ExtractionInspector.svelte
│   ├── FileBrowserHeader.svelte
│   ├── FileTree.svelte
│   ├── FloatingToolbar.svelte
│   ├── MobileArtifactBrowser.svelte
│   ├── PublishViewer.svelte
│   ├── RunHistory.svelte
│   ├── WorkflowStatusBadge.svelte
│   ├── WorkflowStatusPills.svelte
│   ├── WorkspaceHeader.svelte
│   ├── WorkspacePane.svelte
│   ├── WorkspaceSidebar.svelte
│   ├── WorkspaceStatus.svelte
│   ├── editor-canvas.svelte
│   └── workspace-context.svelte.ts
│
├── ChatComposer.svelte            # ← Root-level loose files
├── PWAInstallPrompt.svelte
├── SharedChatView.svelte
├── ShimmerArtifactCard.svelte
├── ThemeHead.svelte
├── app-sidebar.svelte
├── auth-form.svelte
├── chat-header.svelte
├── chat-menu.svelte
├── chat-resource.svelte
├── chat.svelte
├── class-selector.svelte
├── drop-zone.svelte
├── file-view-modal.svelte
├── message-action.svelte
├── model-selector.svelte
├── nav-main.svelte
├── nav-secondary.svelte
├── nav-user.svelte
├── pdf-preview.svelte
├── settings-modal.svelte
├── submit-button.svelte
├── tool-message.svelte
└── workspace-switcher.svelte
```

## Problems to Identify
1. **Root-level file sprawl**: 24 loose `.svelte` files in the root with no grouping — many clearly belong in existing subdirectories (`chat-header.svelte` → `chat/`, `ChatComposer.svelte` → `chat/`).
2. **Inconsistent naming**: Mix of PascalCase (`ChatComposer.svelte`, `SharedChatView.svelte`) and kebab-case (`chat-header.svelte`, `auth-form.svelte`). Pick one convention and enforce it.
3. **Duplicate drop-zone concerns**: Both `drop-zone.svelte` (root) and `file-drop-zone/` (directory) exist — likely redundant or one wraps the other.
4. **Chat components scattered**: Chat-related files exist in the root (`chat.svelte`, `chat-header.svelte`, `chat-menu.svelte`, `chat-resource.svelte`, `ChatComposer.svelte`, `SharedChatView.svelte`, `message-action.svelte`, `tool-message.svelte`, `submit-button.svelte`, `model-selector.svelte`) and in `chat/` subdirectory.
5. **Navigation components not grouped**: `app-sidebar.svelte`, `nav-main.svelte`, `nav-secondary.svelte`, `nav-user.svelte`, `workspace-switcher.svelte` are layout/navigation but scattered in root.
6. **Large workspace directory**: 17 files in `workspace/` — consider sub-grouping by concern (file browser, workflow status, artifact viewer).
7. **Missing barrel exports**: Most subdirectories lack an `index.ts` for clean imports.

## Target Structure (Reference — adapt based on findings)
```
components/
├── ui/                            # ⛔ EXCLUDED
├── ai-elements/                   # ⛔ EXCLUDED
├── prompt-kit/                    # ⛔ EXCLUDED
│
├── auth/                          # Authentication
│   ├── auth-form.svelte
│   └── index.ts
├── chat/                          # All chat-related components
│   ├── index.ts
│   ├── chat-composer.svelte       # was ChatComposer.svelte
│   ├── chat-view.svelte           # was chat.svelte
│   ├── shared-chat-view.svelte    # was SharedChatView.svelte
│   ├── chat-header.svelte
│   ├── chat-menu.svelte
│   ├── chat-resource.svelte
│   ├── message-action.svelte
│   ├── tool-message.svelte
│   ├── submit-button.svelte
│   ├── model-selector.svelte
│   ├── command-dropdown.svelte
│   ├── mention-dropdown.svelte
│   ├── intent-validation-card.svelte
│   ├── pdf-link-card.svelte
│   ├── student-result-card.svelte
│   └── validation-summary.svelte
├── editor/                        # Tiptap editor (unchanged if clean)
│   ├── index.ts
│   ├── ai-stream-view.svelte
│   ├── copilot-widget.svelte
│   ├── editor-mode-toggle.svelte
│   ├── wysiwyg-bubble-menu.svelte
│   ├── wysiwyg-editor.svelte
│   ├── wysiwyg-slash-menu.svelte
│   └── extensions/
│       ├── ai-stream-node.ts
│       ├── copilot.ts
│       ├── mention-menu.ts
│       └── slash-menu.ts
├── file-upload/                   # Consolidated file upload/drop
│   ├── index.ts
│   ├── file-drop-zone.svelte
│   ├── drop-zone.svelte           # or merge with file-drop-zone
│   └── types.ts
├── layout/                        # App shell and navigation
│   ├── index.ts
│   ├── app-sidebar.svelte
│   ├── nav-main.svelte
│   ├── nav-secondary.svelte
│   ├── nav-user.svelte
│   ├── workspace-switcher.svelte
│   ├── class-selector.svelte
│   └── theme-head.svelte
├── modals/                        # Modal/dialog components
│   ├── index.ts
│   ├── file-view-modal.svelte
│   ├── settings-modal.svelte
│   └── pdf-preview.svelte
├── shared/                        # Cross-cutting utilities
│   ├── index.ts
│   ├── responsive-sheet.svelte
│   ├── shimmer-artifact-card.svelte
│   └── pwa-install-prompt.svelte
├── sidebar-history/               # Chat history sidebar
│   ├── index.ts
│   ├── history.svelte
│   ├── item.svelte
│   └── sidebar-threads.ts
├── template/                      # Result template (unchanged)
│   ├── index.ts
│   ├── records-table.svelte
│   ├── result-header.svelte
│   ├── result-template.svelte
│   ├── score-summary.svelte
│   ├── student-info.svelte
│   ├── student-ratings.svelte
│   ├── teacher-remark.svelte
│   ├── result-email.svelte
│   └── style.css
└── workspace/                     # Workspace feature
    ├── index.ts
    ├── workspace-context.svelte.ts
    ├── workspace-pane.svelte
    ├── workspace-header.svelte
    ├── workspace-sidebar.svelte
    ├── workspace-status.svelte
    ├── editor-canvas.svelte
    ├── editor-tabs.svelte
    ├── browser/               # File browser sub-group
    │   ├── file-tree.svelte
    │   ├── file-browser-header.svelte
    │   └── mobile-artifact-browser.svelte
    ├── artifact/              # Artifact viewing sub-group
    │   ├── artifact-view.svelte
    │   ├── extraction-inspector.svelte
    │   ├── floating-toolbar.svelte
    │   └── publish-viewer.svelte
    └── workflow/              # Workflow status sub-group
        ├── run-history.svelte
        ├── workflow-status-badge.svelte
        └── workflow-status-pills.svelte
```

## Process
1. **Audit**: Read every custom file in the scoped directory (skip `ui/`, `ai-elements/`, `prompt-kit/`). For each file, note:
   - Its primary feature domain (chat, editor, workspace, layout, auth, etc.).
   - What it imports and what imports it (dependency graph).
   - Whether it belongs in its current location.
   - Whether its naming follows the chosen convention.
2. **Choose naming convention**: Decide on **one** convention (recommend kebab-case to match SvelteKit norms) and list all files that violate it.
3. **Propose**: Before moving anything, produce a migration table with an **Action** column:

   | Current Path | Action | Proposed Path | Reason |
   |-------------|--------|--------------|--------|
   | `ChatComposer.svelte` | **move** | `chat/chat-composer.svelte` | Group with chat domain, normalize naming |
   | `nav-main.svelte` | **move** | `layout/nav-main.svelte` | Navigation belongs in layout shell |
   | `drop-zone.svelte` | **merge** → `file-drop-zone.svelte` | — | Duplicate of file-drop-zone, consolidate |
   | `<orphaned-file>.svelte` | **delete** | — | Dead code, zero imports |
   | ... | ... | ... | ... |

   Valid actions: `move`, `merge`, `delete`. For merges, specify which file survives and absorbs the other.

4. **Confirm**: Present the migration table and target structure for approval before executing.
5. **Execute**: For each file move:
   a. Move the file to its new location.
   b. Update ALL import paths across the entire `src/` directory that reference the old path.
   c. Update barrel `index.ts` files in both source and destination directories.
   d. If renaming (PascalCase → kebab-case), also update all component references in `.svelte` template tags (`<ChatComposer>` → update import alias).
   e. Run `pnpm run svelte-check --workspace src/lib/components/` to verify zero breakage.
6. **Create missing barrel exports**: Every subdirectory must have an `index.ts` that exports its public API.
7. **Final verification**: Run `pnpm run build` to confirm no broken imports remain anywhere.

## Merge & Delete Rules
- **Merge**: When two files serve the same purpose (e.g., duplicate drop-zone wrappers), merge the smaller into the larger. Preserve the richer implementation, port any unique logic from the other, then delete the redundant file. Update all imports to point to the surviving file.
- **Delete**: When a file is dead code (zero imports, no route references, no dynamic imports), delete it. Confirm with a full-project grep (`grep -r "filename" src/`) before removing.
- **Flag uncertain cases**: If you're unsure whether a file is dead or duplicated, flag it in the migration table with action `review` instead of deleting.

## Constraints
- **DO NOT touch `ui/`, `ai-elements/`, `prompt-kit/`, or `file-drop-zone/`** — these are library-managed.
- Do NOT change any runtime logic, props, events, or component behavior unless merging duplicate files.
- Do NOT rename exported component identifiers — only file paths and filenames change.
- When merging, preserve the richer implementation and port unique logic from the absorbed file.
- Preserve git history by using `git mv` where possible.
- If a circular dependency is discovered, flag it in the migration table but do NOT resolve it in this pass.
- Adhere to the design system in `src/routes/layout.css` — do not modify it.

## Naming Conventions
- **Directories**: lowercase, singular nouns, kebab-case (`file-upload/` not `FileUpload/`).
- **Component files**: kebab-case (`chat-composer.svelte` not `ChatComposer.svelte`).
- **Context/state files**: kebab-case with `.svelte.ts` suffix for rune-based state (`workspace-context.svelte.ts`).
- **Barrel exports**: Every directory gets an `index.ts`.
- **Domain grouping**: Group by feature domain first (`chat/`, `workspace/`, `layout/`), not by component type.
