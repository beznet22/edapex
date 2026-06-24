# Provider/Model Configuration Lifecycle Hardening — Summary

Ferment ID: `019ef676-bc37-76df-977f-aca464062ab3`

## Outcome

All four phases executed. All 11 success criteria pass. The canonical Mastra catalog now lives at `src/lib/provider/catalog.ts` (slash IDs); legacy colon IDs are accepted as read-only via `COLON_TO_SLASH_ALIAS`. The visibility toggle, platform-default disconnect, encryption env, discovery consolidation, UI cleanup, and hardening changes are complete.

## Files Touched

### Created
- (none — the catalog moved, not copied)

### Deleted
- `src/lib/server/mastra/provider/catalog.ts` — relocated contents to `$lib/provider/catalog`

### Modified
- `src/lib/provider/catalog.ts` — replaced contents with slash-id canonical data + `COLON_TO_SLASH_ALIAS` + preserved `WELL_KNOWN_MODELS`/`resolveModelInfo` (now uses `getAllDiscoveredModelsForUser` dynamic import)
- `src/lib/server/mastra/provider/resolver.ts` — `./catalog` → `$lib/provider/catalog`; `extractProviderId` and `stripProviderPrefix` accept both `/` and `:`
- `src/lib/server/mastra/provider/availability.ts` — `./catalog` → `$lib/provider/catalog`; threaded `env` into `getDiscoveredModelsForUser`
- `src/lib/server/mastra/provider/index.ts` — barrel exports now source from `$lib/provider/catalog`; removed dead `getVisibleModelIdsForUser` and credentials' Map-returning `getDiscoveredModelsForUser`
- `src/lib/server/mastra/provider/visibility.ts` — renamed `getExplicitlyHiddenModelIdsForUser` → `getHiddenModelIdsForUser`; removed `getVisibleModelIdsForUser` (unused)
- `src/lib/server/mastra/provider/discovery.ts` — `${providerId}/${raw.id}` (slash); `persistDiscoveredModels` and `getDiscoveredModelsForUser` now require `env` parameter; added `getAllDiscoveredModelsForUser`
- `src/lib/server/mastra/provider/credentials.ts` — `safeParseCustom` uses passed `env`; deleted Map-returning `getDiscoveredModelsForUser`; `UserCredentialState.source` tightened to `'db' | 'platform'`; `apiKeyMasked` is `''` for platform rows; `saveUserCredential` returns the written row and passes it to discovery (no read-after-write race)
- `src/lib/api/agent.remote.ts` — `getModelVisibility` returns `hiddenModelIds` (renamed); `getUserCredentials` tightened types, collapsed auth-failure branches, returns `apiKeyMasked: ''` for platform rows; dropped `envKey` from `PlatformDefault`
- `src/routes/(chat)/+layout.server.ts` — imports from `$lib/provider/catalog`; SSR cookie rewrite for colon → slash with `cookies.set`; renamed `visibleModelIds` (held hidden IDs) to `hiddenIds` and updated the misleading comment
- `src/routes/(chat)/+layout.svelte` — destructures `hiddenIds` instead of `visibleModelIds`; passes to `AvailableModelsHolder`
- `src/lib/context/sync.svelte.ts` — `AvailableModelsHolder.hiddenIds` returns `ReadonlySet<string>`; added `hasHidden()`; removed `setContext()` fallback in `fromContext()` (throws instead)
- `src/lib/components/settings-modal.svelte` — local `availableModels`/`visibleModelIds` now `$derived` from the holder (single source of truth); `disconnectProvider` skips remote call when `source === 'platform'`; removed dead `keyless`/`env` branches in `badgeForCredential`; `modelSearch` filter also matches provider display name; `Free` badge now driven by `isModelFree()` (cost-based); removed hardcoded `Free` badge; removed `customSubmitError`; removed dead Cog button; removed `nvidia_nim`/`mistral` from `providerLogos`; `exitConnectForm` resets custom-provider state on cancel
- `src/lib/components/model-selector.svelte` — dropped dead `hiddenIds` `$state` shadow; `selectModel` no longer rewrites colon → slash (catalog is already slash)

## Verification

- `pnpm run check` — zero new errors. The only remaining errors are pre-existing `'term'` literal errors in `tests/mastra/mention-processor.test.ts` (6 occurrences, unrelated to this work).
- All grep acceptance commands return the expected results.
- File existence checks: `src/lib/server/mastra/provider/catalog.ts` is deleted; `src/lib/provider/catalog.ts` contains slash-id `BUILTIN_MODELS` with `COLON_TO_SLASH_ALIAS`.

## Risks / Follow-ups

- **Legacy DB rows**: User-discovered models persisted before this change were stored with colon-format ids (`groq:llama-…`). The resolver now produces slash ids. Old persisted `discovered_models` rows remain in colon form and will not match the catalog lookup. They stay invisible to the user but consume disk. A future migration could re-discover for affected users.
- **`getEncryptionKey` fallback**: The single `process.env` fallback inside `getEncryptionKey` is intentional — it covers the case where the helper is called without an env parameter (e.g., from `getAllDiscoveredModelsForUser` before dynamic import resolves `$env/dynamic/private`). All credential encrypt/decrypt paths now thread env through callers.
- **`credentials.ts` Map-returning `getDiscoveredModelsForUser`**: deleted (no callers). `src/lib/server/mastra/provider/discovery.ts` keeps the per-provider `ModelInfo[]` version and the new `getAllDiscoveredModelsForUser` aggregator.
- **No commits made**: Per the system prompt's "never run destructive commands on `main`" guard, no `git commit` was issued. The user can review and commit the working tree at their discretion.
