SOME CLARIFICATION OF WHAT I ACTUALLY NEED:

** Phase 3: Client (after first turn)**
[AI SDK Chat] receives:
  1. data-runInfo { runId: 'abc123' }                    → chat.activeRunId = 'abc123'
  2. data-threadCreated { threadId, title, ... }         → chat.chatData updated; URL → /chat/<threadId>
  3. data-createDocument { streaming, success, content, title } × 2 (raw + formatted)
  4. text-delta chunks (agent's "I see..." narration)
  5. data-awaitValidation { artifactId: 'doc-format-<id>', runId: 'abc123' }
                                                          → chat.pendingValidationArtifactId set

[UI]
  - Chat: artifact shimmer card with skeleton progress indicator and streaming status as card title
  - Editor: opens with the formatted markdown streaming in token by token using the <Markdown> component, WysiwygEditor mounts, editable=true
  - ValidateFab: mode='validate' (pendingValidationArtifactId set, but errors empty)
  - Header: ready to edit
  - 2s debounce on every keystroke → PUT /api/file/exams/examType-<id>/<safeTitle>.md
  - On first keystroke: chat.editContent ≠ null → FAB stays in 'validate' (still clickable)
  - editable=true throughout

/validate — Should be removed (/validate as a slash command is ambiguous)

**/generate — PDF Generation** [Make this a subcommand under /marksheet (e.g /marksheet generate)]
[Teacher] types "/generate @<studentName> @year (optional default to current) @term (optional default to current) @class (optional default to selected from src/lib/components/class-selector.svelte OR teacher assigned class)"
   ↓
[Phase 1] Universal preamble (no files → no parallel classifyAndStream)
[Phase 2] chatWorkflow.start
   - parallel[null, titleStep] → titleStep only
   - assistantStep: agent has reporting skill tools
   - Agent calls get-active-marksheet (or get-active-marksheet → returns { committedRecordId })
   - Agent calls generate-result-pdf({ recordId, studentName })
     → reads recordId from DB
     → PDFGeneratorHelper.render(recordId) → returns base64 PDF
     → writes to exams/examType-<id>/<safeTitle>.pdf via workspace
     → emits data-generatePDF { processing, streaming, success, data: base64, title }
     → thread-data: persistGeneratedPdf to workspace
   - Agent says: "PDF ready. Click /publish to email parents."
   - awaitValidationStep: no marksheet tool call → PASS-THROUGH, no suspend
[Phase 3] Client: PDF preview in editor-canvas (PDF mode), no FAB

**/publish — Publish PDF to Parents** [Make this a subcommand under /marksheet (e.g /marksheet publish)]
[Teacher] types "/publish @<studentName> @year (optional default to current) @term (optional default to current) @class (optional default to selected from src/lib/components/class-selector.svelte OR teacher assigned class)"   ↓
[Phase 1] Universal preamble
[Phase 2] chatWorkflow.start
   - assistantStep: agent calls get-active-marksheet → generate-result-pdf if PDF missing
   - Agent calls publish-result-pdf({ recordId, sendEmail: true })
     → renders PDF if missing
     → dispatches email to parents
     → writes StudentTimeline row
     → emits data-publishResult { success, recipients }
   - Agent says: "Published to N parents."
   - awaitValidationStep: no marksheet validate tool call → PASS-THROUGH
[Phase 3] Client: confirmation toast, no artifact


**/result, /view — Lookup**  [Make this a subcommand under /marksheet (e.g /marksheet result OR view)]
[Teacher] types "/result OR /view @<studentName> @year (optional default to current) @term (optional default to current) @class (optional default to selected from src/lib/components/class-selector.svelte OR teacher assigned class)"   
   ↓
[Phase 1] Universal preamble
[Phase 2] chatWorkflow.start
   - assistantStep: agent has reporting skill + read skill tools (view-student-result, search-school-directory, etc.)
   - Agent calls search-school-directory({ query: studentName }) → studentId
   - Agent calls view-student-result({ studentId, examTypeId })
     → reads smResultStores
     → returns Markdown-formatted result card
   - Agent says (text-delta): renders the result inline
   - awaitValidationStep: no marksheet validate tool call → PASS-THROUGH
[Phase 3] Client: no artifact, just chat response


**Chat composer, Assistant Agent and Workflow**

- in src/lib/components/SharedChatView.svelte, there is an Onboarding modall used for staff class self assignment, this is the manual way of doing it currently. Fix any bug ensure its working as expected
- for any task, If the assistant agents needs any info, input data from the user doe it use a dropdown (just like \src/lib/components/chat/CommandDropdown.svelte) to show options using workflow suspend/resume and wait for the user to choose
- does the chat composer curently process student @mentions from src/lib/components/chat/MentionDropdown.svelte so users can do like "/enroll @John Doe ..."  (This is currently not working)
- does the system current handle @mations from the chat composer using the src/lib/components/chat/MentionDropdown.svelte  (This is currently not working)
- does the plus dropdown button on the ChatComposer currently support a dedicated "Upload document" (for OCR extraction) and "Upload Photo" (for OCR extraction OR normal upload). We should implement this if not already implemented.
- do we have a consistent student photo upload lifcycle via the assistant agent (user clicks the Plus dropdown button on the ChatComposer and clicks on upload "Upload Photo",  to the chat composer, the photo is immediately uploaded to /api/uploads and a upload path is returned, the uses the @mention to mention a student, the path is injected to the assistant agent for database commit for that studentId). We should implement this if not already implemented.

We should support the following @  on the ChatComposer
@year (for academicTear), @class (for both class and section e.g LOWERBASIC 1 B), and @exam (for examTypes) 

You also need to confirm if `tenantContext.staffId`, `tenantContext.userId` and other ids values not variable were properly injected into the systemprompt or skill.

in src/routes/api/chat/+server.ts academicId and examTypeId from mentions are not passed, this should default to currentTerm and getAcademicId from inside the createTenantContext. See src/lib/server/repository/base.repo.ts

- During student/staff admition/registration the assistant should give the user a template form to copy and fill it and paste back and only trigger options for Schools/classes/sections/academic-year/exam-type selection
- ChatComposer should also support @file for workspace file dropdown, it will show all the files for the Schools/classes/sections/academic-year/exam-type (you should investigate how workspace are scoped, See src/routes/api/uploads/+server.ts for an example). Note that only student will show at first when @ is typed, files begins to when the user start typing @file 

Note: that currently when will type @ on the ChatComposer, the dropdown does not show for any mentions, fix that.


**Examples of what the Assistant Agent should be able to do (Common Actions)**

- the assistant agent should be able to guide teachers/IT/admin/coordinators to register a student by providing a copy and paste template to them or some other method
- the assistant agent should be able to guide IT/admin/coordinators to register a staff by providing a copy and paste template to them or some other method
- the assistant agent should be able to guide T/admin/coordinators to assign class/subject to a staff
- the assistant agent should be able to guide teachers to pick a class and assign it to them self
- the assistant agent should be able to guide teachers/IT/admin/coordinators to pick any academicYear, pick any examType in thet year  then check/view/publish the student result for that year and type
- the assistant agent should be able to guide teachers/IT/admin/coordinators to update student/staff data (e.g upload student/staff profile image. change student name)
- the assistant agent should be able to guide teachers/IT/admin/coordinators to promote/demote student
- the assistant agent should be able to guide teachers/IT/admin/coordinators to disable/enable OR suspend/re-activate student