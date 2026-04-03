# Homeschooling Domain Architecture

## Overview
The Homeschooling domain enables B2C and cooperative homeschool families to operate as lightweight tenants with subscription-based access to LMS courses, facilitator revenue sharing, student portfolios, and flexible scheduling. It bridges the institutional LMS with family-driven, self-paced learning.

### Key Business Logic
- **Subscription Plans**: `basic`, `family`, `premium`, `b2b_micro` with renewal tracking and status lifecycle (`active`, `past_due`, `canceled`, `trial`).
- **Revenue Sharing**: Facilitators earn `baseAmount` + `performanceBonus` per period, reconciled to the Finance ledger via `ledgerEntryId`.
- **Student Portfolios**: Evidence-based achievement tracking (`project`, `exam`, `artwork`, `certification`) linked to LMS courses and submissions.
- **Flexible Scheduling**: Per-student daily schedules linked to Academic subjects and LMS lessons with status tracking.
- **[NEW] Professional Persona Flow (The Parent Educator)**: Mrs. Ngozi, a Parent Educator, manages the "Semester 1 Science Portfolio" goal. She triggers the `schedule_planner` to generate a 12-week learning path. When the `portfolio_evidence_validator` flags a missing experiment video, she uses the `homeschool.recommendSupplements` tool to find enrichment clips. She approves the final achievement report via the `aiApprovals` gate, which then triggers the `revenue_agent` to reconcile the facilitator's share in the Finance ledger, visualized via Boneyard-powered skeletons.

---

## Logic Parity (Legacy to V2)

### Schema Mapping
| Legacy Table | V2 Entity (`src/db/domain-homeschool.ts`) | Notes |
| :--- | :--- | :--- |
| — (new) | `homeschoolSubscriptions` | Tenant-level subscription plans with renewal tracking. |
| — (new) | `revenueShares` | Facilitator earnings with ledger integration. |
| — (new) | `homeschoolPortfolios` | Evidence-based student achievement records. |
| — (new) | `homeschoolSchedules` | Flexible daily learning schedules. |
| — (new) | `aiSessions` | [GOVERNANCE] Traceability for curriculum and portfolio discussions. |
| — (new) | `aiTasks` | [GOVERNANCE] Atomic scheduling and evidence validation tasks. |
| — (new) | `aiGoals` | [GOVERNANCE] Alignment with family-driven educational targets. |
| — (new) | `aiApprovals` | [GOVERNANCE] Parental sign-off for final portfolio reports and payments. |

### Cross-Domain Dependencies
- **LMS**: Courses and lessons are consumed via `courseId` and `lessonId`.
- **Finance**: Revenue shares link to `ledgerEntries` for accounting.
- **Academic**: Subjects referenced for curricular alignment.
- **Core**: Tenants with `tenantType: 'homeschool_family' | 'homeschool_coop'`.

---

## Technical Implementation

### Core Entities

#### [HomeschoolSubscriptions](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-homeschool.ts#L8)
Tenant-level subscription. Plan types: `basic`, `family`, `premium`, `b2b_micro`. Lifecycle: `active` → `past_due` → `canceled`.

#### [RevenueShares](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-homeschool.ts#L21)
Per-period facilitator earnings. Tracks `baseAmount`, `performanceBonus`, `totalEarned`, with status `pending` → `paid`. Links to Finance ledger.

#### [HomeschoolPortfolios](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-homeschool.ts#L37)
Student achievement evidence. Types: `project`, `exam`, `artwork`, `certification`. Links to LMS courses and submissions.

#### [HomeschoolSchedules](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-homeschool.ts#L55)
Daily learning schedules per student. Status: `planned` → `in_progress` → `completed` / `skipped`. Links to Academic subjects and LMS lessons.

---

## AI Task Agents & Tools

### Operational Tools (Mastra)
- `homeschool.createPath(studentId)`: Personalized academic coaching and curriculum routing.
- `homeschool.recommendSupplements(studentId)`: AI-driven enrichment for portfolio gaps.
- `generate_weekly_schedule`: Auto-generates a week's schedule based on learning pace.
- `calculate_revenue_share`: Computes facilitator earnings based on engagement.
- `compile_portfolio_report`: Aggregates entries into a validated achievement report.
- `recommend_next_course`: Predictive enrollment based on historical competency.

### [STRESS DEFENSE] Tools
- `subscription_renewal_guard`: Prevents access gaps during payment processing delays.
- `revenue_share_reconciler`: Ensures facilitator payouts match Finance ledger entries.
- `portfolio_evidence_validator`: Validates attachment URLs and submission links.
- `schedule_conflict_resolver`: Detects and resolves overlapping schedule entries.

---

## PBAC & Security
- **Parent/Guardian**: Full control over their family tenant's schedules, portfolios, and subscriptions.
- **Facilitator**: Can view assigned students' progress, submit evaluations, and view their revenue shares.
- **Student**: Can view their own schedule and portfolio.

---

## Hono API Routes

| Method | Route | Description | Auth |
|:---|:---|:---|:---|
| `GET` | `/api/v1/homeschool/subscriptions` | Get subscription status | Parent |
| `POST` | `/api/v1/homeschool/subscriptions` | Create/renew subscription | Parent |
| `GET` | `/api/v1/homeschool/schedules` | List schedules | Parent + Student |
| `POST` | `/api/v1/homeschool/schedules` | Create schedule entry | Parent |
| `GET` | `/api/v1/homeschool/portfolios` | List portfolio entries | Parent + Student |
| `POST` | `/api/v1/homeschool/portfolios` | Add portfolio entry | Parent + Facilitator |
| `GET` | `/api/v1/homeschool/revenue-shares` | List revenue shares | Facilitator |

---

## HMAS Agent Registry

| Agent | Type | Capabilities |
|:---|:---|:---|
| Agent | Type | Capabilities | Link |
|:---|:---|:---|:---|
| `homeschool_supervisor` | Supervisor | Subscription, facilitator management | [SOUL.md](../strategy/SOUL.md) |
| `schedule_planner` | Task | Weekly generation, conflict resolution | [SOUL.md](../strategy/SOUL.md) |
| `portfolio_curator` | Task | Evidence compilation, achievement reports | [SOUL.md](../strategy/SOUL.md) |
| `revenue_agent` | Task | Revenue calculation, ledger reconciliation | [SOUL.md](../strategy/SOUL.md) |

---

## Domain Events

| Event | Payload | Consumers |
|:---|:---|:---|
| `homeschool.subscription_activated` | `{ tenantId, plan }` | Settings (config), Communication (welcome) |
| `homeschool.subscription_past_due` | `{ tenantId, renewsAt }` | Communication (reminder), Finance (dunning) |
| `homeschool.portfolio_entry_added` | `{ portfolioId, userId, evidenceType }` | Events (audit) |
| `homeschool.revenue_share_paid` | `{ shareId, facilitatorId, amount }` | Finance (ledger), Communication (payout notification) |

---

## UI Documentation (Boneyard)
- **Parent Dashboard**: The high-density family overview MUST implement `boneyard-js` skeletons for sub-100ms multi-student progress tracking.
- **Portfolio Gallery**: The student achievement viewport must utilize "Refraction-Pro" glassmorphism cards for premium visual evidence presentation.
