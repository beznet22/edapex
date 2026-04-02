# Communication Domain Architecture

## Overview
The Communication domain re-architects message dispatching into a unified, multi-channel event system. It replaces 6+ legacy notification and messaging tables with a single `communicationEvents` table supporting polymorphic targeting and per-recipient delivery tracking.

### Key Business Logic
- **Multi-Channel Dispatch**: Supports `notification`, `notice`, `message`, `email`, `sms`, `chat` channels.
- **Polymorphic Targeting**: `targetType` supports `person`, `role`, `class`, `section`, `broadcast` with `targetRefId` for dynamic resolution.
- **Priority & Scheduling**: Messages can be scheduled (`scheduledAt`) or sent immediately with priority levels (`low`, `normal`, `high`, `urgent`).
- **Per-Recipient Tracking**: `communicationRecipients` tracks delivery status per user: `pending` → `sent` → `delivered` / `failed` / `bounced`.

---

## Logic Parity (Legacy to V2)

### Schema Mapping
| Legacy Table (`schoolify`) | V2 Entity (`src/db/domain-communication.ts`) | Notes |
| :--- | :--- | :--- |
| `sm_notice_boards` | `communicationEvents` (channel: `notice`) | Notices as events. |
| `sm_email_sms_logs` | `communicationEvents` (channel: `email`/`sms`) | Unified dispatch. |
| `sm_communications` / `sm_send_messages` | `communicationEvents` (channel: `message`) | Direct messaging. |
| `chat_conversations` / `chat_groups` | `communicationEvents` (channel: `chat`) | Chat unified into events. |
| `chat_group_message_recipients` | `communicationRecipients` | Per-recipient tracking. |

---

## Technical Implementation

### Core Entities

#### [CommunicationEvents](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-communication.ts#L29)
Universal dispatch event. `channel` + `targetType` + `targetRefId` for flexible routing. `scheduledAt` for deferred delivery.

#### [CommunicationRecipients](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-communication.ts#L59)
Per-recipient delivery tracking. Status: `pending` → `sent` → `delivered` / `failed` / `bounced`. Tracks `readAt` and `failureReason`.

---

## AI Task Agents & Tools

### Operational Tools (Mastra)
- `comms.sendBroadcast(message, targets)`: Multi-channel dispatch with target resolution.
- `comms.resolveTargets(filter)`: High-performance target expansion for broadcasts.
- `send_broadcast`: Dispatches a message to all users of a specific role/class/section.
- `resolve_target_users`: Expands a polymorphic target into specific user IDs.
- `draft_template_message`: AI-generated message from a template with variable substitution.
- `schedule_reminder`: Creates a scheduled follow-up communication for overdue events.
- `moderate_chat`: AI content moderation for chat messages.

### [STRESS DEFENSE] Tools
- `delivery_retry_engine`: Retries failed SMS/email with exponential backoff.
- `broadcast_throttle`: Rate-limits broadcast dispatch to prevent provider throttling.
- `notification_dedup_filter`: Prevents duplicate notifications from event storms.
- `channel_fallback_router`: Falls back to alternative channels (email → SMS → push) on delivery failure.

---

## PBAC & Security
- **TenantAdmin**: Full communication access, can broadcast to any target.
- **Teacher**: Can send messages to their assigned class/section and parents.
- **Parent**: Can receive messages and reply to teachers.
- **Student**: Can receive notifications, read-only for notices.

---

## Hono API Routes

| Method | Route | Description | Auth |
|:---|:---|:---|:---|
| `POST` | `/api/v1/communication/send` | Send message | Teacher+ |
| `POST` | `/api/v1/communication/broadcast` | Send broadcast | `TenantAdmin` |
| `GET` | `/api/v1/communication/inbox` | Get received messages | Self |
| `GET` | `/api/v1/communication/sent` | Get sent messages | Self |
| `GET` | `/api/v1/communication/notices` | List notices | Authenticated |
| `PATCH` | `/api/v1/communication/:id/read` | Mark as read | Self |

---

## HMAS Agent Registry

| Agent | Type | Capabilities |
|:---|:---|:---|
| `communication_dispatcher` | Task | Multi-channel dispatch, target resolution, scheduling |
| `notification_engine` | Task | Event-driven notification generation from domain events |
| `chat_moderator` | Task | Content moderation, spam detection |
| `pr_officer` | Task | Newsletter drafting, public relations messaging |

---

## Domain Events

| Event | Payload | Consumers |
|:---|:---|:---|
| `communication.message_sent` | `{ eventId, channel, targetType }` | Events (audit) |
| `communication.delivery_failed` | `{ eventId, recipientId, reason }` | Communication (retry), Events (audit) |
| `communication.broadcast_completed` | `{ eventId, recipientCount, channel }` | Events (audit) |
