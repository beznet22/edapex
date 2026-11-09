# 50 — Workflows, Shell and Sandbox

**Draft.** No implementation in Phase 9B.

## The distinction

| Layer | Purpose |
|---|---|
| Typed workflow IR | Known, validated sequences of business capabilities |
| Agent-composed plan | Natural-language request decomposed into capabilities |
| Code sandbox | Computation/conditions not expressible in the IR |
| Shell | Filesystem inspection and editing only |

A shell is not a workflow engine. A typed workflow is not enough for every natural-language request.

## TypeScript workflow IR

Author workflows in TypeScript as data:

```ts
type Workflow = {
  id: string;
  version: number;
  steps: Step[];
};

type Step =
  | { kind: "call"; capability: string; input: unknown }
  | { kind: "if"; condition: Condition; then: Step[]; else: Step[] }
  | { kind: "forEach"; source: unknown; do: Step[] }
  | { kind: "code"; script: string; capabilities: string[] };
```

- TypeScript is authoring-time only.
- Runtime validation uses Zod/JSON Schema.
- Types do not enforce runtime values.
- Do not execute arbitrary TypeScript.
- The IR can be versioned, validated, approved and synced.

## Natural-language fallback

1. Agent maps the request to known capabilities.
2. If complete, emit workflow IR.
3. If not, emit a sandboxed code step with explicit capabilities.
4. If still not possible, ask the person or refuse.
5. Every write/export gets human approval.

## Code sandbox

- JS/WASM only; no shell for business workflows.
- Bound capability calls only; no network, host FS, secrets or DOM.
- Time/memory/output limits.
- Local: QuickJS/wasmi interpreter; avoid JIT-dependent mobile runtimes.
- Desktop can use Wasmtime; mobile uses an interpreter.
- Code and results are audited.
- No execution of model-generated code in the Tauri/WebView main runtime.

## Shell

- Allowlisted commands over the workspace.
- Admin/teacher only.
- File I/O only; no school API access from shell.
- Desktop may use Tauri's permissioned shell plugin; mobile implements a Rust command engine.
- Shell output is subject to quotas/redaction.

## Approval

Plan and dry-run first. Apply requires human approval, an idempotency key and an audit record. High-impact actions (placements, merges, enrollment, staffing) are never auto-applied.
