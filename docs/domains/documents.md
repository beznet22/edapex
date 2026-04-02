# Documents Domain Architecture: Universal Polymorphic Storage

## 1. Overview
The EdApex V2 Documents domain replaces the fragmented and rigid file-handling logic of the legacy system with a unified, polymorphic, and cloud-native storage engine. By decoupling document metadata from business entities, V2 enables "attach-anything" capabilities without schema mutations.

## 2. Legacy vs. Modern Paradigm

| Feature | Legacy Laravel (InfixEdu) | EdApex V2 (Modern) |
| :--- | :--- | :--- |
| **Storage Structure** | Multiple tables (`sm_student_documents`, `sm_upload_contents`, etc.) | Unitary `documents` table with polymorphic linkage. |
| **Entity Linkage** | Hardcoded Foreign Keys (e.g., `student_id`). | `owner_type` + `owner_id` (Polymorphic). |
| **Physical Storage** | Local filesystem (`public/uploads/`). | S3-compatible cloud storage (Abstracted). |
| **Metadata** | Limited (usually just title/file). | Extensible JSON `metadata` for versioning and auditing. |

## 3. Core Architecture

### A. Polymorphic Schema (`documents`)
The central `documents` table uses a polymorphic pattern to serve all domains:
- **`owner_type`**: The entity type (e.g., `'student'`, `'staff'`, `'homework'`, `'school'`).
- **`owner_id`**: The primary key of the owner entity.
- **`document_type`**: Categorization for business logic (e.g., `'profile_doc'`, `'study_material'`, `'assignment'`).

### B. Storage & Binary Abstraction
V2 implements a `StorageService` that abstracts physical file operations.
- **File Paths**: Stored as relative keys (e.g., `tenants/1/students/101/birth-cert.pdf`).
- **Cloud Transition**: The `filePath` column in V2 stores the cloud object identifier, facilitating easy migration from local testing to production S3/Cloudfront.
- **Binary Generation (`html2pdf`)**: The `DocumentService` exposes an internal facade that executes the `html2pdf` binary directly on strings yielded by Domain AI task agents (such as `generate_grading_report`). This ensures complex dynamic content is converted locally without exposing sensitive academic records to external generation APIs.

## 4. Legacy Mapping & Migration

### A. Fragmented Table Consolidation
The following legacy tables are merged into the V2 `documents` table:

| Legacy Table | V2 `owner_type` | V2 `document_type` |
| :--- | :--- | :--- |
| `sm_student_documents` | `student` or `staff` | `profile_doc` |
| `sm_teacher_upload_contents` | `class` or `section` | `study_material` |
| `sm_upload_contents` | `school` | `general_upload` |
| `sm_staffs` (Resume/Letters) | `staff` | `onboarding_doc` |

### B. Multipart Upload Strategy
While the legacy system handled files via standard HTTP POST (`fileUpload` helper), V2 recommends:
1. **Presigned URLs**: Fetching a temporary S3 upload URL for direct-to-cloud uploads.
2. **Metadata Callback**: Updating the `documents` table only after successful cloud persistence.

## 5. Security & Access Control
Unlike legacy `available_for_role` logic, V2 leverages **PBAC**:
- **Visibility**: Controlled by policies checking `owner_type` and requester context.
- **Temporary Access**: Use of CDN-signed URLs for private documents (e.g., payroll slips).

## 6. Implementation Notes
- **MIME Type Validation**: V2 enforces strict MIME checks in the `StorageService` layer, preventing execution of malicious files (replaces legacy `mimes:...` validation).
- **Tenant Isolation**: All file paths are prefixed with `tenant_id` at the storage provider level for physical data isolation.

---

## Hono API Routes

```
Routes → DocumentsController → DocumentsService → DocumentsRepository
```

| Method | Route | Description | Auth |
|:---|:---|:---|:---|
| `GET` | `/api/v1/documents` | List documents (filtered by owner_type) | Authenticated |
| `POST` | `/api/v1/documents/presign` | Get presigned upload URL | Authenticated |
| `POST` | `/api/v1/documents` | Create document metadata record | Authenticated |
| `GET` | `/api/v1/documents/:id` | Get document with signed download URL | Owner + Admin |
| `DELETE` | `/api/v1/documents/:id` | Delete document | Owner + Admin |
| `POST` | `/api/v1/documents/:id/verify` | Verify document (admin) | `TenantAdmin` |

---

## HMAS Agent Registry

| Agent | Type | Capabilities |
|:---|:---|:---|
| `document_classifier` | Task | Auto-categorize uploaded documents |
| `document_verifier` | Task | Validate document authenticity and expiry |

---

## Domain Events

| Event | Payload | Consumers |
|:---|:---|:---|
| `docs.uploaded` | `{ documentId, ownerType, ownerId }` | Events (audit), AI (auto-classify) |
| `docs.verified` | `{ documentId, verifiedBy }` | Events (audit), Communication (notify owner) |
| `docs.expired` | `{ documentId, expiryDate }` | Communication (renewal reminder) |
