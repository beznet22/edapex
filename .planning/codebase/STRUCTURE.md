# Structure (edapex)

Directory layout and key files for the EdApex V2 platform.

## Centralized Source (`src/`)
- `config/`: Environment & unified configuration.
- `controllers/`: Hono route handlers (Req/Res) via `BaseController`.
- `services/`: Framework-agnostic business logic & HMAS Orchestration.
    - `ai/`: HMAS strategy, agents, and procedural skills.
- `domain/`: Anti-Corruption Layer (Interfaces & Repositories).
- `db/`: Drizzle schemas, relations, and migrations (siloed by dialect).
- `routes/`: Hono route definitions.
- `middleware/`: Auth, PBAC, Sentry, Rate Limiting.
- `validators/`: Zod schemas for input validation.
- `events/`: Event Bus & EDA definitions.
- `types/`: Shared TypeScript types & enums.
- `utils/`: Helpers, loggers, formatting.
- `tests/`: Unit, integration, and E2E specs (Vitest).

## Root Level
- `docs/`: Master specifications, domain details, and project roadmap.
- `.planning/`: GSD framework orchestration and project state.
- `AGENTS.md`: Agent specific instructions and technical mandates.
- `wrangler.toml`: Cloudflare deployment config.
- `drizzle.config.ts`: Database migration config.

## Domain Modules (18 Areas)
Logic is distributed across `src/db/domain-*.ts` and `src/domain/repositories/` covering:
- **Foundations**: Core, Identity, PBAC, Settings, Documents, Events.
- **Academic**: Academic, Assessment, Attendance, LMS, Classroom, Homeschooling.
- **Operations**: Finance, HR & Payroll, Library, Facilities.
- **Support**: AI Engine, Communication, CMS.
