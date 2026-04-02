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
All attendance mutations emit `attendance.marked` or `attendance.updated` events to the `events` table for downstream processing. *Note: Live sessions in Domain 18 (Agentic Classroom) automatically emit `attendance.marked` events for students validated via `classroomParticipants`, eliminating manual roll-call.*

### Anomaly Detection Agents
- **Mass Absenteeism Alert**: Triggers when absenteeism in a specific `class_id` or `section_id` exceeds a tenant-defined threshold (>20%), flagging potential health outbreaks or pedagogical issues.
- **Chronic Absenteeism Engine**: Monitors individual `userId` patterns over a rolling 30-day window to identify students at risk of dropout or staff requiring HR intervention.
- **Auto-Reconciliation Agent**: Cross-references approved `leave_requests` (HR/Student domains) to automatically transition `absent` records to `excused`.

### Operational Tools (Mastra)
- `attendance.markAttendance(userId, status)`: Records attendance entry for student/staff.
- `attendance.bulkMark(classId, entries)`: Bulk attendance marking for a class.
- `attendance.verifyPresence(userId)`: Multi-signal presence verification (IoT, Wi-Fi, manual).
- `attendance.flagSecurityAnomaly(anomalyData)`: Flags suspicious entry/exit patterns.
- `attendance.updateAttendance(staffId, date, status)`: Records daily staff presence for payroll.
- `attendance.generateDailySummary(tenantId, date)`: Aggregates attendance stats for dashboard.

### [STRESS DEFENSE] Tools
- `multi_signal_presence_fusion`: Aggregates IoT, Wi-Fi, and manual signals to prevent proxy spoofing.
- `tardy_nurse_routing`: Correctly routes credit for students in medical or administrative transit.
- `offline_attendance_cache`: Local-first capture with conflict-aware async reconciliation.
- `spoof_detection_mesh`: Detects GPS/Wi-Fi spoofing and battery drain anomalies.
- `mass_absence_sub_trigger`: Auto-notifies HR/Substitution agent when absenteeism spikes.

## 🔒 Security & Performance
- **PBAC Enforcement**: Attendance marking is strictly limited to authorized staff (teachers for assigned classes, HR for staff).
- **Indexing Strategy**: 
  - `att_user_date_idx`: Optimized for individual "My Attendance" reports.
  - `att_tenant_date_idx`: Optimized for daily dashboard summaries and administrative oversight.
- **Data Locality**: `tenant_id` mandatory for all queries to ensure strict multi-tenant isolation.

---

## Hono API Routes

```
Routes → AttendanceController → AttendanceService → AttendanceRepository
```

| Method | Route | Description | Auth |
|:---|:---|:---|:---|
| `POST` | `/api/v1/attendance` | Mark attendance (single) | Teacher |
| `POST` | `/api/v1/attendance/bulk` | Bulk mark attendance | Teacher |
| `GET` | `/api/v1/attendance/daily` | Daily attendance summary | Teacher+ |
| `GET` | `/api/v1/attendance/user/:id` | Individual attendance report | Self + Teacher |
| `GET` | `/api/v1/attendance/analytics` | Tenant-wide analytics | `TenantAdmin` |
| `GET` | `/api/v1/holidays` | List holidays | Authenticated |
| `POST` | `/api/v1/holidays` | Create holiday | `TenantAdmin` |

---

## HMAS Agent Registry

| Agent | Type | Capabilities |
|:---|:---|:---|
| `attendance_monitor` | Task | Anomaly detection, chronic absenteeism alerts, spoof detection |
| `auto_reconciler` | Task | Cross-references leave requests and nurse logs |
| `biometric_validator` | Task | Multi-signal presence fusion and offline sync |

---

## Domain Events

| Event | Payload | Consumers |
|:---|:---|:---|
| `attendance.marked` | `{ userId, classId, status, date }` | AI (anomaly detection), Events (audit) |
| `attendance.anomaly_detected` | `{ classId, absentRate, threshold }` | Communication (alert admin), HR (substitute trigger) |
| `attendance.reconciled` | `{ userId, date, oldStatus, newStatus }` | Events (audit) |
| `attendance.sync_conflict` | `{ userId, date, deviceId }` | Core (device management) |
