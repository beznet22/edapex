# Stack (edapex)

Detailed technical stack for the EdApex V2 platform.

## Frontend
- **Framework**: TanStack Start (React 19)
- **Styling**: Tailwind CSS v4
- **Components**: Shadcn UI + AI Elements
- **Loading**: `boneyard-js` (Skeleton screens)
- **State Management**: TanStack DB (Local-First IndexedDB)

## Backend & API
- **Framework**: TanStack Start (running on Hono / Cloudflare Workers)
- **API Standard**: REST (via Hono)
- **Environment**: Cloudflare Workers / Edge Runtime

## Database & Persistence
- **ORM**: Drizzle ORM
- **Primary Database**: Cloudflare D1 (Edge-Native)
- **Other Dialects**: MySQL, PostgreSQL, SQLite (LibSQL)
- **Patterns**: Repository Pattern for dialect abstraction, Multi-tenant partitioning (`tenant_id`).

## AI & Intelligence
- **SDK**: Mastra AI SDK
- **Models**: OpenAI (OpenCode), Anthropic (via Mastra runtime)
- **Orchestration**: Hierarchical Multi-Agent System (HMAS)
- **Patterns**: Executive Orchestrator -> Domain Supervisors -> Task Agents.

## Tooling & DevOps
- **Package Manager**: pnpm
- **Build Tool**: Vite
- **Deployment**: Wrangler (Cloudflare)
- **Containers**: Docker / Compose (for local dev and MySQL)
- **Lint/Format**: ESLint, Prettier
- **Language**: TypeScript
