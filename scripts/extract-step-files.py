#!/usr/bin/env python3
"""
Extract step files from restored chat.ts + editor-command.ts using EXACT
line ranges (1-indexed, inclusive on both ends).

Run AFTER `git checkout HEAD -- src/lib/server/mastra/workflows/chat.ts
src/lib/server/mastra/workflows/editor-command.ts` to restore the originals.

This script does NOT touch:
  - src/lib/server/mastra/utils/chat-{schemas,errors,utils}.ts  (manually patched)
  - src/lib/server/mastra/workflows/index.ts                   (manually written)
  - src/lib/server/mastra/index.ts                             (manually edited)
  - src/routes/api/chat/+server.ts                            (manually edited)

It ONLY writes the step files in chat/ and editor/.

Each step gets a minimal header of imports based on what the original
file imports + which schemas/types it touches.

Validate with `pnpm run check` after running.
"""

from pathlib import Path

ROOT = Path('/home/beznet/Workspace/edapex')
WF = ROOT / 'src/lib/server/mastra/workflows'
CHAT_DIR = WF / 'chat'
EDITOR_DIR = WF / 'editor'

CHAT_FILE = WF / 'chat.ts'
EDITOR_FILE = WF / 'editor-command.ts'

chat_lines = CHAT_FILE.read_text().split('\n')
editor_lines = EDITOR_FILE.read_text().split('\n')


def slice_lines(lines, start_1indexed, end_1indexed):
    """1-indexed inclusive line range."""
    return '\n'.join(lines[start_1indexed - 1:end_1indexed])


def write_chat_step(filename, start, end, imports):
    body = slice_lines(chat_lines, start, end)
    content = '\n'.join(imports) + '\n\n' + body + '\n'
    (CHAT_DIR / filename).write_text(content)
    print(f'  wrote chat/{filename}  (lines {start}-{end})')


def write_editor_step(filename, start, end, imports):
    body = slice_lines(editor_lines, start, end)
    content = '\n'.join(imports) + '\n\n' + body + '\n'
    (EDITOR_DIR / filename).write_text(content)
    print(f'  wrote editor/{filename}  (lines {start}-{end})')


# ─── Chat step boundaries (discovered via grep on restored chat.ts) ────────
# Each entry: (filename, start_line, end_line_inclusive, imports)

CHAT_STEPS = [
    (
        'classify-step.ts',
        258, 283,
        [
            'import { createStep } from \'@mastra/core/workflows\';',
            'import { z } from \'zod\';',
            'import { chatWorkflowInputSchema, fileStreamItemSchema } from \'../../utils/chat-schemas\';',
            'import type { FileStreamItem } from \'../../utils/chat-schemas\';',
        ],
    ),
    (
        'stream-document-step.ts',
        286, 300,
        [
            'import { createStep } from \'@mastra/core/workflows\';',
            'import { fileStreamItemSchema } from \'../../utils/chat-schemas\';',
        ],
    ),
    (
        'collapse-step.ts',
        303, 320,
        [
            'import { createStep } from \'@mastra/core/workflows\';',
            'import { z } from \'zod\';',
            'import { chatWorkflowInputSchema, workflowEnvelopeSchema } from \'../../utils/chat-schemas\';',
        ],
    ),
    (
        'hitl-verify-step.ts',
        323, 381,
        [
            'import { createStep } from \'@mastra/core/workflows\';',
            'import { z } from \'zod\';',
            'import { workflowEnvelopeSchema } from \'../../utils/chat-schemas\';',
        ],
    ),
    (
        'assistant-step.ts',
        384, 462,
        [
            'import { createStep } from \'@mastra/core/workflows\';',
            'import { z } from \'zod\';',
            'import { chatWorkflowOutputSchema, workflowEnvelopeSchema } from \'../../utils/chat-schemas\';',
            'import { writeDataPart } from \'../../utils/chat-utils\';',
            'import { streamWithAutoRetry } from \'../../agent-stream-retry\';',
        ],
    ),
    (
        'selection-gate-step.ts',
        463, 529,
        [
            'import { createStep } from \'@mastra/core/workflows\';',
            'import { z } from \'zod\';',
            'import { chatWorkflowInputSchema, fileStreamItemSchema, optionItemSchema, pendingSelectionSchema } from \'../../utils/chat-schemas\';',
            'import { writeDataPart } from \'../../utils/chat-utils\';',
        ],
    ),
    (
        'continuation-assistant-step.ts',
        530, 582,
        [
            'import { createStep } from \'@mastra/core/workflows\';',
            'import { z } from \'zod\';',
            'import { chatWorkflowInputSchema, chatWorkflowOutputSchema, fileStreamItemSchema } from \'../../utils/chat-schemas\';',
            'import { streamWithAutoRetry } from \'../../agent-stream-retry\';',
        ],
    ),
    (
        'await-validation-step.ts',
        583, 730,
        [
            'import { createStep } from \'@mastra/core/workflows\';',
            'import { z } from \'zod\';',
            'import { chatWorkflowInputSchema, fileStreamItemSchema } from \'../../utils/chat-schemas\';',
            'import { writeDataPart } from \'../../utils/chat-utils\';',
            'import { parseResolvedOptionId } from \'../../utils/chat-utils\';',
            'import { buildWorkspaceRequestContext } from \'$lib/server/helpers/chat-helper\';',
            'import { tenantWorkspace } from \'../../storage/workspaces\';',
            'import type { TenantContext } from \'../../tenant-context\';',
        ],
    ),
    (
        'title-step.ts',
        731, 756,
        [
            'import { createStep } from \'@mastra/core/workflows\';',
            'import { z } from \'zod\';',
            'import { chatWorkflowInputSchema } from \'../../utils/chat-schemas\';',
            'import { generateThreadTitle } from \'$lib/server/helpers/chat-helper\';',
        ],
    ),
]

# Sub-workflow + bridge step + main workflow composition go in dedicated files
CHAT_AUX = [
    (
        'classify-and-stream.ts',
        759, 768,
        [
            'import { createWorkflow } from \'@mastra/core/workflows\';',
            'import { chatWorkflowInputSchema, fileStreamItemSchema } from \'../../utils/chat-schemas\';',
            'import { classifyStep } from \'./classify-step\';',
            'import { streamDocumentStep } from \'./stream-document-step\';',
        ],
    ),
    (
        'extract-file-items-step.ts',
        771, 781,
        [
            'import { createStep } from \'@mastra/core/workflows\';',
            'import { z } from \'zod\';',
            'import { fileStreamItemSchema } from \'../../utils/chat-schemas\';',
        ],
    ),
]


# ─── Editor step boundaries (hardcoded from grep on editor-command.ts) ──
# Editor command has 5 step consts + stripLeakedSelection function + workflow.
# runContinueAgentStep is NOT in git HEAD (only in uncommitted edits).
# Boundaries verified via:
#   grep -n '^const \(.*Step\) = createStep\|^function stripLeakedSelection\|^export const editorCommandWorkflow' editor-command.ts
# → 37 deriveEditorContextStep, 55 resolveMentionsStep, 74 resolveCommandStep,
#   96 stripLeakedSelection, 106 runEditAgentStep, 138 runGenerateAgentStep,
#   170 editorCommandWorkflow

EDITOR_STEPS = [
    (
        'derive-editor-context-step.ts',
        37, 54,
        [
            'import { createStep } from \'@mastra/core/workflows\';',
            'import { editorCommandRequestSchema, derivedEditorCommandSchema } from \'../../editor/schemas\';',
        ],
    ),
    (
        'resolve-mentions-step.ts',
        55, 73,
        [
            'import { createStep } from \'@mastra/core/workflows\';',
            'import { derivedEditorCommandSchema, resolvedMentionsSchema } from \'../../editor/schemas\';',
            'import { resolveMentionsInMarkdown } from \'../../editor/mention-resolver\';',
        ],
    ),
    (
        'resolve-command-step.ts',
        74, 95,
        [
            'import { createStep } from \'@mastra/core/workflows\';',
            'import { resolvedMentionsSchema, resolvedEditorCommandSchema } from \'../../editor/schemas\';',
            'import { buildEditPrompt, buildGeneratePrompt } from \'../../editor/prompt-builders\';',
        ],
    ),
    (
        'run-edit-agent-step.ts',
        106, 137,
        [
            'import { createStep } from \'@mastra/core/workflows\';',
            'import { resolvedEditorCommandSchema, editorCommandResultSchema } from \'../../editor/schemas\';',
            'import { streamWithAutoRetry } from \'../../agent-stream-retry\';',
        ],
    ),
    (
        'run-generate-agent-step.ts',
        138, 169,
        [
            'import { createStep } from \'@mastra/core/workflows\';',
            'import { resolvedEditorCommandSchema, editorCommandResultSchema } from \'../../editor/schemas\';',
            'import { streamWithAutoRetry } from \'../../agent-stream-retry\';',
        ],
    ),
]


def main():
    print('=== Chat steps ===')
    for filename, start, end, imports in CHAT_STEPS:
        write_chat_step(filename, start, end, imports)
    for filename, start, end, imports in CHAT_AUX:
        write_chat_step(filename, start, end, imports)

    print('=== Editor steps ===')
    for filename, start, end, imports in EDITOR_STEPS:
        write_editor_step(filename, start, end, imports)

    print('✓ All step files extracted.')


if __name__ == '__main__':
    main()
