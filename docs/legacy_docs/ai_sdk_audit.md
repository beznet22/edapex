# EdApex AI SDK & Orchestration Audit

This document provides a comprehensive traceability map of the AI orchestration layer, file storage systems, extraction pipelines, and result publishing workflows.

## 1. AI SDK Request Lifecycle
**Path**: `UI` → `API Gateway` → `AgentService` → `Execution`

### 1.1 Frontend Entry Point
- **Composer**: `src/lib/components/chat/ChatInterface.svelte`
- **Dispatcher**: `useChat` hook calls `POST /api/chat`.

### 1.2 API Gateway (`src/routes/api/chat/+server.ts`)
- **Session Auth**: Captures `locals.user` and `locals.session`.
- **Role Hydration**: Detects if user is `STAFF` or `STUDENT`.
- **Provider Resolution**: Uses `ProviderRouter.getPreferredModel()` for lane-based routing (Strongest vs. Fastest).

### 1.3 Agent Orchestration (`src/lib/server/service/agent.service.ts`)
- **Hydration**: Injects context strings (User Role, Staff ID) into system prompts.
- **Tool Mapping**: Manually maps `coordinatorTools` based on assistant persona.
- **Execution**: Calls `streamText` from `@ai-sdk/google` or other providers.

---

## 2. File Storage & Extraction System
**Root Channel**: `POST /api/uploads`

### 2.1 Storage Hierarchy
Files are managed by `StudentFileStorage` (`src/lib/server/storage/student-files.ts`) in the following structure:
```bash
/storage/uploads/extracted/
└── {class_name}({section_name})/    # Lowercase, space-to-underscore
    └── {student_full_name}/
        ├── data.json                # ExtractedAssessment metadata
        └── {student_full_name}.jpg  # Primary assessment image
```

### 2.2 Extraction Pipeline (`AssessmentService.runExtraction`)
1. **Pass 1 (Transcription)**: LLM transcribes raw text/marks from image.
2. **Pass 2 (Mapping)**: Schema-aware LLM maps transcription to `ResultInput`.
3. **Logic Injection**: `applyGradingBusinessLogic` calculates totals and grades.
4. **Persistence**: Saves `data.json` and JPG to the storage hierarchy.

### 2.3 Cleanup & Sync (`DELETE /api/uploads`)
- **Filesystem**: Deletes the student/class subdirectories.
- **Database**: Calls `resultRepo.cleanMarks()` to remove linked marks/results from DB if a `recordId` is present in `data.json`.

---

## 3. PDF Generation & Preview
**Helper**: `src/lib/server/helpers/pdf-generator.ts`

### 3.1 Binary Bridge
- Uses `bin/html2pdf` (Linux binary) via `exec`.
- **Temporary State**: Creates `randomUUID` directory in `/tmp` for each request.
- **Capabilities**:
  - `generatePDF`: Returns buffer or file path.
  - `generatePreview`: Generates individual page JPGs and returns as a ZIP or buffer.

### 3.2 UI Rendering
- **Template**: `src/lib/components/template/ResultTemplate.svelte`.
- **Process**: Svelte `render` → HTML String → `html2pdf` → PDF.

---

## 4. Result Publishing Workflow
**Service**: `AssessmentService.publishResults`

### 4.1 Dispatch Sequence
1. **Validation**: `getStudentResult` retrieves hydrated data + Base64 images.
2. **Rendering**:
   - PDF generated using `ResultTemplate.svelte`.
   - Email Body generated using `ResultEmail.svelte`.
3. **Worker Dispatch**: `JobWorker` (via `email-job.ts`) sends SMTP mail with PDF and CID-embedded School Logo.
4. **Timeline Audit**:
   - `timelineRepo.upsertTimelines` records the event.
   - **Persistence**: `type: "exam-{examId}-{messageId}"`.
   - **Payload**: `file: base64(studentId, messageId, examId)`.

---

## 5. Traceability Map (Files)
| Component | Primary File Path |
| :--- | :--- |
| **Agent Gateway** | `src/lib/server/service/agent.service.ts` |
| **Tool Implementation** | `src/lib/chat/tools/coordinator.tool.ts` |
| **Storage Manager** | `src/lib/server/storage/student-files.ts` |
| **Extraction Logic** | `src/lib/server/helpers/chat-helper.ts` |
| **PDF Binary** | `bin/html2pdf` |
| **Job Worker** | `src/lib/server/worker/index.ts` |
| **Timeline Repo** | `src/lib/server/repository/timeline.repo.ts` |
