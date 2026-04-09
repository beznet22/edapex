---
title: EdApex V2 Conventions
description: Established coding rules and style guides
---

# Code Conventions

The development of the EdApex V2 architecture adheres to strict constraints designed for consistency, speed, and safety within an edge-native, AI-first ecosystem.

## 1. Context and State Management (Svelte 5)
- Always use `Svelte 5` runes for reactivity (`$state`, `$derived`, `$effect`).
- Avoid `$stores` unless deeply binding legacy dependencies.
- Use explicit Context Classes in Svelte: Component-level context must instantiate a class that exposes a `setContext()` method and a `fromContext()` retriever (ex: `ChatContext.setContext()`).
- Data hydration happens explicitly inside `$effect()` blocks against layout loaders (ex: `filesContext.rehydrate(data.uploads)`).

## 2. API Design & Data Fetching
- Endpoints inside `src/routes/api/` should be minimal, stateless logic pass-throughs.
- Bound API requests locally via `$lib/api/` rather than invoking explicit `fetch` patterns scattered in components.
- Secure API endpoints enforce User/Session authentication manually via `locals: { user, session }` injected via standard hooks. Reject with `error(401)` early.

## 3. Tool Function Isolation (HMAS)
- Agents communicate with the system using explicit tool boundaries defined in `src/lib/chat/tools/`.
- Every tool MUST export an explicitly defined `zodSchema`.
- Input and Output validation schemas are mandatory for AI agent usage.
- Tools invoke services (e.g., `assessment.ts`), never raw DAOs directly.
- Use strict role-mapping to limit token footprint (`coordinator.tool.ts` vs `result.tool.ts`).

## 4. Repositories (Data Abstraction)
- All CRUD interactions execute via standard DAOs mapped in `src/lib/server/repository`.
- Never execute Drizzle logic inside Svelte Loaders or Actions. Always map to `repo.DOMAIN.method`.
- Repositories inject `schoolId` and `academicId` as soft-delete/tenant boundaries. Ignore this rule and data bleeds instantly.

## 5. Security & Tokens
- Sensitive tokens enforce Base64URL encoding via the `jose` library standard to guarantee URL-safe JWT compatibility.
- Ensure strict multi-stage validation hooks for sensitive update operations. Never trust client payload identifiers directly without verifying execution ownership contexts.
