# Staging: Hermes Persistent Memory Integration for EdApex V2

Integrating environment-agnostic persistent memory and 3-tier context buffers.

## 1. Technical Mapping: Multi-Dialect Persistence
Hermes uses `MEMORY.md` and `USER.md` on disk. EdApex maps these to the **Persistence Layer** via Drizzle.

| Hermes Concept | EdApex Implementation | Platform Mapping |
| :--- | :--- | :--- |
| `memory` store | `ai_memories` Table | D1 (Edge) / Postgres (VPS) / TanStack (Client) |
| `user` store | `ai_user_profiles` Table | D1 (Edge) / Postgres (VPS) / TanStack (Client) |
| Character Limit | SQL `CHECK` / Zod | Enforced at Repository & Middleware |
| Frozen Snapshot | Prefetched Buffer | Orchestration / System Prompt |
| `session_search` | SQL `LIKE` / Vector | Dialect-Agnostic Query (Audit Logs) |

## 2. Memory Hierarchy (The PBAC Lens)
To ensure isolation, memory is partitioned:
1. **Executive Memory** (`agent_id=executive`): Global school conventions and institutional facts.
2. **Domain Memory** (`domain=[HR|Finance|...]`): Specific quirks and workflow lessons for a Supervisor.
3. **User Memory** (`user_id=UUID`): Preferences and identity for the human collaborator.

> [!NOTE]
> **Environment Agnosticism**: Persistence is handled via **Drizzle ORM**. This ensures `ai_memories` are stored in **D1** on the Edge and **PostgreSQL/MySQL** on VPS/Docker, with **TanStack DB** managing local-first client synchronization.

## 3. Implementation Workflow
1. **Database**: Add `ai_memories` table to `src/db/sqlite/domain-ai.ts` (with Postgres/MySQL parallels).
2. **Registry**: Update `src/services/ai/strategy/registry.ts` to share memory buffers across HMAS heartbeats.
3. **Tools**: Create `src/services/ai/tools/memory_tool.ts` with `add`, `replace`, `remove`.
4. **Prompting**: Update the HMAS bootstrap logic to inject the "Frozen Snapshot" header into system prompts.

## 5. Memory Providers (External Sync)
Following the Hermes standard, EdApex supports **Memory Providers** for additive external synchronization.

- **Primary Provider (Internal)**: Handled via the 8-layer `PersistenceService` (D1/Postgres).
- **Secondary Sync (External)**: Optional mirroring to services like **Mem0**, **Honcho**, or **OpenViking**.
- **Configuration**: Managed in `src/services/ai/strategy/config.ts` via tenant-scoped API keys stored in `domain-settings`.
- **Mirroring Pattern**: Every write to `ai_memories` triggers an async `PROVIDER_SYNC` event on the Event Bus to update external stores without blocking the Edge request.
