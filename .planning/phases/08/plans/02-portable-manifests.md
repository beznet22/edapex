# Plan: Portable Manifests

**Goal:** Standardize the platform's state-transfer format for cross-system portability.

## Proposed Changes

### Manifest Engine
- [ ] **NEW** `src/services/core/ManifestService.ts`: Core logic for generating `SCHOOL.md` and `AGENTS.md`.
- [ ] **Formats**: Support YAML and JSON-LD for maximum interoperability.

### Export/Import
- [ ] **NEW** `src/routes/api/system/export.ts`: Protected endpoint for manifest generation.
- [ ] **Security**: Ensure sensitive tenant credentials are redacted from exports.

## Verification
- [ ] Export a test school and verify UUID v7 consistency.
- [ ] confirm that `AGENTS.md` correctly maps current supervisor hierarchies.
