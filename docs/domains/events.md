# Domain Events Architecture

## 🎯 Domain Overview
The **Domain Events** domain is the nervous system of EdApex V2. It facilitates decentralized, asynchronous coordination between the core system and the Hierarchical Multi-Agent System (HMAS). By transitioning from synchronous Laravel hooks to a persistent event bus, EdApex ensures "Planet-Scale" reliability and enables federated AI learning across regional nodes.

## 📂 Legacy Mapping
The legacy system relied on synchronous controllers, traits (`NotificationSend`), and specialized asynchronous Jobs.

| Legacy Entity | Legacy Implementation | V2 Domain Event (`events` table) |
| :--- | :--- | :--- |
| **Notification Triggers** | `NotificationSend::sent_notifications()` | `eventType: '[entity].[action]'`, e.g., `homework.assigned` |
| **Async Tasks (Jobs)** | `Jobs/SendUserMailJob`, `Jobs/sendSmsJob` | Event Consumer: `communication_supervisor` |
| **Student Promotion** | `Events/StudentPromotion` | `eventType: 'student.promoted'`, `aggregateType: 'student'` |
| **User Logs** | `sm_user_logs`, `sm_system_logs` | Unified `audit_log` with `INSERT \| UPDATE \| DELETE` |
| **Registry Update** | `Chat/Listeners/InstituteRegisteredListener` | `eventType: 'tenant.provisioned'`, `aggregateType: 'tenant'` |

## 🏗️ Modern Architecture

### 1. Reliable Event Bus (At-least-once Delivery)
EdApex V2 implements an **Transactional Outbox Pattern** using the `events` table.
- **Persistence**: Domain services write events to the `events` table within the same database transaction as the state change.
- **Dissemination**: A reliable relay service (or Mastra Workflow) reads `events` and publishes them to the active Event Bus (e.g., NATS, Redis Stream, or AI-Node queue).
- **Acknowledgement**: Consumers (Task Agents) must acknowledge processing. Unacknowledged events are replayed based on a sliding-window retry policy.

### 2. Event Schema (`events` table)
- `eventType`: Strong-typed names (e.g., `assessment.result_calculated`).
- `aggregateType` / `aggregateId`: Points to the specific resource (e.g., `ExamResult`, `Student`).
- `correlationId`: Essential for HMAS to trace a chain of actions (e.g., `Voice Command -> Plan -> Action 1 -> Action 2`).

### 3. Federated AI Integration (Regional Nodes)
Regional AI nodes subscribe to the `events` stream for two purposes:
1.  **Immediate Inference**: Triggering a `prediction_agent` when `attendance.marked` shows a streak of absences.
2.  **Federated Learning**: Anonymized payloads from `events` are aggregated at the regional node level to retrain local models (e.g., localized curriculum difficulty) without original data leaving the tenant's primary storage.

## 🤖 AI Agent & Tool Integration
Task Agents are the primary consumers of domain events.

| Agent | Event Subscription | Triggered Action |
| :--- | :--- | :--- |
| **Grading Agent** | `exam.marks_uploaded` | Calculates final grades and computes class rankings. |
| **Attendance Agent** | `attendance.marked` | Analyzes trends and triggers parent notifications for low attendance. |
| **Fee Recovery Agent** | `fee.due_date_approached` | Generates personalized reminders based on parent payment history. |

## 🔒 PBAC & Security
- **Tenant Isolation**: Every query to the `events` or `audit_log` table is strictly scoped by `tenant_id`.
- **Actor Integrity**: The `actor_id` field tracks which user or AI Agent ID triggered the event, ensuring full non-repudiation.

## 📝 Recommendations & Justifications
- **Status Column for Events**: Add a `delivery_status` column (`pending`, `delivered`, `failed`) to the `events` table to explicitly track the outbox state.
- **Payload Indexing**: Implement `json_extract` generated columns for frequently-queried event fields (e.g., `action_result` within the payload) to optimize agent dashboards.
- **Audit Data Retention**: Implement a partitioning scheme for `audit_log` based on `changed_at` (monthly) to ensure high-performance queries as the history grows.
