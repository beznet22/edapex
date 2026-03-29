# Academic Domain Architecture

## Overview
The Academic domain manages the core educational structure of the school, including Class levels, Sections, Subjects, and the Class Routine (Timetable). It ensures that students are correctly enrolled into specific academic groups and that teachers and rooms are optimally scheduled without conflicts.

### Key Business Logic
- **Class-Section Relationship**: Classes are high-level groupings (e.g., Grade 10). Sections are physical or logical sub-groups (e.g., Section A, Section B). Every class must have at least one section.
- **Subject Assignment**: Subjects are linked to Class-Sections rather than just Classes. This allows different sections of the same grade to have different teachers or even elective subjects.
- **Routine Management**: Routines are built based on Time Slots (Periods). A routine entry must specify Class, Section, Subject, Teacher, Room, and Day.

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
Calculates weekly schedule. Currently uses `dayOfWeek` enum and raw start/end times.

---

## AI Task Agents & Tools

### Agents
- **Academic Architect**: Handles the setup of classes, sections, and subject mappings.
- **Schedule Coordinator**: Specialized in routine generation and conflict resolution.

### Tools
- `validate_routine_collision`: Checks if a Teacher or Room is already occupied at a specific time.
- `sync_class_section_logic`: Ensures that when a section is removed from a class, all associated routines and enrollments are handled.

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
