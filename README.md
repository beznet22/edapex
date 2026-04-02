# EdApex: Planet-Scale AI-Native School Management Platform

EdApex is a next-generation school management ecosystem built for massive scale and deep AI autonomy. It leverages a Hierarchical Multi-Agent System (HMAS) and Policy-Based Access Control (PBAC) to provide a secure, intelligent, and highly scalable foundation for both institutional school management and standalone retail (B2C) education.

## Key Features

- **Hierarchical Multi-Agent System (HMAS)**: Autonomous task agents orchestrated by domain supervisors.
- **Agentic Classroom (Domain 18)**: OpenMAIC LangGraph execution for live streaming 1-on-1 AI tutoring sessions.
- **Edge-Native Performance**: Deployed across the cloud edge with Hono, respecting strict CPU latency constraints.
- **Multi-Tenant Isolation**: PBAC enforced logical isolation allowing thousands of schools on a shared cluster.
- **Polyglot Persistence**: Unified Anti-Corruption Layer supporting SQLite, D1, PostgreSQL, and MySQL.

---

## Tech Stack

- **Language**: TypeScript (Node.js 20+ / Bun)
- **Framework**: Hono (Edge-ready web framework)
- **Database ORM**: Drizzle ORM
- **Supported Databases**: Cloudflare D1, SQLite, PostgreSQL, MySQL
- **AI Engine**: Mastra AI SDK (`@mastra/core`, OpenMAIC)
- **Authentication**: Better-Auth
- **Validation**: Zod
- **Package Manager**: pnpm
- **Testing**: Vitest

---

## Prerequisites

- **Node.js**: v20 or higher (or Bun equivalent)
- **pnpm**: v8 or higher
- **Databases**: SQLite (local) or active Docker / Cloudflare D1 environment.
- **Docker**: For local Postgres/MySQL emulation (optional).
- **Wrangler**: Cloudflare CLI for D1 and Edge dev testing.

---

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/beznet/edapex.git
cd edapex
```

### 2. Install Dependencies

Ensure you have `pnpm` installed natively.

```bash
pnpm install
```

### 3. Environment Setup

Copy your environment variables. 

```bash
cp .env.example .env
```

Configure the following variables in `.env`:

| Variable | Description | Example |
| -------- | ----------- | ------- |
| `DATABASE_URL` | Connection for Postgres/MySQL | `file:local.db` (for SQLite) |
| `MASTRA_API_KEY` | Your AI orchestration key | `sk-xxxx` |
| `OPENAI_API_KEY` | Provider key (optional) | `sk-xxxx` |
| `TENANT_SECRET` | Used for PBAC token generation | `super_secret_string` |

### 4. Database Setup

EdApex V2 supports multiple dialects. For local development with SQLite/D1:

**Run Drizzle Generator & Push Schema (Local SQLite):**
```bash
pnpm run db:generate
pnpm run db:push
```

**Apply Migrations to Local D1 instance:**
```bash
pnpm run db:migrate:local
```

### 5. Start Development Server

Run the backend over the Hono/Wrangler Edge emulator:

```bash
pnpm run dev:backend
```

This will run Hono on `localhost:8787`. You can now access the `/api/v1` routes.

---

## Architecture

### Directory Structure

```
src/
├── config/              # Centralized environment & unifiedConfig
├── controllers/         # Hono route handlers (req/res) via BaseController
├── services/            # Framework-agnostic business logic & AI orchestration
├── domain/              # Anti-Corruption Layer (Interfaces & Repositories)
│   ├── interfaces/      # e.g., core.interface.ts, ai.interface.ts
│   └── repositories/    # Drizzle ORM concrete implementations
├── db/                  # Drizzle schemas, relations, and migrations
│   ├── sqlite/          # Schema definitions for SQLite / D1
│   ├── postgres/        # Schema definitions for PostgreSQL
│   └── mysql/           # Schema definitions for MySQL
├── routes/              # Hono route definitions
├── middleware/          # Auth, PBAC, Sentry, Rate Limiting
├── validators/          # Zod schemas for input validation
├── events/              # Event Bus & EDA definitions
├── types/               # Shared TypeScript types & Enums
├── utils/               # Helpers, loggers, formatting
├── tests/               # Unit, Integration, and E2E specs
├── instrument.ts        # Observability & Tracing setup
├── app.ts               # Hono App instance configuration
└── server.ts            # Bootstrapper & Dependency Injection
```

### Request Lifecycle

1. HTTP Request hits Wrangler / Cloudflare Worker boundary.
2. `server.ts` bootstraps instances, Request routed to `app.ts` (Hono).
3. Middleware fires: Rate limiting -> Identity extraction (Better-Auth) -> PBAC Policy Enforcer (Tenant isolation check).
4. `Controller` parses params explicitly via Zod validators.
5. Controller invokes `Service` layer (e.g. `ClassroomService`).
6. `Service` evaluates logic and coordinates with **Mastra AI Agents** or dispatches `events`.
7. `Service` persists explicitly to the `Repository` (Anti-Corruption Layer).
8. `Repository` interacts with target DB layer using Drizzle ORM.
9. Response flows back to client (optionally as SSE Streams for Domain 18).

### Key Components

**Hierarchical Multi-Agent System (HMAS)**
Built on Mastra, this is the AI engine of the school.
- **Executive**: Intercepts user requests, parses intent.
- **Domain Supervisors**: E.g., `academic_supervisor` routes tasks within specific domain boundaries.
- **Task Agents**: E.g., `EvaluatorAgent` actually grading the quiz.

**Policy-Based Access Control (PBAC)**
Instead of legacy ABAC, a Policy Enforcer intercepts requests and verifies conditions.
- Uses `Subject`, `Action`, `Resource`, `Environment`.
- Automatically blocks cross-tenant reads before controller execution.

**Agentic Classroom (Domain 18) & SSE**
Manages real-time stateless orchestration over Edge WebSocket/SSE connections. Uses `domain-classroom`'s `classroom_memory_ledger` to respect the 10ms CPU limits without locking main tables.

### Database Schema (Overview Core Entities)

```
domain_core_tenants
├── id (varchar, PK)
├── name (varchar)
└── domain (varchar, unique)

domain_core_users
├── id (varchar, PK)
├── email (varchar, unique)
└── tenant_id (varchar, FK -> domain_core_tenants)

domain_classroom_sessions
├── id (varchar, PK)
├── tenant_id (varchar, FK)
├── course_id (varchar, FK)
├── director_agent_id (varchar, FK)
└── status (enum)
```

---

## Environment Variables

### Required
| Variable | Description | Where to Get |
| -------- | ----------- | ------------ |
| `DATABASE_URL` | Universal DB connection string | `file:local.db` OR Provider |
| `MASTRA_API_KEY` | Mastra Orchestration Key | Mastra Dashboard |

### Optional
| Variable | Description | Default |
| -------- | ----------- | ------- |
| `NODE_ENV` | Application environment | `development` |
| `OPENAI_API_KEY` | Standalone AI provider fallback | - |

---

## Available Scripts

| Command | Description |
| ------- | ----------- |
| `pnpm run dev:backend` | Start the Wrangler local dev emulator for Hono backend |
| `pnpm run build` | Build Vite frontend / bundle backend |
| `pnpm run typecheck` | Run standard TypeScript compiler checks without emitting files |
| `pnpm run lint` | ESLint across `src/` directory |
| `pnpm run format` | Prettier formatter across `src/` directory |
| `pnpm run test` | Run the Vitest test suite |
| `pnpm run db:push` | Immediate push of schema changes to local `local.db` |
| `pnpm run db:generate` | Generate raw SQL migrations for Drizzle |
| `pnpm run db:migrate:local`| Run raw SQL migrations on local Wrangler D1 |
| `pnpm run docker:up` | Spin up Postgres/MySQL Docker composition |

---

## Testing

### Running Tests

We utilize Vitest for instant edge-compatible testing.

```bash
# Run all tests
pnpm run test

# Run generic test with coverage
pnpm run test --coverage

# Run specific file
pnpm vitest run src/tests/domain-classroom.spec.ts
```

### Test Structure

```
src/tests/
├── unit/             # Isolated function and validation testing
├── integration/      # Repository testing mapping to Drizzle memory DB
└── e2e/             # Supertest against Hono app instance
```

---

## Deployment

EdApex V2 is designed for the Edge, natively targeting **Cloudflare Workers** & **D1**.

### Cloudflare (Recommended Edge Target)

```bash
# Authenticate
pnpm wrangler login

# Deploy migrations to production D1
pnpm run db:migrate:prod

# Deploy the worker
pnpm run start
```
*Note: Ensure your `wrangler.toml` is configured with your specific Cloudflare Account ID and D1 database bindings.*

### Docker Deployment (Traditional Cloud)

If bypassing Cloudflare for a standard VPS/AWS configuration:

```bash
# Build the node image
pnpm run docker:build

# Launch the composition (includes Postgres/MySQL configured in docker-compose.yml)
pnpm run docker:up
```

---

## Troubleshooting

### D1 Migration Failures
**Error:** `Wrangler cannot apply migration`
**Solution:**
1. Ensure your `wrangler.toml` namespace matches the exact database configured.
2. If schema drift occurred locally, delete the `.wrangler` directory and `local.db` to flush state, then re-run `db:push`.

### Better-Auth SQLite Exceptions
**Error:** `TypeError: database is locked`
**Solution:** Local SQLite does not support highly concurrent writes. Consider switching `.env` `DATABASE_URL` to a local Docker Postgres instance using `docker:up` if testing concurrent bulk student loads.

### SSE Stream Disconnection
**Error:** `Agentic Classroom stream closes after 100ms`
**Solution:** Cloudflare restricts CPU limits. Ensure you are using the `saveToPolymorphicArtifact` tools instead of executing heavyweight LLM calls synchronously. Always route heavy compute to external providers (`@mastra/openai`).

---

## Acknowledgments

EdApex's deep architectural patterns---specifically regarding the stateless graph engine execution for real-time WebSocket/SSE orchestration, and the autonomous agent control-plane featuring atomic task checkout, cost rollups, and stateless heartbeat execution loops---are deeply inspired by the groundbreaking open-source work of:

- [THU-MAIC/OpenMAIC](https://github.com/THU-MAIC/OpenMAIC)
- [Paperclip](https://github.com/paperclipai/paperclip)