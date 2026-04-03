# Settings Domain Architecture

## Overview
The Settings domain decouples system configuration from hardcoded files into database-driven, tenant-scoped settings. It provides a key-value configuration store indexed by `domain` (e.g., `general`, `finance`, `lms`) and a feature flag system for gradual rollouts, A/B testing, and module enablement.

### Key Business Logic
- **Domain-Scoped Config**: Each setting row represents a config block for a specific domain (`general`, `finance`, `attendance`, `ai`). JSON `config` stores typed configuration objects.
- **Feature Flags**: Tenant-scoped dark launches with `featureKey`, `isEnabled`, `rolloutPercentage`, and optional targeted user IDs.
- **Type Safety**: Config values use discriminated union types (`GeneralConfig`, `FinanceConfig`, `LmsConfig`, `HomeschoolConfig`, `ClassroomConfig`).
- **[NEW] Professional Persona Flow (The IT Admin)**: Mr. Chinedu, the IT Administrator, prepares the "Region-Specific Feature Rollout" goal. He uses the `config_manager` to update the localized grading scale in `Settings.Config`. Before promoting to production, he enables the `lms.ai_tutoring` feature flag for a 10% canary rollout. When the `feature_flag_circuit_breaker` detects a latency spike, it auto-reverts the setting, which Mr. Chinedu verifies via a Boneyard-powered "State Rollback" toast in his Command Center.

---

## Logic Parity (Legacy to V2)

### Schema Mapping
| Legacy Table (`schoolify`) | V2 Entity (`src/db/domain-settings.ts`) | Notes |
| :--- | :--- | :--- |
| `sm_general_settings` / `infixedu__settings` | `settings` (domain: `general`) | School name, logo, address, timezone. |
| `sm_email_settings` / `sm_sms_gateways` | `settings` (domain: `communication`) | Channel provider config. |
| `sm_payment_gateway_settings` | `settings` (domain: `finance`) | Currency, receipt prefix, invoice prefix. |
| `sm_dashboard_settings` / `sm_home_page_settings` | `settings` (domain: `ui`) | Dashboard and homepage config. |
| `invoice_settings` / `maintenance_settings` | `settings` (domain: specific) | Merged into domain-scoped settings. |
| — (new) | `featureFlags` | Dark launches and gradual rollouts. |

---

## Technical Implementation

### Core Entities

#### [Settings](/home/beznet/Workspace/edapex/src/db/sqlite/domain-settings.ts#L48)
Key-value config store. Unique constraint on `(tenantId, domain)`. JSON `config` supports `GeneralConfig`, `FinanceConfig`, `LmsConfig`, `HomeschoolConfig`, `ClassroomConfig`, or arbitrary objects.

#### [FeatureFlags](/home/beznet/Workspace/edapex/src/db/sqlite/domain-settings.ts#L66)
Feature toggle system. `featureKey` (e.g., `lms.ai_tutoring`), `isEnabled`, `rolloutPercentage` (0-100). Metadata supports targeted user IDs and A/B variants.

---

## AI Task Agents & Tools

### Operational Tools (Mastra)
- `settings.updateConfig(domain, config)`: Updates tenant-scoped configuration with validation.
- `settings.setAcademicYear(yearId)`: Transitions the active academic period for a tenant.
- `get_tenant_config`: Retrieves merged config for a domain (tenant-level + system defaults).
- `check_feature_flag`: Evaluates if a feature is enabled for a given tenant/user.
- `migrate_legacy_settings`: Imports legacy settings into the domain-scoped JSON format.
- `sync_config_across_nodes`: Ensures config consistency across edge nodes.

### [STRESS DEFENSE] Tools
- `config_rollback_guard`: Captures config snapshots before mutations for instant rollback.
- `feature_flag_circuit_breaker`: Auto-disables features causing error rate spikes.
- `config_validation_engine`: Schema-validates config JSON against expected types.

---

## PBAC & Security
- **TenantAdmin**: Full settings and feature flag management.
- **SuperAdmin**: System-wide defaults and cross-tenant config.
- **All Others**: Read-only access to public config (school name, logo).

---

## Hono API Routes

| Method | Route | Description | Auth |
|:---|:---|:---|:---|
| `GET` | `/api/v1/settings/:domain` | Get config for domain | Authenticated |
| `PUT` | `/api/v1/settings/:domain` | Update config for domain | `TenantAdmin` |
| `GET` | `/api/v1/feature-flags` | List feature flags | `TenantAdmin` |
| `POST` | `/api/v1/feature-flags` | Create feature flag | `TenantAdmin` |
| `PATCH` | `/api/v1/feature-flags/:key` | Toggle feature flag | `TenantAdmin` |

---

## HMAS Agent Registry

| Agent | Type | Capabilities | Link |
|:---|:---|:---|:---|
| `config_manager` | Task | Config retrieval, validation, default merging | [SOUL.md](../strategy/SOUL.md) |
| `feature_flag_evaluator` | Task | Rollout percentage calculation, A/B variant selection | [SOUL.md](../strategy/SOUL.md) |
| `config_auditor` | Task | Change tracking, rollback management | [SOUL.md](../strategy/SOUL.md) |

---

## Domain Events

| Event | Payload | Consumers |
|:---|:---|:---|
| `settings.config_updated` | `{ tenantId, domain, changedKeys }` | All domains (cache invalidation) |
| `settings.feature_flag_toggled` | `{ featureKey, isEnabled, tenantId }` | Events (audit) |
| `settings.config_rollback` | `{ tenantId, domain, reason }` | Communication (admin alert) |

---

## UI Documentation (Boneyard)
- **Configuration Dashboard**: All settings forms MUST implement `boneyard-js` skeletons to handle high-density JSON config editing without UI lag.
- **Toggle Animations**: Feature flag toggles must use the "Refraction-Pro" glassmorphism style for immediate visual feedback of state changes.


