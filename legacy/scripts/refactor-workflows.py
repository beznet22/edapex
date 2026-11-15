#!/usr/bin/env python3
"""
Refactor src/lib/server/mastra/workflows/chat.ts into per-step files.

Splits chat.ts (966 lines) into:
  - src/lib/server/mastra/utils/chat-schemas.ts    (zod schemas + z.infer types)
  - src/lib/server/mastra/utils/chat-errors.ts    (FriendlyError interface + 3 parsers)
  - src/lib/server/mastra/utils/chat-utils.ts     (parseResolvedOptionId helper)
  - src/lib/server/mastra/workflows/chat/classify-step.ts
  - src/lib/server/mastra/workflows/chat/stream-document-step.ts
  - src/lib/server/mastra/workflows/chat/collapse-step.ts
  - src/lib/server/mastra/workflows/chat/hitl-verify-step.ts
  - src/lib/server/mastra/workflows/chat/assistant-step.ts
  - src/lib/server/mastra/workflows/chat/selection-gate-step.ts
  - src/lib/server/mastra/workflows/chat/continuation-assistant-step.ts
  - src/lib/server/mastra/workflows/chat/await-validation-step.ts
  - src/lib/server/mastra/workflows/chat/title-step.ts
  - src/lib/server/mastra/workflows/chat/extract-file-items-step.ts
  - src/lib/server/mastra/workflows/chat/classify-and-stream.ts  (sub-workflow)
  - src/lib/server/mastra/workflows/chat/workflow.ts              (main composition + step-id exports)

Also splits editor-command.ts (216 lines) into:
  - src/lib/server/mastra/workflows/editor/derive-editor-context-step.ts
  - src/lib/server/mastra/workflows/editor/resolve-mentions-step.ts
  - src/lib/server/mastra/workflows/editor/resolve-command-step.ts
  - src/lib/server/mastra/workflows/editor/run-edit-agent-step.ts
  - src/lib/server/mastra/workflows/editor/run-generate-agent-step.ts
  - src/lib/server/mastra/workflows/editor/run-continue-agent-step.ts
  - src/lib/server/mastra/workflows/editor/workflow.ts   (composition + stripLeakedSelection helper)

Creates:
  - src/lib/server/mastra/workflows/index.ts  (re-exports chatWorkflow + editorCommandWorkflow + step-id constants)

Deletes:
  - src/lib/server/mastra/workflows/chat.ts
  - src/lib/server/mastra/workflows/editor-command.ts

Updates import sites:
  - src/lib/server/mastra/index.ts:                    './workflows/chat' → './workflows'
  - src/routes/api/chat/+server.ts:                   '$lib/server/mastra/workflows/chat' → '$lib/server/mastra/utils/chat-schemas'

NOTE: NO re-export shim — import sites are updated directly per user direction.
"""

import re
from pathlib import Path

ROOT = Path('/home/beznet/Workspace/edapex')
WF = ROOT / 'src/lib/server/mastra'
WORKFLOWS_DIR = WF / 'workflows'
UTILS_DIR = WF / 'utils'
CHAT_DIR = WORKFLOWS_DIR / 'chat'
EDITOR_DIR = WORKFLOWS_DIR / 'editor'

# Marker patterns used to delimit sections in chat.ts / editor-command.ts
SECTION_RE = re.compile(r'^\s*//\s*───\s*(.+?)\s*───')


def split_by_markers(content):
    """Return {marker_name: section_body} — section body is the text AFTER
    the marker line and BEFORE the next marker (or EOF). The marker line
    itself is excluded from the body."""
    lines = content.split('\n')
    sections = {}
    current_marker = None
    current_body = []
    in_section = False

    for line in lines:
        m = SECTION_RE.match(line)
        if m:
            if current_marker is not None:
                sections[current_marker] = '\n'.join(current_body).strip('\n')
            current_marker = m.group(1).strip()
            current_body = []
            in_section = True
        elif in_section:
            current_body.append(line)

    if current_marker is not None:
        sections[current_marker] = '\n'.join(current_body).strip('\n')

    return sections


def write_file(path: Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def strip_imports_block(content):
    """Strip leading `import ...` / `export ... from` lines and return the
    rest of the body. Leaves non-import lines intact."""
    lines = content.split('\n')
    start = 0
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith('import ') or stripped.startswith('export ') and ' from ' in stripped:
            continue
        if stripped == '':
            # allow leading blank lines between imports
            continue
        start = i
        break
    return '\n'.join(lines[start:]).strip('\n')


# ───────────────────────────────────────────────────────────────────────────
# Chat workflow extraction
# ───────────────────────────────────────────────────────────────────────────

CHAT_FILE = WORKFLOWS_DIR / 'chat.ts'
chat_content = CHAT_FILE.read_text()
chat_sections = split_by_markers(chat_content)

# Strip existing imports — we'll add per-file imports
chat_sections = {k: strip_imports_block(v) for k, v in chat_sections.items()}

# --- utils/chat-schemas.ts --------------------------------------------------
write_file(
    UTILS_DIR / 'chat-schemas.ts',
    '/**\n'
    ' * Zod schemas + z.infer types for the chat workflow.\n'
    ' *\n'
    ' * Extracted from `workflows/chat.ts` so individual step files can import\n'
    ' * only the contracts they need without re-defining the full envelope.\n'
    ' *\n'
    ' * Public exports:\n'
    ' *   - `chatWorkflowInputSchema`  — what `/api/chat` POSTs into `handleWorkflowStream`\n'
    ' *   - `chatWorkflowOutputSchema` — what the workflow returns\n'
    ' *\n'
    ' * Internal exports (re-used by step files):\n'
    ' *   - `optionItemSchema`, `pendingSelectionSchema` — selectionGate suspend payload\n'
    ' *   - `fileReferenceSchema`                       — input file refs\n'
    ' *   - `fileStreamItemSchema`, `workflowEnvelopeSchema` — intra-workflow contracts\n'
    ' *   - `WorkflowEnvelope`, `FileStreamItem`, `ChatWorkflowInput`, `ChatWorkflowOutput` — types\n'
    ' */\n\n'
    'import { z } from \'zod\';\n\n'
    + chat_sections['Schemas']
)

# --- utils/chat-errors.ts --------------------------------------------------
write_file(
    UTILS_DIR / 'chat-errors.ts',
    '/**\n'
    ' * Error parsers for the chat workflow.\n'
    ' *\n'
    ' * Each parser converts a raw error (from `@ai-sdk/provider` or\n'
    ' * `$lib/provider/errors`) into a `FriendlyError` shape the UI can\n'
    ' * render in the chat error alert.\n'
    ' */\n\n'
    'import { APICallError, LoadAPIKeyError, InvalidPromptError, NoContentGeneratedError, NoSuchModelError } from \'@ai-sdk/provider\';\n'
    'import {\n'
    '	NoCredentialError,\n'
    '	ProviderDisabledError,\n'
    '	ModelNotFoundError,\n'
    '	NoProvidersError\n'
    '} from \'$lib/provider/errors\';\n\n'
    + chat_sections.get('FriendlyError', '')
    + '\n'
    + chat_sections.get('parseApiCallError', '')
    + '\n'
    + chat_sections.get('parseFallback', '')
    + '\n'
    + chat_sections.get('parseFriendlyError', '')
)

# --- utils/chat-utils.ts ---------------------------------------------------
parse_resolved_body = chat_sections.get('parseResolvedOptionId', '')
# Find the function definition (skip preceding JSDoc)
jsdoc_strip = re.sub(r'^/\*\*.*?\*/\s*', '', parse_resolved_body, count=1, flags=re.DOTALL).strip()
write_file(
    UTILS_DIR / 'chat-utils.ts',
    '/**\n'
    ' * Misc helpers for the chat workflow.\n'
    ' */\n\n'
    + jsdoc_strip
)


# ───────────────────────────────────────────────────────────────────────────
# Chat step files
# ───────────────────────────────────────────────────────────────────────────

# Each entry: (filename, imports, section markers in source order)
# `imports` is a list of import lines to add at the top of the file.
CHAT_STEPS = [
    {
        'name': 'classify-step',
        'imports': [
            'import { createStep } from \'@mastra/core/workflows\';',
            'import { z } from \'zod\';',
            'import { chatWorkflowInputSchema, fileStreamItemSchema, type FileStreamItem } from \'../../utils/chat-schemas\';',
        ],
        'section': 'Step 1: classify',
    },
    {
        'name': 'stream-document-step',
        'imports': [
            'import { createStep } from \'@mastra/core/workflows\';',
            'import { fileStreamItemSchema } from \'../../utils/chat-schemas\';',
        ],
        'section': 'Step 2: per-file validate (foreach)',
    },
    {
        'name': 'collapse-step',
        'imports': [
            'import { createStep } from \'@mastra/core/workflows\';',
            'import { z } from \'zod\';',
            'import { chatWorkflowInputSchema, workflowEnvelopeSchema } from \'../../utils/chat-schemas\';',
        ],
        'section': 'Step 3: collapse foreach output back into envelope',
    },
    {
        'name': 'hitl-verify-step',
        'imports': [
            'import { createStep } from \'@mastra/core/workflows\';',
            'import { z } from \'zod\';',
            'import { workflowEnvelopeSchema } from \'../../utils/chat-schemas\';',
        ],
        'section': 'Step 4: optional HITL',
    },
    {
        'name': 'assistant-step',
        'imports': [
            'import { createStep } from \'@mastra/core/workflows\';',
            'import { z } from \'zod\';',
            'import { chatWorkflowInputSchema, chatWorkflowOutputSchema, workflowEnvelopeSchema } from \'../../utils/chat-schemas\';',
            'import { writeDataPart } from \'../../utils/persist-data-parts\';',
            'import { streamWithAutoRetry } from \'../../agent-stream-retry\';',
        ],
        'section': 'Step 5: assistant agent',
    },
    {
        'name': 'selection-gate-step',
        'imports': [
            'import { createStep } from \'@mastra/core/workflows\';',
            'import { z } from \'zod\';',
            'import { chatWorkflowInputSchema, fileStreamItemSchema, optionItemSchema, pendingSelectionSchema } from \'../../utils/chat-schemas\';',
            'import { writeDataPart } from \'../../utils/persist-data-parts\';',
        ],
        # No marker in chat.ts — extract by surrounding markers
        'section_range': ('Step 5: assistant agent', 'Sub-workflow: classify + per-file stream'),
        'extra_filter': lambda body: 'const selectionGateStep' in body or 'const continuationAssistantStep' in body,
        'keep_until': 'const continuationAssistantStep',
    },
    {
        'name': 'continuation-assistant-step',
        'imports': [
            'import { createStep } from \'@mastra/core/workflows\';',
            'import { z } from \'zod\';',
            'import { chatWorkflowInputSchema, chatWorkflowOutputSchema, fileStreamItemSchema } from \'../../utils/chat-schemas\';',
            'import { streamWithAutoRetry } from \'../../agent-stream-retry\';',
        ],
        'section_range': ('Step 5: assistant agent', 'Sub-workflow: classify + per-file stream'),
        'extra_filter': lambda body: 'const continuationAssistantStep' in body,
        'keep_until': 'const awaitValidationStep',
    },
    {
        'name': 'await-validation-step',
        'imports': [
            'import { createStep } from \'@mastra/core/workflows\';',
            'import { z } from \'zod\';',
            'import { chatWorkflowInputSchema, fileStreamItemSchema } from \'../../utils/chat-schemas\';',
            'import { writeDataPart } from \'../../utils/persist-data-parts\';',
            'import { parseResolvedOptionId } from \'$lib/server/mastra/utils/chat-utils\';',
            'import { buildWorkspaceRequestContext } from \'$lib/server/helpers/chat-helper\';',
            'import { tenantWorkspace } from \'../../storage/workspaces\';',
            'import type { TenantContext } from \'../../tenant-context\';',
        ],
        'section_range': ('Step 5: assistant agent', 'Sub-workflow: classify + per-file stream'),
        'extra_filter': lambda body: 'const awaitValidationStep' in body,
        'keep_until': 'const titleStep',
    },
    {
        'name': 'title-step',
        'imports': [
            'import { createStep } from \'@mastra/core/workflows\';',
            'import { z } from \'zod\';',
            'import { chatWorkflowInputSchema } from \'../../utils/chat-schemas\';',
            'import { generateThreadTitle } from \'$lib/server/helpers/chat-helper\';',
        ],
        'section_range': ('Step 5: assistant agent', 'Sub-workflow: classify + per-file stream'),
        'extra_filter': lambda body: 'const titleStep' in body,
        'keep_until': '// ─── Sub-workflow',
    },
    {
        'name': 'extract-file-items-step',
        'imports': [
            'import { createStep } from \'@mastra/core/workflows\';',
            'import { z } from \'zod\';',
            'import { fileStreamItemSchema } from \'../../utils/chat-schemas\';',
        ],
        'section': 'Bridge step: extract array from parallel record',
    },
]

# Now extract each step body
def extract_step_body(name, section=None, section_range=None, extra_filter=None, keep_until=None):
    if section:
        body = chat_sections.get(section)
        if not body:
            raise ValueError(f"Section not found: {section}")
        # Strip the "const <name>Step = createStep({...});" suffix? Actually keep everything.
        return body.strip()

    # range-based extraction (used when section has no marker)
    if section_range:
        start_marker, end_marker = section_range
        start_idx = None
        end_idx = None
        for i, line in enumerate(chat_content.split('\n')):
            if SECTION_RE.match(line):
                m = SECTION_RE.match(line).group(1).strip()
                if start_marker and m == start_marker and start_idx is None:
                    start_idx = i + 1
                elif end_marker and m == end_marker:
                    end_idx = i
                    break
        if start_idx is None or end_idx is None:
            raise ValueError(f"Range markers not found: {section_range}")
        body = '\n'.join(chat_content.split('\n')[start_idx:end_idx])

        # Trim to keep_until marker (e.g. next step declaration)
        if keep_until:
            body = body.split(keep_until)[0]

        if extra_filter and not extra_filter(body):
            raise ValueError(f"Filter rejected body for {name}")
        return body.strip()

    raise ValueError(f"No section or section_range for {name}")


for step in CHAT_STEPS:
    body = extract_step_body(**{k: v for k, v in step.items() if k in ('name', 'section', 'section_range', 'extra_filter', 'keep_until')})
    file_content = '\n'.join(step['imports']) + '\n\n' + body + '\n'
    write_file(CHAT_DIR / f"{step['name']}.ts", file_content)


# --- chat/classify-and-stream.ts (sub-workflow) ---------------------------
sub_wf_body = chat_sections.get('Sub-workflow: classify + per-file stream', '')
write_file(
    CHAT_DIR / 'classify-and-stream.ts',
    'import { createWorkflow } from \'@mastra/core/workflows\';\n'
    'import { chatWorkflowInputSchema, fileStreamItemSchema } from \'../../utils/chat-schemas\';\n'
    'import { classifyStep } from \'./classify-step\';\n'
    'import { streamDocumentStep } from \'./stream-document-step\';\n\n'
    + sub_wf_body + '\n'
)

# --- chat/workflow.ts (main composition + step-id exports) -----------------
main_wf_body = chat_sections.get('Workflow', '')
write_file(
    CHAT_DIR / 'workflow.ts',
    'import { createWorkflow } from \'@mastra/core/workflows\';\n'
    'import { chatWorkflowInputSchema, chatWorkflowOutputSchema } from \'../../utils/chat-schemas\';\n'
    'import { classifyAndStreamWorkflow } from \'./classify-and-stream\';\n'
    'import { titleStep } from \'./title-step\';\n'
    'import { extractFileItemsStep } from \'./extract-file-items-step\';\n'
    'import { collapseStep } from \'./collapse-step\';\n'
    'import { hitlVerifyStep } from \'./hitl-verify-step\';\n'
    'import { assistantStep } from \'./assistant-step\';\n'
    'import { selectionGateStep } from \'./selection-gate-step\';\n'
    'import { continuationAssistantStep } from \'./continuation-assistant-step\';\n'
    'import { awaitValidationStep } from \'./await-validation-step\';\n\n'
    + main_wf_body + '\n'
)

# --- workflows/index.ts ----------------------------------------------------
write_file(
    WORKFLOWS_DIR / 'index.ts',
    'export { chatWorkflow, HITL_VERIFY_STEP_ID, SELECTION_GATE_STEP_ID, AWAIT_VALIDATION_STEP_ID } from \'./chat/workflow\';\n'
    'export { editorCommandWorkflow } from \'./editor/workflow\';\n'
)

# ───────────────────────────────────────────────────────────────────────────
# Editor workflow extraction
# ───────────────────────────────────────────────────────────────────────────

EDITOR_FILE = WORKFLOWS_DIR / 'editor-command.ts'
editor_content = EDITOR_FILE.read_text()

# Strip imports — we'll add per-file imports
editor_lines = editor_content.split('\n')
editor_import_end = 0
for i, line in enumerate(editor_lines):
    s = line.strip()
    if s.startswith('import ') or (s.startswith('export ') and ' from ' in s):
        editor_import_end = i + 1
    elif s == '' and editor_import_end > 0 and i > editor_import_end:
        continue
    elif editor_import_end > 0:
        break
editor_body = '\n'.join(editor_lines[editor_import_end:]).strip('\n')

# Split editor body into step consts and the workflow composition
# Step consts are bounded by their `const <name>Step = createStep({...});` declarations
editor_step_defs = []
editor_wf_body = ''
# Find each step declaration in editor_body
editor_step_pattern = re.compile(r'^const (\w+Step) = createStep\(\{', re.MULTILINE)
matches = list(editor_step_pattern.finditer(editor_body))

for i, m in enumerate(matches):
    start = m.start()
    end = matches[i + 1].start() if i + 1 < len(matches) else len(editor_body)
    block = editor_body[start:end].rstrip().rstrip(';')
    # Add semicolon
    block = block + ';'
    editor_step_defs.append((m.group(1), block))

# The rest is the workflow composition
if matches:
    last_match = matches[-1]
    editor_wf_body = editor_body[last_match.start():].lstrip()


# Per-step imports (each step uses schemas from '../editor/schemas')
EDITOR_STEPS = [
    ('deriveEditorContextStep', 'derive-editor-context-step', 'derive-editor-context'),
    ('resolveMentionsStep', 'resolve-mentions-step', 'resolve-mentions'),
    ('resolveCommandStep', 'resolve-command-step', 'resolve-command'),
    ('runEditAgentStep', 'run-edit-agent-step', 'run-edit-agent'),
    ('runGenerateAgentStep', 'run-generate-agent-step', 'run-generate-agent'),
    ('runContinueAgentStep', 'run-continue-agent-step', 'run-continue-agent'),
]

STEP_TO_SCHEMA = {
    'deriveEditorContextStep': ['editorCommandRequestSchema', 'derivedEditorCommandSchema'],
    'resolveMentionsStep':     ['derivedEditorCommandSchema', 'resolvedMentionsSchema'],
    'resolveCommandStep':      ['resolvedMentionsSchema', 'resolvedEditorCommandSchema'],
    'runEditAgentStep':        ['resolvedEditorCommandSchema', 'editorCommandResultSchema'],
    'runGenerateAgentStep':    ['resolvedEditorCommandSchema', 'editorCommandResultSchema'],
    'runContinueAgentStep':    ['resolvedEditorCommandSchema', 'editorCommandResultSchema'],
}

for step_var, step_filename, step_id in EDITOR_STEPS:
    matching = [b for v, b in editor_step_defs if v == step_var]
    if not matching:
        raise ValueError(f"Step not found in editor: {step_var}")
    body = matching[0]

    schemas = STEP_TO_SCHEMA[step_var]
    import_lines = [
        'import { createStep } from \'@mastra/core/workflows\';',
        'import { streamWithAutoRetry } from \'../../agent-stream-retry\';',
    ]
    if step_var == 'resolveMentionsStep':
        import_lines.append('import { resolveMentionsInMarkdown } from \'../../editor/mention-resolver\';')
    elif step_var == 'resolveCommandStep':
        import_lines.append('import { buildEditPrompt, buildGeneratePrompt } from \'../../editor/prompt-builders\';')
    else:
        import_lines.append('import { ' + ', '.join(schemas) + ' } from \'../../editor/schemas\';')

    if step_var == 'resolveMentionsStep':
        import_lines.append('import { derivedEditorCommandSchema, resolvedMentionsSchema } from \'../../editor/schemas\';')
    elif step_var == 'resolveCommandStep':
        import_lines.append('import { resolvedMentionsSchema, resolvedEditorCommandSchema } from \'../../editor/schemas\';')

    file_content = '\n'.join(import_lines) + '\n\n' + body + '\n'
    write_file(EDITOR_DIR / f'{step_filename}.ts', file_content)


# --- editor/workflow.ts (composition + stripLeakedSelection helper) --------
write_file(
    EDITOR_DIR / 'workflow.ts',
    'import { createWorkflow } from \'@mastra/core/workflows\';\n'
    'import { editorCommandRequestSchema, finalizedEditorCommandSchema } from \'../editor/schemas\';\n'
    'import { deriveEditorContextStep } from \'./derive-editor-context-step\';\n'
    'import { resolveMentionsStep } from \'./resolve-mentions-step\';\n'
    'import { resolveCommandStep } from \'./resolve-command-step\';\n'
    'import { runEditAgentStep } from \'./run-edit-agent-step\';\n'
    'import { runGenerateAgentStep } from \'./run-generate-agent-step\';\n'
    'import { runContinueAgentStep } from \'./run-continue-agent-step\';\n\n'
    + editor_wf_body
    + '\n'
)


# ───────────────────────────────────────────────────────────────────────────
# Update import sites
# ───────────────────────────────────────────────────────────────────────────

# mastra/index.ts: './workflows/chat' → './workflows'
mastra_index = (WF / 'index.ts').read_text()
mastra_index = mastra_index.replace(
    "import { chatWorkflow } from './workflows/chat';",
    "import { chatWorkflow } from './workflows';"
)
# Also update any editorCommandWorkflow import if present
if "from './workflows/editor-command'" in mastra_index:
    mastra_index = mastra_index.replace(
        "from './workflows/editor-command'",
        "from './workflows'"
    )
(WF / 'index.ts').write_text(mastra_index)

# routes/api/chat/+server.ts: '$lib/server/mastra/workflows/chat' → '$lib/server/mastra/utils/chat-schemas'
api_chat = (ROOT / 'src/routes/api/chat/+server.ts').read_text()
api_chat = api_chat.replace(
    'import { chatWorkflowInputSchema } from "$lib/server/mastra/workflows/chat";',
    'import { chatWorkflowInputSchema } from "$lib/server/mastra/utils/chat-schemas";'
)
(ROOT / 'src/routes/api/chat/+server.ts').write_text(api_chat)


# ───────────────────────────────────────────────────────────────────────────
# Delete the old monolithic files
# ───────────────────────────────────────────────────────────────────────────

CHAT_FILE.unlink()
EDITOR_FILE.unlink()

print('✓ Refactor complete')
print(f'  Created:')
print(f'    - {UTILS_DIR}/chat-schemas.ts')
print(f'    - {UTILS_DIR}/chat-errors.ts')
print(f'    - {UTILS_DIR}/chat-utils.ts')
print(f'    - {CHAT_DIR}/ (10 step files + classify-and-stream.ts + workflow.ts)')
print(f'    - {EDITOR_DIR}/ (6 step files + workflow.ts)')
print(f'    - {WORKFLOWS_DIR}/index.ts')
print(f'  Updated:')
print(f'    - {WF}/index.ts (chatWorkflow import path)')
print(f'    - {ROOT}/src/routes/api/chat/+server.ts (chatWorkflowInputSchema import path)')
print(f'  Deleted:')
print(f'    - {CHAT_FILE}')
print(f'    - {EDITOR_FILE}')
