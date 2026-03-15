# EdApex Target Domain Schema & Migration Strategy

## Goal
Redesign the legacy InfixEdu data layer (170+ MySQL tables in flat `sms-schema.ts`) into a **domain-layered, polymorphic, AI-ready** architecture — while maintaining the live system via incremental migration (Strangler Fig pattern).

> [!IMPORTANT]
> The new polymorphic schema (`edx_*`) resides in an isolated `edapex_v2` database. Identity and linkage are managed via a unified Account layer. Cross-database Foreign Keys link back to the legacy `devdb.users` table.

---

## 1. Core Architecture & Linkage
The system uses a unified identity model where multiple legacy roles are consolidated into a single polymorphic entity.

- **Linkage Rules**:
  1. **Identity**: `edx_accounts.user_id` -> `devdb.users.id`
  2. **Consolidation**: `sm_students`, `sm_parents`, and `sm_staffs` are merged into `edx_accounts` via `account_type`.
  3. **Metadata**: Role-specific fields (e.g., `admission_no`, `salary`, `qualification`) are stored in a typesafe JSON `metadata` column.

---

## 2. Domain Schemas

### 🏢 Core Domain (`domain-core.ts`)
- **`edx_accounts`**: Central account table. Links to `users.id`.
- **`edx_enumerations`**: Universal lookup table (replacing `sm_base_setups`).
- **`edx_account_documents`**: polymorphic document storage for specific accounts.
- **`edx_account_addresses`**: Unified address storage.

### 🎓 Academic Domain (`domain-academic.ts`)
- **`edx_classes` / `edx_sections`**: Core structure.
- **`edx_enrollments`**: Polymorphic linkage between `accounts` and `classes`. Replaces `student_records`.
- **`edx_subjects`**: Centralized subject definitions.
- **`edx_subject_assignments`**: Links staff accounts to subjects and sections.
- **`edx_class_routines`**: Scheduling system.
- **`edx_homeworks` / `edx_lessons`**: Academic content delivery.

### 📝 Assessment Domain (`domain-assessment.ts`)
- **`edx_exams` / `edx_exam_setups`**: Exam definitions and marking schemes.
- **`edx_exam_marks`**: Raw mark entries.
- **`edx_computed_results`**: Finalized results with total marks and GPA (linked to `accounts`).
- **`edx_grades`**: Grade scale definitions.

### 👥 HR Domain (`domain-hr.ts`)
- **`edx_departments` / `edx_designations`**: Organizational structure.
- **`edx_leave_requests`**: Staff leave management.
- **`edx_payroll_runs`**: Salary and deduction tracking.

### 💰 Finance Domain (`domain-finance.ts`)
- **`edx_ledger_entries`**: Universal double-entry-style ledger. Replaces disparate fee/expense tables.
- **`edx_fee_masters` / `edx_fee_types` / `edx_fee_groups`**: Fee structure definitions.
- **`edx_bank_accounts`**: Internal cash/bank tracking.

### 📅 Attendance Domain (`domain-attendance.ts`)
- **`edx_attendances`**: Universal table for both students and staff. Supports daily, subject, and term scopes.

### 🌐 CMS Domain (`domain-cms.ts`)
- **`edx_content_nodes`**: Polymorphic storage for news, pages, events, and testimonials.

### 📢 Communication Domain (`domain-communication.ts`)
- **`edx_communication_events`**: Centralized notifications, notices, and messages.

### 🏠 Facilities Domain (`domain-facilities.ts`)
- **`edx_dormitories` / `edx_rooms`**: Housing management.
- **`edx_routes` / `edx_vehicles`**: Transport management.
- **`edx_facility_allocations`**: Tracks who is assigned to which room or bus.

### 📚 Library Domain (`domain-library.ts`)
- **`edx_books` / `edx_book_issues`**: Library catalog and circulation.

### 🔐 PBAC Domain (`domain-pbac.ts`)
- **`edx_policy_definitions`**: Conditional access policies.
- **`edx_role_assignments`**: Scoped roles (e.g. "Teacher of Grade 4").

### ⚙️ Settings Domain (`domain-settings.ts`)
- **`edx_settings`**: Domain-grouped JSON configurations (replacing `sm_general_settings`).

### 🛠️ Infrastructure Layer
- **`edx_domain_events`**: Event log for system actions.
- **`edx_audit_log`**: Row-level change tracking (Old Values vs. New Values).
- **`edx_documents`**: General file storage tracking.

---

## 3. Implementation Status

### Phase 5: Data Migration (Backfill) - [COMPLETE]
Successfully migrated all 14 domains with >99% parity across core tables.
- **Accounts**: 1,398 records.
- **Enrollments**: 2,154 records.
- **Computed Results**: 44,456 records.
- **Subject Assignments**: 445 records.

### Phase 6: Shadow Writes (Shelved)
Reverted repository-level dual-writes to prioritize a clean independent audit.

---

## 4. Verification Plan

### Automated Verification
- Run `scripts/verify-migration.ts` to ensure row parity.
- Run `scripts/verify-fk.ts` (new) to check for broken relational links.

### Manual Verification
- Execute cross-database JOINs to verify that `edx_accounts` correctly maps to `devdb.users` names.
