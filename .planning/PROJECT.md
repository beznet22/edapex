# PROJECT: EdApex V2 Agentic School

Next-generation, AI-native School Management Platform (The Agentic School).

## What This Is
EdApex is a multi-tenant AI control plane designed for massive educational scalability. It transitions from traditional ERP logic to a Hierarchical Multi-Agent System (HMAS).

## Why It Exists (Core Value)
To handle the complexity of 100k+ schools using autonomous agents that can manage academic, financial, and operational workflows with minimal human intervention while maintaining strict multi-tenant isolation and financial auditability.

## Context
EdApex V2 is an evolution of a legacy project (Paperclip). It adopts an edge-native, local-first strategy to survive low-connectivity environments (Nigeria/Global South) while providing premium AI capabilities.

## Requirements

### Validated
- ✓ **DB-CORE**: Multi-dialect Drizzle ORM supporting D1, MySQL, SQLite.
- ✓ **TENANT-ISOLATION**: Mandatory `tenant_id` filtering at the repository layer.
- ✓ **HMAS-CORE**: Mastra-backed orchestration with domain supervisor pattern.
- ✓ **LEDGER-ATOMIC**: Double-entry financial events for token usage auditing.

### Active
- [ ] **UI-SHELL-V2**: 3-pane dashboard shell with AI-Elements chat and artifact viewer.
- [ ] **SSE-TELEMETRY**: Real-time agent pulse and cost heartbeat stream.
- [ ] **LOCAL-SYC**: TanStack DB background sync engine for offline-resilience.
- [ ] **PBAC-GATEWAY**: Edge-native policy evaluation before tool execution.

### Out of Scope
- Native Mobile Apps (Web-first PWA approach).
- On-premise GPU hosting (Edge API focus).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TanStack Start | Modern React 19 SSR/CSR versatility for high-density UI. | Adopted |
| Tailwind CSS v4 | Performance-first styling with modern design tokens. | Adopted |
| Cloudflare D1 | Edge-native persistence with low cold-start latency. | Adopted |
| Local-First (IndexedDB) | Critical for operational resilience in Nigeria. | Adopted |

## Evolution
This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason.
2. Requirements validated? → Move to Validated with phase reference.
3. New requirements emerged? → Add to Active.
4. Decisions to log? → Add to Key Decisions.
5. "What This Is" still accurate? → Update if drifted.

---
*Last updated: 2026-04-09 after initialization*
