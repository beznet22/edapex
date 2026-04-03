# Staging: Hermes Runtime & Context Intelligence Integration

This document outlines the high-fidelity integration of Hermes Runtime, Prompt Assembly, and Context Compression into EdApex V2, ensuring no architectural drift.

## 1. Runtime Enhancements

### 1.1 The "System + 3" Caching Loop
Refactor `src/services/ai/prompt-builder.ts` to strictly enforce:
- **Breakpoint 1 (IMMUTABLE)**: System Identity (SOUL.md) + HMAS Structure (Section 1-46).
- **Breakpoint 2-4**: Rolling window of the 3 most recent turns.
- **Benefit**: Reductions in Edge latency by ~50% and token costs by ~30% for long sessions.

### 1.2 Boundary-Aware Compression
The `EdApexContextCompressor` (Auditor Agent subsystem) MUST:
- **Prune Tool Results**: Aggressively clear tool results >200 chars in non-tail messages.
- **Align Boundaries**: Never split a `tool_call` from its `tool_result`. Walk backward to the parent `assistant` message before summarizing.

## 2. Multi-Dialect Persistence (Mandatory)

All AI-related tables in `src/db/schema.ts` MUST be implemented with dialect-agnostic types following the Repository Pattern:

### 2.1 `ai_sessions` Evolution
| Column | Dialect: D1/SQLite | Dialect: PostgreSQL | Dialect: MySQL |
| :--- | :--- | :--- | :--- |
| **id / tenant_id** | `text` (UUID) | `uuid` | `varchar(36)` |
| **parent_session_id** | `text` | `uuid` | `varchar(36)` |
| **token_stats** | `text` (JSON) | `jsonb` | `json` |
| **is_compressed** | `integer` (0/1) | `boolean` | `tinyint(1)` |

### 2.2 Full-Text Search (FTS)
- **SQLite/D1**: Utilize `FTS5` virtual tables.
- **Postgres**: Utilize `tsvector` and `GIN` indexes.
- **MySQL**: Utilize `FULLTEXT` indexes on message content.

## 3. Implementation Phases

- **PHASE-2**: Implement **System+3 Caching** and **Session Lineage** (Schema).
- **PHASE-4**: Implement **Dual-Stage Compression** with **Boundary Realignment**.
- **PHASE-5**: Deploy the **Auditor Agent** specifically to handle recursive "Middle Turn" summarization across all dialects.

---
**Status**: STAGING (Pending Review)
