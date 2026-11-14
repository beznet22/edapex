# 21 — Generative UI: OpenUI Lang for v1

**Draft.** Phase 9B decision. Dependencies installed: `@openuidev/lang-core@1.1.0`, `@openuidev/react-lang@1.1.0` (pinned). Transitive `@openuidev/devtools@0.3.1` and `@openuidev/observability@0.0.4` are inside the security-review scope.

## Specification context

This spec is **authoritative for v1 generated UI** and owns the OpenUI encoder, catalog, validation, action bridge, storage shape and security rules. It is not a chat-shell or platform-layout spec.

- `15-ui-surfaces.md` owns where a surface appears and how it fits the transcript/artifact layout.
- `17-chat-framework.md` owns the `surface` message part and runtime event mapping.
- `19-design-system.md` owns the tokens and React primitives each catalog component maps to.
- `43`/`44` own source reuse and audit rules.

Where spec 15 says “if both are enabled,” this spec resolves v1: **OpenUI only; A2UI is deferred**. Do not add an A2UI adapter, dependency or fallback path.

## Decision

Use **OpenUI Lang** as the v1 generative-UI encoder and renderer.

- The chat shell, transcript, composer, approvals and runtime state come from the ported OpenDuet interaction layer.
- xcodex remains the only local agent runtime.
- OpenUI renders generated surfaces from a fixed, host-owned component catalog.
- Authoritative EdApex workflows stay in fixed React forms. GenUI is read-only or assisted, never the final authority.
- A2UI is deferred. Do not install `@a2ui/*`, `@copilotkit/a2ui-renderer`, or the experimental `@openuidev/a2ui` profile in v1.
- Do not use MCP Apps or arbitrary HTML/iframe GenUI in v1.

The canonical runtime path is:

```text
xcodex
  → typed tool result (already authorized and tenant-scoped)
  → OpenUI Lang surface
  → parser + catalog validation
  → Gold on Slate React components
  → closed action ID
  → xcodex typed operation
  → CF Worker authorization / approval
  → mutation
```

## Why OpenUI for v1

v1 is a React application inside Tauri and the browser, and OpenDuet is React. A compact language that renders registered React components adds no new runtime beyond the existing React layer, which is why it was chosen for v1.

OpenUI's first-party benchmark reports, across 46 screens and six models:

| Metric | OpenUI | A2UI |
|---|---:|---:|
| Mean output tokens | 1,362 | 2,823 |
| System prompt tokens | 5,031 | 12,610 |
| Combined tokens | 6,393 | 15,433 |
| Stream time at 50 tok/s | ~27s | ~56s |
| Render success | 99.9% | 96.6% |

The benchmark is maintained by OpenUI, not an independent standards body. Treat it as directional evidence pending the EdApex bake-off in `70-evaluation-and-rollout.md`. `70-evaluation-and-rollout.md` requires an EdApex bake-off on real school surfaces before the catalog is frozen.

The decision is not permanent: re-evaluation triggers, the React Native/Flutter/Lynx renderer status and the v2 GenUI gate live in `80-v2-native-mobile.md` (§A2UI triggers, §v2 GenUI).

## GenUI scope

### Tier 0 — fixed React only

These are not GenUI surfaces:

- marksheet entry, review and publishing;
- fee reconciliation and payment mutation;
- student/staff record edits;
- approval decisions;
- bulk imports, deletions, promotions and transfers;
- public application forms;
- any destructive, financial or legally significant action.

GenUI may **open** these forms with a prefill, but it may not edit or submit them.

### Tier 1 — read-only GenUI

This is the majority of v1 GenUI:

- Student 360: attendance, performance trend, fee balance, intervention options.
- Class/cohort performance comparisons.
- Attendance exception lists and trends.
- Fee collection status and changes.
- Timetable and free-period views.
- Report-card and transcript summaries.
- Data-quality/quarantine views.
- Approval preflight: what will change, exceptions, risk, required approval.
- Onboarding and role-specific help.

### Tier 2 — assisted GenUI

The surface may compose context and a recommended next step, but the action opens a fixed form or requests an allowlisted operation:

- draft a fee reminder for human approval;
- open a prefilled intervention form;
- open the fixed marksheet editor for a student/subject;
- open the fixed approval dialog after a preflight;
- open the quarantine-resolution form.

Tier 2 must never write directly from a generated button.

### Prohibited

- No raw HTML, CSS or JavaScript in a GenUI surface.
- No iframe or third-party widget in chat.
- No `query`/`mutation` primitives in generated OpenUI Lang. Data comes from tool results.
- No arbitrary `{ method, path, body }` action.
- No direct database access, credential access or session access.
- No implicit persistence of school data.
- No GenUI decision that replaces a server-side authorization or approval gate.

## Package boundary

Use only:

- `@openuidev/lang-core` — parser, prompt generation, validation and type layer;
- `@openuidev/react-lang` — React renderer for the EdApex catalog.

Do **not** use:

- `@openuidev/react-ui` — prebuilt chat layouts duplicate the OpenDuet shell;
- `@openuidev/react-headless` — chat state belongs to the xcodex adapter;
- `@openuidev/a2ui` — experimental and not a v1 dependency;
- `@assistant-ui/*` — removed from v1;
- CopilotKit or `@copilotkit/a2ui-renderer`.

The workspace package is `packages/genui`. It owns the catalog, parser wrapper, action types, prompt builder and renderer adapter. `packages/chat` owns the OpenDuet-derived transcript/composer and the xcodex chat adapter.

## Catalog

Keep the v1 catalog small: 25–35 components, role-scoped. The shipped baseline is `packages/genui/src/catalog.tsx` — six components (`Stack`, `TextContent`, `Badge`, `Metric`, `Callout`, `Table`; library id `edapex-v1`) with Zod-enforced caps (≤20 rows, ≤8 columns, ≤200 cells, ≤40 `Stack` children, ≤2,000 chars text). The role-scoped catalog is a Modify of that file: `createLibrary(role)` returning the per-role component set.

### Layout and structure

`Stack`, `Card`, `Section`, `Grid`, `Tabs`, `Divider`, `EmptyState`, `Skeleton`.

### Data presentation

`Metric`, `Table`, `Chart`, `Timeline`, `Diff`, `Badge`, `Callout`, `TextContent`, `KeyValue`, `Progress`.

### EdApex domain summaries

`StudentHeader`, `ClassHeader`, `AttendanceSummary`, `FeeSummary`, `MarksheetSummary`, `ApprovalPreflight`.

### Actions

`Button`, `Link`, `ActionButton`, `FormSummary`.

Catalog rules:

- Every component maps to an existing Gold-on-Slate React component or a thin adapter.
- No arbitrary style props. Theme comes from host tokens.
- Props are typed with Zod schemas and validated before render.
- Tables have a row cap (start: 20 rows) and aggregate/chart data should be pre-aggregated by the tool.
- Parent/student catalogs are read-only and exclude mutation actions.
- Teacher/admin catalogs add assisted actions, but no direct-write components.
- The catalog version is explicit and stored with the surface.
- A component removed from the catalog renders a safe fallback, not arbitrary HTML.

## Data rules

- GenUI receives only data already returned by an authorized tool.
- The model never receives a database handle, SQL, session token or unrestricted API client.
- The surface is rendered from tool output plus a presentation payload; it cannot fetch its own data.
- For `edapex-ephemeral` data, do not persist a PII snapshot. Persist the surface source, catalog version, data class and expiry; re-render only when the data is still available.
- If the data is unavailable after reload, show a redacted expired-surface state or the fixed tool-card fallback. Do not silently show stale marks or fees.
- Redact/minimize PII before sending prompts to remote models.
- Tenant/school scope is applied before the tool returns data; the renderer is not a security boundary.

## Action bridge

Generated surfaces may emit only closed action IDs:

```ts
type GenUIAction =
  | {
      kind: "navigate";
      route: AllowlistedRouteId;
      entityId?: string;
    }
  | {
      kind: "open_form";
      form: AllowlistedFormId;
      entityId?: string;
      prefill?: Readonly<Record<string, string | number>>;
    }
  | {
      kind: "request_operation";
      operation: AllowlistedOperationId;
      args: Readonly<Record<string, string | number | boolean | null>>;
    };
```

Rules:

- `AllowlistedRouteId`, `AllowlistedFormId` and `AllowlistedOperationId` are closed unions generated from the capability registry.
- No free-form URL, HTTP method, path or request body.
- `request_operation` is validated server-side for role, tenant, current record state and approval policy.
- `open_form` navigates to fixed React; it does not submit.
- Approval decisions use `open_form`/`navigate` to the fixed approval surface; GenUI never approves.
- Every action carries a correlation ID and is audited.
- Unknown action IDs are rejected and shown as an error, not executed.

## Surface storage

Store generated surfaces in `message_parts` (see `42-agent-db-schema.md`). The normative type is `SurfacePart` in `packages/contracts/src/chat.ts` — discriminator `kind: "surface"`, fields `language: "openui"`, `catalogVersion`, `source`, `dataClass`, and optional `expiresAt` (epoch ms) for `edapex-ephemeral` surfaces.

- `workspace` surfaces may be stored locally and synced under the workspace policy.
- `edapex-ephemeral` surfaces store source and metadata only; no student/mark/fee snapshot.
- Do not create an artifact automatically. Saving a surface as an artifact is an explicit user action, and the artifact data policy applies.
- The transcript may replay the source; if the data is unavailable, show the expired/fallback state.

## Token and latency budget

Starting budgets, to be validated in `70`:

- target ≤2,000 output tokens for 90% of surfaces;
- max 40 rendered components;
- max 20 table rows;
- charts use aggregated data, not raw exports;
- one surface per turn by default; no speculative surfaces;
- fallback to a fixed tool card or plain text when the budget, parser or renderer fails.

Do not optimize by removing the catalog's safety constraints. A smaller role-scoped catalog is the preferred lever.

## Security

OpenUI Lang is untrusted model output.

- Parse and validate with `@openuidev/lang-core`; enforce component/prop schemas and size limits.
- Reject unsupported components, expressions, queries, mutations and over-budget surfaces.
- Sanitize text/Markdown; allowlist links/images; no raw HTML.
- Render only registered React components; no dynamic `import`, `eval` or script execution.
- No iframe, no third-party origin, no `window.open` from model-supplied URLs.
- Action bridge is closed and server-authorized.
- No school data in sync, logs or telemetry; redact PII.
- A generated surface is not an approval, a capability grant or a mutation token.
- OpenUI's parser/runtime must be pinned and security-reviewed before release.

## Non-goals

- No GenUI marksheet editor.
- No GenUI financial mutation.
- No GenUI approval decision.
- No MCP Apps or arbitrary HTML widgets.
- No A2UI dependency in v1.
- No assistant-ui or CopilotKit runtime.
- No server-side xcodex.
- No paid GenUI/hosted persistence service.

## Acceptance

- The catalog renders on web, Tauri desktop and Tauri mobile WebView.
- 50 golden prompts across admin/teacher/parent/student meet the `70` thresholds (golden set: `packages/genui/test/golden/`, thresholds imported from `70-evaluation-and-rollout.md`).
- Every generated action is a closed ID; zero unauthorized mutations in the red-team suite (`packages/genui/test/redteam/`: closed-ID rejection, unknown-action error path, no direct-write components).
- No school-data snapshot is persisted for `edapex-ephemeral` surfaces.
- Parser failure, unknown component, over-budget surface and missing data all fall back safely.
- A2UI/assistant-ui/CopilotKit are absent from the v1 dependency graph.
- The surface source, catalog version and data class are stored and replayable under policy.

## Sources

- OpenUI repository: <https://github.com/thesysdev/openui>
- OpenUI benchmarks: <https://www.openui.com/benchmarks>
- OpenUI package docs: <https://www.openui.com/docs/api-reference>
- OpenDuet pinned source: `CopilotKit/OpenDuet@f52288fff5ccdbd3de428d573d9f026fce5ff480`
- OpenUI/A2UI experimental profile: <https://www.openui.com/docs/api-reference/a2ui>
