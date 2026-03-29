# Communication Domain Architecture

## 🎯 Domain Overview
The Communication domain provides a unified, omni-channel infrastructure for internal and external information exchange. It transitions from fragmented legacy tables to a centralized "Communications Event" hub, enabling structured delivery across Notifications, Email, SMS, Push, and Chat.

### Key Business Logic (Legacy)
- **Role-Based Targeting**: Most communication (Notices, Events, Bulk Messages) is filtered by role (Student, Teacher, Parent).
- **Multi-Channel Dispatch**: Support for simultaneous Email and SMS delivery.
- **Acknowledgement Tracking**: Legacy notifications track "Read" status, whereas bulk messages only track "Sent".

## 📂 Entity Mapping (V1 -> V2)

| Legacy Entity | Table | V2 Entity | Improvement |
| :--- | :--- | :--- | :--- |
| Notice Board | `sm_notice_boards` | `communicationEvents` | Consolidates multiple broadcast types into one polymorphic table. |
| School Events | `sm_events` | `communicationEvents` | Enables shared targeting logic with notices. |
| Bulk Logs | `sm_email_sms_logs` | `communicationRecipients` | Per-user delivery status tracking for all channels. |
| Chat History | `chat_conversations` | `chatMessages` (Proposed) | Dedicated storage for high-frequency messaging. |

## 🤖 AI Agent & Tool Integration

### Task Agents
- **Moderation Agent**: Scans incoming chat and public news comments for toxicity/PII.
- **Dispatch Agent**: Optimizes delivery timing based on user activity patterns.
- **Summary Agent**: Generates daily digests of unread notices and events.

### Structured Tools
- `send_notification.tool`: Low-level dispatch for single or bulk messages.
- `moderate_content.tool`: AI utility to flag or redact problematic text.
- `get_unread_summaries.tool`: Aggregates pending communications for the User Persona.

## 🛡️ PBAC & Security
- **Policy: Notice Creation**: Restricted to `role: admin` or `role: principal`.
- **Policy: Specific Targeting**: Users can only target roles/classes they are associated with (e.g., Teacher to their assigned Class).
- **Environment Scoping**:
    - **Tenant Isolation**: Mandatory `tenantId` check on every query.
    - **Academic Year**: Events are scoped to `academicId` to filter historical calendar items.

## 💡 Recommendations & Justifications

### 1. High-Frequency Chat Storage
**Current State**: `src/db/domain-communication.ts` includes `chat` as a channel in `communicationEvents`.
**Recommendation**: Implement a dedicated `chatMessages` table for high-frequency exchange to avoid bloat in the audit-heavy `communicationEvents` table.
**Justification**: Chat requires optimized indexing for `channelId` and `timestamp`, plus specific `moderation_status` flags.

### 2. Template Versioning in Metadata
**Recommendation**: Use the `metadata` JSON field to store `template_id` and `version` for external providers (SendGrid/Twilio).
**Justification**: Ensures reproducibility of sent messages even if templates change over time.

### 3. Moderation State in Events
**Recommendation**: Record moderation results in the `events` table (Domain: Events) for auditability.
**Justification**: Provides a centralized log of AI interventions without cluttering the primary communication tables.

## 🛡️ Security & Privacy
- **Tenancy**: Every communication event is strictly scoped to `tenantId`.
- **RBAC**: Access to "Notice Creation" or "Bulk SMS" is restricted to specific role permissions.
- **Metadata Protection**: Provider API responses containing PII must be encrypted or scrubbed in logs.

## 🚀 Transition Strategy
1.  **Phase 1**: Migrate `sm_notice_boards` and `sm_events` into `communicationEvents`.
2.  **Phase 2**: Replace legacy traits like `NotificationSend` with a unified `CommunicationService`.
3.  **Phase 3**: Implement the Moderated Chat infrastructure in a dedicated module.

---

## Hono API Routes

```
Routes → CommunicationController → CommunicationService → CommunicationRepository
```

| Method | Route | Description | Auth |
|:---|:---|:---|:---|
| `GET` | `/api/v1/communications` | List communication events | Authenticated |
| `POST` | `/api/v1/communications` | Create communication event | Teacher+ |
| `POST` | `/api/v1/communications/broadcast` | Broadcast to role/class | `TenantAdmin` |
| `GET` | `/api/v1/communications/:id/recipients` | Get recipient delivery status | Teacher+ |
| `GET` | `/api/v1/notifications` | Get user's notifications | Authenticated |
| `PATCH` | `/api/v1/notifications/:id/read` | Mark notification as read | Authenticated |

---

## HMAS Agent Registry

| Agent | Type | Capabilities |
|:---|:---|:---|
| `communication_supervisor` | Supervisor | Routes messages, manages delivery dispatch |
| `moderation_agent` | Task | Scans content for toxicity/PII |
| `dispatch_agent` | Task | Optimizes delivery timing and channel |
| `summary_agent` | Task | Generates daily digests of unread notices |

---

## Domain Events

| Event | Payload | Consumers |
|:---|:---|:---|
| `comm.event_dispatched` | `{ eventId, channel, recipientCount }` | Events (audit) |
| `comm.delivery_failed` | `{ recipientId, reason }` | Events (alert), Communication (retry) |
| `comm.content_moderated` | `{ eventId, approved, flags }` | Events (audit) |
