# Database & Domain Layer Constraints

As dictated by the `database-architect` skill, the lowest layers of the EdApex stack (`db/` and `domain/`) handle the critical persistence and abstract persistence structures.

## 1. Edge-Native Optimization (Cloudflare D1)
Whenever you add a schema `export const ...` into `src/db/sqlite/`, you MUST ensure it is compatible with Cloudflare D1's specific SQLite flavor:
- **Shared Dialect**: Use a unified SQLite dialect for both local development and edge deployment.
- **Driver Abstraction**: Abstract away the driver (e.g., `d1-orm` vs `better-sqlite3`) to maintain consistent DX.
- **D1 Migration**: Always generate migrations that can be applied to `edapex_db --local` or `--remote`.

## 2. Multi-Tenancy Guarantee
Every operational table (except core infra tables) MUST have a `tenant_id` referring back to `tenants.id`.

## 3. The Sync-Ready Repository
Repositories MUST support differential synchronization:
- **`updatedSince` Filtering**: All `get` methods must accept an optional timestamp.
- **D1 Batching**: Use `db.batch()` for all mutations to respect Cloudflare's 10ms CPU limit.
- **Interface Barrier**: The `domain/interfaces/` layer encapsulates all DB types. Services NEVER import Drizzle schemas directly.

## 4. Scale & Normalization
Ensure you are prioritizing normalized designs leveraging JSON/JSONB properly for schemaless configurations. Never use raw SQL when Drizzle provides type-safe methods.
