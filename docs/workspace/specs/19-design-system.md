# 19 — Design System: shadcn/ui + Tailwind v4

**Draft.** Phase 9B design decision; no dependency is installed by this document.

## Decision

Use **shadcn/ui + Tailwind CSS v4** for the React workspace UI (web PWA, Tauri desktop and Tauri mobile).

- shadcn is the accessible primitive layer, not a bespoke visual identity.
- Gold on Slate in `src/routes/layout.css` is the visual authority.
- Do not use shadcn's default theme colors or typography.
- Do not reuse the existing Svelte shadcn components; the React workspace gets its own `packages/ui`.
- The chat shell is the vendored OpenDuet presentation layer, not a third-party chat primitive library.
- OpenUI Lang is the generated-surface renderer; it maps to Gold-on-Slate components in `packages/genui`.
- Streamdown is the chat Markdown renderer; Tiptap is the artifact editor.

## Tailwind v4 facts

- v4 is CSS-first: `@import "tailwindcss";` and `@theme`/`@theme inline` instead of the v3 `@tailwind` directives.
- A JavaScript `tailwind.config.js` is **not detected automatically**. It can still be loaded explicitly with `@config`, but that is legacy compatibility, not the default.
- shadcn still uses **`components.json`**; that is not the Tailwind config file.
- Use `@tailwindcss/vite` (not the old PostCSS plugin) with Vite.
- shadcn v4 uses OKLCH color variables and `@theme inline`; `tailwindcss-animate` is replaced by `tw-animate-css`.
- Browser target: **Safari 16.4+, Chrome 111+, Firefox 128+**. Tailwind v4 depends on `@property`/`color-mix()` and will not work in older browsers.

## Tauri/WebView constraint

Tauri uses the system WebView. Tailwind v4 is acceptable only if the supported WebView floor meets the Tailwind v4 floor:

- iOS: Safari/WebKit 16.4+.
- Android: System WebView/Chrome 111+.
- Desktop: current WebView2/WKWebView/WebKitGTK.

If school devices cannot meet this, use Tailwind v3.4 for v1 or raise the minimum supported OS/WebView explicitly. Do not silently ship a broken UI.

## Gold on Slate tokens

Map the existing Gold on Slate oklch values into CSS variables:

```css
@import "tailwindcss";

:root {
  --background: oklch(...);
  --foreground: oklch(...);
  --primary: oklch(...);
  /* ... */
}

.dark {
  --background: oklch(...);
  /* ... */
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  /* ... */
}
```

Do not copy OpenDuet's purple/Inter theme. Do not change `src/routes/layout.css`; migrate the token values into the workspace package CSS.

## Component use

- **shadcn primitives:** Button, Dialog, Sheet, Drawer, Tabs, ScrollArea, Command, Field, Input, Select, Popover, Tooltip, Skeleton, Progress, Toast/Sonner.
- **OpenDuet chat presentation:** transcript, composer, tool activity, approval cards, queue/following states, shell geometry. Vendor only the required files; strip CopilotKit/A2UI/auth/query imports. See `43-openduet-ui-vendoring.md`.
- **OpenUI generated surfaces:** only the `packages/genui` catalog. Map each OpenUI component to a Gold-on-Slate React component. Do not use OpenUI's prebuilt chat layouts (`@openuidev/react-ui`) or chat state (`@openuidev/react-headless`).
- **Streamdown:** chat Markdown and artifact preview. Pin the version, sanitize/allowlist links/images, and add the Tailwind v4 `@source` entries for `streamdown` and enabled plugins.
- **Tiptap:** artifact editor; build the minimal Novel-style slash/bubble UI from Gold tokens. Use open-source extensions only. Novel is visual reference only; do not add the package or copy source (`44-reference-app-audits.md`).
- **Do not use shadcn AI Elements in v1.** They would duplicate the OpenDuet chat/message/tool layer. The fallback is the vendored OpenDuet presentation plus custom components, not a second chat component library.
- **Do not use assistant-ui.** It was rejected; see `17-chat-framework.md`.

## Monorepo

- shadcn components live in `packages/ui`.
- OpenDuet-derived chat components live in `packages/chat`.
- OpenUI catalog/parser/action bridge live in `packages/genui`.
- `components.json` lives with the UI package/application that consumes it; use the shadcn monorepo CLI support.
- No duplicate component copies between web and Tauri.
- Pin CLI/component versions and review generated diffs; shadcn copies code, so upgrades are deliberate.

## Risks

- Tailwind v4's modern-browser floor may exclude older school phones.
- shadcn's default style is not EdApex; every component must be reviewed against Gold on Slate.
- OpenDuet's chat components carry CopilotKit, A2UI, query and auth imports; the vendoring step must strip them rather than adding those dependencies.
- OpenUI components can drift from Gold tokens; the catalog adapter owns the mapping and must be reviewed as a design surface.
- Streamdown's Markdown extensions increase the HTML/Markdown attack surface; sanitize and allowlist.
- Tiptap is headless; every visual affordance (slash menu, bubble menu, callouts, table tools) must be built and reviewed against Gold tokens.
- Upgrading shadcn components can overwrite local changes; version and review.

## Acceptance

- No `tailwind.config.js` is required.
- `components.json` exists for shadcn.
- Gold on Slate tokens are the only theme source.
- Tailwind v4 browser floor is met on every supported WebView.
- No Svelte UI components are imported.
- OpenDuet, OpenUI, Streamdown and Tiptap share the same token layer.
- Streamdown is the only chat Markdown renderer; assistant-ui Markdown is absent.
- No shadcn AI Elements are installed in v1.
- No assistant-ui, assistant-cloud, CopilotKit runtime, A2UI or paid MAU/seat is installed.
- No `novel` package or copied Novel source; only the visual/interaction pattern is referenced.
- Data-bound tables/panels use the Boneyard skeleton pattern with a 150 ms delay; reduced-motion disables animation; fallback is a static Tailwind skeleton.
- No generated surface can use arbitrary HTML, CSS or JavaScript.
