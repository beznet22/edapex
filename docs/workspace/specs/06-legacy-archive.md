# 06 — Legacy Retirement and Archive

**Draft.** Phase 9B planning only.

## Goal

Retire the legacy SvelteKit application without losing rollback capability, audit history or archived data.

## Phases

| Step | Action | Gate |
|---|---|---|
| Freeze | No feature work; maintenance/security only | Phase 8 signed |
| Tag | `legacy-sveltekit-final` at the last deployable commit | final source/dump hash recorded |
| Read-only | Keep deployment for rollback; no new writes | 24h watch green |
| Exclude | Remove from new workspace build/CI | new app verified |
| Archive | Preserve branch/tag, docs, env names, data map | explicit owner approval |
| Retire | Redirect/remove domains; stop deployment | retention/legal approval |
| Delete | Remove source only with approval | rollback window closed |

## Must preserve

- final commit/tag and release artifact
- final database/archive checksums
- route list and environment-variable names (not secrets)
- operational/rollback runbook
- data-retention and legal decision
- owner of the archive

## Must not do

- Delete the tree before the rollback window closes.
- Mix legacy SvelteKit code into new React/Tauri packages.
- Reuse legacy assets as the new canonical source.
- Archive secrets or PII in git or docs.
- Redirect `api.llacademy.ng`/portals until Phase 8/9A is signed.

## Relationship to the workspace

The new workspace is a clean implementation. EdApex skills/tools wrap the CF Worker API; they do not import legacy SvelteKit modules. The legacy app remains a reference and rollback target only.
