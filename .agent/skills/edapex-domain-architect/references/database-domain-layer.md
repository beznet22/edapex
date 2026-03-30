# Database & Domain Layer Constraints

As dictated by the `database-architect` skill, the lowest layers of the EdApex stack (`db/` and `domain/`) handle the critical persistence and abstract persistence structures.

## 1. Drizzle Multi-Dialect Consistency
Whenever you add a schema `export const ...` into `src/db/mysql/domain-[name].ts`, you MUST simultaneously mirror it perfectly into:
- `src/db/postgres/...`
- `src/db/sqlite/...`

**PostgreSQL Types Warning**: Remember that Postgres uses `serial` or `integer` instead of `int`. Always use the `pgSchema("domain_name")` definitions correctly.
**SQLite Warning**: Use `integer("id", { mode: "number" })` without strictly defining foreign constraints directly in-line if it breaks the single-file layout.

## 2. Multi-Tenancy Guarantee
Every operational table (except core infra tables) MUST have a `tenant_id` referring back to `tenants.id`.

## 3. The Interface Barrier
The `domain/interfaces/` layer acts as the absolute barrier against leaky abstractions.
- Define a unified TypeScript interface (e.g. `IUser`, `IFinanceLedger`) that entirely encapsulates the DB type.
- The Service layer imports this interface, NEVER the MySQL or Postgres drizzle specific schema.
- Create 3 parallel concrete Repositories (`domain/repositories/[dialect]/[name].repository.ts`) that each map the Drizzle row directly into the unified TS Interface explicitly.

## 4. Normalization and Scale
Ensure you are prioritizing normalized designs leveraging JSON/JSONB properly for schemaless configurations (e.g. `lms_metadata`). 
Never use raw SQL when Drizzle provides `eq()`, `and()`, or `.returning()` methods.
