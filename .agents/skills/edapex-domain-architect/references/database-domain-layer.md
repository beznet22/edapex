# Database & Domain Layer Constraints

As dictated by the `database-architect` skill, the lowest layers of the EdApex stack (`db/` and `domain/`) handle the critical persistence and abstract persistence structures.

## 1. Edge-Native Optimization (Cloudflare D1)
Whenever you add a schema `export const ...` into `src/db/sqlite/`, you MUST ensure it is compatible with Cloudflare D1's specific SQLite flavor:
- **Shared Dialect**: Use a unified SQLite dialect for both local development and edge deployment.
- **Driver Abstraction**: Abstract away the driver (e.g., `d1-orm` vs `better-sqlite3`) to maintain consistent DX.
- **D1 Migration**: Always generate migrations that can be applied to `edapex_db --local` or `--remote`.
- **`.returning()` Syntax**: All `INSERT` and `UPDATE` mutations MUST chain `.returning()` for SQLite/D1 compatibility. This is required for the service layer to receive the created/updated entity without a follow-up `SELECT`.

## 2. Multi-Tenancy Guarantee
Every operational table (except core infra tables) MUST have a `tenant_id` referring back to `tenants.id`.
- **Composite Indexes**: Every table MUST have a composite index on `(tenant_id, id)` for optimized partition-scoped lookups.
- **Query Enforcement**: Every repository method MUST accept `tenantId` as a required parameter and filter accordingly.

## 3. The Sync-Ready Repository
Repositories MUST support differential synchronization:
- **`updatedSince` Filtering**: All `get` methods must accept an optional timestamp for delta sync.
- **D1 Batching**: Use `db.batch()` for all multi-row mutations to respect Cloudflare's 10ms CPU limit.
- **Interface Barrier**: The `domain/interfaces/` layer encapsulates all DB types. Services NEVER import Drizzle schemas directly.
- **Mapper Methods**: Every repository MUST have private `map[Entity]` methods to transform raw Drizzle rows into domain interfaces, ensuring date conversions and type safety.

## 4. Scale & Normalization
Ensure you are prioritizing normalized designs leveraging JSON/JSONB properly for schemaless configurations. Never use raw SQL when Drizzle provides type-safe methods.

## 5. Schema Naming Convention
All tables MUST use the `domain_[module]_[entity]` naming convention (e.g., `domain_finance_ledger_entries`). This ensures clear domain ownership and prevents naming collisions.

## 6. Dependency Injection Pattern
Repository implementations MUST follow the established pattern:
```typescript
// ✅ Correct: Repository implements interface
export class SqliteFinanceRepository implements IFinanceRepository {
  // Uses imported `db` singleton and domain schema tables
}

// ❌ Wrong: Service instantiates repository directly
const repo = new SqliteFinanceRepository(); // Anti-pattern
```
Services receive repositories via constructor injection or factory functions.
