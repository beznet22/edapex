# Documents Domain Architecture

## Overview
The Documents domain provides a polymorphic, scalable file management system for all digital assets across the platform. Using `ownerType` and `ownerId` polymorphic linkage, files can be attached to any entity (user profiles, homework, facilities) without altering their core tables.

### Key Business Logic
- **Polymorphic Ownership**: `ownerType` + `ownerId` enables any domain entity to have attached documents without schema changes.
- **Review Workflow**: `status`: `draft` → `pending_review` → `approved` / `rejected` for verified document management.
- **Version Tracking**: Metadata supports `version` and `previousVersionId` for document revision chains.
- **Expiry Management**: `expiresAt` for time-sensitive documents (licenses, certifications).
- **[NEW] Professional Persona Flow (The Registrar)**: Mr. Tunde, the Registrar, manages the "Student Record Hardening" goal. He triggers the `verification_agent` to scan for 200 pending admissions documents. When the `malware_scan_gate` flags a suspicious PDF, he reviews the `aiSessions` to verify that the `storage_quota_enforcer` has correctly blocked the upload. He approves the final student certificates via the `aiApprovals` gate, which then triggers the `archivist_agent` to sign and store the PDF WorkProducts, visualized via Boneyard skeletons.

---

## Logic Parity (Legacy to V2)

### Schema Mapping
| Legacy Table (`schoolify`) | V2 Entity (`src/db/domain-documents.ts`) | Notes |
| :--- | :--- | :--- |
| `sm_student_documents` | `documents` (ownerType: `student`) | Student-attached files. |
| `sm_staff_documents` | `documents` (ownerType: `staff`) | Staff-attached files. |
| `sm_upload_contents` / `sm_teacher_upload_contents` | `documents` (ownerType: varies) | Shared content uploads. |
| — (new) | `aiSessions` | [GOVERNANCE] Traceability for document review and verification. |
| — (new) | `aiTasks` | [GOVERNANCE] Atomic upload, scan, and signing tasks. |
| — (new) | `aiGoals` | [GOVERNANCE] Alignment with institutional record-keeping targets. |
| — (new) | `aiApprovals` | [GOVERNANCE] Human sign-off for certificate issuance and verification. |

---

## Technical Implementation

### Core Entity

#### [Documents](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-documents.ts#L28)
Universal document store. `ownerType` (e.g., `student`, `staff`, `homework`, `facility`), `ownerId`, `documentType`, `filePath`, `fileSize`, `mimeType`. JSON `metadata` for version tracking and verification.

> [!WARNING]
> Schema has a bug: `createdBy` column uses column name `created_at` which conflicts with the actual `createdAt` timestamp column. This should be renamed to `created_by` in the next migration.

---

## AI Task Agents & Tools

### Operational Tools (Mastra)
- `docs.archiveRecord(recordId)`: Moves a document to long-term R2 archival storage.
- `docs.generateCertificate(userId, type)`: Secure certificate creation as a PDF WorkProduct.
- `docs.signDocument(documentId)`: Cryptographic signing of official school records.
- `upload_document`: Handles file upload with mime type detection and metadata.
- `verify_document`: Moves a document through the review workflow.
- `archive_expired_documents`: Batch archives documents past their expiry date.
- `search_documents`: Full-text search across metadata and owner references.

### [STRESS DEFENSE] Tools
- `file_integrity_checker`: Validates file checksums after upload to detect corruption.
- `storage_quota_enforcer`: Prevents tenants from exceeding allocated storage limits.
- `malware_scan_gate`: Scans uploaded files before persistence.
- `orphan_file_cleanup`: Detects and purges documents with deleted owner references.

---

## PBAC & Security
- **TenantAdmin**: Full document management.
- **Staff**: Can upload/manage documents within their scope.
- **Student/Parent**: Can upload personal documents and view their own.
- **All Files**: Tenant-scoped via mandatory `tenantId`.

---

## Hono API Routes

| Method | Route | Description | Auth |
|:---|:---|:---|:---|
| `POST` | `/api/v1/documents/upload` | Upload document | Authenticated |
| `GET` | `/api/v1/documents/:ownerType/:ownerId` | List documents by owner | Self + Staff |
| `GET` | `/api/v1/documents/:id` | Get document details | Owner + Staff |
| `PATCH` | `/api/v1/documents/:id/verify` | Approve/reject document | Staff |
| `DELETE` | `/api/v1/documents/:id` | Delete document | Owner + `TenantAdmin` |

---

## HMAS Agent Registry

| Agent | Type | Capabilities |
|:---|:---|:---|
| Agent | Type | Capabilities | Link |
|:---|:---|:---|:---|
| `archivist_agent` | Task | Lifecycle, signing, certificates | [SOUL.md](../strategy/SOUL.md) |
| `verification_agent` | Task | Review workflow, integrity check | [SOUL.md](../strategy/SOUL.md) |
| `storage_agent` | Task | Quota, orphan cleanup, archival | [SOUL.md](../strategy/SOUL.md) |

---

## Domain Events

| Event | Payload | Consumers |
|:---|:---|:---|
| `documents.uploaded` | `{ documentId, ownerType, ownerId }` | Events (audit) |
| `documents.verified` | `{ documentId, status, verifiedBy }` | Communication (notification), Events (audit) |
| `documents.expired` | `{ documentId, ownerType }` | Communication (renewal reminder) |
| `documents.certificate_generated` | `{ documentId, userId, certificateType }` | Communication (delivery), Events (audit) |

---

## UI Documentation (Boneyard)
- **Document Explorer**: All document viewports MUST implement `boneyard-js` skeletons for sub-100ms file-list retrieval.
- **Review Workflow**: The verification viewport must utilize "Refraction-Pro" glassmorphism cards for scannable status/rejection reason visualization.
