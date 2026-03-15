-- 🏗️ EDAPEX FINAL CONSOLIDATED SCHEMA (v1.2 - Strict Domain Types)
-- Standards: PostgreSQL 16+, UUIDv7, RLS, NUMERIC financial precision.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- ═══════════════════════════════════════
-- 1. CORE SCHEMA (Tenancy, IAM, Policies)
-- ═══════════════════════════════════════
CREATE SCHEMA IF NOT EXISTS core;

CREATE TABLE core.tenants (
    id          UUID PRIMARY KEY, -- Expected to be UUIDv7
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    config      JSONB NOT NULL DEFAULT '{}', -- Notification settings, Branding, Gateways
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE core.users (
    id          UUID PRIMARY KEY,
    tenant_id   UUID NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
    full_name   TEXT NOT NULL,
    email       TEXT NOT NULL,
    role_id     UUID,
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE (tenant_id, email)
);

CREATE TABLE core.credentials (
    id          UUID PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
    tenant_id   UUID NOT NULL REFERENCES core.tenants(id),
    type        TEXT NOT NULL, -- 'password', 'api_key', 'mfa'
    secret      TEXT NOT NULL,
    meta        JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE core.policies (
    id          UUID PRIMARY KEY,
    tenant_id   UUID NOT NULL REFERENCES core.tenants(id),
    name        TEXT NOT NULL, -- 'view_student', 'grade_exam'
    description TEXT,
    rules       JSONB NOT NULL, -- YAML/JSON policy rules from PBAC.md
    is_active   BOOLEAN DEFAULT true,
    UNIQUE (tenant_id, name)
);

CREATE TABLE core.audit_log (
    id          UUID PRIMARY KEY,
    tenant_id   UUID NOT NULL,
    actor_id    UUID REFERENCES core.users(id),
    action      TEXT NOT NULL,
    resource    TEXT NOT NULL,
    changes     JSONB,
    created_at  TIMESTAMPTZ DEFAULT now()
) PARTITION BY RANGE (created_at);

-- ═══════════════════════════════════════
-- 2. DOMAIN SCHEMA (Unified School Operations)
-- ═══════════════════════════════════════
CREATE SCHEMA IF NOT EXISTS domain;

-- 👤 POLYMORPHIC PROFILES (Humans)
-- Consolidates Students, Staff, Guardians, etc.
CREATE TABLE domain.profiles (
    id          UUID PRIMARY KEY,
    tenant_id   UUID NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES core.users(id),
    type        TEXT NOT NULL CHECK (type IN ('student', 'staff', 'guardian', 'sibling', 'vendor', 'supplier', 'library_member')),
    first_name  TEXT NOT NULL,
    last_name   TEXT,
    email       TEXT,
    phone       TEXT,
    data        JSONB NOT NULL DEFAULT '{}', -- PII, health records, bio
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 📦 POLYMORPHIC ASSETS (Physical/Logical Resources)
-- Replaces Inventory, Books, Vehicles, etc.
CREATE TABLE domain.assets (
    id          UUID PRIMARY KEY,
    tenant_id   UUID NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
    type        TEXT NOT NULL CHECK (type IN ('book', 'vehicle', 'inventory_item', 'dorm_allocation', 'item_category', 'book_category')),
    name        TEXT NOT NULL,
    identifier  TEXT, -- Serial No, ISBN, Plate No
    data        JSONB NOT NULL DEFAULT '{}', -- Specs, maintenance info
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 🌳 RECURSIVE ACADEMICS & STRUCTURES
CREATE TABLE domain.academics (
    id          UUID PRIMARY KEY,
    tenant_id   UUID NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
    type        TEXT NOT NULL CHECK (type IN (
                   'academic_year', 'class', 'section', 'subject', 'classroom', 'class_teacher', 
                   'topic', 'syllabus', 'lesson_plan', 'study_material', 'exam_type', 
                   'exam_setup', 'exam_schedule', 'question_bank', 'online_exam', 'homework', 
                   'fee_group', 'fee_type', 'fee_master', 'fee_discount', 'department', 
                   'designation', 'transport_route', 'transport_stop', 'vehicle_assignment', 
                   'dormitory', 'dorm_room', 'dorm_room_type', 'cms_page', 'cms_menu', 
                   'cms_gallery', 'cms_testimonial', 'cms_news'
                 )),
    name        TEXT NOT NULL,
    parent_id   UUID REFERENCES domain.academics(id), -- e.g. Section -> Class
    config      JSONB DEFAULT '{}', -- Pass marks, fare price, capacity
    UNIQUE (tenant_id, type, name, parent_id)
);

-- UNIFIED LEDGER (Fees, Payroll, Wallets, Stock In/Out)
CREATE TABLE domain.ledger (
    id            UUID PRIMARY KEY,
    tenant_id     UUID NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
    profile_id    UUID REFERENCES domain.profiles(id),
    asset_id      UUID REFERENCES domain.assets(id),
    amount        NUMERIC(19, 4) NOT NULL,
    balance       NUMERIC(19, 4),
    category      TEXT NOT NULL CHECK (category IN (
                    'fee_collection', 'wallet_deposit', 'wallet_withdrawal', 'admission_fee', 
                    'salary_payout', 'staff_allowance', 'library_fine', 'inventory_purchase', 
                    'inventory_sale', 'item_issuance', 'room_rent', 'transport_fee', 
                    'generic_income', 'generic_expense'
                  )),
    status        TEXT DEFAULT 'posted' CHECK (status IN ('posted', 'pending', 'void')),
    created_at    TIMESTAMPTZ DEFAULT now()
) PARTITION BY RANGE (created_at);

-- ACTIVITY LOGS (Attendance, Exam Marks, Behavioral Feedback)
CREATE TABLE domain.activity_logs (
    id            UUID PRIMARY KEY,
    tenant_id     UUID NOT NULL REFERENCES core.tenants(id) ON DELETE CASCADE,
    profile_id    UUID REFERENCES domain.profiles(id),
    asset_id      UUID REFERENCES domain.assets(id),
    type          TEXT NOT NULL CHECK (type IN (
                    'student_attendance', 'staff_attendance', 'subject_attendance', 
                    'behavioral_record', 'mark_entry', 'exam_session', 'homework_submission', 
                    'library_issue', 'library_return', 'vehicle_checkin', 'dorm_checkin', 
                    'chat_log', 'audit_event'
                  )),
    value         TEXT NOT NULL, -- 'present', 'A+', 'late'
    recorded_at   TIMESTAMPTZ DEFAULT now(),
    meta          JSONB
) PARTITION BY RANGE (recorded_at);

-- ═══════════════════════════════════════
-- 3. AI SCHEMA (Intelligence & Evolution)
-- ═══════════════════════════════════════
CREATE SCHEMA IF NOT EXISTS ai;

CREATE TABLE ai.threads (
    id          UUID PRIMARY KEY,
    tenant_id   UUID NOT NULL REFERENCES core.tenants(id),
    user_id     UUID REFERENCES core.users(id),
    title       TEXT,
    context     JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE ai.messages (
    id          UUID PRIMARY KEY,
    thread_id   UUID NOT NULL REFERENCES ai.threads(id) ON DELETE CASCADE,
    role        TEXT NOT NULL, -- 'user', 'assistant', 'system', 'tool'
    content     TEXT,
    tool_calls  JSONB,
    feedback    JSONB,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE ai.memory (
    id          UUID PRIMARY KEY,
    tenant_id   UUID NOT NULL REFERENCES core.tenants(id),
    content     TEXT NOT NULL,
    embedding   VECTOR(1536),
    source_type TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- SELF-EVOLVING INFRASTRUCTURE (HMAS Support)
CREATE TABLE ai.tool_registry (
    id          UUID PRIMARY KEY,
    tenant_id   UUID NOT NULL REFERENCES core.tenants(id),
    name        TEXT NOT NULL,
    description TEXT, -- Agent manual
    parameters  JSONB, -- JSON Schema
    handler_url TEXT,
    performance_score NUMERIC(3, 2) DEFAULT 0,
    version     INT DEFAULT 1,
    is_active   BOOLEAN DEFAULT true,
    UNIQUE(tenant_id, name)
);

CREATE TABLE ai.evolution_log (
    id          UUID PRIMARY KEY,
    tenant_id   UUID NOT NULL,
    tool_id     UUID REFERENCES ai.tool_registry(id),
    observation TEXT NOT NULL,
    suggested_fix JSONB,
    status      TEXT DEFAULT 'pending'
);

-- ═══════════════════════════════════════
-- 4. GLOBAL RLS POLICIES (Zero-Trust)
-- ═══════════════════════════════════════
-- Note: Must be executed per-table in production
-- ALTER TABLE domain.profiles ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE domain.assets ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY tenant_isolation ON domain.profiles USING (tenant_id = current_setting('app.tenant_id')::uuid);
-- CREATE POLICY tenant_isolation ON domain.assets USING (tenant_id = current_setting('app.tenant_id')::uuid);
