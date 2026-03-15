# Database Migration Review & Audit Protocol

**Objective**: Perform a comprehensive technical audit of the EdApex V2 database migration and modernization project. Ensure absolute alignment with the architectural goals documented in `docs/` and verify the integrity of the 14 domain schemas implemented in `src/lib/server/db/domain-*.ts`.

## Context Overview
The project involves migrating a legacy MariaDB database (`devdb`) to a modernized, consolidated schema (`edapex_v2`) using Drizzle ORM. The goal is to move from a flat, redundant structure to a normalized, polymorphic architecture while preserving data parity.

## Audit Checklist for the AI Agent

### 1. Architectural Alignment
- [ ] **Polymorphic Consolidation**: Review `domain-core.ts` (Accounts) and `domain-academic.ts` (Enrollments). Ensure the "One Identity, Many Roles" pattern is correctly implemented.
- [ ] **Domain Separation**: Verify that the 14 domains satisfy the "Strangler Fig" pattern requirements defined in the implementation plan.
- [ ] **Naming Conventions**: Ensure all V2 tables follow the `edx_*` prefixing and snake_case column naming as per system standards.

### 2. Schema Verification
- [ ] **Foreign Key Enforcement**: Audit the `REFERENCES` constraints added to all `domain-*.ts` files. Specifically, check cross-database references to `devdb.users` for identity integrity.
- [ ] **Indexing Strategy**: Review all `index()` definitions in the Drizzle schemas. Ensure high-traffic lookup columns (e.g., `user_id`, `class_id`, `account_id`) are indexed.
- [ ] **Multi-tenancy**: Verify that the `tenant_id` (school_id) is present and correctly restricted in all core domain tables.

### 3. Data Migration Integrity
- [ ] **Backfill Scrutiny**: Review the backfill logic used for `edx_accounts` and `edx_enrollments`. 
- [ ] **Legacy Orphans Detection**: Verify the handling of "Legacy Orphans" (users without profiles). Confirm they were intentionally and safely excluded.
- [ ] **Parity check**: Re-run row count comparisons between key legacy tables (`sm_students`, `sm_parents`, `sm_staffs`) and the new consolidated `edx_accounts`.

### 4. Codebase Readiness
- [ ] **Repository Layer**: Verify that `BaseRepository` is correctly configured for single-database writes (legacy) but ready for future dual-db operations.
- [ ] **Type Safety**: Check exported types for all domain schemas and ensure they are properly used in the repository layer.

## Recommended Tools for Audit
1. `mysql -e "SHOW CREATE TABLE ..."` on key V2 tables.
2. `SELECT COUNT(*)` comparisons between `devdb` and `edapex_v2`.
3. `grep_search` to find all `references()` calls to ensure no major FK is missing.

## Final Report Requirement
Produce a `migration_audit_report.md` summarizing:
1. **Critical Vulnerabilities**: Any missing integrity constraints.
2. **Parity Gaps**: Data points found in legacy but missing in V2.
3. **Architecture Deviations**: Any implementation details that contradict the original design documents.
4. **Approval Recommendation**: State clearly if Phase 5 is "Production Ready".
