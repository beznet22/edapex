---
title: EdApex V2 Structure
description: Directory topology and code boundaries
---

# Project Structure

The codebase strictly adheres to the standard SvelteKit layout while mapping complex domains into isolated module paths.

## Primary Layout

\`\`\`
src/
├── app.d.ts                 # Global type definitions and Locals injection
├── app.html                 # Main document root
├── lib/                     # Core library path (alias $lib)
│   ├── api/                 # Remote API binding clients (frontend use)
│   ├── assets/              # Static assets (favicons, generic svgs, manifest)
│   ├── components/          # Reusable UI parts (shadcn components, chat, dialogs)
│   ├── context/             # Svelte 5 Stateful context roots (Chat, App, PWA runes)
│   ├── schema/              # Zod schemas (Data validation bounds)
│   ├── server/              # Secure boundary layer (NOT exposed to clients)
│   │   ├── agents/          # HMAS instruction schemas and AI prompts
│   │   ├── db/              # Drizzle configuration schemas and connection pooling
│   │   ├── helpers/         # Generic server-side utilities (bcrypt, tokens)
│   │   ├── provider/        # AI orchestration model bindings and routers
│   │   ├── repository/      # CRUD layer abstracting MySQL via DAO patterns
│   │   ├── service/         # Complex bound integrations (Auth, Email, Agents)
│   │   └── storage/         # Persisted local/remote artifacts handlers
│   └── types/               # Type definitions decoupled from schemas
└── routes/                  # Expressive SvelteKit routing hierarchy
    ├── (auth)/              # Route group for signin/secure logic
    ├── (chat)/              # Main application loop containing AI interface bounds
    └── api/                 # Decoupled backend endpoints (trpc-like behavior)
\`\`\`

## Structural Rules

1. **`$lib/server` Isolation**: Files under `server` are strictly isolated from the client. Mixing frontend code here will cause build failures via SvelteKit logic boundaries.
2. **Components Layer**: Subdirectory `/ui/` inside components is strictly reserved for `shadcn-svelte` primitive elements. Domain logic components go directly in `/components`.
3. **Runes vs Store**: `src/lib/context` uniformly adopts Svelte 5 Classes injected with state (`$state()`) versus traditional Svelte stores. Use `PWAContext.setContext()` pattern for hydration.
