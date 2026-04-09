# Requirements: EdApex V2 Agentic School

**Defined:** 2026-04-09
**Core Value:** A multi-tenant, edge-native AI control plane that autonomously manages educational institutions through a hierarchical multi-agent system.

## v1 Requirements (Phase 4 Focus)

### UI Shell & Navigation
- [ ] **SHELL-01**: Three-pane dashboard (Navigation, Workspace, AI/Pulse).
- [ ] **SHELL-02**: Sidebar with multi-tenant scoping (Institutional, Departmental, Personal).
- [ ] **SHELL-03**: Global Search Bar for natural language intent resolution via the Principal Assistant.
- [ ] **SHELL-04**: Skeleton screens powered by `boneyard-js` for all data loading states.

### Real-Time Telemetry
- [ ] **TELM-01**: Real-time "Agent Pulse" stream showing system ticks and tool-calls.
- [ ] **TELM-02**: SSE-powered "Atomic Checkout" to display live token/cost events.
- [ ] **TELM-03**: Ghost notifications in the properties panel for low-priority agent logs.

### Local-First Persistence & Sync
- [ ] **SYNC-01**: Local-first state management via TanStack DB for 50ms UI latency.
- [ ] **SYNC-02**: Background reconciliation of local IndexedDB mutations with Cloudflare D1.
- [ ] **SYNC-03**: Semantic merge for Markdown artifacts (WorkProducts).
- [ ] **SYNC-04**: Strict transactional integrity for financial ledger entries.

### Governance & PBAC
- [ ] **GOV-01**: Evaluation of PBAC policies at the Edge Gateway before tool execution.
- [ ] **GOV-02**: Domain-restricted toolsets for Specialized HMAS Supervisors.
- [ ] **GOV-03**: Automatic lockdown of agents upon detected policy violations.

### Financial Controls
- [ ] **FIN-01**: Hard-stop budget enforcement based on billed cents.
- [ ] **FIN-02**: Atomic checkout loop requiring ledger credit before inference.

## v2 Requirements (Future Phases)

### Autonomous Optimization
- **OPT-01**: Proactive "Maximizer" auditor to scan for token inefficiencies.
- **OPT-02**: Recursive memory summarization to optimize context window spend.

### Community & Portability
- **PORT-01**: Portable `SCHOOL.md` and `AGENTS.md` manifests.
- **PORT-02**: Global Skill Registry for cross-school collaboration.

## Out of Scope

| Feature | Reason |
|---------|--------|
| On-premise GPU hosting | V2 focuses on Edge (Cloudflare) and standard API providers. |
| Native Mobile Apps | PWA and responsive web-first approach per current architecture. |
| Legacy Paperclip Support | V2 transforms/strangles Paperclip; it does not support it long-term. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SHELL-01 | Phase 4 | Pending |
| SHELL-02 | Phase 4 | Pending |
| SHELL-03 | Phase 4 | Pending |
| SHELL-04 | Phase 4 | Pending |
| TELM-01 | Phase 4 | Pending |
| TELM-02 | Phase 4 | Pending |
| TELM-03 | Phase 4 | Pending |
| SYNC-01 | Phase 2 | Pending |
| SYNC-02 | Phase 2 | Pending |
| SYNC-03 | Phase 4 | Pending |
| SYNC-04 | Phase 4 | Pending |
| GOV-01 | Phase 2 | Pending |
| GOV-02 | Phase 3 | Pending |
| GOV-03 | Phase 2 | Pending |
| FIN-01 | Phase 1 | Complete |
| FIN-02 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-09*
*Last updated: 2026-04-09 after initialization*
