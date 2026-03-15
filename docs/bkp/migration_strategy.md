# 🚀 Lean EdApex Migration Strategy (High Speed)

This strategy is optimized for a **direct, high-speed cutover** into the consolidated Lightweight & Self-Evolving schema. We avoid complex CDC middleware in early phases, focusing on **Direct Hydrators** and **Real-time Validation**.

---

## 1. The "Hydrator" Pattern

Instead of table-by-table mirroring, we use **Domain-Aware Hydrators** (written in Rust/TypeScript) that ingest legacy rows and emit consolidated PG records.

### Phase 1: Ingest (Staging)
1.  **Direct Dump**: Use `pgloader` to pull the legacy MySQL database into a PG schema named `stage_legacy`.
2.  **Zero Modification**: Do not touch types or constraints in staging; keep it raw for speed.

### Phase 2: Hydrate (Consolidation)
Running the Hydrator CLI:
*   **Entity Hydrator**: Pulls from `sm_students`, `sm_staffs`, `sm_parents` → Emits `domain.entities`.
*   **Ledger Hydrator**: Pulls from `sm_fees_payments`, `wallet_transactions`, `sm_hr_payroll` → Emits `domain.ledger`.
*   **Config Hydrator**: Pulls from `sm_general_settings`, `sm_sms_gateways` → Emits `core.tenants.config` (JSONB).

### Phase 3: Validate (Reconciliation)
*   **Entity Counts**: `SELECT count(*) FROM domain.entities WHERE type = 'student'` must match `SELECT count(*) FROM stage_legacy.sm_students`.
*   **Financial Balance**: `SELECT sum(amount) FROM domain.ledger` must match the sum of legacy fee payments + payroll + wallet.
*   **PII Check**: Verify national IDs and bank accounts are correctly encrypted in `domain.entities.data`.

---

## 2. High-Speed Rollout Schedule

We migrate **one school at a time** (Tenant Isolation) to minimize blast radius and ensure 100% data fidelity.

### Step 1: Pilot Tenant (24 Hour Full Sync)
1.  Freeze writes for the pilot tenant in the legacy system.
2.  Run the Hydrators.
3.  Perform manual + AI-assisted data validation.
4.  Point the pilot DNS to EdApex.

### Step 2: Batch Migration (The 80/20 Rule)
1.  Automate the hydrator for schools with standard data profiles.
2.  Maintain a "Data Quality Dashboard" to track hydration errors in JSONB fields.

---

## 3. Advanced Features Integration

### Self-Evolving Readiness
*   The migration script pre-populates the `ai.tool_registry` with base tools.
*   Once a school is live, the **Evolution Agent** reviews legacy "Data Garbage" (typos, mismatched records) and proposes clean-up routines.

### Vector Memory Ingestion
*   During migration, school policies (Handbooks, Attendance Rules) are pulled from `sm_general_settings` and `sm_notice_boards`.
*   These are embedded using OpenAI Ada-002 and stored in `ai.memory` *before* the school goes live.

---

## 4. Rollback & Safety

*   **Reverse Sync**: If a critical bug is found, a reverse hydrator pushes new EdApex data back to legacy MySQL.
*   **Shadow Mode**: For complex schools, EdApex can run in "Observer Mode" (processing incoming writes via simple webhook) for 48h before cutover.

---

## 5. Comparison: Legacy vs. Lean

| Metric | Legacy Strategy | Lean Strategy |
|---|---|---|
| **Middleware** | Debezium + Kafka | Direct SQL/Rust CLI |
| **Complexity** | High (Real-time CDC) | Low (Ingest & Hydrate) |
| **Speed** | Slow (Syncing 170 tables) | Fast (Consolidating to ~15 tables) |
| **Risk** | Low (Dual-write) | Medium (Cutover-focused) |
| **Self-Healing** | No | Yes (via Evolution Agent) |
