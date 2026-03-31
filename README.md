# EdApex: Planet-Scale AI-Native School Management Platform

EdApex is a next-generation school management ecosystem built for massive scale and deep AI autonomy. It leverages a hierarchical multi-agent system (HMAS) and policy-based access control (PBAC) to provide a secure, intelligent, and highly scalable foundation for both institutional and retail education.

## 🏛 Technical Vision

EdApex V2 moves beyond the monolithic past into a modern, layered architecture designed for AI-native execution:
- **HMAS Core**: Powered by **Mastra AI SDK** for sophisticated reasoning and task automation.
- **PBAC Security**: Dynamic attribute-based access control replacing static roles.
- **Multi-Tenant Foundation**: Strict logical isolation for thousands of schools/campuses.
- **Multi-Dialect Persistence**: Repository-pattern based support for MySQL, PostgreSQL, and SQLite/LibSQL.

## 🛠 Tech Stack

- **Runtime**: Node.js / Bun
- **Framework**: [Hono](https://hono.dev/) (Edge-ready web framework)
- **Database ORM**: [Drizzle ORM](https://orm.drizzle.team/)
- **AI Engine**: [Mastra AI SDK](https://mastra.ai/)
- **Authentication**: [Better-Auth](https://better-auth.com/)
- **Validation**: [Zod](https://zod.dev/)
- **Package Manager**: `pnpm`

## 📂 Directory Structure

```bash
src/
├── config/              # Centralized environment & unifiedConfig
├── controllers/         # Hono route handlers (req/res) via BaseController
├── services/            # Framework-agnostic business logic & AI orchestration
├── domain/              # Anti-Corruption Layer (Interfaces & Repositories)
│   ├── interfaces/      # e.g., core.interface.ts, ai.interface.ts
│   └── repositories/    # Drizzle ORM concrete implementations (mysql, postgres, sqlite)
├── db/                  # Drizzle schemas, relations, and migrations
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

## 🚀 Getting Started

### 1. Prerequisites
- Node.js 20+ or Bun
- `pnpm` installed globally

### 2. Installation
```bash
pnpm install
```

### 3. Environment Setup
Copy the example environment file and configure your database and AI keys:
```bash
cp .env.example .env
```

### 4. Database Setup
Push the schema to your target database:
```bash
pnpm run db:push
```

## 📖 Documentation

- **[Master Architecture](docs/MASTER_ARCHITECTURE.md)**: Detailed technical specification.
- **[Domain Specifications](docs/domains/)**: Deep dive into per-module schemas and logic.
- **[PBAC Security Model](docs/domains/pbac.md)**: Details on the policy-based security engine.

## 🤝 Contributing

When contributing to EdApex, follow the patterns established in `src/` and ensure all business logic is encapsulated in **Services** and **Repositories**. AI commits must follow the attribution format specified in `AGENTS.md`.