# Implementation Plan: Mastra-Native Backend Migration

## Overview

This plan migrates EdApex's backend AI operations to Mastra-native `agent.generate()` / `agent.stream()` calls by: converting model IDs to `provider/model` format, eliminating the legacy provider router, making the extraction workflow self-contained, cleaning up `+page.server.ts`, removing redundant `retrieveApiKey()`, replacing `generateId` with `crypto.randomUUID()`, and adding the `getBareModelName()` utility.

## Tasks

- [x] 1. Migrate model IDs and add utility functions
  - [x] 1.1 Convert all model IDs in `registry.ts` from `provider:model` to `provider/model` format
    - Replace every colon separator with a forward slash in the `id` field of each `ModelDefinition` in `MODEL_REGISTRY`
    - Add the `getBareModelName()` export function that extracts the model name after the first `/`
    - Update `getChatRoutableModels()` filter to use the new ID format (`mistral/mistral-ocr-latest`)
    - _Requirements: 1.1, 1.3, 1.4, 9.1, 9.2, 9.3_

  - [x] 1.2 Update `AgentRouter` in `router.ts` to remove format conversion functions
    - Delete the `toMastraModelId()` function export
    - Delete the `resolvedToMastraModelId()` function export
    - Remove the `resolveMastraModelId()` method that called `toMastraModelId()`
    - Update `resolveMastraModel()` to use the model ID directly (already in `provider/model` format) instead of splitting on `:`
    - Import and use `getBareModelName()` from `registry.ts` for extracting the bare model name
    - Update the global fallback model ID from `'opengateway:mimo-v2-flash'` to `'opengateway/mimo-v2-flash'`
    - Update the OCR task filter from `'mistral:mistral-ocr-latest'` to `'mistral/mistral-ocr-latest'`
    - Update `resolveByProfile` exclusion filter to use `'mistral/mistral-ocr-latest'`
    - _Requirements: 1.2, 1.5, 9.1_

  - [ ]* 1.3 Write property test for Model ID Format Invariant
    - **Property 1: Model ID Format Invariant**
    - Verify all entries in `MODEL_REGISTRY` have IDs starting with `provider` + `/`, contain no `:`, and the substring before the first `/` equals the `provider` field
    - **Validates: Requirements 1.1, 1.3, 1.4**

  - [ ]* 1.4 Write property test for Bare Model Name Extraction
    - **Property 3: Bare Model Name Extraction**
    - Verify `getBareModelName()` returns substring after first `/` when present, full string when no `/`, and never returns empty for non-empty input
    - **Validates: Requirements 9.1, 9.2, 9.3**

- [x] 2. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Make extraction workflow self-contained
  - [x] 3.1 Rewrite `workflows/extraction.ts` to resolve models and create agents inline
    - Remove the import of `runTwoPassExtraction` from `chat-helper.ts`
    - Import `AgentRouter`, `createMastraDb`, `Agent`, and prompt constants (`OCR_SYSTEM_PROMPT`, `MAPPER_SYSTEM_PROMPT`, `legacyExtractPrompt`) directly
    - In the `extractStep.execute()`, instantiate `AgentRouter` and call `resolveMastraModel("ocr")`, `resolveMastraModel("chat")`, `resolveMastraModel("vision")` directly
    - Create inline `Agent` instances for OCR, mapper, and fallback within the step
    - Implement two-pass extraction logic (OCR → mapping) with fallback to single-pass vision
    - Record `isFallback` flag per file result
    - Catch errors per-file and append to errors array, continuing with remaining files
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [ ]* 3.2 Write unit tests for extraction workflow self-containment
    - Verify the extraction module does not import `runTwoPassExtraction` or `generateContent` from `chat-helper.ts`
    - Test that OCR failure triggers fallback vision agent
    - Test that mapping failure triggers fallback vision agent
    - Test that total failure appends error and continues
    - **Property 5: Extraction Workflow Self-Containment**
    - **Validates: Requirements 3.1, 3.3**

- [x] 4. Add `executeExtraction` method to EdApexGateway
  - [x] 4.1 Implement `gateway.executeExtraction()` in `gateway.ts`
    - Add a public `executeExtraction(file, tenantContext, options)` method to `EdApexGateway`
    - The method should invoke the extraction workflow or call `AgentRouter.resolveMastraModel()` for OCR/vision/chat roles and run the two-pass pipeline
    - Accept file blob, TenantContext, and teacher context (staffId)
    - Return structured extraction result compatible with `resultInputSchema`
    - _Requirements: 4.1, 4.6_

  - [x] 4.2 Rewrite `+page.server.ts` to delegate extraction to Gateway
    - Remove direct `AgentRouter` instantiation and `resolveMastraModel()` calls
    - Remove `generateContent` import from `chat-helper.ts`
    - Instantiate `EdApexGateway` and call `gateway.executeExtraction()` with the validated file, tenant context, and staffId
    - Parse the structured result and proceed with `resultInputSchema` validation and `assessment.upsertStudentResult`
    - Retain the fallback blob storage path on extraction failure
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Remove redundant `retrieveApiKey()` and replace `generateId`
  - [x] 6.1 Remove `retrieveApiKey()` from `provider-config.ts`
    - Delete the `retrieveApiKey()` function export from `provider-config.ts`
    - Verify no other module imports `retrieveApiKey` from `provider-config.ts` (the legacy router also has one but will be deleted)
    - _Requirements: 5.1, 5.3, 5.4_

  - [x] 6.2 Replace `generateId` with `crypto.randomUUID()` in `src/lib/server/db/schema.ts`
    - Remove `import { generateId } from "ai"`
    - Add `import { randomUUID } from "crypto"`
    - Update the `sessions` table `id` column `$defaultFn` to use `randomUUID()`
    - _Requirements: 6.1, 6.2, 6.4_

  - [x] 6.3 Replace `generateId` with `crypto.randomUUID()` in `src/lib/server/repository/auth.repo.ts`
    - Remove `import { generateId } from "ai"`
    - If `generateId` is used in the file body (currently only imported but not directly called in the repo — it's used via schema), confirm removal is safe
    - _Requirements: 6.1, 6.2_

- [x] 7. Delete legacy provider router and clean up imports
  - [x] 7.1 Migrate `getAvailableModels` and `getUserProviderKeys` to Mastra layer
    - Move `getAvailableModels()` logic into `mastra/registry.ts` or `mastra/router.ts` (whichever is more appropriate)
    - Move `getUserProviderKeys()` logic into `mastra/provider-config.ts` or `mastra/router.ts`
    - Ensure any consumers of these functions are updated to import from the new location
    - _Requirements: 2.2, 2.7_

  - [x] 7.2 Delete `src/lib/server/provider/router.ts`
    - Remove the file entirely
    - Verify no remaining imports reference `$lib/server/provider/router` anywhere in the codebase
    - _Requirements: 2.1, 2.3, 2.4, 2.5_

  - [x] 7.3 Clean up `chat-helper.ts`
    - Remove `generateContent` export (no longer needed after extraction workflow is self-contained)
    - Remove `runTwoPassExtraction` export and its helper `runFallbackExtraction`
    - Retain `generateTitle` and `convertToUIMessages` functions
    - Remove unused imports (`OCR_SYSTEM_PROMPT`, `MAPPER_SYSTEM_PROMPT`, `legacyExtractPrompt`, `ResultInput` type, `z` if unused)
    - _Requirements: 3.3, 7.1_

  - [x] 7.4 Clean up remaining `generateContent` imports across the codebase
    - Remove `generateContent` import from `src/routes/api/results/+server.ts`
    - Remove `generateContent` import from `src/lib/api/assessment.remote.ts`
    - Replace any active usage with Gateway-based extraction or remove if commented out
    - _Requirements: 2.2, 7.1_

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Final verification and import boundary enforcement
  - [x] 9.1 Verify no legacy AI SDK imports remain in server code
    - Run `grep -r "from [\"']ai[\"']" src/lib/server/` and confirm zero matches
    - Run `grep -r "@ai-sdk/openai-compatible\|@ai-sdk/mistral" src/lib/server/` and confirm zero matches
    - Confirm `"ai"` imports only exist in: `src/routes/**/+server.ts`, `src/routes/**/+layout.server.ts`, and client-side `.svelte.ts` files
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ]* 9.2 Write property test for No Legacy AI SDK Imports
    - **Property 4: No Legacy AI SDK Imports in Server Code**
    - Verify no file under `src/lib/server/` imports `generateId`, `generateText`, `generateObject`, `createOpenAICompatible`, `createMistral`, or `Provider` from `"ai"` or `@ai-sdk/*`
    - **Validates: Requirements 2.3, 2.4, 2.5, 6.1, 7.1, 7.3**

  - [x] 9.3 Run `pnpm run check` to verify zero TypeScript errors
    - Ensure the full project type-checks cleanly after all migrations
    - _Requirements: 2.6_

- [x] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The `generateId` in `src/routes/(chat)/+layout.server.ts` and `src/lib/context/file-context.svelte.ts` are retained per Requirement 6.3 (client-side / route handler usage is permitted)
- The `generateId` in `src/routes/api/chat/+server.ts` is retained per Requirement 7.2 (route handler transport layer)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4"] },
    { "id": 2, "tasks": ["3.1", "6.1", "6.2", "6.3"] },
    { "id": 3, "tasks": ["3.2", "4.1"] },
    { "id": 4, "tasks": ["4.2", "7.1"] },
    { "id": 5, "tasks": ["7.2", "7.3", "7.4"] },
    { "id": 6, "tasks": ["9.1", "9.2"] },
    { "id": 7, "tasks": ["9.3"] }
  ]
}
```
