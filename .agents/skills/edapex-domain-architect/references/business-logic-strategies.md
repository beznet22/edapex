# Business Logic & Code Flow Strategies

As the **AI-Driven Domain Architect** for EdApex, you must design and enforce professional code flow strategies across ALL domains of the platform. This document defines the canonical patterns for service-layer orchestration, cross-domain communication, and end-to-end feature implementation.

You operate as a **Professional Skilled Agent** who understands the real-world roles of educators, administrators, accountants, finance officers, communications officers, HR officers, marketing officers, IT directors, AI operations managers, and operational staff. Every code flow must map to a real-world professional workflow.

---

## 1. The Canonical Code Flow (Request Lifecycle)

Every feature in EdApex follows this strict, unidirectional flow:

```
Client (TanStack DB) → Edge API (Hono) → Middleware (Auth/PBAC) → Controller → Validator (Zod) → Service → Repository → Database (D1)
                                                                                                        ↓
                                                                                                  Domain Events
                                                                                                        ↓
                                                                                              Subscribing Services
```

### Layer Responsibilities

| Layer | Responsibility | MUST NOT |
|:---|:---|:---|
| **Controller** | HTTP envelope, parameter extraction, response formatting | Contain business logic, import Drizzle |
| **Validator** | Zod schema parsing, payload sanitization | Make database calls |
| **Service** | Business rules, orchestration, event emission | Import `Context`, return HTTP status codes |
| **Repository** | Data access, query construction, row mapping | Throw HTTP errors, contain business rules |
| **Database** | Schema definition, migrations | Be imported by services directly |

---

## 2. Professional Role-Based Code Flow Strategies

Each domain maps to real-world professional roles. The agent MUST embody the professional persona when designing features — think as the **Accountant** when building Finance flows, as the **HR Officer** when building payroll, as the **IT Director** when provisioning tenants.

---

### Core Domain — IT Director / System Administrator
**Professional Persona**: The **IT Director** oversees platform identity, tenant provisioning, session control, and user lifecycle management. They are the gatekeeper of the entire multi-tenant infrastructure.

```
[Tenant Provisioning]
IT Director → CoreController.createTenant → CoreValidator → CoreService.provisionTenant()
  → CoreRepository.createTenant()
  → SettingsRepository.seedDefaultConfig(tenantId)
  → emit('core.tenant_provisioned')
  → [PBAC subscribes] → PbacService.createDefaultPolicies()
  → [Settings subscribes] → SettingsService.seedFeatureFlags()

[User Onboarding]
IT Director → CoreController.createUser → CoreValidator → CoreService.provisionAccount()
  → CoreRepository.createAccount()
  → CoreRepository.createUserPersona(userType)
  → emit('core.user_created')
  → [PBAC subscribes] → PbacService.assignDefaultRole()
  → [Communication subscribes] → CommService.sendWelcome()
```

---

### Academic Domain — Curriculum Coordinator / Vice Principal / Registrar
**Professional Persona**: The **Curriculum Coordinator** designs class structures, maps subjects to teachers, and builds timetables. The **Vice Principal** approves scheduling. The **Registrar** manages student enrollment into academic groups.

```
[Class-Section Setup]
Curriculum Coordinator → AcademicController.createClass → AcademicValidator
  → AcademicService.setupClass()
  → AcademicRepository.createClass(tenantId, academicId)
  → AcademicRepository.createClassSections(classId, sectionIds)  [via db.batch()]

[Timetable Generation]
Vice Principal → AcademicController.createRoutine → AcademicValidator
  → AcademicService.generateRoutine()
  → AcademicRepository.validateCollision(teacher, room, timeSlot)
  → AcademicRepository.createRoutineEntry()
  → emit('academic.routine_updated')
  → [Communication subscribes] → CommService.notifyTeachers()

[Student Enrollment]
Registrar → AcademicController.enrollStudent → AcademicValidator
  → AcademicService.enrollStudent()
  → AcademicRepository.createEnrollment(tenantId, classId, sectionId, userId)
  → emit('academic.student_enrolled')
  → [Attendance subscribes] → AttendanceService.initRecords()
  → [Finance subscribes] → FinanceService.assignFees()
```

---

### Assessment Domain — Examinations Officer / Head of Department / Subject Teacher
**Professional Persona**: The **Examinations Officer** defines exam structures and triggers result computation. The **Head of Department** oversees quality. The **Subject Teacher** captures marks for their assigned classes.

```
[Exam Configuration]
Exams Officer → AssessmentController.createExam → AssessmentValidator
  → AssessmentService.defineExam()
  → AssessmentRepository.createExam(tenantId, examType, academicId)
  → AssessmentRepository.createExamSetups(examId, subjects, markDistribution)

[Mark Submission]
Subject Teacher → AssessmentController.submitMarks → AssessmentValidator
  → AssessmentService.submitMarks()
  → AssessmentRepository.upsertExamMarks(tenantId, setupId, marks)  [via db.batch()]
  → emit('assessment.marks_uploaded')
  → [AI subscribes] → ResultEngine.compute()

[Result Computation]
Exams Officer → AssessmentController.computeResults → AssessmentValidator
  → AssessmentService.computeResults()
  → AssessmentRepository.aggregateMarks(examId, classId)
  → AssessmentRepository.createComputedResults(rankings, gpas)  [via db.batch()]
  → emit('assessment.result_calculated')
  → [Communication subscribes] → CommService.publishReportCards()
```

---

### Finance Domain — School Accountant / Bursar / Finance Officer
**Professional Persona**: The **School Accountant** manages the universal ledger and financial reporting. The **Bursar** handles daily fee collection and receipt issuance. The **Finance Officer** approves disbursements and reconciles bank balances.

```
[Fee Assignment]
Bursar → FinanceController.assignFees → FinanceValidator
  → FinanceService.assignFeesToStudents()
  → FinanceRepository.createFeeAssignments(tenantId, group, students)  [via db.batch()]
  → FinanceRepository.createInstallments(assignments)  [optional]

[Fee Payment Recording]
Bursar → FinanceController.recordPayment → FinanceValidator
  → FinanceService.recordPayment()
  → FinanceRepository.createLedgerEntry(type: 'fee_payment')
  → FinanceRepository.updateFeeAssignment(paidAmount)
  → FinanceRepository.updateBankBalance()  [via db.batch()]
  → emit('finance.payment_received')
  → [Communication subscribes] → CommService.sendReceipt()

[Balance Sheet Report]
Bursar → FinanceController.getBalanceSheet → (no validator needed for GET)
  → FinanceService.generateBalanceSheet(tenantId, dateRange)
  → FinanceRepository.aggregateLedgerEntries(tenantId, dateRange)
```

> [!IMPORTANT]
> All financial mutations MUST result in a `ledger_entries` record. Direct balance manipulation is prohibited. The ledger is the single source of truth.

---

### AI Domain — AI Operations Manager
**Professional Persona**: The **AI Operations Manager** oversees conversational AI quality, agent orchestration via the HMAS hierarchy, token budget allocation, and model provider selection (Workers AI vs OpenAI).

```
[Chat Interaction — Stateless Execution]
Student/Teacher → AiController.sendMessage → AiValidator
  → AiService.processMessage()
  → AiRepository.getMessages(chatId)           // Load history
  → AiRepository.getChatMetadata(chatId)        // Load working memory
  → mapToStandardPayload(dbMessages)            // Transform for LLM
  → agent.generate(standardMessages)            // Stateless invocation
  → AiRepository.saveMessage(chatId, response)  // Persist response
  → AiRepository.logAgentAction(actionId)       // Audit trail
  → ctx.waitUntil(tokenBudgetService.track())   // Deferred billing
```

---

### HR Domain — HR Officer / HR Manager / Finance Officer
**Professional Persona**: The **HR Officer** handles day-to-day staff operations (onboarding, leave requests). The **HR Manager** approves leave and manages departmental assignments. The **Finance Officer** executes payroll runs and coordinates salary ledger entries.

```
[Staff Onboarding]
HR Manager → HrController.onboardStaff → HrValidator
  → HrService.onboardStaff()
  → CoreRepository.createUserPersona(userType: 'staff', metadata: StaffMetadata)
  → HrRepository.assignDepartment(userId, departmentId)
  → HrRepository.assignDesignation(userId, designationId)
  → emit('hr.staff_onboarded')
  → [PBAC subscribes] → PbacService.assignTeacherRole()

[Leave Management]
Staff Member → HrController.requestLeave → HrValidator
  → HrService.submitLeaveRequest()
  → HrRepository.checkLeaveBalance(userId, leaveTypeId)
  → HrRepository.createLeaveRequest(status: 'pending')

HR Manager → HrController.approveLeave → HrValidator
  → HrService.approveLeave()
  → HrRepository.updateLeaveRequest(status: 'approved')
  → emit('hr.leave_approved')
  → [Attendance subscribes] → AttendanceService.markExcused()

[Payroll Processing]
Finance Officer → HrController.generatePayroll → HrValidator
  → HrService.generatePayroll()
  → HrRepository.getActiveStaff(tenantId)
  → HrRepository.calculateSalaries(staff, attendance, deductions)
  → HrRepository.createPayrollRecords()  [via db.batch()]
  → emit('hr.payroll_approved')
  → [Finance subscribes] → FinanceService.createSalaryLedgerEntries()
  → ctx.waitUntil(commService.sendPayslips())
```

---

### Attendance Domain — Class Teacher / Form Teacher
**Professional Persona**: The **Class Teacher** records daily attendance for their assigned class. The **Form Teacher** monitors long-term patterns and escalates chronic absenteeism to parents and administration via AI-driven anomaly detection.

```
[Daily Attendance Marking]
Class Teacher → AttendanceController.bulkMark → AttendanceValidator
  → AttendanceService.markBulkAttendance()
  → AttendanceRepository.upsertAttendance(tenantId, classId, date, records)  [via db.batch()]
  → emit('attendance.marked')
  → [AI subscribes] → AnomalyDetector.analyze()

[Chronic Absenteeism Check]
[Event-Driven] → AttendanceService.checkChronicAbsenteeism()
  → AttendanceRepository.getAbsenteeismStats(userId, 30days)
  → emit('attendance.anomaly_detected')
  → [Communication subscribes] → CommService.alertParent()
```

---

### LMS Domain — Course Instructor / E-Learning Coordinator / Educator
**Professional Persona**: The **Course Instructor** creates and publishes courses with modular lessons. The **E-Learning Coordinator** manages platform-wide LMS settings and analytics. The **Educator** facilitates AI-tutored learning sessions and grades submissions.

```
[Course Creation & Publishing]
Instructor → LmsController.createCourse → LmsValidator
  → LmsService.createCourse()
  → LmsRepository.createCourse(tenantId, courseData)
  → LmsRepository.createModules(courseId, modules)
  → LmsRepository.createLessons(moduleId, lessons)  [via db.batch()]

Instructor → LmsController.publishCourse → LmsValidator
  → LmsService.publishCourse(courseId)
  → LmsRepository.updateCourseStatus(courseId, 'published')
  → emit('lms.course_published')
  → [AI subscribes] → RAGIndexer.vectorizeLessons()

[AI Tutoring Session]
Student → LmsController.startTutoring → LmsValidator
  → LmsService.startTutoringSession()
  → LmsRepository.createTutoringSession(userId, courseId)
  → TutorAgent.generate(courseContext, studentQuestion)
  → LmsRepository.saveTutoringResponse()
  → emit('lms.tutoring_completed')
  → [Finance subscribes] → FinanceService.trackTokenUsage()
```

---

### CMS Domain — Marketing Officer / Content Manager
**Professional Persona**: The **Marketing Officer** drives the school's public-facing content strategy — news, events, and branding. The **Content Manager** handles day-to-day content creation, AI-assisted article generation, moderation, and SEO optimization.

```
[AI Content Generation & Publishing]
Marketing Officer → CmsController.generateContent → CmsValidator
  → CmsService.generateContent()
  → ContentGeneratorAgent.create(topic, tone, tenantBranding)
  → CmsRepository.createContentNode(type: 'news', status: 'draft')
  → ContentModeratorAgent.scan(contentId)
  → SeoOptimizerAgent.enhance(contentId)
  → CmsRepository.publishContent(contentId)
  → emit('cms.content_published')
  → [Communication subscribes] → CommService.notifySubscribers()
```

---

### Communication Domain — Communications Officer / Admin Officer
**Professional Persona**: The **Communications Officer** orchestrates omni-channel messaging (Push, SMS, Email) and manages notification templates. The **Admin Officer** creates and targets broadcasts to specific roles, classes, or departments.

```
[Broadcast Notification]
Admin → CommunicationController.broadcast → CommunicationValidator
  → CommunicationService.broadcast()
  → CommunicationRepository.createEvent(channel, targetRoles)
  → CommunicationRepository.createRecipients(userIds)  [via db.batch()]
  → ctx.waitUntil(pushService.dispatch(recipients))
  → emit('comm.event_dispatched')
```

---

### Library Domain — Librarian / Library Manager
**Professional Persona**: The **Librarian** manages daily circulation (issuance, returns, fine tracking). The **Library Manager** oversees collection development, stock auditing, and integration with the Finance domain for fine ledger entries.

```
[Book Issuance]
Librarian → LibraryController.issueBook → LibraryValidator
  → LibraryService.issueBook()
  → LibraryRepository.checkAvailability(bookId)
  → LibraryRepository.createBookIssue(userId, bookId, dueDate)
  → LibraryRepository.decrementStock(bookId)  [via db.batch()]
  → emit('library.book_issued')

[Overdue Fine Trigger]
[Scheduled Event] → LibraryService.checkOverdueBooks()
  → LibraryRepository.getOverdueIssues(tenantId)
  → LibraryRepository.calculateFines(issues)
  → emit('library.book_overdue')
  → [Finance subscribes] → FinanceService.createFineLedgerEntry()
  → [Communication subscribes] → CommService.sendOverdueReminder()
```

---

### Facilities Domain — Transport Director / Warden / Store Manager
**Professional Persona**: The **Transport Director** manages fleet routes and vehicle allocation. The **Warden** oversees dormitory occupancy and student housing. The **Store Manager** handles inventory procurement, sales, and internal issuance with Finance domain integration.

```
[Transport Allocation]
Transport Director → FacilitiesController.allocateTransport → FacilitiesValidator
  → FacilitiesService.allocateTransport()
  → FacilitiesRepository.createAllocation(facilityType: 'TRANSPORT', userId, routeId)
  → emit('facilities.allocation_created')
  → [Finance subscribes] → FinanceService.assignTransportFee()

[Inventory Transaction]
Store Manager → FacilitiesController.recordTransaction → FacilitiesValidator
  → FacilitiesService.recordInventoryTransaction()
  → FacilitiesRepository.createTransaction(type: 'SELL', items)
  → FacilitiesRepository.updateStock(itemId, newQuantity)  [via db.batch()]
  → emit('facilities.inventory_sold')
  → [Finance subscribes] → FinanceService.createIncomeLedgerEntry()
```

---

### Documents Domain — Records Officer / Administrator
**Professional Persona**: The **Records Officer** manages the document lifecycle — upload, categorization, verification, and archival. All documents use polymorphic ownership (`owner_type/owner_id`) and R2 presigned URLs for secure cloud storage.

```
[Document Upload & Verification]
Records Officer → DocumentsController.presign → (get upload URL)
Student/Staff → [Direct R2 Upload] → DocumentsController.create → DocumentsValidator
  → DocumentsService.registerDocument()
  → DocumentsRepository.createDocument(ownerType, ownerId, filePath)
  → emit('docs.uploaded')
  → [AI subscribes] → DocumentClassifier.categorize()

Admin → DocumentsController.verify → DocumentsValidator
  → DocumentsService.verifyDocument()
  → DocumentsRepository.updateVerification(documentId, verifiedBy)
  → emit('docs.verified')
```

---

### Homeschooling Domain — Parent Educator / Facilitator / Educator
**Professional Persona**: The **Parent Educator** manages their child's personalized learning path and compliance portfolio. The **Facilitator** is a TRCN-certified tutor compensated via revenue sharing. The **Educator** designs NERDC-compliant curriculum with AI-assisted lesson planning.

```
[Subscription & Enrollment]
Parent → HomeschoolController.subscribe → HomeschoolValidator
  → HomeschoolService.createSubscription()
  → HomeschoolRepository.createSubscription(tenantId, plan, academicId)
  → emit('homeschool.subscription_created')
  → [Finance subscribes] → FinanceService.createSubscriptionInvoice()

[Revenue Share Calculation]
[Scheduled/Background] → HomeschoolService.calculateRevenueShares()
  → HomeschoolRepository.getActiveFacilitators(tenantId)
  → HomeschoolRepository.computePerformanceBonuses(retentionMetrics)
  → HomeschoolRepository.createRevenueShares()  [via db.batch()]
  → emit('homeschool.revenue_distributed')
  → [Finance subscribes] → FinanceService.createRevenueShareLedgerEntries()
```

---

### Events (Audit) Domain — Compliance Officer / System Administrator
**Professional Persona**: The **Compliance Officer** monitors the event bus for anomalous patterns and ensures audit trail integrity. The **System Administrator** manages event relay, dispatch retries, and outbox lifecycle.

```
[Event Relay & Dispatch]
[Background Agent] → EventsService.relayPendingEvents()
  → EventsRepository.getPendingEvents(limit: 100)
  → eventBus.publishBatch(events)
  → EventsRepository.markAsDispatched(eventIds)  [via db.batch()]
```

---

### PBAC Domain — Security Administrator / IT Director
**Professional Persona**: The **Security Administrator** designs fine-grained access policies using the PBAC DSL. The **IT Director** oversees policy bindings to roles and ensures tenant-level isolation of all authorization decisions.

```
[Policy Creation]
Security Admin → PbacController.createPolicy → PbacValidator
  → PbacService.createPolicy()
  → PbacRepository.createPolicyDefinition(tenantId, definition)

[Access Evaluation — Middleware]
[Every Request] → PbacMiddleware.evaluate()
  → PbacService.evaluate(subjectContext, action, resource)
  → PbacRepository.getActivePolicies(tenantId, roleName)
  → PolicyEvaluator.match(policies, context)
  → allow | deny
```

---

### Settings Domain — System Administrator / IT Director
**Professional Persona**: The **System Administrator** configures tenant preferences, manages feature flags, and controls module activation. The **IT Director** manages system-wide defaults and configuration hierarchy (global → tenant override).

```
[Configuration Update]
Admin → SettingsController.upsertConfig → SettingsValidator
  → SettingsService.upsertConfig()
  → SettingsRepository.upsert(tenantId, domain, config)
  → emit('settings.config_updated')
  → [Affected Domains] → cacheInvalidation()
```

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
export class InsufficientBalanceError extends Error { /* ... */ }
export class TenantNotFoundError extends Error { /* ... */ }
export class ExamMarkExceedsMaxError extends Error { /* ... */ }

// Controller mapping — never expose raw errors
try {
  const result = await financeService.processPayment(tenantId, data);
  return BaseController.sendSuccess(c, result, 'Payment processed', 201);
} catch (error) {
  if (error instanceof InsufficientBalanceError) return BaseController.sendError(c, 'Insufficient funds', 402);
  if (error instanceof TenantNotFoundError) return BaseController.sendError(c, 'Tenant not found', 404);
  return BaseController.sendError(c, 'An unexpected error occurred', 500);
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
