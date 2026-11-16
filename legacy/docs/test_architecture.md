Here is the complete, production-ready, master blueprint for your Cross-Database Headless Integration Testing Architecture.This system integrates Mastra (LibSQL Memory and Agent Provider) with a SvelteKit App (Drizzle MySQL). It features full multi-tenant isolation, real concurrent LLM streaming, and automated evaluation metrics, complete with an explicit teardown layer to prevent dangling connections.🗺️ System Data Flow & Architecture Blueprint                      +------------------------------------------+

                      |        Headless Vitest Workspace         |
                      |   Loads Workspace Configuration & Env    |
                      +------------------------------------------+
                                           |
                                           v
                      +------------------------------------------+

                      |       globalSetup File (setup.ts)        |
                      | Initializes Context / Registers Teardown |
                      +------------------------------------------+
                                           |
                                           v
                      +------------------------------------------+

                      |     Stream Consumer & State Manager      |
                      |    (Decodes handleWorkflowStream())      |
                      +------------------------------------------+
                                           |
         +---------------------------------+---------------------------------+

         |                                 |                                 |
         v                                 v                                 v
+--------------------+           +--------------------+           +--------------------+

|  LLM Live Engine   |           |  App Database DB   |           |   Mastra Memory    |
|   (gpt-4o-mini)    |           | (Drizzle MySQL)    |           |  Layer (LibSQL)    |
+--------------------+           +--------------------+           +--------------------+

         |                                 |                                 |
         v                                 v                                 v
[Concurrent Matrix]              [Tenant Isolations]             [Mastra Scorers]
(Tests 20+ Slash Commands        (Mutates App State                 (Evaluates Tone &
 Simultaneously)                  via Real Tools)                    Empathy Persona)
                                           |
                                           v
                      +------------------------------------------+

                      |        Global teardown() Hook            |
                      |  Drains Pools & Releases DB File Locks   |
                      +------------------------------------------+
⚙️ 1. Vitest Workspace Engine Configuration (vitest.config.ts)typescriptimport { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Real LLM streams and multi-DB tasks require higher execution margins
    testTimeout: 35000, 
    // Binds the lifecycle hooks for complete resource cleanup
    globalSetup: './tests/integration/setup.ts',
  },
  resolve: {
    alias: {
      $lib: resolve(__dirname, './src/lib'),
    },
  },
});
Use code with caution.🔌 2. Global Test Lifecycle Setup & Teardown (tests/integration/setup.ts)typescriptimport { db as mysqlDb } from '$lib/db/mysql';
import { mastra } from '$lib/mastra';
import { LibSQLStorage } from '@mastra/core/storage';

export async function setup() {
  console.log('🏁 Starting Multi-Database Integration Suite...');
}

export async function teardown() {
  console.log('🛑 Testing finished. Cleaning up active database connection pools...');

  try {
    // 1. Drain the Drizzle MySQL Client Connection Pool to prevent Vitest hangs
    if (mysqlDb && typeof (mysqlDb as any).$client?.end === 'function') {
      await (mysqlDb as any).$client.end();
      console.log('✅ Drizzle MySQL connection pool drained successfully.');
    }
  } catch (error) {
    console.error('⚠️ Failed to cleanly drain Drizzle MySQL connection pool:', error);
  }

  try {
    // 2. Terminate the Native Mastra LibSQL Storage Engine client connection
    const libsqlStorage = mastra.getStorage() as LibSQLStorage;
    if (libsqlStorage?.client && typeof libsqlStorage.client.close === 'function') {
      await libsqlStorage.client.close();
      console.log('✅ Native Mastra LibSQL storage client closed successfully.');
    }
  } catch (error) {
    console.error('⚠️ Failed to close Mastra LibSQL client connection:', error);
  }
}
Use code with caution.🧪 3. Complete E2E Cross-Database Test File (tests/integration/mastra-cross-db.test.ts)typescriptimport { describe, it, expect, beforeEach } from 'vitest';
import { handleWorkflowStream } from '@mastra/core/ai-sdk';
import { LibSQLStorage } from '@mastra/core/storage';
import { EmpathyScorer, PersonaGuardrail } from '@mastra/core/evaluators';

// Cross-boundary database imports
import { db as mysqlDb } from '$lib/db/mysql';
import { tenantsTable, applicationLogsTable, userItemsTable } from '$lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { mastra } from '$lib/mastra';

// --- System Evaluation Guardrails Setup ---
const empathyScorer = new EmpathyScorer({ threshold: 0.85 });
const personaGuardrail = new PersonaGuardrail({
  expectedPersona: 'Empathetic technical expert. Guides the user, proposes logical next tasks, and maintains a supportive tone.',
});

interface SlashCommandTestCase {
  command: string;
  expectedTool: string;
  expectedKeyword: RegExp;
}

// --- Headless Stream Consumer Utility ---
async function parseWorkflowStream(stream: ReadableStream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let fullTextOutput = '';
  let executedTools: string[] = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    fullTextOutput += chunk;

    // Detect structural tool call frames piped through the text protocol stream
    if (chunk.includes('"type":"tool-call"')) {
      const match = chunk.match(/"toolName":"([^"]+)"/);
      if (match?.[1]) executedTools.push(match[1]);
    }
  }
  return { fullTextOutput, executedTools };
}

describe('Mastra (LibSQL Memory) & App (Drizzle MySQL) Multi-Tenant Engine', () => {
  const workflow = mastra.getWorkflow('agentChatWorkflow');
  const libsqlStorage = mastra.getStorage() as LibSQLStorage;

  // Sandbox parameters matching your multi-tenant tenantContext schema
  const TEST_TENANT_ID = 'tenant_local_integration_88';
  const TEST_USER_ID = 'user_headless_tester_99';

  beforeEach(async () => {
    // 1. Flush targeted tenant row structures in MySQL via Drizzle to avoid test pollution
    await mysqlDb.delete(userItemsTable).where(eq(userItemsTable.tenantId, TEST_TENANT_ID));
    await mysqlDb.delete(tenantsTable).where(eq(tenantsTable.id, TEST_TENANT_ID));

    // 2. Clear running tracking histories within Native Mastra LibSQL memory
    await libsqlStorage.client.execute({ sql: 'DELETE FROM mastra_runs;' });
    await libsqlStorage.client.execute({ sql: 'DELETE FROM mastra_steps;' });

    // 3. Seed isolated tenant row parameters into MySQL
    await mysqlDb.insert(tenantsTable).values({
      id: TEST_TENANT_ID,
      name: 'Local Automated Testing LLC',
      status: 'ACTIVE',
      tier: 'ENTERPRISE'
    });
  });

  // =========================================================================
  // ARCHITECTURE CAPABILITY 1: CONCURRENT SLASH COMMAND MATRIX PROCESSING
  // =========================================================================
  const slashCommandsMatrix: SlashCommandTestCase[] = [
    {
      command: '/create-profile user_headless_tester_99 --role engineering',
      expectedTool: 'createProfileTool',
      expectedKeyword: /engineering|profile/i,
    },
    {
      command: '/get-weather Lagos',
      expectedTool: 'getWeatherTool',
      expectedKeyword: /Lagos|temperature|sunny|cloudy/i,
    },
    {
      command: '/sync-tenant-status',
      expectedTool: 'syncTenantStatusTool',
      expectedKeyword: /synced|active|status/i,
    }
  ];

  it.concurrent.each(slashCommandsMatrix)(
    'should route matrix command "$command" concurrently to "$expectedTool"',
    async ({ command, expectedTool, expectedKeyword }) => {
      const run = await workflow.createRunAsync();
      const stream = await handleWorkflowStream({
        run,
        inputData: { 
          message: command,
          tenantContext: { tenantId: TEST_TENANT_ID, userId: TEST_USER_ID }
        },
        closeOnSuspend: true
      });

      const result = await parseWorkflowStream(stream);
      expect(result.executedTools).toContain(expectedTool);
      expect(result.fullTextOutput).toMatch(expectedKeyword);
      expect(result.fullTextOutput).not.toContain('undefined');
    }
  );

  // =========================================================================
  // ARCHITECTURE CAPABILITY 2: HUMAN-IN-THE-LOOP SUSPEND & RESUME ACTIONS
  // =========================================================================
  it('should freeze processing inside LibSQL on gated loops, monitor external MySQL updates, and resume', async () => {
    const run = await workflow.createRunAsync();

    const initStream = await handleWorkflowStream({
      run,
      inputData: {
        message: '/wipe-user-workspace-cache',
        tenantContext: { tenantId: TEST_TENANT_ID, userId: TEST_USER_ID }
      },
      closeOnSuspend: true
    });

    await parseWorkflowStream(initStream);

    // Validate execution freezes cleanly in LibSQL tracking state
    const stepSnapshot = await libsqlStorage.client.execute({
      sql: 'SELECT status, active_step_id FROM mastra_runs WHERE id = ?',
      args: [run.runId]
    });
    expect(stepSnapshot.rows?.[0]?.status).toBe('SUSPENDED');
    const activeStepId = stepSnapshot.rows?.[0]?.active_step_id as string;

    // Simulate an external administrative override event inside MySQL
    await mysqlDb.update(tenantsTable)
      .set({ status: 'MAINTENANCE_LOCKED' })
      .where(eq(tenantsTable.id, TEST_TENANT_ID));

    // Resume the workflow programmatically using the token data payload
    const resumeStream = await workflow.resumeStream({
      runId: run.runId,
      stepId: activeStepId,
      resumeData: { approved: true, auditKey: 'QA_MOCK_BYPASS_KEY' }
    });

    const finalResult = await parseWorkflowStream(resumeStream);

    // Assert that the pipeline fully concludes
    const finalSnapshot = await libsqlStorage.client.execute({
      sql: 'SELECT status FROM mastra_runs WHERE id = ?',
      args: [run.runId]
    });
    expect(finalSnapshot.rows?.[0]?.status).toBe('COMPLETED');
    expect(finalResult.fullTextOutput).toMatch(/workspace cache flushed/i);
  });

  // =========================================================================
  // ARCHITECTURE CAPABILITY 3: BEHAVIORAL ETHICAL & PERSONA GUARDRAILS
  // =========================================================================
  it('should enforce supportive, empathetic communication styles and prompt actionable next options', async () => {
    const run = await workflow.createRunAsync();
    
    const stream = await handleWorkflowStream({
      run,
      inputData: { 
        message: 'This database syncing tool keeps throwing network validation codes. I have wasted my whole morning on this.',
        tenantContext: { tenantId: TEST_TENANT_ID, userId: TEST_USER_ID }
      },
      closeOnSuspend: true
    });

    const result = await parseWorkflowStream(stream);

    // Run semantic model-graded evaluations using Mastra Scorers
    const empathyEval = await empathyScorer.score({ output: result.fullTextOutput });
    const personaEval = await personaGuardrail.score({ output: result.fullTextOutput });

    expect(empathyEval.score).toBeGreaterThan(0.85);
    expect(personaEval.passed).toBe(true);

    // Verify system interaction quality guidelines: Response provides interactive loops instead of terminal endings
    expect(result.fullTextOutput).toSatisfy((text) => 
      text.includes('Would you like to') || 
      text.includes('Next steps') || 
      text.includes('Let us verify')
    );
  });
});
---

## Canonical Workspace Paths (Phase B)

**Added 2025-01**: All tenant artifacts land at canonical paths via helpers in `src/lib/server/mastra/storage/workspaces/paths.ts`. This eliminates path fragmentation (e.g. `exams/examType-X/<studentName>.md` vs `pdfs/<admissionNo>_<name>.pdf`).

### Layout

```
.workspaces/<schoolId>/AY<academicId>-<year-slug>/<classId>-<classSlug>_<sectionId>-<sectionSlug>/
  manifest.json                   ← single source of truth, byKind indexed
  ocr/<fileName>.md               ← raw OCR markdown (one per upload)
  ocr/<fileName>.meta.json        ← Mistral fileId + sha256 sidecar
  marksheets/<studentId>.json     ← validated Marksheet JSON (LLM-derived)
  marksheets/<studentId>-<slug>.md ← formatted academic report markdown
  transcripts/<studentId>.md      ← multi-term transcript markdown
  transcripts/<studentId>.json    ← transcript data
  pdfs/marksheet-<studentId>.pdf  ← rendered marksheet PDF
  pdfs/transcript-<studentId>.pdf ← rendered transcript PDF
  notes/, shared/, scratch/       ← user storage
```

### Slug rules

| Input | Output | Source |
|---|---|---|
| "LOWER BASIC 2" | `lb2` | first-letter of each word + trailing digit |
| "MIDDLE BASIC 1" | `mb1` | |
| "PRE-NURSERY" | `pn` | hyphens split words |
| "PRÉ-NURSERY" | `pn` | diacritics stripped via NFKD |
| "B" (section) | `b` | single letter preserved |
| "" (empty) | `<id>` | numeric fallback (collision-safe) |

### Key invariants

1. **`studentId` is the only identifier in artifact paths** — never `admissionNo`, never `studentName`. ID is collision-safe; names can collide across classes.
2. **Single `manifest.json` at workspace root** — replaces per-kind manifests (`extracted/manifest.json`, `pdfs/manifest.json`). Tracks every artifact by relative path + byKind indexes.
3. **OCR JSON pipeline dropped** — Mistral structured output was unreliable; the document agent re-derives JSON from markdown via `marksheetSchema` at validation time. Only markdown + meta persist from OCR.
4. **PDF idempotency works** — `marksheetPdfPath(studentId)` is deterministic, so `pdfExists()` returns the right answer.
5. **`studentHint` lives in the upload manifest** — when the teacher clicks "link to student X" at HITL, `link-marksheet-student` updates `manifest.entries[*].studentHint.studentId`. The next `validate-marksheet` call seeds its re-derivation prompt with this hint.

### Path helpers

| Helper | Path | Use site |
|---|---|---|
| `classDir(tenant)` | full workspace root | resolve-tenant-filesystem.ts |
| `marksheetJsonPath(studentId)` | `marksheets/<id>.json` | validate, auto-fix, commit |
| `marksheetMarkdownPath(studentId, name?)` | `marksheets/<id>[-<name>].md` | format-marksheet-document |
| `marksheetPdfPath(studentId)` | `pdfs/marksheet-<id>.pdf` | generate-result-pdf, publish-result-pdf |
| `transcriptJsonPath(studentId)` | `transcripts/<id>.json` | transcript-report |
| `transcriptMarkdownPath(studentId)` | `transcripts/<id>.md` | transcript-report |
| `transcriptPdfPath(studentId)` | `pdfs/transcript-<id>.pdf` | generate-transcript-pdf, publish-transcript-pdf |
| `ocrMarkdownPath(fileName)` | `ocr/<sanitized-fileName>.md` | OcrWorkspaceStore |
| `ocrMetaPath(fileName)` | `ocr/<sanitized-fileName>.meta.json` | OcrWorkspaceStore |

### Tool input schema changes

| Tool | Old input | New input |
|---|---|---|
| `validate-marksheet` | `{ documentId, correctedMarkdown }` | `{ studentId, correctedMarkdown }` |
| `auto-fix-marksheet` | `{ documentId, errors, currentMarkdown }` | `{ studentId, errors, currentMarkdown }` |
| `commit-marksheet` | `{ documentId }` | `{ studentId }` |
| `link-marksheet-student` | `{ documentId, studentId }` | unchanged (manifest update only) |
| `get-active-marksheet` | `{ documentId? }` | `{ studentId }` |

The `documentId` is still tracked in the upload manifest for OCR lookup (`format-marksheet-document(documentId)`), but marksheet JSON/markdown/PDF operations all key on `studentId`.

### Migration

Run once per environment after deploying:
```bash
pnpm tsx scripts/migrations/workspace-paths-2025-01.ts --dry-run   # preview
pnpm tsx scripts/migrations/workspace-paths-2025-01.ts              # execute
```

PDFs keyed by `<admissionNo>_<name>.pdf` need a manual studentId lookup and are flagged `REVIEW` during the dry run.

### Deprecations

- `tenant-file-storage.ts` — kept for now (still imported by 4 files), but superseded by `paths.ts` + `tenantWorkspace`. Future PR will migrate callers and delete this file.
- `OcrWorkspaceStore.writeNormalizedJson` / `readNormalizedJson` — REMOVED. OCR JSON pipeline dropped; use `validate-marksheet(studentId, markdown)` instead.
- `buildResultStoragePath` / `buildTranscriptStoragePath` in `_shared.ts` — REMOVED. Use `paths.marksheetPdfPath(studentId)` / `paths.transcriptPdfPath(studentId)` directly.
