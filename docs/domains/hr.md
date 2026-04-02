# Human Resources & Payroll Domain Architecture

## Overview
The HR domain decouples employee management, payroll, and leave tracking from the Core identity layer. It provides department/designation taxonomies, configurable leave policies, salary templates with earning/deduction components, payroll generation, and staff performance evaluations.

### Key Business Logic
- **Department/Designation**: Organizational hierarchy for staff personas.
- **Leave Management**: Configurable leave types with annual allowances. Request → Approval workflow.
- **Salary Templates**: JSON-based component definitions (`earning`/`deduction`) supporting percentage-of-basic calculations.
- **Payroll Runs**: Monthly generation with automated net salary calculation.
- **Staff Evaluations**: Criteria-based performance tracking with scoring and remarks.

---

## Logic Parity (Legacy to V2)

### Schema Mapping
| Legacy Table (`schoolify`) | V2 Entity (`src/db/domain-hr.ts`) | Notes |
| :--- | :--- | :--- |
| `sm_human_departments` | `hrDepartments` | Department definitions. |
| `sm_designations` | `hrDesignations` | Designation/title definitions. |
| `sm_leave_types` / `sm_leave_defines` | `leaveTypes` | Configurable leave categories with annual allowance. |
| `sm_leave_requests` / `sm_leave_deduction_infos` | `hrLeaveRequests` | Request → Approval workflow with approver tracking. |
| `sm_hr_salary_templates` | `salaryTemplates` | JSON components array replacing multiple legacy columns. |
| `sm_hr_payroll_generates` | `payrollRuns` | Monthly payroll with draft → approved → disbursed lifecycle. |
| — (new) | `staffEvaluations` | Criteria-based performance evaluations. |

---

## Technical Implementation

### Core Entities

#### [HrDepartments / HrDesignations](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-hr.ts#L22)
Organizational taxonomy for staff personas. Referenced by `StaffMetadata.departmentId` in Core domain.

#### [LeaveTypes](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-hr.ts#L39)
Configurable leave categories (medical, casual, maternity) with annual day allowances.

#### [HrLeaveRequests](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-hr.ts#L49)
Leave request lifecycle: `pending` → `approved`/`rejected`. Tracks approver and date ranges.

#### [SalaryTemplates](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-hr.ts#L76)
JSON `components` array of `SalaryComponent` objects with name, type (`earning`/`deduction`), amount, and percentage flag.

#### [PayrollRuns](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-hr.ts#L87)
Monthly payroll: `draft` → `approved` → `disbursed` → `cancelled`. Tracks basic, earnings, deductions, net.

#### [StaffEvaluations](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-hr.ts#L115)
Performance evaluations with criteria-based scoring and evaluator tracking.

---

## AI Task Agents & Tools

### Operational Tools (Mastra)
- `hr.getStaffDetails(staffId)`: Fetches contract, role, and salary data.
- `hr.updateAttendance(staffId, date, status)`: Records daily presence for payroll calculation.
- `hr.initiateOnboarding(staffData)`: Creates skeleton record and assigns initial PBAC roles.
- `hr.generateLeaveReport()`: Summarizes staff availability for Supervisor planning.
- `hr.hireStaff(staffData)`: Registrar for new staff profiles.
- `hr.terminateStaff(staffId)`: Offboarding workflow and access revocation.
- `compliance.auditAttendanceRecords(date)`: Scans for missing entries required by law.
- `compliance.generateNERDCReport()`: Aggregates school-wide metrics into prescribed format.
- `compliance.checkSafetyPolicy(policyId)`: Verifies facility maintenance logs.
- `generate_payroll`: Auto-generates monthly payroll runs from salary templates.
- `calculate_leave_balance`: Computes remaining leave days per type per staff member.

### [STRESS DEFENSE] Tools
- `rapid_sub_assigner`: Emergency substitute teacher assignment during mass absenteeism.
- `role_data_boundary_enforcer`: Prevents cross-department data access violations.
- `disciplinary_version_control`: Manages concurrent edits to disciplinary records.
- `performance_bias_detector`: Flags statistical anomalies in evaluation scoring patterns.
- `termination_safety_check`: Multi-step validation before irreversible termination actions.
- `payroll_double_run_guard`: Prevents duplicate payroll generation for the same period.
- `leave_overlap_detector`: Detects conflicting leave requests for same date ranges.
- `salary_component_integrity_checker`: Validates component math (earnings - deductions = net).

---

## PBAC & Security
- **TenantAdmin**: Full HR access.
- **HR Manager**: Department/payroll management.
- **Staff**: Can submit leave requests and view own payroll/evaluations.
- **Payroll Data**: Restricted to HR Manager + TenantAdmin only.

---

## Hono API Routes

| Method | Route | Description | Auth |
|:---|:---|:---|:---|
| `GET` | `/api/v1/hr/departments` | List departments | Authenticated |
| `GET` | `/api/v1/hr/designations` | List designations | Authenticated |
| `GET` | `/api/v1/hr/leave-types` | List leave types | Staff+ |
| `POST` | `/api/v1/hr/leave-requests` | Submit leave request | Staff |
| `GET` | `/api/v1/hr/leave-requests` | List leave requests | Self + HR Manager |
| `PATCH` | `/api/v1/hr/leave-requests/:id` | Approve/reject leave | HR Manager |
| `GET` | `/api/v1/hr/payroll` | List payroll runs | HR Manager |
| `POST` | `/api/v1/hr/payroll/generate` | Generate payroll | HR Manager |
| `GET` | `/api/v1/hr/evaluations/:userId` | Get staff evaluations | Self + HR Manager |

---

## HMAS Agent Registry

| Agent | Type | Capabilities |
|:---|:---|:---|
| `hr_supervisor` | Supervisor | Leave policy enforcement, payroll oversight |
| `payroll_calculator` | Task | Salary template application, net computation |
| `leave_manager` | Task | Balance tracking, conflict detection, auto-reconciliation |
| `evaluation_analyst` | Task | Scoring aggregation, bias detection |

---

## Domain Events

| Event | Payload | Consumers |
|:---|:---|:---|
| `hr.leave_approved` | `{ requestId, userId, dates }` | Attendance (auto-reconcile), Communication (notify) |
| `hr.payroll_disbursed` | `{ payrollId, userId, netSalary }` | Finance (ledger entry), Communication (payslip) |
| `hr.evaluation_completed` | `{ evaluationId, userId, score }` | Events (audit) |
| `hr.leave_balance_exhausted` | `{ userId, leaveType }` | Communication (alert), HR (supervisor) |
