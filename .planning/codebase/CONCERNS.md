---
title: EdApex V2 Concerns
description: Known issues, architectural friction points, and security constraints
---

# System Concerns

This document details explicit technical debt, structural concerns, and known constraints mapped in the codebase. Always consult this document before initiating refactors into core platform pipelines.

## 1. Security & PWA Device Fingerprinting (Important)
- **Constraint**: The stateless JWT/JWE authentication enforces PWA tracking logic to prevent simple replay attacks.
- **Concern**: The `AuthService` source code indicates a `FIXME` regarding device fingerprinting logic resetting after standard browser reloads outside of explicit PWA wrapper installations. This risks session drops for standard web execution.
- **Path**: Any edits to `auth.service.ts` must manually test cross-browser persistence.

## 2. Missing Core Implementations
- **Constraint**: Roles and features mapped during Phase 1 that have UI representations but lack deep execution layer hooks.
- **Concern**: The `resetPwd` feature inside the coordinator interface returns immediately without generating token cascades or updating the actual Hash schema. Labeled as "Not Implemented".

## 3. Tenant Bleeding 
- **Constraint**: Drizzle ORM queries do not execute row-level security (RLS) policies directly on the SQL plane.
- **Concern**: Repositories are theoretically capable of cross-tenant interaction. If `schoolId` or `academicId` logic is manually bypassed in a query constraint, one tenant's agent could execute tools over another tenant's schema space.

## 4. Schema Complexity
- **Constraint**: `sms-schema.ts` is 9000+ lines defining over a hundred interlinked relational bounds.
- **Concern**: Editing this file is highly error-prone due to string-bound foreign key cascades scattered across the definition chain. Future phases MUST split this schema directly into a schema directory array containing isolated domain schemas (e.g. `auth-schema.ts`, `finance-schema.ts`, `chat-schema.ts`) tied together centrally.
