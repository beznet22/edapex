Below is the **final evolution of the EdApex architecture**: a **Hierarchical Multi-Agent System (HMAS)** designed for a **large multi-tenant school ERP with PBAC authorization**.

This architecture enables:

* thousands of schools
* millions of users
* hundreds of AI agents
* deterministic workflows
* strict governance and policy enforcement

while preventing **agent chaos**.

---

# 1. EdApex Hierarchical Multi-Agent Architecture (HMAS)

The key idea is **structured agent layers**, not a flat agent network.

```text
Users
 │
 ▼
Interaction Layer
 │
 ▼
Tenant Context + Authentication
 │
 ▼
PBAC Policy Engine
 │
 ▼
Intent Router
 │
 ▼
Executive Orchestrator Agent
 │
 ▼
────────────────────────────
Domain Supervisor Agents
────────────────────────────
 │
 ▼
────────────────────────────
Task Agents
────────────────────────────
 │
 ▼
Tool Execution Layer
 │
 ▼
Domain Services
 │
 ▼
Repositories / Database
```

Hierarchy prevents:

* uncontrolled agent loops
* unpredictable reasoning
* scaling bottlenecks

---

# 2. Agent Hierarchy Levels

The system contains **four levels of intelligence**.

```text
Level 1 — Executive Agent
Level 2 — Domain Supervisor Agents
Level 3 — Task Agents
Level 4 — Tool Executors
```

---

# 3. Level 1 — Executive Orchestrator Agent

The **Executive Agent** is the brain of the system.

Responsibilities:

* interpret user intent
* create execution plans
* coordinate domain agents
* maintain conversation context

Example request:

```
"Generate full academic report for Sarah"
```

Executive plan:

```
1 fetch attendance
2 fetch exam results
3 fetch homework completion
4 generate report
```

Delegation:

```
attendance supervisor
assessment supervisor
homework supervisor
report supervisor
```

---

# 4. Level 2 — Domain Supervisor Agents

Each domain has a **supervisor agent**.

These agents manage **multiple task agents**.

Domains include:

```
student domain
academic domain
attendance domain
assessment domain
finance domain
hr domain
library domain
inventory domain
transport domain
dormitory domain
communication domain
reporting domain
cms domain
```

Example hierarchy:

```
Academic Supervisor
 ├ lesson planning agent
 ├ homework agent
 ├ syllabus agent
 └ study material agent
```

Responsibilities:

* break tasks into sub-tasks
* coordinate task agents
* ensure domain rules

---

# 5. Level 3 — Task Agents

Task agents perform **specific operations**.

Example task agents.

### Student Domain

```
student registration agent
student promotion agent
guardian linking agent
student transfer agent
```

### Academic Domain

```
class routine agent
lesson planning agent
syllabus management agent
study material agent
```

### Attendance Domain

```
student attendance agent
staff attendance agent
attendance analytics agent
```

### Assessment Domain

```
exam creation agent
grading agent
result processing agent
merit list generator
```

### Finance Domain

```
fee collection agent
discount agent
wallet agent
financial reporting agent
```

### HR Domain

```
staff onboarding agent
payroll agent
leave approval agent
attendance monitoring agent
```

### Library Domain

```
book catalog agent
book issue agent
book return agent
inventory monitoring agent
```

### Transport Domain

```
route assignment agent
vehicle management agent
transport reporting agent
```

### Dormitory Domain

```
room allocation agent
hostel monitoring agent
student accommodation agent
```

### Communication Domain

```
notification agent
chat moderation agent
announcement agent
email sms agent
```

### CMS Domain

```
page generator agent
news agent
gallery agent
banner agent
```

---

# 6. Level 4 — Tool Execution Layer

Task agents do not touch infrastructure.

They use **tools**.

Example tools:

```
create_student.tool
mark_attendance.tool
create_exam.tool
grade_exam.tool
collect_fee.tool
issue_book.tool
assign_room.tool
generate_report.tool
```

Tools call **domain services**.

---

# 7. PBAC Policy Engine Integration

Every agent execution must pass the **policy engine**.

Authorization flow:

```
User Request
     │
     ▼
PBAC Policy Engine
     │
     ▼
Agent Execution
```

Policy checks evaluate:

```
user attributes
resource attributes
environment
tenant context
```

Example rule.

Teacher grading exam:

```
allow if
user.role == teacher
AND exam.subject IN teacher.subjects
```

Parent viewing child record:

```
allow if
user.role == parent
AND student.guardian_id == user.id
```

Principal override:

```
allow if
designation == principal
```

---

# 8. Multi-Tenant Isolation

All agents operate within **tenant context**.

Every execution contains:

```
tenant_id
user_id
role_context
policy_context
```

Database queries always include:

```
tenant_id filter
```

Example:

```
SELECT * FROM students
WHERE tenant_id = ?
```

This prevents cross-school data access.

---

# 9. AI Knowledge Layer

Agents access institutional knowledge.

Knowledge includes:

```
grading rules
attendance policies
promotion rules
fee policies
curriculum
```

Knowledge storage:

```
global knowledge
tenant knowledge
```

Agents retrieve context before decisions.

---

# 10. Workflow Engine

Some operations must remain deterministic.

Examples:

```
student admission
exam result publication
fee payment lifecycle
leave approval
certificate generation
```

Workflows coordinate multiple agents safely.

Example:

```
Admission Workflow

apply
review
approve
payment
enrollment
```

---

# 11. Event-Driven Agent Collaboration

Events synchronize domains.

Example events:

```
student_registered
attendance_marked
exam_completed
fee_paid
book_issued
```

Example chain:

```
exam_completed
     │
     ▼
assessment agent
     │
     ▼
result generation
     │
     ▼
report agent
```

---

# 12. Memory Architecture

Agents use **three memory types**.

### Conversation Memory

```
chat history
session context
```

### Task Memory

```
execution plan
intermediate results
```

### Institutional Memory

```
school policies
historical performance
student history
```

All memory is **tenant-scoped**.

---

# 13. Observability and Governance

Monitoring is critical for large AI systems.

Tracked metrics:

```
agent decisions
tool usage
latency
errors
policy violations
```

Example log:

```
tenant=school_14
agent=attendance_agent
action=mark_attendance
duration=90ms
```

---

# 14. Horizontal Scaling

System services scale independently.

```
API Service
Agent Service
Policy Service
Workflow Service
Knowledge Service
Realtime Service
```

Deployment platform example:

```
container clusters
```

Autoscaling based on:

```
CPU usage
agent queue length
AI token usage
```

---

# 15. Final Folder Structure

```
/edapex

/apps
   api
   web
   mobile

/core
   tenant_resolver
   tenant_context
   policy_engine
   intent_router
   orchestrator
   workflow_engine
   event_bus

/agents
   supervisors
   tasks

/tools
   student_tools
   attendance_tools
   exam_tools
   finance_tools

/domains
   students
   academics
   attendance
   exams
   finance
   hr
   library
   inventory
   transport
   dormitory
   communication
   cms

/knowledge
   global
   tenant

/policies
   pbac

/memory
   conversation
   institutional

/infrastructure
   repositories
   database
   cache
   queue
   storage

/observability
   logs
   metrics
   tracing
```

---

# 16. What This Architecture Achieves

This final architecture allows EdApex to support:

```
thousands of schools
millions of students
hundreds of AI agents
complex school workflows
strict authorization policies
tenant-safe data isolation
```

while maintaining:

```
deterministic operations
AI autonomy
security
horizontal scalability
full governance
```

---

**Ultimate scaling upgrade** for this system [Version 3](arch_v3.md):

**"Federated Multi-School Intelligence Architecture"**

This would allow EdApex to **learn patterns across thousands of schools while keeping each school's data private**, dramatically improving predictions like **dropout risk, academic performance forecasting, and fee default detection**.
