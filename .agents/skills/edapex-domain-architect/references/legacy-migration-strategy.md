# Legacy Codebase Migration Strategy

The EdApex Domain Architect can analyze, review, and transform legacy codebases into the modern EdApex V2 architecture. This document defines the canonical migration methodology.

---

## 1. Migration Philosophy

Legacy code is **intellectual property** — it encodes years of business logic, edge cases, and domain knowledge. The goal is NOT to rewrite from scratch, but to **extract, understand, and re-architect** the business intent into the EdApex V2 8-layer architecture.

```
Legacy Codebase → Analyze → Extract Business Rules → Map to V2 Layers → Implement → Verify Parity
```

---

## 2. Phase L0: Legacy Discovery (MANDATORY)

Before any migration work, perform exhaustive analysis:

### Step 1: Codebase Audit
```
1. Identify the legacy tech stack (framework, ORM, database, auth)
2. Map the directory structure to understand module boundaries
3. List all database tables/models and their relationships
4. Identify authentication & authorization patterns
5. Catalog all API endpoints and their HTTP methods
6. Identify background jobs, cron tasks, and event handlers
```

### Step 2: Business Logic Extraction
```
For each module in the legacy codebase:
1. Read every controller/handler → Document what each endpoint DOES
2. Read every model/ORM → Document entity relationships and constraints
3. Read every service/helper → Document business rules and validation logic
4. Read every middleware → Document cross-cutting concerns (auth, logging, rate-limiting)
5. Read database migrations/seeders → Document schema evolution and default data
```

### Step 3: Code Flow Mapping
```
For each critical user journey:
1. Trace the request path: Route → Middleware → Controller → Service → Database
2. Document every side effect (emails sent, files uploaded, events emitted)
3. Document every validation rule and error handling path
4. Document every cross-module dependency (e.g., enrollment triggers fee assignment)
5. Note any "hidden" business rules embedded in SQL queries or ORM scopes
```

> [!IMPORTANT]
> Legacy business rules hidden in SQL `WHERE` clauses, ORM scopes, or view layer conditionals are the most common source of migration bugs. Extract them ALL before writing any V2 code.

---

## 3. Legacy-to-V2 Layer Mapping

| Legacy Pattern | V2 Architecture Target | Authority / Skill |
|:---|:---|:---|
| Fat controllers | `src/controllers/` (Envelope) → `src/supervisors/` (HMAS) | `mastra` |
| Request validation | `src/validators/` (Zod schemas) | Zod |
| Service logic | `src/services/` (Pure rules) | `backend-architect` |
| Model/ORM queries | `src/db/sqlite/` (Drizzle) + `repositories/` | `database-architect` |
| Hardcoded RBAC | PBAC DSL in `src/domain/pbac/` | PBAC Domain |
| Local File Store | Cloudflare R2 + Documents Domain | R2 / Documents |
| Blade/EJS/jQuery | TanStack Start SPA + Tailwind v4 + Lucide | `ui-ux-pro-max` |
| Traditional DB | Cloudflare D1 (SQLite) with UUID v7 | D1 / Drizzle |

---

## 4. Migration Workflow

### Step 1: Schema Translation
```typescript
// V2: Drizzle D1 Schema with UUID v7
export const students = sqliteTable('students', {
  id: text('id').primaryKey().$defaultFn(() => uuid7()), // UUID v7 mandated
  tenantId: text('tenant_id').notNull(),                // Strong multi-tenancy
  name: text('name').notNull(),
  classId: text('class_id').references(() => classes.id),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_students_tenant').on(table.tenantId, table.id),
]);
```

### Step 2: HMAS Business Logic Extraction
```typescript
// Controller — only HTTP envelope
async assignFees(c: Context) {
  const data = FinanceValidator.assignFeesSchema.parse(await c.req.json());
  const result = await this.financeSupervisor.assignFees(c.get('tenantId'), data);
  return BaseController.sendSuccess(c, result, 'Fees assigned', 201);
}

// Supervisor (HMAS) — orchestration
async assignFees(tenantId: string, data: AssignFeesInput) {
  const students = await this.academicRepo.getStudentsByClass(tenantId, data.classId);
  const result = await this.financeService.processBulkAssignments(tenantId, students, data.amount);
  await this.eventBus.emit('finance.fees_assigned', { tenantId, count: students.length });
  return result;
}
```

### Step 3: Frontend Migration (`web-artifacts-builder`)
- **Move to React 19 / TanStack Start**.
- **Replace CSS with Tailwind v4 `@theme`**.
- **Replace Fetch with TanStack DB `useLiveQuery`**.
- **Replace icon fonts with Lucide React (import { Icon } from 'lucide-react')**

---

## 5. Migration Verification Checklist

After migrating each module, verify feature parity:

### Business Logic Parity
- [ ] All legacy endpoints are mapped to V2 routes
- [ ] All validation rules are captured in Zod schemas
- [ ] All authorization checks are encoded as PBAC policies
- [ ] All database queries produce equivalent results
- [ ] All side effects (emails, events, file ops) are preserved via domain events
- [ ] All error codes and messages match expected behavior

### Architecture Compliance
- [ ] No business logic in controllers (only HTTP envelope)
- [ ] No SQL/Drizzle in services (only repository calls)
- [ ] All queries include `tenantId` filtering
- [ ] Services receive repositories via constructor injection
- [ ] Multi-row mutations use `db.batch()`
- [ ] Non-critical work deferred via `ctx.waitUntil()`
- [ ] Sync handler registered in `frontend/src/lib/sync.ts`

### Data Migration
- [ ] Legacy `school_id` / `org_id` mapped to `tenant_id`
- [ ] Legacy auto-increment IDs preserved or new ID mapping documented
- [ ] Legacy timestamps converted to SQLite `datetime('now')` format
- [ ] Legacy enums mapped to EdApex enumeration system
- [ ] Orphaned records identified and handled

---

## 6. Migration Report Template

After completing a module migration, produce a report:

```markdown
# Migration Report: [Module Name]

## Legacy Analysis
- **Source**: [Framework, file paths, tables]
- **Endpoints migrated**: X/Y
- **Business rules extracted**: N

## V2 Implementation
- **Schema**: `src/db/sqlite/domain-[module].ts`
- **Repository**: `src/domain/repositories/sqlite/[module].repository.ts`
- **Service**: `src/services/[module].service.ts`
- **Controller**: `src/controllers/[module].controller.ts`
- **Validators**: `src/validators/[module].validator.ts`
- **Frontend sync**: `frontend/src/lib/sync.ts` — [collection registered]

## Parity Status
- All endpoints: ✅/❌
- All validations: ✅/❌
- All auth rules: ✅/❌
- All side effects: ✅/❌

## Breaking Changes
- [List any behavior differences between legacy and V2]

## Technical Debt
- [List any shortcuts taken that need future work]
```

