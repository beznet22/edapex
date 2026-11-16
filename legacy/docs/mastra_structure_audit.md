# Mastra Directory Structure Audit & Reorganization

## Scope
Audit and reorganize all files under: `src/lib/server/mastra/`

---

## Mission
Analyze the current file layout of the scoped directory. Identify files that are misplaced, responsibilities that are split across wrong boundaries, and naming inconsistencies. Propose and execute a reorganization into a clean, domain-driven folder structure following Mastra framework and modular monolith best practices.

## Current State (Reference)
```
mastra/
├── agents/                    # Agent definitions
│   ├── assistant.ts
│   ├── editor-copilot.ts
│   ├── editor-edit.ts
│   ├── editor-generate.ts
│   ├── index.ts
│   ├── result-mapper.ts
│   ├── shared.ts
│   ├── supervisor.ts
│   └── title.ts
├── editor/                    # Editor-specific logic
│   ├── prompt-builders.ts
│   ├── schemas.ts
│   └── utils.ts
├── skills/                    # Skill definition files (.md)
│   ├── assistant.skill.md
│   ├── default.skill.md
│   ├── gov.skill.md
│   ├── grading.skill.md
│   ├── onboard.skill.md
│   └── supervisor.skill.md
├── storage/                   # Storage adapters
│   ├── extracted-assessment.ts
│   ├── files.ts
│   ├── libsql/
│   ├── ocr/
│   ├── student-files.ts
│   ├── tenant-file-storage.ts
│   └── workspaces/
├── tools/                     # Tool definitions (flat)
│   ├── carry-forward.ts
│   ├── context-tool.ts
│   ├── core-tools.ts
│   ├── ddg-scraper.ts
│   ├── global-tools.ts
│   ├── gov-tools.ts
│   ├── grading-tools.ts
│   ├── html-to-markdown.ts
│   ├── index.ts
│   ├── lru-cache.ts
│   ├── onboard-tools.ts
│   ├── tinyfish-client.ts
│   └── workflow-tools.ts
├── workflows/                 # Workflow definitions
│   ├── chat.ts
│   ├── editor-command.ts
│   ├── extraction.ts
│   ├── generate.ts
│   ├── publish.ts
│   └── validation.ts
├── context-cache.ts           # ← Root-level loose files
├── file-context.ts
├── gateway.ts
├── index.ts
├── mention-processor.ts
├── provider-config.ts
├── registry.ts
├── route-guard.ts
├── router.ts
├── scoped-repository.ts
├── skill-context.ts
├── skill-registry.ts
├── skill-schema.ts
├── skill-state.ts
├── skill-tools.ts
├── skill-watcher.ts
└── tenant-context.ts
```

## Problems to Identify
1. **Root-level file sprawl**: 17 loose files in the root — many belong in subdirectories by domain.
2. **Skill-related fragmentation**: `skill-context.ts`, `skill-registry.ts`, `skill-schema.ts`, `skill-state.ts`, `skill-tools.ts`, `skill-watcher.ts` are scattered in the root instead of colocated under `skills/`.
3. **Flat tool directory**: 13 tool files in a flat `tools/` folder — group by domain (grading, governance, onboarding, editor, etc.).
4. **Infrastructure mixed with domain**: `lru-cache.ts`, `html-to-markdown.ts`, `ddg-scraper.ts`, `tinyfish-client.ts` are utilities/clients, not Mastra tools — they belong in an `infra/` or `lib/` subdirectory.
5. **Missing `types/` directory**: Shared types and interfaces are likely scattered across files instead of centralized.
6. **Barrel export hygiene**: Check that each subdirectory has a clean `index.ts` that re-exports its public API.

## Target Structure (Reference — adapt based on findings)
```
mastra/
├── index.ts                   # Public API — re-exports from subdirectories
├── config/                    # Framework configuration
│   ├── provider-config.ts     # LLM provider setup
│   └── registry.ts            # Agent/tool registry
├── agents/                    # Agent definitions
│   ├── index.ts
│   ├── assistant.ts
│   ├── supervisor.ts
│   ├── title.ts
│   ├── shared.ts              # Shared agent utilities
│   ├── result-mapper.ts
│   └── editor/                # Editor-specific agents grouped
│       ├── copilot.ts
│       ├── edit.ts
│       └── generate.ts
├── tools/                     # Tool definitions grouped by domain
│   ├── index.ts
│   ├── core/
│   │   ├── core-tools.ts
│   │   ├── context-tool.ts
│   │   └── workflow-tools.ts
│   ├── grading/
│   │   ├── grading-tools.ts
│   │   └── carry-forward.ts
│   ├── governance/
│   │   └── gov-tools.ts
│   ├── onboarding/
│   │   └── onboard-tools.ts
│   └── global/
│       └── global-tools.ts
├── workflows/                 # Workflow definitions
│   ├── index.ts
│   ├── chat.ts
│   ├── editor-command.ts
│   ├── extraction.ts
│   ├── generate.ts
│   ├── publish.ts
│   └── validation.ts
├── skills/                    # Skill system (definitions + runtime)
│   ├── index.ts
│   ├── definitions/           # .skill.md files
│   │   ├── assistant.skill.md
│   │   ├── default.skill.md
│   │   ├── gov.skill.md
│   │   ├── grading.skill.md
│   │   ├── onboard.skill.md
│   │   └── supervisor.skill.md
│   ├── context.ts             # was skill-context.ts
│   ├── registry.ts            # was skill-registry.ts
│   ├── schema.ts              # was skill-schema.ts
│   ├── state.ts               # was skill-state.ts
│   ├── tools.ts               # was skill-tools.ts
│   └── watcher.ts             # was skill-watcher.ts
├── storage/                   # Storage adapters (unchanged if clean)
│   ├── index.ts
│   ├── extracted-assessment.ts
│   ├── files.ts
│   ├── student-files.ts
│   ├── tenant-file-storage.ts
│   ├── libsql/
│   ├── ocr/
│   └── workspaces/
├── context/                   # Request/tenant context
│   ├── index.ts
│   ├── tenant-context.ts
│   ├── scoped-repository.ts
│   ├── context-cache.ts
│   ├── file-context.ts
│   └── mention-processor.ts
├── routing/                   # API routing and guards
│   ├── index.ts
│   ├── gateway.ts
│   ├── router.ts
│   └── route-guard.ts
├── editor/                    # Editor-specific logic
│   ├── index.ts
│   ├── prompt-builders.ts
│   ├── schemas.ts
│   └── utils.ts
└── lib/                       # Internal utilities (not Mastra-specific)
    ├── lru-cache.ts
    ├── html-to-markdown.ts
    ├── ddg-scraper.ts
    └── tinyfish-client.ts
```

## Non-Code Assets (`.md`, `.json`, `.yaml`, etc.)

Non-code files are easy to miss during reorganization because they don't appear in TypeScript import graphs. They are just as important — a moved `.skill.md` that isn't reflected in the runtime loader will silently break the skill system.

### Strategy: Colocate with the Code that Loads Them
This is the dominant pattern in major open-source projects:
- **Mastra** itself colocates agent configs with agent code.
- **Next.js / SvelteKit** colocate route metadata with route files.
- **Nx / Turborepo** keep project-level configs (`project.json`, `tsconfig.json`) inside each package.
- **Storybook** colocates `.stories.tsx` next to the component.

The principle: **a non-code file lives in the same directory as the code that reads it**.

### How to Audit Non-Code Files
1. **Enumerate**: List all non-`.ts` / non-`.js` files in the scoped directory:
   ```bash
   find src/lib/server/mastra -type f ! -name '*.ts' ! -name '*.js'
   ```
2. **Trace the loader**: For each non-code file, find the code that reads it at runtime. Search for:
   - `fs.readFile`, `fs.readdir`, `readFileSync` — direct file reads
   - `glob`, `watch`, `chokidar` — glob/watcher patterns
   - `import.meta.glob` — Vite glob imports
   - `gray-matter`, `yaml.parse`, `JSON.parse(readFile...)` — frontmatter/config parsers
   - Hardcoded path strings referencing the file or its directory
3. **Record the binding**: In the migration table, note:
   - What file loads it
   - Whether the path is hardcoded or configurable (constructor arg, env var, etc.)
   - Whether a glob pattern (`*.skill.md`) or exact filename is used
4. **Move together**: When the loader code moves, the non-code files it reads must move to the same relative location — or the loader's path config must be updated.

### Known Non-Code Files in This Project
| File Pattern | Loader | Path Source |
|-------------|--------|-------------|
| `skills/*.skill.md` | `skill-schema.ts` → `validateSkillDirectory()` | `skillDir` constructor arg |
| `skills/*.skill.md` | `skill-watcher.ts` → `chokidar.watch()` | `skillDir` constructor arg |
| `skills/*.skill.md` | `skill-registry.ts` → `loadFromDirectory()` | `skillDir` param |

### Migration Table Format for Non-Code Files
Non-code files use the same migration table but with a **Loader Update** column:

| Current Path | Action | Proposed Path | Loader Update | Reason |
|-------------|--------|--------------|---------------|--------|
| `skills/*.skill.md` | **move** | `skills/definitions/*.skill.md` | Update `skillDir` at call sites to append `/definitions` | Separate runtime code from definition files |

---

## Process
1. **Audit**: Read every file in the scoped directory — **including non-code files** (`.md`, `.json`, `.yaml`, etc.). For each file, note:
   - Its primary responsibility (agent, tool, workflow, config, utility, type, context, **definition**, **fixture**).
   - What it imports and what imports it (dependency graph). For non-code files, trace the **runtime loader** instead.
   - Whether it belongs in its current location.
2. **Propose**: Before moving anything, produce a migration table with an **Action** column:

   | Current Path | Action | Proposed Path | Reason |
   |-------------|--------|--------------|--------|
   | `skill-context.ts` | **move** | `skills/context.ts` | Colocate skill runtime with definitions |
   | `lru-cache.ts` (in tools/) | **move** | `lib/lru-cache.ts` | Infrastructure, not a Mastra tool |
   | `<duplicated-file>.ts` | **merge** → `<surviving-file>.ts` | — | Overlapping responsibility, consolidate |
   | `<dead-file>.ts` | **delete** | — | Zero imports, dead code |
   | ... | ... | ... | ... |

   Valid actions: `move`, `merge`, `delete`. For merges, specify which file survives and absorbs the other.

3. **Confirm**: Present the migration table and target structure for approval before executing.
4. **Execute**: For each file move:
   a. Move the file to its new location.
   b. Update ALL import paths across the entire `src/` directory that reference the old path.
   c. Update barrel `index.ts` files in both the source and destination directories.
   d. Run `pnpm run svelte-check --workspace src/lib/server/mastra/` to verify zero breakage.
5. **Create missing barrel exports**: Every subdirectory must have an `index.ts` that exports its public API.
6. **Final verification**: Run `pnpm run build` to confirm no broken imports remain anywhere.

## Merge & Delete Rules
- **Merge**: When two files serve the same purpose or have heavily overlapping responsibilities, merge the smaller into the larger. Preserve the richer implementation, port any unique logic from the other, then delete the redundant file. Update all imports to point to the surviving file.
- **Delete**: When a file is dead code (zero imports, no dynamic references), delete it. Confirm with a full-project grep (`grep -r "filename" src/`) before removing.
- **Flag uncertain cases**: If you're unsure whether a file is dead or duplicated, flag it in the migration table with action `review` instead of deleting.

## Constraints
- Do NOT change runtime logic, function signatures, or type definitions during moves.
- Do NOT rename exported symbols — only file paths change.
- When merging, preserve the richer implementation and port unique logic from the absorbed file. Do not silently drop functionality.
- Preserve git history by using `git mv` where possible.
- If a circular dependency is discovered during the audit, flag it in the migration table but do NOT attempt to resolve it in this pass.

## Naming Conventions
- **Directories**: lowercase, singular nouns (`context/` not `contexts/`).
- **Files**: kebab-case (`tenant-context.ts` not `tenantContext.ts`).
- **Non-code files**: Keep existing naming conventions (e.g., `<name>.skill.md`). Do not rename unless the convention is inconsistent.
- **Colocated assets**: Non-code files that are loaded by a specific module live in the same directory or a `definitions/` subdirectory within that module.
- **Barrel exports**: Every directory gets an `index.ts`. Non-code asset directories (e.g., `definitions/`) do not need barrel exports.
- **Domain grouping**: Group by business domain first (`grading/`, `governance/`), not by technical role.
