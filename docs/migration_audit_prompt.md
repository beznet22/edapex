# Database Migration Review & Audit Protocol

**Objective**: Perform a comprehensive technical audit of the EdApex V2 database migration and modernization project. Ensure absolute alignment with the architectural goals documented in `docs/` and verify the integrity of the 14 domain schemas implemented in `src/lib/server/db/domain-*.ts`.

## Context Overview
The project involves migrating a legacy MariaDB database (`devdb`) to a modernized, consolidated schema (`edapex_v2`) using Drizzle ORM. The goal is to move from a flat, redundant structure to a normalized, polymorphic architecture while preserving data parity.

## Audit Checklist for the AI Agent

### 1. Architectural Alignment
- [ ] **Polymorphic Consolidation**: Review `domain-core.ts` (Accounts). Ensure that `sm_students`, `sm_staffs`, and `sm_parents` are correctly mapped to `edx_accounts` using the `account_type` enum and `metadata` JSON blob.
- [ ] **Polymorphic Linkage**: Verify `domain-academic.ts` (Enrollments). Ensure `edx_enrollments` correctly links student accounts to classes, and `edx_subject_assignments` links staff accounts to subjects.
- [ ] **Unified Financials**: Review `domain-finance.ts`. Check if the `edx_ledger_entries` table correctly consolidates legacy fee payments, wallet top-ups, and expenses using the `transaction_type` and `reference_type` polymorphic pointers.
- [ ] **Domain Separation**: Verify that the 14 domains satisfy the "Strangler Fig" pattern requirements.
- [ ] **Naming Conventions**: Ensure all V2 tables follow the `edx_*` prefixing and snake_case column naming.
- [ ] **Naming Conventions**: Ensure all V2 tables follow the `edx_*` prefixing and snake_case column naming.
- [ ] **Legacy Deadwood & Mapping Cleanup**: Identify and flag for removal all columns carried over from `devdb` that are no longer required. Specifically, target all columns with the `legacy_` prefix (e.g., `legacy_student_id`, `legacy_staff_id`, `legacy_parent_id`). These were temporary mappings for Phase 5 verification and must be removed to ensure a "Clean Slate" architecture.

### 2. Schema Verification
- [ ] **Foreign Key Enforcement**: Audit the `REFERENCES` constraints added to all `domain-*.ts` files. Specifically, check cross-database references to `devdb.users` for identity integrity.
- [ ] **Indexing Strategy**: Review all `index()` definitions in the Drizzle schemas. Ensure high-traffic lookup columns (e.g., `user_id`, `class_id`, `account_id`, `academic_id`) are indexed to prevent performance degradation on large datasets.
- [ ] **Multi-tenancy**: Verify that the `tenant_id` (school_id) is present and correctly restricted in all core domain tables.

### 3. Data Migration Integrity
- [ ] **Backfill Scrutiny**: Review the backfill logic in `scripts/backfill-*.ts`. Ensure that account IDs are correctly resolved from legacy primary keys during the migration of dependent data (Attendance, Results, Enrollments).
- [ ] **Legacy Orphans Detection**: Verify the handling of "Legacy Orphans" (users without profiles). Confirm they were intentionally and safely excluded from `edx_accounts`.
- [ ] **Parity check**: Re-run row count comparisons between key legacy tables and the new consolidated V2 tables using `scripts/verify-migration.ts`.

### 4. Codebase Readiness
- [ ] **Repository Layer (Shadow Writes)**: Verify that `BaseRepository` and specific repos (Student, Staff) have dual-write logic implemented correctly to keep V2 in sync with live legacy traffic.
- [ ] **Type Safety**: Check exported types for all domain schemas and ensure they are properly used in the repository layer.

## Recommended Tools for Audit
1. `mysql -e "SHOW CREATE TABLE ..."` on key V2 tables.
2. `npx tsx scripts/verify-migration.ts` to check data parity.
3. `grep_search` to find all `.references()` and `.index()` calls.

## Final Report Requirement
Produce a `migration_audit_report.md` summarizing:
1. **Critical Vulnerabilities**: Any missing integrity constraints or broken FKs.
2. **Parity Gaps**: Data points found in legacy but missing in V2.
3. **Architecture Deviations**: Any implementation details that contradict the original design documents.
4. **Approval Recommendation**: State clearly if Phase 5 & 6 are "Production Ready".
