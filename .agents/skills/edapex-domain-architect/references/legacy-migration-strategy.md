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

| Legacy Pattern | V2 Architecture Target |
|:---|:---|
| Express/Laravel routes | `src/controllers/[module].controller.ts` via `BaseController` |
| Inline request validation | `src/validators/[module].validator.ts` via Zod schemas |
| Fat controllers with DB queries | `src/services/[module].service.ts` (business logic) + `src/domain/repositories/` (data access) |
| Raw SQL / Eloquent / Sequelize queries | `src/db/sqlite/domain-[module].ts` (Drizzle schema) + `src/domain/repositories/sqlite/[module].repository.ts` |
| `if/else` role checks in controllers | PBAC policy definitions in `src/domain/pbac/` |
| `sendMail()` calls in controllers | Domain events → Communication service subscriber |
| File uploads to local disk | Cloudflare R2 with presigned URLs via Documents domain |
| Session-based auth | JWT/Bearer token via Hono middleware |
| Cron jobs | Cloudflare Workers scheduled events or domain event triggers |
| Frontend templates (Blade/EJS) | TanStack Start SPA + Shadcn UI components |
| jQuery/Bootstrap UI | React 19 + Tailwind CSS v4 + Lucide React |
| Local database (MySQL/PostgreSQL) | Cloudflare D1 (SQLite) with tenant_id partitioning |

---

## 4. Migration Workflow

### Step 1: Schema Translation
```typescript
// Legacy: MySQL/PostgreSQL table
// CREATE TABLE students (
//   id INT AUTO_INCREMENT PRIMARY KEY,
//   school_id INT NOT NULL,
//   name VARCHAR(255),
//   class_id INT REFERENCES classes(id),
//   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
// )

// V2: Drizzle D1 Schema
export const students = sqliteTable('students', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tenantId: integer('tenant_id').notNull(),  // school_id → tenant_id
  name: text('name').notNull(),
  classId: integer('class_id').references(() => classes.id),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_students_tenant').on(table.tenantId, table.id),
]);
```

> [!WARNING]
> Every `school_id`, `organization_id`, or `institute_id` in legacy code maps to `tenant_id` in V2. This is the MOST critical mapping.

### Step 2: Business Logic Extraction → Service Layer
```typescript
// Legacy: Fat controller with inline business logic
// app.post('/fees/assign', (req, res) => {
//   const students = db.query('SELECT * FROM students WHERE class_id = ?', [req.body.class_id]);
//   students.forEach(s => {
//     db.query('INSERT INTO fee_assignments (student_id, amount) VALUES (?, ?)', [s.id, req.body.amount]);
//   });
//   sendEmail(students, 'Fee assigned');
//   res.json({ success: true });
// })

// V2: Separated into layers
// Controller — only HTTP envelope
async assignFees(c: Context) {
  const data = FinanceValidator.assignFeesSchema.parse(await c.req.json());
  const result = await this.financeService.assignFeesToStudents(c.get('tenantId'), data);
  return BaseController.sendSuccess(c, result, 'Fees assigned', 201);
}

// Service — business logic only
async assignFeesToStudents(tenantId: number, data: AssignFeesInput) {
  const students = await this.academicRepo.getStudentsByClass(tenantId, data.classId);
  const assignments = students.map(s => ({
    tenantId, studentId: s.id, amount: data.amount, status: 'pending',
  }));
  const result = await this.financeRepo.createFeeAssignments(tenantId, assignments);
  await this.eventBus.emit('finance.fees_assigned', { tenantId, classId: data.classId, count: students.length });
  return result;
}

// Repository — data access only
async createFeeAssignments(tenantId: number, assignments: NewFeeAssignment[]) {
  return this.db.batch(
    assignments.map(a => this.db.insert(feeAssignments).values(a).returning())
  );
}
```

### Step 3: Authorization Migration
```typescript
// Legacy: Inline role check
// if (req.user.role !== 'admin' && req.user.role !== 'accountant') {
//   return res.status(403).json({ error: 'Forbidden' });
// }

// V2: PBAC policy
{
  action: 'finance.fees.assign',
  subject: { roles: ['admin', 'accountant'] },
  conditions: { tenantId: '${subject.tenantId}' },
  effect: 'allow'
}
// Evaluated automatically by PbacMiddleware before controller executes
```

### Step 4: Frontend Migration
```
Legacy jQuery/Bootstrap:      → React 19 component with Shadcn UI
Legacy AJAX calls:            → TanStack Query with structured query keys
Legacy localStorage:          → TanStack DB collection with sync handler
Legacy form validation:       → Zod schema + React Hook Form
Legacy event listeners:       → React hooks (useEffect, useCallback)
Legacy template rendering:    → JSX with Tailwind CSS v4 utilities
Legacy icon fonts (FA/Glphy): → Lucide React (import { Icon } from 'lucide-react')
```

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
