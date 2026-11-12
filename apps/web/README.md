# EdApex Web

The single browser application for EdApex. It contains the admin claim directory,
claim flow, login surface and the cowork workspace.

## Stack

- Next App Router compiled by **vinext 1.4.5** on Vite 8.
- React 19.3.1, Tailwind CSS v4, shadcn/Radix primitives.
- Gold on Slate tokens copied from the legacy design authority into `app/globals.css`.
- `@edapex/contracts` for capabilities, chat parts and runtime views.
- `@edapex/chat` for queue/turn state and shared message primitives.
- `@edapex/genui` for the OpenUI v1 catalog and renderer.
- `@edapex/documents` for the Tiptap artifact editor.
- Ported OpenDuet interaction components in `components/openduet`; see
  `components/openduet/VENDOR.md` and `LICENSE.openduet`.
- Chatbot starter attribution and Apache-2.0 notice in `LICENSE.chatbot`.

No AI SDK, Auth.js, Drizzle/Postgres, Redis, Vercel Blob, BotID, CopilotKit or A2UI
runtime is part of this app.

## Routes

| Route | Surface |
|---|---|
| `/` | Admin claim directory |
| `/admin/claim-links` | Admin claim directory |
| `/claim` | Claim-token exchange, then Google sign-in |
| `/claim-link` | Alias for `/claim` (legacy/generated claim URLs) |
| `/workspace` | Cowork Chat |
| `/workspace/tasks` | Tasks shell |
| `/workspace/make` | Make shell |
| `/workspace/offline` | PWA offline fallback |
| `/workspace/manifest.webmanifest` | PWA manifest |
| `/sw.js` | Service worker scoped to `/workspace` |

## Workspace architecture

- `app/workspace/layout.tsx` persists across Chat/Tasks/Make. It owns session restoration, the capability manifest, runtime state and the shell.
- Route pages only render a surface: `WorkspaceChat`, `TasksSurface` or `MakeSurface`.
- `WorkspaceLayoutClient` is the only workspace component that calls `getSession`, `loadCapabilities` or `useWorkspaceRuntime`.
- All workspace navigation uses `next/link`; do not use `<a href>` for workspace routes.
- `WorkspaceBoot` is surface-specific: Chat shows the composer skeleton, Tasks shows task rows, Make shows the page grid, each with the active rail/tab.
- Artifact editing uses the desktop 38/62 split or the sub-1024px full-screen sheet; it is not a nested editor inside a card.
- Development CSP may include `unsafe-eval` and the local HMR WebSocket; production must not.

## Local development

```bash
pnpm install
pnpm --dir apps/web dev
```

The dev server runs at `http://localhost:5181`. In development, `/workspace`
uses a local **Dev Admin** capability fixture and does not call `/api/v1/me`; the
admin directory, claim flow and login still use the real API. Set
`NEXT_PUBLIC_DEV_AUTH_BYPASS=0` to disable the workspace bypass and exercise the
real session gate. Production builds always bypass is disabled.

For real local API data, set `DEV_API_COOKIE` to inject a development session
without putting the token in the browser:

```bash
DEV_API_COOKIE="__Host-edapex_session=…" NEXT_PUBLIC_DEV_AUTH_BYPASS=0 \
  pnpm --dir apps/web dev
```

Without `DEV_API_COOKIE`, the local proxy cannot authenticate against the
production API, and the workspace stays in the sign-in gate.

The Cloudflare plugin is enabled for production builds, not the local vinext dev
server. This keeps HMR and the proxy straightforward while the deploy build still
exercises the Worker entry.

## Verification

```bash
pnpm --dir apps/web check
pnpm --dir apps/web build
pnpm --dir apps/web test
pnpm --dir apps/web test:e2e
pnpm exec vinext check
```

The production server can be checked locally with:

```bash
pnpm --dir apps/web build
pnpm --dir apps/web start
```

PWA checks: manifest at `/workspace/manifest.webmanifest`, service worker at
`/sw.js` with scope `/workspace`, and offline navigation to `/workspace` serving the
offline page. The service worker caches only static assets, icons and the offline
page; it never caches `/api/*`, transcripts or school data.

## Deployment

`cloudflare.config.ts` defines the `edapex-web` Worker and `worker/index.ts` is the
Worker entry. `vite build` emits the Worker and static assets under `dist/`.

```bash
pnpm --dir apps/web build
pnpm --dir apps/web deploy:preview
```

Production promotion is a phase gate: the previous `app.llacademy.ng` Pages
deployment remains the rollback until the Worker route/domain and smoke tests pass.
Do not promote from `main`.
