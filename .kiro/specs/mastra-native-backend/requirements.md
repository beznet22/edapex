# Requirements Document

## Introduction

This document specifies the requirements for completing the migration of EdApex's backend AI operations to Mastra-native `agent.generate()` / `agent.stream()` calls. The migration eliminates the legacy AI SDK provider layer (`provider/router.ts`), standardizes model IDs to Mastra-native format (`provider/model`), makes the extraction workflow self-contained, cleans up `+page.server.ts` to use the Gateway, removes the redundant `retrieveApiKey()` wrapper from `provider-config.ts`, and replaces all `generateId` imports from the `"ai"` package with `crypto.randomUUID()`.

The end state is a codebase where the only AI framework dependency is `@mastra/core` on the server side, with `"ai"` imports limited to the client-side chat transport layer (`@ai-sdk/svelte`, `createUIMessageStream`).

## Glossary

- **Model_Registry**: The centralized TypeScript module (`registry.ts`) that defines all available AI model definitions with their IDs, providers, tiers, and capabilities.
- **AgentRouter**: The class responsible for resolving the best model for a given agent role through a 6-tier routing hierarchy, returning live `MastraLanguageModel` instances.
- **EdApexGateway**: The Mastra-native gateway class that orchestrates chat and extraction operations using AgentRouter for model resolution.
- **Extraction_Workflow**: The Mastra workflow (`workflows/extraction.ts`) that performs document OCR and structured data extraction through a multi-step pipeline.
- **Legacy_Router**: The deprecated `src/lib/server/provider/router.ts` module that uses raw AI SDK constructs (`createOpenAICompatible`, `createMistral`, `Provider` type).
- **Provider_Config**: The module (`provider-config.ts`) responsible for credential encryption, storage, and transport normalization.
- **Mastra_Model_ID**: A model identifier in the format `provider/model-name` (e.g., `opengateway/mimo-v2-flash`), compatible with `@mastra/core`'s `resolveModelConfig()`.
- **Legacy_Model_ID**: A model identifier in the deprecated format `provider:model-name` (e.g., `opengateway:mimo-v2-flash`).

## Requirements

### Requirement 1: Model ID Format Migration

**User Story:** As a developer, I want all model IDs in the registry to use Mastra-native `provider/model` format, so that model resolution no longer requires format conversion.

#### Acceptance Criteria

1. THE Model_Registry SHALL store all model definition `id` fields in `provider/model-name` format where the provider prefix is the substring before the first forward slash and must exactly equal the `provider` field of that model definition
2. WHEN a model ID is read from the Model_Registry, THE AgentRouter SHALL pass the ID directly to `resolveModelConfig()` without invoking any format conversion function
3. THE Model_Registry SHALL NOT contain any model ID with a colon (`:`) separator
4. WHEN a model ID contains multiple forward slashes (e.g., NVIDIA NIM models like `nvidia/minimaxai/minimax-m2.7`), THE Model_Registry SHALL treat only the substring before the first forward slash as the provider prefix for validation against the `provider` field
5. THE AgentRouter SHALL NOT contain or invoke a `toMastraModelId()` conversion function

### Requirement 2: Legacy Provider Router Elimination

**User Story:** As a developer, I want the legacy `provider/router.ts` file removed, so that there is a single authoritative model resolution path through the Mastra AgentRouter.

#### Acceptance Criteria

1. THE System SHALL delete the file `src/lib/server/provider/router.ts` entirely
2. IF any module under `src/` previously imported symbols from `provider/router.ts` (such as `resolveProvider`, `resolveProviderForTask`, `getUserProviderKeys`, `getAvailableModels`, `getUserPriority`, `loadUserProviderRegistry`, `loadUserSettings`, `saveUserSettings`, or `getModelIdForTask`), THEN THE System SHALL replace those imports with equivalent functionality from the Mastra layer (`mastra/router.ts`, `mastra/provider-config.ts`, or `mastra/registry.ts`)
3. THE System SHALL NOT retain any imports of `createOpenAICompatible` from `@ai-sdk/openai-compatible` in any TypeScript file under `src/lib/server/`
4. THE System SHALL NOT retain any imports of `createMistral` from `@ai-sdk/mistral` in any TypeScript file under `src/lib/server/`
5. THE System SHALL NOT retain any imports of the `Provider` type from the `"ai"` package in any TypeScript file under `src/lib/server/`
6. WHEN the file `src/lib/server/provider/router.ts` is deleted, THE System SHALL verify that `pnpm run check` produces zero TypeScript errors attributable to missing imports or references from the deleted module
7. IF the legacy router exported utility functions (such as `getAvailableModels` or `getUserProviderKeys`) that have no existing equivalent in the Mastra layer, THEN THE System SHALL migrate that logic into the appropriate Mastra module (`mastra/router.ts` or `mastra/registry.ts`) before deletion

### Requirement 3: Extraction Workflow Self-Containment

**User Story:** As a developer, I want the extraction workflow to resolve its own models and create its own agents inline, so that it has no dependency on `chat-helper.ts` for extraction logic.

#### Acceptance Criteria

1. THE Extraction_Workflow SHALL resolve OCR, mapper, and fallback models using `AgentRouter.resolveMastraModel()` directly within its step execution, passing the roles "ocr", "chat", and "vision" respectively
2. THE Extraction_Workflow SHALL create inline `Agent` instances within its step execution for OCR transcription, structured mapping, and fallback vision extraction, without importing agent-creation logic from external modules
3. THE Extraction_Workflow SHALL NOT import `runTwoPassExtraction` or `generateContent` from `chat-helper.ts`
4. WHEN the OCR transcription agent throws an exception for a file, THE Extraction_Workflow SHALL invoke the fallback vision agent for single-pass extraction of that file
5. WHEN the structured mapping agent throws an exception after successful OCR transcription, THE Extraction_Workflow SHALL invoke the fallback vision agent for single-pass extraction of that file
6. WHEN both the two-pass extraction and the fallback vision agent throw exceptions for a file, THE Extraction_Workflow SHALL append an error entry containing the file identifier and failure reason to the errors array and continue processing remaining files
7. WHEN extraction succeeds for a file, THE Extraction_Workflow SHALL record whether the result was produced by the two-pass pipeline or the fallback agent

### Requirement 4: Page Server Cleanup

**User Story:** As a developer, I want `+page.server.ts` to delegate extraction to the EdApexGateway or extraction workflow, so that it no longer manually instantiates models or calls `generateContent`.

#### Acceptance Criteria

1. WHEN a file upload form action is submitted, THE Page_Server SHALL delegate extraction processing to the EdApexGateway by calling a single gateway method, passing the validated file blob, a TenantContext object (containing userId, classId, sectionId, and schoolId), and teacher context (containing staffId)
2. THE Page_Server SHALL NOT directly instantiate `AgentRouter` or call `AgentRouter.resolveMastraModel()` for extraction tasks
3. THE Page_Server SHALL NOT import or call `generateContent` from `chat-helper.ts`
4. WHEN the EdApexGateway extraction method returns a successful result, THE Page_Server SHALL parse the structured extraction output and proceed with validation and persistence using the existing `resultInputSchema` and `assessment.upsertStudentResult` flow
5. IF the EdApexGateway extraction method throws an error or returns a failure indicator, THEN THE Page_Server SHALL fall back to storing the uploaded file via blob storage and return a response with status "pending" indicating the file was saved but extraction failed
6. THE Page_Server SHALL NOT directly instantiate `Agent` objects or call `agent.generate()` for extraction tasks

### Requirement 5: Redundant retrieveApiKey Removal

**User Story:** As a developer, I want the standalone `retrieveApiKey()` function removed from `provider-config.ts`, so that all credential resolution flows through `AgentRouter.resolveMastraModel()` which already handles key retrieval internally.

#### Acceptance Criteria

1. THE Provider_Config module SHALL NOT export a `retrieveApiKey()` function
2. WHEN any module previously called `retrieveApiKey()` to obtain a decrypted API key, THE System SHALL replace that call with a combination of `getProviderCredentialWithFallback()` and `decrypt()` to retrieve the plaintext key from the returned `ProviderState`
3. THE Provider_Config module SHALL retain `getProviderCredentialWithFallback()` as the canonical credential lookup function
4. THE Provider_Config module SHALL continue to export the `decrypt()` function so that callers needing a plaintext API key can decrypt the `apiKeyEncrypted` field from a `ProviderState` result
5. IF `getProviderCredentialWithFallback()` returns null for a provider that is not `opengateway`, THEN the calling module SHALL treat the credential as unavailable and surface an error indicating no API key was found for that provider

### Requirement 6: generateId Replacement

**User Story:** As a developer, I want all server-side `generateId` imports from the `"ai"` package replaced with `crypto.randomUUID()`, so that the server has no dependency on the `"ai"` package for ID generation.

#### Acceptance Criteria

1. THE System SHALL NOT import `generateId` from the `"ai"` package in any TypeScript file under `src/lib/server/` or in any Drizzle schema file under `src/lib/server/db/`
2. WHEN an ID is generated in server-side code (including Drizzle schema `$defaultFn` callbacks), THE System SHALL use `crypto.randomUUID()` from the Node.js `crypto` module
3. WHEN `generateId` is used in client-side code (e.g., Svelte components or route handlers under `src/routes/`), THE System SHALL retain it since the `"ai"` package is permitted on the client side and in route handlers for transport
4. THE System SHALL ensure generated UUIDs (36-character hyphenated format) are compatible as primary keys in all existing database schemas that previously used nanoid-style strings

### Requirement 7: AI Package Import Boundary

**User Story:** As a developer, I want a clear boundary where the `"ai"` package is only used in client-side transport code, so that the server-side codebase depends solely on `@mastra/core`.

#### Acceptance Criteria

1. THE System SHALL NOT import any symbol from the `"ai"` package in files under `src/lib/server/`
2. THE System SHALL retain `"ai"` package imports in client-side files (`*.svelte.ts`, `+page.svelte`, `+layout.svelte`) and route handler files (`src/routes/**/+server.ts`) for chat transport functionality (`createUIMessageStream`, `createUIMessageStreamResponse`, `generateId`)
3. THE System SHALL NOT import `@ai-sdk/openai-compatible` or `@ai-sdk/mistral` in any TypeScript file under `src/lib/server/`
4. WHEN server-side code requires AI model instantiation, THE System SHALL use `@mastra/core`'s `resolveModelConfig()` exclusively

### Requirement 8: Model Resolution Consistency

**User Story:** As a developer, I want model resolution to be deterministic and consistent, so that the same inputs always produce the same model selection.

#### Acceptance Criteria

1. WHEN the same (userId, role, conversationOverride, thinkingEnabled, profile) tuple is provided with a fixed database state, THE AgentRouter SHALL return a ResolvedModel with identical `provider`, `model`, `apiKey`, `baseUrl`, and `capabilities` fields on every invocation
2. WHEN a conversation override specifies a model ID not found in the registry, THE AgentRouter SHALL skip that tier and fall through to the next resolution tier in the hierarchy
3. WHEN no provider credentials are available for any configured provider, THE AgentRouter SHALL fall through to the `opengateway` provider as a keyless global fallback
4. THE AgentRouter SHALL resolve models through the 6-tier hierarchy in strict order: conversation override, deep reasoning, role mapping, profile selection, thinking toggle, global fallback
5. IF a tier resolves a model whose provider has no available credentials and the provider is not `opengateway`, THEN THE AgentRouter SHALL skip that tier's result and continue to the next tier in the hierarchy
6. THE AgentRouter SHALL perform model resolution as a pure lookup with no side effects, such that concurrent calls with the same inputs and database state are safe to execute in any order

### Requirement 9: Bare Model Name Extraction

**User Story:** As a developer, I want a utility function that extracts the bare model name from a full Mastra model ID, so that API calls can use the model name without the provider prefix.

#### Acceptance Criteria

1. WHEN a model ID in `provider/model-name` format is provided, THE `getBareModelName` function SHALL return the substring after the first forward slash, preserving any subsequent slashes intact (e.g., `nvidia/minimaxai/minimax-m2.7` returns `minimaxai/minimax-m2.7`)
2. WHEN a model ID contains no forward slash, THE `getBareModelName` function SHALL return the full string unchanged
3. IF the input string is empty or consists only of a forward slash, THEN THE `getBareModelName` function SHALL return the input string unchanged
4. THE `getBareModelName` function SHALL accept a string of 1 to 255 characters and SHALL return a non-empty string for any input that contains at least one non-slash character
