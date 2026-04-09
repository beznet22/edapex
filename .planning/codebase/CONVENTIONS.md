# Conventions (edapex)

Coding standards and development mandates for EdApex V2.

## Process & Tooling
- **Package Manager**: Always use `pnpm`.
- **Database**: All migrations via `drizzle-kit` or `wrangler d1 migrations`.
- **State Management**: Client-side data must use TanStack DB.

## Multi-Tenant Security
- **Mandatory Filter**: Every database query MUST include a `tenant_id` filter.
- **Pre-execution PBAC**: Authorization happens *before* any tool or service execution.

## AI & Agentic Development
- **HMAS Orchestration**: Follow the Executive -> Supervisor -> Agent hierarchy.
- **Provider-Agnostic**: Define agent capabilities via Mastra; pick model at runtime.
- **Skills System**: Logic for complex operations (like Classroom Domain 18) lives in `domain-classroom` skills.

## Coding Style
- **Layered Arch**: Respect boundary rules (Controllers -> Services -> Repositories).
- **Identifier Standard**: Use UUID v7 for all core identifiers.
- **UI Skeletons**: Use `boneyard-js` for pixels-perfect skeleton screens in all high-density views.
- **Commit Attribution**: AI commits MUST include the following footer:
```text
Signed-off-by: Beznet <[EMAIL_ADDRESS]>
Co-Authored-By: Antigravity <antigravity@google.com>
```

## CLI Shortcuts
- **Typecheck**: `pnpm tsc --noEmit src/path/to/file.ts`
- **Format**: `pnpm prettier --write src/path/to/file.ts`
- **Drizzle Push**: `pnpm run db:push`
