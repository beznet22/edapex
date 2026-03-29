# Attendance Domain Architecture

## 🎯 Domain Overview
The Attendance domain is responsible for tracking the presence, absence, and partial attendance of students and staff across daily sessions and specific academic subjects. In V2, this domain transitions from fragmented, role-specific tables to a unified, event-driven model optimized for high-performance retrieval and AI-driven monitoring.

## 🏛️ Architectural Evolution

### Legacy Mapping (InfixEdu)
| Feature | Legacy Table/Logic | V2 Implementation |
| :--- | :--- | :--- |
| **Student Attendance** | `sm_student_attendances` | `attendances` (actor_type: 'student') |
| **Staff Attendance** | `sm_staff_attendances` | `attendances` (actor_type: 'staff') |
| **Subject Attendance** | `sm_subject_attendances` | `attendances` (scope_type: 'subject') |
| **Bulk Storage** | `student_attendance_bulks` | Deprecated (Handled via Batch API) |
| **Holidays/Weekends**| `sm_holidays`, `sm_weekends` | `holidays` (Centralized) |

### Unified Schema Design
V2 utilizes a single `attendances` table to consolidate all tracking logic, reducing join complexity and enabling cross-persona analytics.

- **Status Normalization**: Legacy codes (`P`, `A`, `L`, `F`) are mapped to a strict `status` enum: `present`, `absent`, `late`, `half_day`, `excused`.
- **Relational Integrity**: Directly references `enrollments` for students and `users` for both staff and students, ensuring identity consistency.
- **Scoping**: `scope_type` allows for 'daily' (standard) or 'subject' (periodic) tracking within the same structure.

## 🤖 AI & Automation Layer

### Event-Driven Triggers
All attendance mutations emit `attendance.marked` or `attendance.updated` events to the `events` table for downstream processing.

### Anomaly Detection Agents
- **Mass Absenteeism Alert**: Triggers when absenteeism in a specific `class_id` or `section_id` exceeds a tenant-defined threshold (>20%), flagging potential health outbreaks or pedagogical issues.
- **Chronic Absenteeism Engine**: Monitors individual `userId` patterns over a rolling 30-day window to identify students at risk of dropout or staff requiring HR intervention.
- **Auto-Reconciliation Agent**: Cross-references approved `leave_requests` (HR/Student domains) to automatically transition `absent` records to `excused`.

## 🔒 Security & Performance
- **PBAC Enforcement**: Attendance marking is strictly limited to authorized staff (teachers for assigned classes, HR for staff).
- **Indexing Strategy**: 
  - `att_user_date_idx`: Optimized for individual "My Attendance" reports.
  - `att_tenant_date_idx`: Optimized for daily dashboard summaries and administrative oversight.
- **Data Locality**: `tenant_id` mandatory for all queries to ensure strict multi-tenant isolation.
