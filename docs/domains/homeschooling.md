# EdApex Domain Architecture: Homeschooling

## 1. Domain Overview
The `Homeschooling` domain is a greenfield addition to the EdApex Planet-Scale Architecture, targeting the B2C and B2B2C markets. It enables alternative learning pathways outside the conventional school system by delivering the National Curriculum (NERDC) from Early Childhood (ECCDE) through to Senior Secondary.
It introduces specialized operations such as flexible `homeschool_subscriptions`, management of TRCN-certified facilitators natively grouped as a core `userType` Persona, and automated `revenue_shares` designed to empower and compensate teachers dynamically based on their interaction metrics.

Crucially, it acts as a specialized administrative wrapper operating **inside the entire core school management system infrastructure**. It natively links with the `LMS` and `Academic` domains for curriculum delivery, and the `HR` domain to support robust, multi-tiered facilitator compensation models (`salaried`, `contractor` revenue-shares, or `hybrid`).

## 2. Entity Mapping (V1 -> V2)
The legacy `schoolify` monolith (InfixEdu) strictly operated on a conventional B2B institutional framework. Therefore, the Homeschooling schema is entirely native to EdApex V2.

| Legacy V1 (InfixEdu) | Modern V2 (Drizzle ORM) | Purpose / Improvement |
| :--- | :--- | :--- |
| *None (Greenfield)* | `homeschool_subscriptions` | Tracks recurring billing intervals and pricing. Bound to the `Academic` domain via `academic_id`. |
| *None (Greenfield)* | `users` (`facilitator` userType) | Tracks verified staff with specific certifications and hourly rates using JSON `metadata`. Natively links to `hr_departments` and `hr_designations` to support `salaried`, `contractor`, or `hybrid` employment models. |
| *None (Greenfield)* | `revenue_shares` | Tracks base payouts and performance bonuses. Natively linked to the `Finance` domain via `ledger_entry_id` for holistic double-entry accounting. |
| *None (Greenfield)* | `homeschool_portfolios`| Legally required evidence of work; deeply integrated with `lms_courses`, `lms_submissions`, and `academic_years`. |
| *None (Greenfield)* | `homeschool_schedules`| Personalized scheduling that binds `users` to `lms_lessons`. Bound strictly to `academic_years`. |

*Note on Tenancy:* To unify the system, a homeschool family or co-op is treated as a distinct `tenant`, differentiated by the new `tenantType` field (`homeschool_family`, `homeschool_coop`) on the `domain-core` `tenants` table.

## 3. AI Agent & Tool Integration
The success of the Homeschooling domain relies heavily on autonomous curriculum generation and adaptive learning.

### Task Agents
1. **HomeschoolSupervisor:** The primary router and context manager. Interprets parent/student intent and coordinates curriculum flow.
2. **EarlyYearsAgent:** Tailored for ECCDE (ages 0-6). Focuses on thematic, play-based content generation for 8 core skill areas.
3. **StemTutoringAgent:** Focused on Upper Basic and Secondary students. Handles deep, step-by-step logic, Coding & Robotics integration, and virtual lab simulations.

### Structured Tools
- `generate_lesson_plan.tool`: Creates NERDC-compliant weekly `homeschool_schedules` mapped tightly to `lms_lessons`.
- `calculate_revenue_share.tool`: Periodically evaluates student retention metrics to compute the performance bonus for facilitators.

## 4. PBAC & Security
Homeschooling requires a tightly scoped execution environment to protect child data.
- **Parental Oversight:** A `Parent` subject is granted explicit `read` and `update` privileges over `student_records` strictly bound to their self-referenced `parent_user_id`.
- **Facilitator Access:** A `Facilitator` is granted ephemeral `read` privileges only for the duration of a scheduled tutoring session. Once the session ends, access reverts.
- **Environment Context:** Policies evaluate the `tenant_type`. Conventional school staff roles cannot interact with homeschool tenants under any circumstance.

## 5. Recommendations & Justifications
- **Recommendation 1:** Expand the LMS Engine directly into the `homeschool_portfolios` logic.
  - **Justification:** Avoids building parallel assessment tracking systems by utilizing LMS adaptive pathways for homeschool compliance mapping.
- **Recommendation 2:** Isolate `revenue_shares` execution to background task queues.
  - **Justification:** Complex profit-sharing calculations should not block synchronous user requests.
- **Schema Extensibility:** The `subject_specializations` within the `FacilitatorMetadata` uses standard JSON arrays, providing flexibility as new specialized tracks (e.g., Coding & Robotics frameworks) emerge in the curriculum while adhering firmly to the core identity system.
