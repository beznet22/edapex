# Academic Domain Architecture

## Overview
The Academic domain manages the core educational structure of the school, including Class levels, Sections, Subjects, and the Class Routine (Timetable). It ensures that students are correctly enrolled into specific academic groups and that teachers and rooms are optimally scheduled without conflicts.

### Key Business Logic
- **Class-Section Relationship**: Classes are high-level groupings (e.g., Grade 10). Sections are physical or logical sub-groups (e.g., Section A, Section B). Every class must have at least one section.
- **Subject Assignment**: Subjects are linked to Class-Sections rather than just Classes. This allows different sections of the same grade to have different teachers or even elective subjects.
- **Routine Management**: Routines are built based on Time Slots (Periods). A routine entry must specify Class, Section, Subject, Teacher, Room, and Day.
- **[NEW] Professional Persona Flow (The Academic Director)**: Dr. Mensah, the Academic Director, uses the Command Center to resolve a "6 AM Substitution Crisis." He interacts with the `substitution_agent` to find coverage for 5 sick teachers while maintaining prerequisite chain integrity. He uses the `schedule_coordinator` to simulate a "Hard-Stop Optimization" that priorities core subjects during a hall-splitting event. All his overrides are logged in `aiActivityLogs` and verified via Boneyard skeletons before the morning bell.

---

## Logic Parity (Legacy to V2)

### Schema Mapping
| Legacy Table (`schoolify`) | V2 Entity (`src/db/domain-academic.ts`) | Notes |
| :--- | :--- | :--- |
| `sm_classes` | `classes` | Main class/grade level entity. |
| `sm_sections` | `sections` | Section definitions available to the school. |
| `sm_class_sections` | `classSections` | Junction table mapping sections to classes per academic year. |
| `sm_subjects` | `subjects` | Subjects with code and type (Theory/Practical). |
| `sm_assign_subjects` | `subjectAssignments` | Links Class-Section to Subjects and Teachers. |
| `sm_class_routines` | `classRoutines` | Weekly scheduling of subjects. |
| `sm_academic_years` | `academicYears` | Cross-domain multi-year support. |
| — (new) | `aiSessions` | [GOVERNANCE] Linked conversation lineage for scheduling intent. |
| — (new) | `aiTasks` | [GOVERNANCE] Atomic checkout of routine optimization tasks. |
| — (new) | `aiGoals` | [GOVERNANCE] Alignment with term-level academic goals. |

### Critical Logic parity
- **Partitioning**: In Legacy, `school_id` and `academic_id` were columns in every table. V2 enforces `tenantId` (partition) and `academicId` across all entities to ensure strict multi-tenancy and historical data isolation.
- **Junction Enforcement**: Legacy `SmClassController` managed `SmClassSection` manually during class creation. V2 uses the `classSections` junction table to maintain this relationship, enabling a class to have many sections and a section name (like "A") to be reused across classes.

---

## Technical Implementation

### Core Entities

#### [Classes](file:///home/beznet/Workspace/edapex/src/db/domain-academic.ts#L11)
Defines the grade levels. Includes `passMark` logic carried over from legacy.

#### [Sections](file:///home/beznet/Workspace/edapex/src/db/domain-academic.ts#L30)
Defines available section names. These are globally defined per tenant but mapped specifically via junction.

#### [ClassSections](file:///home/beznet/Workspace/edapex/src/db/domain-academic.ts#L48)
The critical junction table. 
> [!IMPORTANT]
> All routines and enrollments MUST reference `class_id` and `section_id` in tandem to maintain integrity.

#### [Subjects](file:///home/beznet/Workspace/edapex/src/db/domain-academic.ts#L70)
Supports `subjectType` (theory/practical) and `subjectCode`.

#### [ClassRoutines](file:///home/beznet/Workspace/edapex/src/db/domain-academic.ts#L106)
Calculates weekly schedule. Currently uses `dayOfWeek` enum and raw start/end times. *Note: In EdApex V2, active routine slots are what dynamically instantiate the live `classroomSessions` (Domain 18) for real-time edge execution.*

---

## AI Task Agents & Tools

### Agents
- **Academic Architect**: Handles the setup of classes, sections, and subject mappings.
- **Schedule Coordinator**: Specialized in routine generation and conflict resolution.

### Operational Tools (Mastra)
- `registrar.enrollStudent(studentData)`: Validates structural compliance before Drizzle insert.
- `registrar.searchStudents(query, filter)`: High-performance search with `tenant_id` filter.
- `registrar.updateProfile(studentId, data)`: Updates student academic profile.
- `registrar.verifyTranscript(studentId)`: Cross-references Assessment domain records.
- `registrar.archiveRecord(recordId)`: Moves completed student files to long-term R2 storage.
- `academic.getCurriculum(subjectId)`: Retrieves the current curriculum for a subject.
- `academic.assignTeacher(classId, teacherId)`: Maps staff to courses in the LMS domain.
- `academic.auditLessonPlan(planId)`: Compares plan vs curriculum for alignment.
- `academic.validateResource(resourceId)`: Ensures textbook/media alignment with school policy.
- `academic.createLessonPlan(subjectId, data)`: Generates a new lesson plan.
- `validate_routine_collision`: Checks if a Teacher or Room is already occupied at a specific time.
- `sync_class_section_logic`: Ensures that when a section is removed from a class, all associated routines and enrollments are handled.

### [STRESS DEFENSE] Tools
- `constraint_prioritizer`: Hall-splitting and core-subject prioritization during schedule collisions.
- `hard_stop_optimizer`: Bounded optimization loop preventing CPU/RAM exhaustion from recursive scheduling.
- `temporal_academic_state_sync`: Handles mid-term withdrawals and data resurrection.
- `substitution_routing_engine`: 6 AM mass absenteeism workflow and emergency coverage.
- `memory_validation_gate`: Prevents premature "graduated" flag poison in agent memory.
- `academic_diff_audit`: Audits track-jumping and prerequisite chain integrity.

---

## PBAC & Security
Access to academic resources is governed by the `tenantId` partition.
- **SuperAdmin**: Full control over academic structure across all tenants.
- **SchoolAdmin**: Manages classes, sections, and routines within their tenant.
- **Teacher**: Read-access to routines; may have edit access to their assigned subjects/routines if permitted.
- **Student/Parent**: Read-only access to their specific class routines and subjects.

---

## Flexibility Recommendations (Future Proofing)

### 1. Dedicated `class_periods` Table
Instead of storing `startTime` and `endTime` as strings in `class_routines`, introduce a normalization layer:
```typescript
export const classPeriods = mysqlTable("class_periods", {
  id: int("id").primaryKey(),
  tenantId: int("tenant_id").notNull(),
  periodName: varchar("period_name", { length: 50 }), // e.g., "1st Period"
  startTime: time("start_time"),
  endTime: time("end_time"),
  isBreak: boolean("is_break").default(false),
  academicId: int("academic_id").notNull(),
});
```
This allows for "Shift-based" routines or varying times per day (e.g., Short Periods on Fridays).

### 2. Academic Calendar Integration
Replace the `dayOfWeek` enum with a reference to an `academic_calendar_days` table to support holiday-aware scheduling and custom weekend configurations (e.g., specific Saturdays being working days).

---

## Hono API Routes

```
Routes → AcademicController → AcademicService → AcademicRepository
```

| Method | Route | Description | Auth |
|:---|:---|:---|:---|
| `GET` | `/api/v1/classes` | List classes for academic year | Authenticated |
| `POST` | `/api/v1/classes` | Create class | `TenantAdmin` |
| `GET` | `/api/v1/sections` | List sections | Authenticated |
| `GET` | `/api/v1/class-sections` | List class-section junctions | Authenticated |
| `GET` | `/api/v1/subjects` | List subjects | Authenticated |
| `POST` | `/api/v1/subject-assignments` | Assign teacher to subject | `TenantAdmin` |
| `GET` | `/api/v1/routines` | Get class routines | Authenticated |
| `POST` | `/api/v1/routines` | Create routine entry | `TenantAdmin` |
| `GET` | `/api/v1/enrollments` | List enrollments | `TenantAdmin` |
| `POST` | `/api/v1/enrollments` | Enroll student | `TenantAdmin` |

---

## HMAS Agent Registry

| Agent | Type | Capabilities | Link |
|:---|:---|:---|:---|
| `academic_architect` | Task | Class/section setup, subject mapping, structural metadata | [SOUL.md](../strategy/SOUL.md) |
| `schedule_coordinator` | Task | Routine generation, collision detection, constraint prioritization | [SOUL.md](../strategy/SOUL.md) |
| `enrollment_manager` | Task | Bulk enrollment, promotion processing, state resurrection | [SOUL.md](../strategy/SOUL.md) |
| `substitution_agent` | Task | Emergency routing for staff absenteeism | [SOUL.md](../strategy/SOUL.md) |

---

## Domain Events

| Event | Payload | Consumers |
|:---|:---|:---|
| `academic.student_enrolled` | `{ userId, classId, sectionId, academicId }` | Attendance (init records), Finance (assign fees) |
| `academic.routine_updated` | `{ classId, sectionId, academicId }` | Communication (notify teachers) |
| `academic.student_promoted` | `{ userId, fromClassId, toClassId }` | Events (audit), Finance (adjust fees) |

---

## UI Documentation (Boneyard)
- **Timetable/Routine Builder**: The routine editor MUST utilize `boneyard-js` skeletons for real-time conflict-resolution overlays.
- **Enrollment Lists**: High-density student rosters must implement the "Refraction-Pro" glassmorphism style for scannable multi-year data tracking.
