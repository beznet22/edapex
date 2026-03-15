# 🏗️ EdApex Target PostgreSQL Schema (Lightweight & Self-Evolving)

> **Philosophy**: Flat, Fast, and Autonomic.
> **Database**: PostgreSQL 16+ | **Extensions**: `pgcrypto`, `pgvector`

---

## 0. Schema Global Patterns

### UUIDv7 & Audit Standard
All tables use **UUIDv7** for monotonically sortable, globally unique IDs.
```sql
-- Audit columns on ALL tables
id          UUID PRIMARY KEY DEFAULT gen_uuidv7(),
tenant_id   UUID NOT NULL, -- RLS enforced
created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
metadata    JSONB DEFAULT '{}' -- For flex-data (no migrations needed)
```

### RLS Strategy
```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON <table>
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

---

## 1. 📦 `core` Schema (Identity & Multi-Tenancy)

Consolidates IAM, Tenant Config, and Global Settings.

```sql
CREATE SCHEMA core;

-- ═══════════════════════════════════════
-- TENANTS (Consolidates IAM Context)
-- Absorbs: sm_schools, sm_general_settings, sm_sms_gateways, sm_email_settings
-- ═══════════════════════════════════════
CREATE TABLE core.tenants (
  id          UUID PRIMARY KEY DEFAULT gen_uuidv7(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  config      JSONB NOT NULL DEFAULT '{}', -- Absorbs ALL settings from 5+ legacy tables
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE core.users (
  id          UUID PRIMARY KEY DEFAULT gen_uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES core.tenants(id),
  full_name   TEXT NOT NULL,
  email       TEXT NOT NULL,
  role_id     UUID,
  is_active   BOOLEAN DEFAULT true,
  UNIQUE (tenant_id, email)
);

CREATE TABLE core.roles (
  id          UUID PRIMARY KEY DEFAULT gen_uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES core.tenants(id),
  name        TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]', -- Resource-Action mapping
  UNIQUE (tenant_id, name)
);

CREATE TABLE core.credentials (
  id          UUID PRIMARY KEY DEFAULT gen_uuidv7(),
  user_id     UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES core.tenants(id),
  type        TEXT NOT NULL, -- 'password', 'api_key', 'mfa_totp'
  secret      TEXT NOT NULL,
  meta        JSONB DEFAULT '{}', -- Salt, Algorithm, Expiry
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE core.policies (
  id          UUID PRIMARY KEY DEFAULT gen_uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES core.tenants(id),
  name        TEXT NOT NULL, -- e.g. 'grade_exam'
  description TEXT,
  rules       JSONB NOT NULL, -- The YAML/JSON rules from PBAC.md
  is_active   BOOLEAN DEFAULT true,
  UNIQUE (tenant_id, name)
);

CREATE TABLE core.audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_uuidv7(),
  tenant_id   UUID NOT NULL,
  actor_id    UUID REFERENCES core.users(id),
  action      TEXT NOT NULL,
  resource    TEXT NOT NULL,
  changes     JSONB, -- {before, after}
  created_at  TIMESTAMPTZ DEFAULT now()
) PARTITION BY RANGE (created_at);
```

---

## 2. 🍱 `domain` Schema (School Operations)

Consolidates Student Lifecycle, Academics, Finance, HR, and Operations.

```sql
CREATE SCHEMA domain;

-- POLYMORPHIC ENTITIES
-- Absorbs: sm_students, sm_staffs, sm_parents, users, sm_suppliers
CREATE TABLE domain.entities (
  id          UUID PRIMARY KEY DEFAULT gen_uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES core.tenants(id),
  user_id     UUID REFERENCES core.users(id), -- Link to Auth credentials
  type        TEXT NOT NULL, -- 'student', 'staff', 'guardian', 'vendor'
  first_name  TEXT NOT NULL,
  last_name   TEXT,
  data        JSONB NOT NULL DEFAULT '{}', -- Absorbs 100+ columns across 5 tables
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ACADEMIC STRUCTURE
-- Absorbs: sm_classes, sm_sections, sm_subjects, sm_academic_years, sm_class_times, sm_online_exams, sm_homework
CREATE TABLE domain.academics (
  id          UUID PRIMARY KEY DEFAULT gen_uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES core.tenants(id),
  type        TEXT NOT NULL, -- 'class', 'section', 'subject', 'year', 'online_exam', 'homework'
  name        TEXT NOT NULL,
  parent_id   UUID REFERENCES domain.academics(id), -- Hierarchy (Section -> Class)
  config      JSONB DEFAULT '{}', -- Absorbs pass marks, credits, question banks, assignment deadines
  UNIQUE (tenant_id, type, name, parent_id)
);

-- THE LEDGER
-- Absorbs: sm_fees_*, wallet_*, sm_hr_payroll_*, transcations, sm_inventory_stocks
CREATE TABLE domain.ledger (
  id            UUID PRIMARY KEY DEFAULT gen_uuidv7(),
  tenant_id     UUID NOT NULL REFERENCES core.tenants(id),
  entity_id     UUID NOT NULL REFERENCES domain.entities(id),
  amount        NUMERIC(19, 4) NOT NULL,
  balance       NUMERIC(19, 4), -- Snapshot balance
  category      TEXT NOT NULL, -- 'fee_payment', 'salary', 'wallet_topup'
  status        TEXT DEFAULT 'posted',
  details       JSONB, -- Method, Reference, Note
  created_at    TIMESTAMPTZ DEFAULT now()
) PARTITION BY RANGE (created_at);

-- ATTENDANCE & LOGS (High volume)
CREATE TABLE domain.activity_logs (
  id            UUID PRIMARY KEY DEFAULT gen_uuidv7(),
  tenant_id     UUID NOT NULL REFERENCES core.tenants(id),
  entity_id     UUID NOT NULL REFERENCES domain.entities(id),
  type          TEXT NOT NULL, -- 'attendance', 'discipline', 'exam_result'
  value         TEXT NOT NULL, -- 'present', 'A+', 'late'
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT now(),
  meta          JSONB
) PARTITION BY RANGE (timestamp);
```

---

## 3. 🧠 `ai` Schema (Self-Evolving Agents)

The Intelligence and Autonomic Layer.

```sql
CREATE SCHEMA ai;

-- CONVERSATIONS & CONTEXT
CREATE TABLE ai.threads (
  id          UUID PRIMARY KEY DEFAULT gen_uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES core.tenants(id),
  user_id     UUID REFERENCES core.users(id),
  title       TEXT,
  context     JSONB DEFAULT '{}', -- Transient session state
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE ai.messages (
  id          UUID PRIMARY KEY DEFAULT gen_uuidv7(),
  thread_id   UUID NOT NULL REFERENCES ai.threads(id) ON DELETE CASCADE,
  role        TEXT NOT NULL, -- 'user', 'assistant', 'system', 'tool'
  content     TEXT,
  tool_calls  JSONB, -- If role is assistant
  feedback    JSONB, -- User votes/ratings
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- KNOWLEDGE BASE (RAG)
CREATE TABLE ai.memory (
  id          UUID PRIMARY KEY DEFAULT gen_uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES core.tenants(id),
  content     TEXT NOT NULL,
  embedding   VECTOR(1536), -- Vector index
  source_type TEXT, -- 'policy', 'handbook', 'web'
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- SELF-EVOLVING INFRASTRUCTURE
CREATE TABLE ai.tool_registry (
  id          UUID PRIMARY KEY DEFAULT gen_uuidv7(),
  tenant_id   UUID NOT NULL REFERENCES core.tenants(id),
  name        TEXT NOT NULL,
  description TEXT, -- LLM-facing prompt
  parameters  JSONB, -- Input JSON Schema
  handler_url TEXT, -- Dynamic tool endpoint
  performance_score NUMERIC(3, 2) DEFAULT 0, -- Success rate
  version     INT DEFAULT 1,
  is_active   BOOLEAN DEFAULT true,
  UNIQUE(tenant_id, name)
);

CREATE TABLE ai.evolution_log (
  id          UUID PRIMARY KEY DEFAULT gen_uuidv7(),
  tenant_id   UUID NOT NULL,
  tool_id     UUID REFERENCES ai.tool_registry(id),
  observation TEXT NOT NULL, -- "Agent keeps getting schema errors on parameter X"
  suggested_fix JSONB, -- {new_description, suggested_schema}
  status      TEXT DEFAULT 'pending' -- 'pending', 'applied', 'revoked'
);
```

---

## 4. Why This Wins

1.  **Low Complexity**: From 170+ tables to ~15 core tables. Developers learn the system in minutes.
2.  **No-Migration Evolution**: Adding "Emergency Contact 2" to a student is a UI change, not a `DB ALTER TABLE`.
3.  **High Speed**: Reduced table count = massive reduction in join memory. Partitioning ensures high volume (attendance/audit) stays fast.
4.  **Self-Improving**: The `ai.evolution_log` allows the system to identify its own reasoning bottlenecks and propose schema or prompt fixes.
