# Human Resources & Payroll Domain Architecture

## Overview
The Human Resources (HR) domain in EdApex V2 manages the lifecycle of school employees, including recruitment metadata, department/designation assignments, leave management, and payroll execution. It is built on a "User-Persona" model, where HR attributes are decoupled from the core platform identity to allow for multi-role flexibility (e.g., a Staff member who is also a Parent).

### Key Business Logic
- **Staff vs Identity**: A `Staff` is a platform `User` with an associated `hr_account`. Personal data (name, email, password) lives in the Identity layer, while professional data (salary, joining date, qualification) lives in the HR layer.
- **Hierarchical Structure**: Staff are organized by `hrDepartments` and `hrDesignations`, which are used for both reporting and automated permission scoping.
- **Leave Lifecycle**: Leave types are defined per tenant. Leave requests follow a `pending -> approved/rejected` workflow, with approved leaves automatically impacting payroll deductions if they exceed the allocated balance.
- **Automated Ledger Integration**: Payroll runs, once approved and paid, emit domain events that the Finance domain consumes to record salary expenses in the universal ledger.

---

## Logic Parity (Legacy to V2)

### Schema Mapping
| Legacy Table (`schoolify`) | V2 Entity (`src/db/domain-hr.ts`) | Notes |
| :--- | :--- | :--- |
| `sm_staffs` | `users` (Identity) + `hr_metadata` | Personal info vs. professional metadata. |
| `sm_human_departments` | `hrDepartments` | Organizational grouping. |
| `sm_designations` | `hrDesignations` | Functional roles/titles. |
| `sm_leave_requests` | `hrLeaveRequests` | Workflow-based leave management. |
| `sm_leave_types` | `leaveTypes` | Configurable leave categories. |
| `sm_hr_payroll_generates`| `payrollRuns` | Snapshot of calculated monthly salary. |
| `sm_hr_salary_templates` | Integrated via `users.metadata` | Base salary and regular allowances. |
| `sm_staff_attendances` | `src/db/domain-attendance.ts` | Source for payroll triggers. |

### Critical Logic Parity
- **Multi-Tenancy**: The legacy `school_id` is replaced by a mandatory `tenantId` check on all HR entities.
- **User Linking**: Legacy `sm_staffs.user_id` is now the primary key link in V2. A staff record cannot exist without a corresponding `users` entry.
- **Status Mapping**: Legacy `active_status` is preserved to manage staff suspension/termination without deleting historical payroll data.

---

## Technical Implementation

### Core Entities

#### [HR Departments](file:///home/beznet/Workspace/edapex/src/db/domain-hr.ts#L34)
Defines the organizational units within a school (e.g., Mathematics, Administration).

#### [HR Designations](file:///home/beznet/Workspace/edapex/src/db/domain-hr.ts#L42)
Defines job titles (e.g., Senior Teacher, Principal).

#### [Payroll Runs](file:///home/beznet/Workspace/edapex/src/db/domain-hr.ts#L80)
The transactional heart of the HR domain.
> [!IMPORTANT]
> Payroll runs are snapshots. Once a run is marked as `paid`, it becomes immutable. Any corrections must happen in a subsequent month's adjustment.

#### [Leave Requests](file:///home/beznet/Workspace/edapex/src/db/domain-hr.ts#L61)
Tracks employee absences. Links to `leaveTypes` to enforce annual limits.

---

## Automated Payroll Recommendations

To ensure 100% accuracy and reduce administrative overhead, the V2 HMAS (`hr_supervisor`) implements automated payroll triggers:

### 1. Attendance-Driven Adjustments
- **Trigger**: The `attendance.month_closed` event.
- **Logic**: The `payroll_generator_agent` scans for "Unpaid Absent" days.
- **Calculation**: `Net Salary = Base + Allowances - (Unpaid Days * Per-Day Rate)`.

### 2. Leave Balance Reconciliation
- **Trigger**: Approved `hrLeaveRequests`.
- **Logic**: If an employee takes leaves beyond the `totalDays` defined in `leaveTypes`, the agent automatically flags the excess as "Unpaid" and queues a deduction for the next `payrollRun`.

### 3. Integrated Disbursement
- **Event**: `hr.payroll_approved`.
- **Consumer**: The Finance domain's `ledger_agent` automatically creates a `salary_payable` entry in the Universal Ledger.

---

## Security & PBAC

HR data contains sensitive PII (Bank info, Salary, Home address).
- **Access Control**: Only `SchoolAdmin` and specific `HRAgent` personas can view salary/bank metadata.
- **Self-Service**: Users (Staff) can read their own `payrollRuns` and `hrLeaveRequests` but cannot modify them once submitted.
- **Audit**: Every change to `basicSalary` or `netSalary` is logged with an `updatedBy` reference to ensure accountability.

---

## Hono API Routes

```
Routes → HrController → HrService → HrRepository
```

| Method | Route | Description | Auth |
|:---|:---|:---|:---|
| `GET` | `/api/v1/hr/departments` | List departments | Authenticated |
| `POST` | `/api/v1/hr/departments` | Create department | `TenantAdmin` |
| `GET` | `/api/v1/hr/designations` | List designations | Authenticated |
| `GET` | `/api/v1/hr/leave-types` | List leave types | Authenticated |
| `POST` | `/api/v1/hr/leave-requests` | Submit leave request | Staff |
| `PATCH` | `/api/v1/hr/leave-requests/:id` | Approve/reject leave | `TenantAdmin` |
| `POST` | `/api/v1/hr/payroll/generate` | Generate payroll run | `TenantAdmin` |
| `GET` | `/api/v1/hr/payroll` | List payroll runs | `TenantAdmin` |
| `GET` | `/api/v1/hr/payroll/my` | Get own payroll history | Staff |
| `PATCH` | `/api/v1/hr/payroll/:id/approve` | Approve payroll for payment | `TenantAdmin` |

---

## HMAS Agent Registry

| Agent | Type | Capabilities |
|:---|:---|:---|
| `hr_supervisor` | Supervisor | Routes HR tasks, policy enforcement |
| `payroll_generator` | Task | Auto-calculates salary, deductions, allowances |
| `leave_processor` | Task | Validates leave balance, auto-flag excess |
| `attendance_reconciler` | Task | Cross-references attendance for payroll |

---

## Domain Events

| Event | Payload | Consumers |
|:---|:---|:---|
| `hr.leave_approved` | `{ requestId, userId, leaveType, days }` | Attendance (mark excused), Events (audit) |
| `hr.payroll_approved` | `{ runId, tenantId, totalAmount }` | Finance (ledger salary entries) |
| `hr.payroll_disbursed` | `{ runId, disbursedAt }` | Communication (payslip notification), Events (audit) |
| `hr.staff_onboarded` | `{ userId, departmentId, designationId }` | PBAC (assign default role), Communication (welcome) |
