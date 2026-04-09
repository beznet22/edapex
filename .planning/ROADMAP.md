# ROADMAP: EdApex V2 Agentic School

Phased execution plan for the Agentic School transformation, aligned with the 18-domain architecture.

## Milestone 1: Foundation & Gateway
Status: 🟢 Complete
Goal: Establish the edge-native backbone and secure control plane.

### Phase 1: Foundation & Ledger
- [x] **Repo Refactor**: Implement Drizzle Repository pattern across core domains.
- [x] **Multi-Tenant Schema**: Deploy `cost_events` and `finance_events` tables.
- [x] **HMAS Initial**: Registry for Specialized Assistants.

### Phase 2: Gateway & Sync
- [x] **PBAC Edge**: Policy evaluator middleware in Hono + KV Caching.
- [x] **Local-First**: TanStack DB setup for all domain collections.
- [x] **Background Sync**: IndexedDB to D1 reconciliation engine.

### Phase 3: Cognitive Core
- [x] **Principal Dispatcher**: LLM-based goal decomposition using `SOUL.md`.
- [x] **Recursive Memory**: Automated context snapshots and summarization.
- [x] **Tool Discovery**: Dynamic skill registry with PBAC vetting.

## Milestone 2: Professional Control Plane
Status: 🟡 Active
Goal: Deploy the high-density Command Center and core academic domains.

### Phase 4: Command Center UI
- [x] **3-Pane Shell**: Layout implementation using TanStack Start & Tailwind v4.
- [x] **SSE Pipeline**: Real-time heartbeat and pulse telemetry.
- [x] **Work Gallery**: Masonry grid for high-density artifact review.

### Phase 5: Academic Domain
- [ ] **Academic Ledger**: Immutable student record audit trail.
- [ ] **Curriculum Engine**: Hierarchical course/module modeling.
- [ ] **Academic Agents**: Enrollment Coordinator & Curriculum Designer.

### Phase 6: Staff & Operations
- [ ] **Staff Ledger**: Atomic cent-based payroll tracking.
- [ ] **Agentic Attendance**: NL-based check-in events.
- [ ] **Asset Tracking**: QR-ready UUID v7 mapping for inventory.

## Milestone 3: Community & Intelligence
Status: ⚪ Upcoming
Goal: Enable proactive intelligence and global stakeholder engagement.

### Phase 7: Communication & Community
- [ ] **Async Messaging**: Append-only messaging ledger and circle predicates.
- [ ] **Notification Hub**: Unified SSE alerts and system toasts.
- [ ] **Community Agents**: PR Officer & Event Planner.

### Phase 8: The Maximizer & Intelligence
- [ ] **Proactive Auditor**: Background agent for quality-density optimization.
- [ ] **Global Manifests**: Portable `SCHOOL.md` and `AGENTS.md` formats.

---
*Last updated: 2026-04-09 | Parity with Phases 1-7 Planning*
