---
title: EdApex V2 Tech Stack
description: Definitive technology stack for EdApex V2
---

# Core Stack

## Framework & UI
- **Framework**: SvelteKit (SPA/SSR architecture managed by Vite)
- **Language**: TypeScript throughout
- **State Management**: Svelte 5 Runes (`$state`, `$derived`, `$effect`, `setContext`, `fromContext`)
- **Styling**: Tailwind CSS v4, built on top of shadcn-svelte components
- **Component Library**: shadcn-svelte with Lucide icons (`@lucide/svelte`)
- **Theming**: `@sejohnson/svelte-themes` for deterministic dark/light mode switches.

## Data & Persistence Layer
- **Relational DB**: MySQL (Multi-tenant via Drizzle ORM)
- **ORM**: Drizzle ORM (`drizzle-orm/mysql-core`)
- **Database Driver**: `mysql2/promise` with built-in connection pooling
- **Migrations**: Standard Drizzle migration patterns (configured via `drizzle.config.ts`)

## AI Integration Layer
- **Orchestration SDK**: NextJS AI SDK (`ai`) ported via `@ai-sdk/svelte`
- **Core Package Utilities**: `streamText`, `smoothStream`, `createUIMessageStream`
- **Provider Adapters**: `@ai-sdk/google`, `@ai-sdk/openai` (OpenRouter compatible)
- **Security Check**: AI Tools enforce validation via `zod` schemas.

## Security & Identity
- **Authentication**: Custom stateless JSON Web Tokens (JWT)
- **Encryption**: JSON Web Encryption (JWE) via `jose`
- **Password Hashes**: Standard bcrypt algorithms
- **Platform Integrity**: Deep device fingerprinting leveraging PWA specs.

## Tools and Tooling
- **Build**: Vite
- **Web App**: Progressive Web App (PWA) tooling (`vite-plugin-pwa`)
- **Validation**: Zod (for forms, API bounds, and AI SDK parameter validation)
- **Date Handling**: `date-fns`

## Messaging & Jobs
- **Email Delivery**: Custom internal jobs API wrapping SMTP/Transactional services.
- **Push Notifications**: VAPID keys for browser push alerts.
