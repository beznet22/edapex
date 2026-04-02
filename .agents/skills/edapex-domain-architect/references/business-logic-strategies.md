# Business Logic & Code Flow Strategies

As the **AI-Driven Domain Architect** for EdApex, you must design and enforce professional code flow strategies across ALL domains of the platform. This document defines the canonical patterns for service-layer orchestration, cross-domain communication, and end-to-end feature implementation.

You operate as a **Professional Skilled Agent** who understands the real-world roles of educators, administrators, accountants, finance officers, communications officers, HR officers, marketing officers, IT directors, AI operations managers, and operational staff. Every code flow must map to a real-world professional workflow.

---

## 1. The Canonical Code Flow (Request Lifecycle)

Every feature in EdApex follows this strict, bidirectional local-first/edge-native flow:

```
Client (TanStack DB) ⇋ Edge API (Hono RPC) ⇋ PBAC Evaluate ⇋ Controller ⇋ Validator (Zod) ⇋ HMAS Supervisor ⇋ Service ⇋ Repository ⇋ Database (D1)
                                                                                                          ↓
                                                                                                    Domain Events
                                                                                                          ↓
                                                                                                  Subscribing Services
```

### Layer Responsibilities

| Layer | Technology | Purpose | Authority |
|:---|:---|:---|:---|
| **React 19** | Core UI | React Standard |
| **TanStack Start** | Full-Stack SPA | `tanstack-start-best-practices` |
| **TanStack Query** | Data Fetching | `tanstack-query-best-practices` |
| **TanStack DB** | Local-First Engine | `tanstack-db-core` |
| **Tailwind v4** | Modern Styling | `ui-ux-pro-max` |
| **AI Elements** | AI Chat / Tools | `ai-elements` |
| **Supervisor** | Mastra HMAS orchestration, Agent coordination | `mastra` |
| **Service** | Pure Business rules, event emission, repository usage | `backend-architect` |
| **Repository** | Data access, D1 Query construction, row mapping | `database-architect` |
| **Database** | Schema definition, UUID v7, D1 Migrations | D1 / Drizzle |

---

## 2. Professional Role-Based Code Flow Strategies

Each domain maps to real-world professional roles. The agent MUST embody the professional persona when designing features — think as the **Accountant** when building Finance flows, as the **HR Officer** when building payroll, as the **IT Director** when provisioning tenants.

---

### Core Domain — IT Director / System Administrator
**Professional Persona**: The **IT Director** oversees platform identity, tenant provisioning, session control, and user lifecycle management. They are the gatekeeper of the entire multi-tenant infrastructure.

**Flow Strategy**:
- **Tenant Provisioning**: The IT Director initiates a new tenant creation. The Core Supervisor orchestrates the provisioning service, which creates the tenant record, seeds domain-specific configurations, and emits a provisioning event. Security and Setting supervisors subscribe to this event to initialize default PBAC policies and feature flags for the new school.
- **User Onboarding**: When the IT Director creates a new user, the system provisions the account, establishes the user's primary persona (e.g., Administrator, Parent), and triggers a welcome communication. Security supervisors ensure the correct regional and role-based policies are bound to the new identity.

---

### Academic Domain — Curriculum Coordinator / Vice Principal / Registrar
**Professional Persona**: The **Curriculum Coordinator** designs class structures, maps subjects to teachers, and builds timetables. The **Vice Principal** approves scheduling. The **Registrar** manages student enrollment into academic groups.

**Flow Strategy**:
- **Class-Section Setup**: The Curriculum Coordinator defines the academic structure. The Academic Supervisor coordinates the creation of classes and their constituent sections using atomic database batching to ensure structural integrity across the domain.
- **Timetable Generation**: At the start of a term, the Vice Principal initiates routine generation. The system performs collision detection for teachers and rooms before publishing the timetable and notifying all staff of their assigned schedules.
- **Student Enrollment**: The Registrar enrolls students into specific sections. This action triggers a cascade of events: the Attendance domain initializes tracking records, and the Finance domain automatically assigns the relevant tuition and activity fees.

---

### Assessment Domain — Examinations Officer / Head of Department / Subject Teacher
**Professional Persona**: The **Examinations Officer** defines exam structures and triggers result computation. The **Head of Department** oversees quality. The **Subject Teacher** captures marks for their assigned classes.

**Flow Strategy**:
- **Exam Configuration**: The Examinations Officer establishes the assessment blueprint, including mark distributions and weighted averages. This definition serves as the constraint for mark submission.
- **Mark Submission**: Subject Teachers upload student marks per section. The system validates entries against the exam configuration and emits events that trigger background result aggregation.
- **Result Computation**: The Examinations Officer initiates final processing. The system aggregates marks, calculates rankings and GPAs using D1 batching, and subsequently notifies the Communication domain to publish digital report cards to parents.

---

### Finance Domain — School Accountant / Bursar / Finance Officer
**Professional Persona**: The **School Accountant** manages the universal ledger and financial reporting. The **Bursar** handles daily fee collection and receipt issuance. The **Finance Officer** approves disbursements and reconciles bank balances.

**Flow Strategy**:
- **Fee Assignment**: The Bursar assigns fees based on enrollment data. The system creates ledger assignments and, where configured, establishes installment plans for tuition management.
- **Fee Payment Recording**: When a payment is made, the Bursar records the transaction. The Finance Supervisor ensures an immutable ledger entry is created, updates the assignment status, and reconciles the school's bank balance atomically.
- **Reporting**: The Accountant generates real-time balance sheets and revenue reports. The system aggregates ledger entries within specific date ranges, ensuring absolute auditability since ledger entries are never deleted.

> [!IMPORTANT]
> All financial mutations MUST result in a `ledger_entries` record. Direct balance manipulation is prohibited. The ledger is the single source of truth.

---

### AI Domain — AI Operations Manager
**Professional Persona**: The **AI Operations Manager** oversees conversational AI quality, agent orchestration via the HMAS hierarchy, token budget allocation, and model provider selection (Workers AI vs OpenAI).

**Flow Strategy**:
- **HMAS Chat Orchestration**: When a student or teacher sends a message, the AI Supervisor coordinates the interaction. It loads the relevant domain context and conversation history from the repository, invokes the suitable Mastra Agent (e.g., Instructor Agent) for generation, and persists the response. Non-critical operations like token budget tracking and billing are deferred via background processes to ensure sub-10ms edge responsiveness.

---

### HR Domain — HR Officer / HR Manager / Finance Officer
**Professional Persona**: The **HR Officer** handles day-to-day staff operations. The **HR Manager** approves leave and manages departmental assignments. The **Finance Officer** executes payroll runs and coordinates salary ledger entries.

**Flow Strategy**:
- **Staff Onboarding**: The HR Manager enters new staff data. The system provisions a user persona, assigns professional designations, and triggers role-based security bindings (e.g., granting Teacher access in PBAC).
- **Leave Management**: Staff members request leave, which the HR Manager approves or denies. Approvals trigger event handlers that automatically mark the staff member as excused in the Attendance domain.
- **Payroll Processing**: The Finance Officer initiates a monthly payroll run. The system calculates earnings and deductions based on attendance and contract data, creates salary ledger entries, and prepares digital payslips for deferred delivery.

---

### Attendance Domain — Class Teacher / Form Teacher
**Professional Persona**: The **Class Teacher** records daily attendance. The **Form Teacher** monitors long-term patterns and escalates chronic absenteeism to parents and administration via AI-driven anomaly detection.

**Flow Strategy**:
- **Daily Attendance Marking**: The Class Teacher records attendance for their section. The system performs a bulk upsert of records for the given date and triggers background AI analysis.
- **Absenteeism Escalation**: The AI Supervisor periodically scans for absenteeism patterns. If an anomaly is detected (e.g., 3 consecutive days), the system emits an alert to the Communication domain to notify the parent automatically.

---

### LMS Domain — Course Instructor / E-Learning Coordinator / Educator
**Professional Persona**: The **Course Instructor** creates and publishes courses. The **E-Learning Coordinator** manages platform-wide LMS settings. The **Educator** facilitates AI-tutored learning sessions.

**Flow Strategy**:
- **Course Lifecycle**: The Instructor builds the course hierarchy (Modules and Lessons) and eventually publishes it. This event triggers the AI domain to vectorize the content for R2-based search and RAG-assisted tutoring.
- **AI Tutoring**: Students engage in AI-tutored sessions. The system loads the course context and student history, invokes the Tutor Agent via Mastra, saves the interaction, and tracks token consumption for billing.

---

### CMS Domain — Marketing Officer / Content Manager
**Professional Persona**: The **Marketing Officer** drives content strategy. The **Content Manager** handles day-to-day creation, AI generation, and SEO.

**Flow Strategy**:
- **AI Content Workflow**: The Marketing Officer triggers generation based on a topic. The Supervisor coordinates generation, moderation, and SEO agents before the content is published and distributed to subscribers via the Communication bus.

---

### Communication Domain — Communications Officer / Admin Officer
**Professional Persona**: The **Communications Officer** orchestrates omni-channel messaging. The **Admin Officer** creates targeted broadcasts.

**Flow Strategy**:
- **Broadcast Notification**: The Admin selects a target audience and message. The Supervisor records the communication event, creates recipient records, and dispatches messages via push/SMS/email in a deferred background process.

---

### Library Domain — Librarian / Library Manager
**Professional Persona**: The **Librarian** manages daily circulation. The **Library Manager** oversees collection and finance integration.

**Flow Strategy**:
- **Circulation Flow**: The Librarian issues a book after validating availability. Returns are tracked, and overdue books trigger automated fine generation that is recorded in the student's finance ledger.

---

### Facilities Domain — Transport Director / Warden / Store Manager
**Professional Persona**: The **Transport Director** manages routes. The **Warden** oversees housing. The **Store Manager** handles inventory and sales.

**Flow Strategy**:
- **Allocation & Sales**: The Transport Director allocates students to routes, triggering recurring fee assignments. The Store Manager records inventory sales, ensuring stock levels are updated atomically and income is recorded in the general ledger.

---

### Documents Domain — Records Officer / Administrator
**Professional Persona**: The **Records Officer** manages document lifecycles.

**Flow Strategy**:
- **Secure Handling**: The Records Officer oversees the upload process (R2 presigned URLs), categorization, and verification. Documents are bound to users/tenants via polymorphic references, and verification status controls access in other domains.

---

### Homeschooling Domain — Parent Educator / Facilitator / Educator
**Professional Persona**: The **Parent Educator** manages child learning. The **Facilitator** earns revenue shares.

**Flow Strategy**:
- **Self-Directed Learning**: Parents subscribe to personalized paths. The system handles recurring billing and revenue distribution to facilitators based on student performance and retention metrics.

---

### Events (Audit) Domain — Compliance Officer / System Administrator
**Professional Persona**: The **Compliance Officer** monitors integrity.

**Flow Strategy**:
- **Audit Integrity**: The system background-relays pending events from the outbox to ensure reliable delivery and an immutable audit trail for compliance officers.

---

### PBAC Domain — Security Administrator / IT Director
**Professional Persona**: The **Security Administrator** designs access policies.

**Flow Strategy**:
- **Zero-Trust Access**: The Security Admin defines policies that are evaluated early at the gateway. Every request must pass PBAC evaluation against tenant-specific rules before service execution.

---

### Settings Domain — System Administrator / IT Director
**Professional Persona**: The **System Administrator** configures preferences.

**Flow Strategy**:
- **Dynamic Configuration**: Administrators update tenant settings, triggering feature flag activation and cache invalidation across all affected domain supervisors.

---

## 3. Cross-Domain Orchestration Patterns

### Pattern A: Event-Driven Decoupling (Primary)
```typescript
// Domain A: LMS
await eventBus.emit('lms.course_purchased', { tenantId, userId, courseId, price });

// Domain B: Finance (subscriber)
eventBus.on('lms.course_purchased', async (payload) => {
  await financeService.createLedgerEntry({
    tenantId: payload.tenantId, type: 'course_sale',
    amount: payload.price, referenceType: 'lms_enrollment', referenceId: payload.courseId,
  });
});
```

### Pattern B: Saga Orchestration (Multi-Step with Rollback)
```typescript
class EnrollmentSaga {
  async execute(tenantId: number, data: EnrollmentInput) {
    const enrollment = await lmsRepo.createEnrollment(tenantId, data);
    try {
      await financeRepo.createLedgerEntry(tenantId, {
        type: 'course_fee', amount: data.price,
        referenceType: 'enrollment', referenceId: enrollment.id,
      });
      await commService.sendEnrollmentConfirmation(enrollment);
    } catch (error) {
      await lmsRepo.cancelEnrollment(tenantId, enrollment.id); // Compensate
      throw new EnrollmentFailedError(error.message);
    }
  }
}
```

### Pattern C: CQRS (Read/Write Separation)
```typescript
// Command: Write to D1
await financeRepo.createLedgerEntry(tenantId, entry);
// Query: Read from KV-cached aggregation
const balanceSheet = await financeQueryService.getBalanceSheet(tenantId);
```

---

## 4. Error Boundary Strategy

```typescript
// Domain errors — thrown by Services
export class InsufficientBalanceError extends Error { name = 'InsufficientBalanceError' }
export class TenantNotFoundError extends Error { name = 'TenantNotFoundError' }

// Controller mapping via BaseController
try {
  const result = await financeSupervisor.processPayment(tenantId, data);
  return BaseController.sendSuccess(c, result, 'Payment processed', 201);
} catch (error) {
  return BaseController.handleError(c, error); // Unified mapping
}
```

---

## 5. Service Design Checklist

Before implementing any service method, verify:

- [ ] Does it receive repositories via constructor injection?
- [ ] Does every query include `tenantId` filtering?
- [ ] Does it throw domain errors (not HTTP status codes)?
- [ ] Does it emit domain events for cross-domain side effects?
- [ ] Does it use `db.batch()` for multi-row mutations?
- [ ] Does it defer non-critical work via `ctx.waitUntil()`?
- [ ] Is the corresponding Zod validator defined?
- [ ] Is the API route documented in `docs/domains/[module].md`?
- [ ] Is the sync handler registered in `frontend/src/lib/sync.ts`?
- [ ] Does the professional role map to a real-world workflow?

