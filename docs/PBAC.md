Below is a **Policy-Based Access Control (PBAC) with a Policy Engine**

* **Multi-tenant schools**
* **AI-agent driven ERP**
* **Policy-Based Access Control (PBAC)** like systems used at companies such as Google
* **All functional domains typically required in a full school management platform**
* **Horizontal scaling for thousands of schools**

The goal is a **deterministic infrastructure with intelligent AI agents layered on top**.

---

# 1. EdApex System Architecture Overview

```text
Clients (Web / Mobile / API / Chat)
        │
        ▼
Edge Gateway
        │
        ▼
Tenant Resolver
        │
        ▼
Tenant Context Engine
        │
        ▼
Authentication Service
        │
        ▼
PBAC Policy Engine
        │
        ▼
Intent Router
        │
        ▼
AI Orchestrator
        │
 ┌──────┼─────────────┬───────────────┐
 ▼      ▼             ▼               ▼
Agent Hub   Workflow Engine   Knowledge Engine   Event Bus
 │
 ▼
Tool Execution Layer
 │
 ▼
Domain Services
 │
 ▼
Repositories
 │
 ▼
Tenant-Isolated Database
```

---

# 2. Multi-Tenant Infrastructure

Every school is a **tenant**.

### Tenant Resolver

Detects tenant from:

* subdomain
* JWT
* API key
* custom domain

Example

```
schoolname.edapex.ai
```

Tenant context created:

```json
{
  "tenant_id": "school_001",
  "school_name": "Apex International",
  "academic_year": "2026",
  "timezone": "Africa/Lagos"
}
```

Every service call includes:

```
tenant_id
user_id
role_context
policy_context
```

---

# 3. Policy-Based Access Control (PBAC)

PBAC replaces simple RBAC.

Instead of:

```
Role → Permission
```

PBAC evaluates **policies dynamically**.

### Authorization Flow

```
User Request
     │
     ▼
Policy Engine
     │
     ├─ User Attributes
     ├─ Resource Attributes
     ├─ Environment Context
     └─ Policy Rules
     │
     ▼
Allow / Deny
```

---

# 4. PBAC Components

### Subjects (Users)

```
student
teacher
parent
accountant
admin
librarian
driver
warden
```

### Resources

```
student_record
exam
attendance
fees
library_book
inventory_item
```

### Actions

```
create
read
update
delete
approve
grade
collect
assign
```

### Environment

```
tenant_id
time
location
device
```

---

# 5. Example PBAC Policy

Teacher can grade exams only for assigned subjects.

```yaml
policy: grade_exam

allow if
    user.role == "teacher"
    AND resource.subject_id IN user.subjects
```

Parent can see only their child.

```yaml
policy: view_student

allow if
    user.role == "parent"
    AND resource.student.guardian_id == user.id
```

Principal can access everything.

```yaml
policy: principal_access

allow if
    user.designation == "principal"
```

---

# 6. Organizational Structure

```
Tenant
  └ Departments
        └ Designations
              └ Roles
                    └ Policies
```

### Departments

```
academics
finance
administration
library
transport
hostel
```

### Designations

```
principal
vice_principal
teacher
accountant
librarian
driver
warden
```

---

# 7. Core Domain Modules

EdApex includes the following **major domains**.

```
students
academics
attendance
examinations
online_exams
homework
communication
fees
accounts
human_resources
library
inventory
transport
dormitory
reports
cms
settings
```

Each domain has:

```
entities
services
repositories
agents
tools
policies
```

---

# 8. Domain Layer Example

### Students Domain

```
students
 ├ student
 ├ guardian
 ├ sibling
 ├ student_category
 ├ student_group
 ├ student_history
 ├ admission
```

Services

```
student_registration_service
student_promotion_service
student_transfer_service
```

---

### Academics Domain

```
classes
sections
subjects
classrooms
class_teachers
class_routines
lesson_plans
topics
syllabus
study_materials
```

---

### Attendance Domain

```
student_attendance
staff_attendance
subject_attendance
attendance_reports
```

---

### Examination Domain

```
exam_types
exam_setup
exam_schedule
mark_register
grading_system
result_processing
```

---

### Online Examination

```
question_bank
mcq
true_false
fill_blank
exam_sessions
auto_grading
```

---

### Homework

```
homework
homework_submission
homework_evaluation
```

---

### Fees

```
fees_group
fees_type
fees_master
fees_discount
fee_collection
fee_reports
wallet_system
```

---

### Accounts

```
income
expense
profit
payment_methods
bank_accounts
transactions
```

---

### Human Resources

```
staff
staff_attendance
payroll
leave_requests
departments
designations
```

---

### Library

```
books
categories
members
issued_books
returns
```

---

### Inventory

```
items
item_categories
suppliers
stock
sales
issuance
```

---

### Transport

```
routes
vehicles
transport_assignments
transport_reports
```

---

### Dormitory

```
dormitories
rooms
room_types
room_assignments
```

---

### Communication

```
chat
notices
events
email
sms
announcements
```

---

### CMS / Website

```
pages
menus
news
courses
gallery
banners
testimonials
```

---

# 9. AI Agent Architecture

Agents interact with domains through tools.

```
AI Orchestrator
        │
        ▼
Agent Hub
```

Agents include:

```
student_agent
admission_agent
attendance_agent
exam_agent
assessment_agent
finance_agent
hr_agent
library_agent
inventory_agent
transport_agent
dormitory_agent
communication_agent
report_agent
cms_agent
```

Agents never access databases directly.

---

# 10. Tool Execution Layer

Agents call tools.

Example

```
create_student.tool
collect_fee.tool
mark_attendance.tool
generate_report.tool
```

Tools call domain services.

---

# 11. Workflow Engine

Handles deterministic processes.

Examples

```
student_admission_workflow
exam_processing_workflow
fee_collection_workflow
leave_approval_workflow
certificate_generation_workflow
```

Workflows are defined declaratively.

---

# 12. Event Driven Architecture

All domain changes produce events.

Example events

```
student_registered
attendance_marked
exam_completed
fee_paid
book_issued
```

Consumers react to events.

Example

```
exam_completed
   ↓
assessment_service
   ↓
result_generation
```

---

# 13. Knowledge Engine

Stores school policies and academic knowledge.

```
grading_policies
attendance_rules
promotion_rules
curriculum
fee_policies
```

Agents query this using vector search.

---

# 14. Data Architecture

Recommended strategy:

```
shared database
tenant partitioning
```

Each table contains:

```
tenant_id
```

Example

```
students
id
tenant_id
name
class_id
guardian_id
```

Indexes

```
(tenant_id, id)
```

---

# 15. File Storage

Files stored per tenant.

```
storage
 ├ tenant_001
 │   ├ student_photos
 │   ├ homework
 │   └ reports
 └ tenant_002
```

---

# 16. Event Bus

Use a distributed event system.

Options

```
Kafka
NATS
Redis Streams
```

Event example

```json
{
  "tenant_id": "school_001",
  "event": "attendance_marked",
  "student_id": 124
}
```

---

# 17. Observability

Monitoring required for AI agents.

```
logs
metrics
tracing
alerts
```

Log example

```
tenant_id=school_001
agent=student_agent
tool=create_student
latency=120ms
```

---

# 18. Scaling Infrastructure

Microservices deployed in clusters.

Example platform:

```
Kubernetes
```

Services

```
api-service
agent-service
workflow-service
policy-service
knowledge-service
realtime-service
```

Autoscaling based on:

```
CPU
queue length
LLM requests
```

---

# 19. Rate Limiting

Limits applied per tenant.

```
requests_per_minute
agent_tasks_per_minute
ai_tokens_per_day
```

---

# 20. Folder Structure

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
   student_agent
   attendance_agent
   exam_agent
   finance_agent
   hr_agent

/tools
   student_tools
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

/infrastructure
   repositories
   database
   cache
   queue

/knowledge
   policies
   curriculum
   grading_rules

/policies
   pbac_rules

/observability
   logs
   metrics
   tracing
```

---

# 21. Result

This architecture enables EdApex to support:

```
10,000+ schools
millions of students
parallel AI agents
custom school policies
tenant-safe data isolation
```

while maintaining:

```
security
governance
horizontal scalability
AI automation
```

---