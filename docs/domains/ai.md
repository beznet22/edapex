# AI Integration Domain Architecture

## Overview
The AI domain manages the infrastructure for AI assistant interactions, agentic orchestration, and tool invocation tracking. It provides chat history, message storage, document artifacts, agent registration, and granular action/tool telemetry — all tenant-isolated and persona-scoped.

### Key Business Logic
- **Chat Infrastructure**: `aiChats` → `aiMessages` with role support (`user`, `assistant`, `system`, `tool`). Messages store parts as JSON for multi-modal content.
- **Document Artifacts**: AI-generated documents (`text`, `code`, `image`, `sheet`) with suggestion tracking.
- **Agentic Infrastructure**: Registered `aiAgents` with capability lists, action tracking (`aiAgentActions`), and tool invocation logging (`aiToolInvocations`).
- **Token Tracking**: Message metadata captures `promptTokens`, `completionTokens`, `totalTokens`, `latencyMs`, and `modelName`.

---

## Logic Parity (Legacy to V2)

### Schema Mapping
| Legacy Table | V2 Entity (`src/db/domain-ai.ts`) | Notes |
| :--- | :--- | :--- |
| — (new) | `aiChats` | Tenant-isolated chat sessions with model and visibility. |
| — (new) | `aiMessages` | Multi-part messages with role and token metadata. |
| — (new) | `aiVotes` | Per-message feedback (upvote/downvote). |
| — (new) | `aiDocuments` | AI-generated artifacts (text, code, image, sheet). |
| — (new) | `aiSuggestions` | AI suggestions linked to documents. |
| — (new) | `aiAgents` | Registry of active agents with capabilities and config. |
| — (new) | `aiAgentActions` | Action lifecycle tracking with idempotency keys. |
| — (new) | `aiToolInvocations` | Granular tool call logging with parameters and results. |

---

## Technical Implementation

### Core Entities

#### [AiChats](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-ai.ts#L39)
Chat session with model selection, visibility (`private`/`public`), and summary metadata.

#### [AiMessages](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-ai.ts#L51)
Multi-part messages supporting `user`, `assistant`, `system`, `tool` roles. Token usage in metadata.

#### [AiVotes](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-ai.ts#L65)
RLHF feedback per message for model improvement.

#### [AiDocuments / AiSuggestions](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-ai.ts#L76)
AI-generated artifacts with iterative suggestion tracking.

#### [AiAgents](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-ai.ts#L102)
Agent registry with capabilities, status (`active`/`inactive`/`maintenance`), and runtime config.

#### [AiAgentActions](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-ai.ts#L116)
Action lifecycle: `pending` → `running` → `completed`/`failed`. Includes idempotency keys and duration.

#### [AiToolInvocations](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-ai.ts#L135)
Per-tool-call logging with parameters, results, and latency for observability.

---

## AI Task Agents & Tools

### Operational Tools (Mastra)
- `ai.getAgentSpend(agentId)`: Aggregates `cost_events` for the current month.
- `ai.enforceAgentPause(agentId)`: Triggers status change if 100% budget reached.
- `ai.predictMonthlySpend()`: Extrapolates current run frequency to end-of-month.
- `ai.identifyWastefulRuns(threshold)`: Flags agents with high cost but low WorkProduct output.
- `it.checkAgentHealth()`: Technical maintenance of the HMAS loop.
- `it.rotateAPIKeys()`: Automated rotation of agent-level keys in Vault/D1.
- `it.auditTokenCents()`: Real-time cost auditing per agent per tenant.
- `register_agent`: Registers a new AI agent with capabilities and config.
- `track_token_usage`: Aggregates token usage per tenant for billing/quotas.

### [STRESS DEFENSE] Tools
- `token_budget_enforcer`: Hard-stops agent execution when token spend exceeds allocated budget.
- `hallucination_circuit_breaker`: Detects and halts agent loops producing nonsensical outputs.
- `agent_action_idempotency`: Prevents duplicate action execution using idempotency keys.
- `tool_timeout_enforcer`: Kills tool invocations exceeding time limits.
- `context_window_throttler`: Prevents amnesia or token-loop deadlocks via dynamic truncation.
- `recursive_loop_breaker`: Prevents agents from entering infinite tool-call loops.
- `offline_prompt_queue`: Buffers agent requests durante total packet loss/offline states.
- `hitl_trigger_router`: Pauses high-risk agent actions for human intervention.

---

## PBAC & Security
- **Tenant Isolation**: All AI data scoped by `tenantId`.
- **TenantAdmin**: Full access to agent registry and analytics.
- **Staff/Student**: Access to their own chats and documents.
- **Agent Actions**: Logged and auditable for governance compliance.

---

## Hono API Routes

| Method | Route | Description | Auth |
|:---|:---|:---|:---|
| `GET` | `/api/v1/ai/chats` | List chats | Self |
| `POST` | `/api/v1/ai/chats` | Create chat | Authenticated |
| `GET` | `/api/v1/ai/chats/:id/messages` | Get messages | Self |
| `POST` | `/api/v1/ai/chats/:id/message` | Send message | Self |
| `GET` | `/api/v1/ai/agents` | List agents | `TenantAdmin` |
| `GET` | `/api/v1/ai/agents/:id/actions` | Get agent actions | `TenantAdmin` |
| `GET` | `/api/v1/ai/documents` | List AI documents | Self |

---

## HMAS Agent Registry

| Agent | Type | Capabilities |
|:---|:---|:---|
| `ai_supervisor` | Supervisor | Agent orchestration, budget enforcement, health monitoring |
| `chat_agent` | Task | Chat completion, context management, document generation |
| `observability_agent` | Task | Token tracking, latency monitoring, anomaly detection |

---

## Domain Events

| Event | Payload | Consumers |
|:---|:---|:---|
| `ai.agent_action_completed` | `{ actionId, agentId, status }` | Events (audit), AI (telemetry) |
| `ai.agent_action_failed` | `{ actionId, agentId, error }` | Communication (admin alert), Events (audit) |
| `ai.token_budget_exceeded` | `{ tenantId, usage, limit }` | Finance (billing), Communication (alert) |
| `ai.hallucination_detected` | `{ agentId, messageId, confidence }` | AI (circuit breaker), Events (audit) |
