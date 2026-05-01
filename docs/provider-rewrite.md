# AI Provider Rewrite Prompt

## Context & Environment
We are executing a complete architectural shift in how AI providers are managed and routed within the application. Currently, the system relies on an OAuth/device-code flow in the [`src/lib/server/provider`](../src/lib/server/provider) directory. This legacy implementation must be entirely discarded.

## Objective
Discard all existing provider logic and implement a strictly API key-based provider router. The new integration must securely store and retrieve API keys from the MySQL database utilizing the existing `personal_access_tokens` schema from [`src/lib/server/db/sms-schema.ts`](../src/lib/server/db/sms-schema.ts).

## Core Requirements

### 1. Hard Cleanup
- Completely wipe out all existing provider integration files in [`src/lib/server/provider`](../src/lib/server/provider) including `google-provider.ts`, `google-middleware.ts`, `qwen-provider.ts`, etc.
- Remove any lingering authentication handlers tied to the old device-code logic.

### 2. Database Integration
- Do not create a new schema. Use the completely compatible `personalAccessTokens` (`personal_access_tokens` database table) schema exported from [`src/lib/server/db/sms-schema.ts`](../src/lib/server/db/sms-schema.ts).
- Model the logic to insert, retrieve, and validate raw API keys for different users/tenants using `tokenable_type` to denote the specific AI provider (e.g., `nvidia_nim`, `openrouter`, `groq`, `mistral`) and `tokenable_id` for the user/tenant associative ID.



### 3. Provider Routing Matrix (Zero-Downtime Agent System)
All mapped providers operate primarily on a **Bring Your Own Key (BYOK)** basis, fetching keys securely from the database per-user/tenant. However, **if a user has only provided a single key**, routing and model selection *must stay strictly confined within that single provider*.

If multiple/global tokens exist, adhere strictly to this priority flow: **Cerebras thinks → Groq works → NVIDIA audits → Mistral reads → OpenRouter saves you.**

- **Cerebras (Primary Planner / Chief Architect):**
  - **Rank #1:** Highest priority for Deep Agentic Workflow planning, complex reasoning, and orchestrating execution steps. Do not waste Cerebras on fast utility tasks.
- **NVIDIA NIM (Senior Backup Architect & Embeddings):** 
  - **Rank #2:** Primary fallback for Cerebras if it goes down. Used for RAG Embeddings, multimodal vision, and auditing complex Cerebras executions.
- **Mistral (Document Intelligence Layer):**
  - **Rank #3:** Routed exclusively for OCR, scanned docs, invoices, and contextual document intelligence. Utilizes `.env` global fallback natively if no key is found.
- **Groq (Speed Utility Layer & Fast Worker):**
  - **Rank #4:** Dedicated to executing structured tool calls inside the agent loop, fast normalizations, classification, and chat title generation (`TaskType = 'title'`).
- **OpenRouter (Emergency Bridge / Panic Button):**
  - **Rank #5:** The absolute last resort. Only invoked when all primary infrastructure is degraded.

### 4. Router API Design (`router.ts` & Multi-Agent Lanes)
- Implement a `ProviderRouter` that determines the correct API key from the database context and constructs the provider client asynchronously.
- The system must respect **Lane-based Multi-Agent architectural execution** governed by the matrix above:
  - **Lane A (OCR/Docs):** `Mistral OCR` extracts -> `Groq` normalizes JSON -> `Cerebras` verifies correctness.
  - **Lane B (Deep Agentic):** `Cerebras` plans execution -> `Groq` executes tool calls -> `Cerebras` verifies output -> `NVIDIA` audits if required.
  - **Lane C (RAG):** `NVIDIA` embeddings/reranking -> `Cerebras` reasons over context -> `Groq` compresses final output.
  - **Lane D (Utility):** `Groq` exclusively (e.g. Chat Titles, fast JSON repair, classifiers).

### 5. UI Updates to Propagate
- Update [`src/lib/components/integrations-modal.svelte`](../src/lib/components/integrations-modal.svelte) to strip out the complicated OAuth "code verification" flows.
- Replace the auth flow with secure API Key input boxes for the newly defined stack (`CEREBRAS`, `NVIDIA_NIM`, `MISTRAL`, `GROQ`, `OPENROUTER`) that immediately save the token into the database via the updated server endpoints.

## Execution Directives
1. **No Hallucinations:** Strict adherence to the `personalAccessTokens` schema (no schema edits).
2. **Type Safety:** Ensure task types (`vision`, `chat`, `title`, `ocr`) are tightly typed mapped explicitly to the allowed providers.
3. **Clean Code:** Guarantee that the resulting provider wrappers are thin layer standard-compliant AI SDK wrappers fetching keys via the DB context.

## Appendix: Deep Context Analysis & Dependencies

### Current Architecture Flow
1. **Frontend UI ([`integrations-modal.svelte`](../src/lib/components/integrations-modal.svelte))**: 
   - Uses Svelte Runes (`$state`, `$derived`, `$effect`).
   - Triggered by page state navigation, invokes `addProvder()` and `addToken()` during modal interaction.
   - Manages an optimistic UI state tracking device codes for PIN validation.
   - *Requirement:* Will be stripped down heavily. Device polling loops (`manualCode`, `currentDeviceCode`) must be converted to immediate API Key paste and save logic to support the new stack.

2. **API & Request Context ([`$lib/api/agent.remote.ts`](../src/lib/api/agent.remote.ts))**:
   - Utilizes `command(...)` pattern alongside strict Zod schema parsing.
   - Contains device polling abstractions, and relies on volatile HTTP cookies (`v_${provider}`) to track states.
   - Validates user sessions against `allowAnonymousChats`.
   - *Requirement:* Must be completely rewritten to instantly `INSERT` / `UPSERT` API keys securely into `personalAccessTokens` linked to `locals.user.id`.

3. **Agent Orchestration ([`src/lib/server/service/agent.service.ts`](../src/lib/server/service/agent.service.ts))**:
   - `AgentService` dynamically selects `OAuth2Client` provider instances.
   - Resolves tools and instructions by examining `user.designation` mappings inside `agentWorkflows`.
   - Handles progressive fallback logic via `cookies.get("default-provider")`.
   - *Requirement:* Re-architect this entirely. Dismantle generic mapping and construct the **Lane-based architectures** defined above (e.g. chaining `Groq` for tools and `Cerebras` for verification within the same agentic flow).

4. **Types and Schema ([`$lib/schema/chat-schema.ts`](../src/lib/schema/chat-schema.ts))**:
   - `CredentialType` is structured around OAuth concepts (`QWEN_CODE`, `GOOGLE_OAUTH`).
   - Encompasses large objects tailored for PKCE flows: `OAuth2Client`, `DeviceAuth`, `credentialSchema`, `jwtPayload`.
   - *Requirement:* Transition `CredentialType` strictly to model names (`CEREBRAS`, `NVIDIA_NIM`, `OPENROUTER`, `GROQ`, `MISTRAL`) matching `tokenableType` strings logic in `personal_access_tokens`. Prune all `OAuth2Client` types and device verification structures.

5. **Provider Logic ([`src/lib/server/provider/*`](../src/lib/server/provider/))**:
   - Providers implement `OAuth2Client`, signing short-lived JWTs to cookies utilizing `jwt.sign`.
   - Extremely polluted with PKCE (`OpenRouter`), `device_code` loops (`Qwen`), and legacy internal CloudAssist flows (`GoogleProvider`).
   - The actual `Provider` instantiation uses [`@ai-sdk/openai-compatible`](https://ai-sdk.dev/providers/openai-compatible-providers) wrappers.
   - *Requirement:* Once device-code functions are eradicated, the new Provider integrations will be significantly shorter. Instantiate API wrappers immediately passing the DB-retrieved token.

### 6. Deep Frontend UI Patterns & State Management (Svelte 5)
1. **Model & Form State ([`$lib/chat/models.ts`](../src/lib/chat/models.ts) & [`integrations-modal.svelte`](../src/lib/components/integrations-modal.svelte))**:
   - `models.ts` contains hardcoded `chatProviders` explicitly tied to the legacy `CredentialType` variants. This needs to be stripped out and replaced with the new API-driven targets (`CEREBRAS`, `NVIDIA_NIM`, `OPENROUTER`, `GROQ`, `MISTRAL`).
   - `integrations-modal.svelte` utilizes Svelte 5 Runes (`$state`, `$derived`, `$effect`) to manage the UI loop.
2. **Popup & Polling Loop ([`$lib/context/oauth.svelte.ts`](../src/lib/context/oauth.svelte.ts))**:
   - Currently spawns a browser `window.open` popup to handle external OAuth authentications (`saveTokenData()`).
   - Executes an aggressive `while(true)` interval loop (`poll_device_code`) that forcefully hits the server `addToken()` endpoint, awaiting a non-pending state.
   - *Requirement:* The OAuth popup mechanisms and `poll_device_code` loops must be completely deleted. The `integrations-modal` UX refactor transforms the UI into a simple setup form: users manually paste their API key via a standard `<input bind:value={apiKey} />` field, and click 'Save'. This should fire a single secure asynchronous call hitting the backend to validate and store the token inside the `personalAccessTokens` database.

## Execution Blueprint - File Modification Matrix

### 🗑️ Files for Total Deletion (Discards)
- [`src/lib/server/provider/google-provider.ts`](../src/lib/server/provider/google-provider.ts)
- [`src/lib/server/provider/google-middleware.ts`](../src/lib/server/provider/google-middleware.ts)
- [`src/lib/server/provider/qwen-provider.ts`](../src/lib/server/provider/qwen-provider.ts)
- [`src/lib/server/provider/openrouter-provider.ts`](../src/lib/server/provider/openrouter-provider.ts)
- [`src/lib/context/oauth.svelte.ts`](../src/lib/context/oauth.svelte.ts)
- [`src/routes/api/auth/callback/[provider]/+server.ts`](../src/routes/api/auth/callback/[provider]/+server.ts) (Legacy callback endpoint)

### 🛠️ Files for Modification
**UI & State:**
- [`src/lib/components/integrations-modal.svelte`](../src/lib/components/integrations-modal.svelte) (Replace device code & popups with standard API key `<form>` fields)
- [`src/lib/chat/models.ts`](../src/lib/chat/models.ts) (Update hardcoded `chatProviders` array to `CEREBRAS`, `NVIDIA_NIM`, `OPENROUTER`, `GROQ`, `MISTRAL`)

**Schema & Types:**
- [`src/lib/schema/chat-schema.ts`](../src/lib/schema/chat-schema.ts) (Gut `DeviceAuth`, `jwtPayload`, `OAuth2Client`. Repurpose `CredentialType` to match `tokenableType` enums. Add Cerebras to typings.)

**Backend Integrations & RPC:**
- [`src/lib/api/agent.remote.ts`](../src/lib/api/agent.remote.ts) (Rewrite `addProvder` / `addToken` RPC endpoints to run standardized securely-scoped `upsert` queries to `personalAccessTokens`)
- [`src/lib/server/service/agent.service.ts`](../src/lib/server/service/agent.service.ts) (Dismantle SvelteKit Cookie tracking logic. Switch provider instances dynamically based solely on DB queries to support Lane configurations)
- [`src/lib/server/provider/router.ts`](../src/lib/server/provider/router.ts) (Implement the Default->Fallback capability Provider Matrix logic. The Router MUST intercept `selectedChatModel` (e.g. `chat-model-reasoning` sourced from the `SelectedModel` UI cookie) and physically map this logical capability string directly to a concrete Provider and specific LLM text identifier (e.g. mapping `chat-model-reasoning` to `CEREBRAS` -> `llama-3.1-70b-instruct`) prior to invoking `provider.languageModel()`).
- [`src/lib/server/provider/index.ts`](../src/lib/server/provider/index.ts) (Revise exports)

**Server Hooks (Dependent Modifiers):**
- [`src/routes/api/chat/+server.ts`](../src/routes/api/chat/+server.ts) (Update dependency mapping for Provider selections triggered directly by chats)
- [`src/lib/server/helpers/chat-helper.ts`](../src/lib/server/helpers/chat-helper.ts) (Fix referencing errors on `CredentialType` and tool handling)

## Resilience, Quotas & Smart Routing Architecture

To ensure production-grade stability, the rewritten provider matrix MUST implement the following autonomous handling protocols inside `agent.service.ts` and `router.ts`:

1. **Automated Error Handling & UI Propagation:**
   - Provider wrappers must automatically intercept and handle session drops, token expirations, and `Vercel AI SDK` tool-call initialization failures (e.g., catching `AI_APICallError` or network timeouts).
   - **Critical:** All errors must be properly propagated back to the UI state (Toast notifications, Error messages, etc.) gracefully, and deeply logged to the backend console utilizing a **namespaced logger** (e.g. `[ProviderRouter:Cerebras] Quota Exceeded`).
   - If everything fails (Emergency Degraded Mode), the requests should be routed into an Async queue + retry worker mechanism rather than silently terminating.

2. **Free Tier Limit & Quota Awareness:**
   - Provider runtime must intelligently account for free-tier constraints (e.g., Cerebras RP/min limits, Groq TPM limits) to ensure continuous execution flow.
   - The system must detect `429 Too Many Requests` or threshold breaches instantly, utilizing this status as a hard trigger to immediately route the workload to the next available fallback in the lane (e.g., switching from Cerebras to NVIDIA).

3. **Lane-Aware Configurable Smart Routing & Dynamic Model Selection:**
   - **Strongest model decides. Fastest model executes.** Do not deviate.
   - If a user explicitly selects a precise manual model ID from the UI (e.g. `llama3.1-70b`), the router must instantly pinpoint which Provider cluster actually serves that specific model utilizing the **Provider Configuration Registry** (defined below).
   - If a preferred or assigned provider encounters session issues, trigger the **Emergency Degraded Mode** bridge: `Cerebras -> NVIDIA fallback planner -> OpenRouter panic button -> Async queue`.
   - **Crucial Rule:** If a user supplies only a *single* API key (e.g. they only have NVIDIA NIM), Smart Routing must collapse into that single provider boundary, gracefully degrading features but utilizing the models within *that* provider. 

4. **Reasoning-First Agent Pipelines & Thinking Budgets:**
   - `BAD:` Groq plans -> Groq executes -> Groq verifies.
   - `BEST:` Cerebras plans -> Groq executes -> NVIDIA audits -> Cerebras finalizes.
   - Guarantee that all `tool calls` mapped in the agent loops invoke fast utility nodes (Groq) triggered strategically after the planning phase (Cerebras/NVIDIA) executes the architecture plan.
   - **Thinking budgets:** Configure the Vercel AI SDK integration inside the agent service to utilize `providerOptions` or system abstractions to allocate strict **reasoning token budgets**, or setting `reasoningEffort: 'high'` whenever supported.
   - **Token Usage Calculations:** The SDK must actively capture and log the `usage` payloads emitted continuously from streaming/generating outputs, strictly tracking metrics like `promptTokens`, `completionTokens`, and `reasoningTokens` explicitly. All outputs must structurally compile the utilized token usage metrics for cost-calculations and Free-Tier awareness.

### Provider Configuration Registry & Smart Map  

To reliably support dynamic resolution whereby UI strings pinpoint backend instances—and to govern autonomous Smart Routing fallbacks—we will deploy a unified Master Config. This decouples hardcoded logic and embeds structural limits and behavioral fallbacks natively inside `router.ts`:

```typescript
export const providerRegistry = {
  cerebras: {
    name: "Cerebras",
    description: "Primary planner and chief architect for deep reasoning",
    options: { fetchApiKey: "personal_access_tokens" }, // Denotes fetching via BYOK Tokenable
    fallback: "nvidia_nim", // If Cerebras breaches limit or 5xx, instantly crash down to NVIDIA
    capabilities: ["planner", "agentic", "reasoning"], // Defines task alignments
    models: {
      "llama-3.3-70b": {
        name: "Llama 3.3 70B",
        description: "High-capacity reasoning engine",
        tool_call: true,
        reasoning: false, // Standard instruct
        limit: { context: 8192, output: 8192 }
      }
    }
  },
  nvidia_nim: {
    name: "NVIDIA NIM",
    description: "Diverse fallback architect with embeddings capabilities",
    options: { fetchApiKey: "global_fallback" }, // Fetches .env if no BYOK
    fallback: "openrouter", // The secondary fallback path
    capabilities: ["fallback_planner", "audit", "embeddings", "vision"],
    models: {
      "qwen2.5-coder-32b-instruct": {
        name: "Qwen 2.5 Coder 32B",
        description: "Excellent code generation and auditing",
        tool_call: true,
        reasoning: false,
        limit: { context: 128000, output: 8192 }
      }
    }
  },
  mistral: {
    name: "Mistral SDK",
    description: "High-precision document intelligence layer",
    options: { fetchApiKey: "global_fallback" },
    fallback: "nvidia_nim", 
    capabilities: ["ocr", "document_intelligence"],
    models: {
      "mistral-large-latest": {
        name: "Mistral Large",
        description: "Versatile large context window model",
        tool_call: true,
        reasoning: false,
        limit: { context: 131000, output: 8192 }
      },
      "pixtral-12b-2409": {
        name: "Pixtral 12B (OCR)",
        description: "Natively extracts text from PDFs and images",
        tool_call: false,
        reasoning: false,
        limit: { context: 128000, output: 8192 }
      }
    }
  },
  groq: {
    name: "Groq",
    description: "Lightning fast utility execution engine",
    options: { fetchApiKey: "personal_access_tokens" },
    fallback: "openrouter", 
    capabilities: ["fast_utility", "executor", "titles"],
    models: {
      "llama3-70b-8192": {
        name: "Llama3 70B",
        description: "Fast-path execution for tool calls",
        tool_call: true,
        reasoning: false,
        limit: { context: 8192, output: 8192 }
      }
    }
  },
  openrouter: {
    name: "OpenRouter",
    description: "Emergency bridge network for zero downtime",
    options: { fetchApiKey: "personal_access_tokens" },
    fallback: "async_queue", // Dead end, triggers backend queue logging
    capabilities: ["emergency_bridge"],
    models: { ... }
  }
}
```

This Unified Master Config empowers the front-end to safely display precise models, and instantly grants the back-end `ProviderRouter` the complete topographical map needed to rapidly compute mapping logic, context token boundaries, and traverse fallback pathways flawlessly without stacking messy `if...else` logic blocks.

## API Configurations & Vercel AI SDK Bindings

All chat-based integrations must leverage the `@ai-sdk/openai-compatible` plugin, but **Mistral OCR requires a custom strategy**.

### 1. Standard OpenAI-Compatible AI SDK Wrappers
The following providers act as standard drop-ins using `createOpenAICompatible()`:
- **NVIDIA NIM**: Set `baseURL: 'https://integrate.api.nvidia.com/v1'`
- **OpenRouter**: Set `baseURL: 'https://openrouter.ai/api/v1'`
- **Groq**: Set `baseURL: 'https://api.groq.com/openai/v1'`

*Implementation Rule:* Instantiate the wrapper dynamically via `createOpenAICompatible({ name: 'provider_name', apiKey: dbToken, baseURL: '...' })`.

### 2. Mistral Integrations (OCR & Agentic Chat)
- **Official SDK:** Instead of a bespoke fetch wrapper or `openai-compatible` proxy, strictly utilize the official [`@ai-sdk/mistral`](https://ai-sdk.dev/providers/ai-sdk-providers/mistral) native provider package for all Mistral routing.
- **OCR Implementation:** Execute document OCR natively via the SDK (`mistral('mistral-ocr-latest')` or equivalent) by passing file payloads directly in the `messages` array. Utilize `providerOptions.mistral` to configure OCR-specific properties like `documentImageLimit` or `documentPageLimit` according to `MistralLanguageModelOptions`.
- **Key Enforcement:** If the user does *not* provide a personal API key for Mistral (via the UI integrations modal), the backend router **must** natively detect this and instantiate the Mistral provider utilizing a global server-backed fallback key stored securely in `.env`.

### 3. Advanced Provider Capabilities
- **Advanced `providerOptions`:** For all generic wrappers utilizing `createOpenAICompatible` (NVIDIA, OpenRouter, Groq), leverage the SDK's `providerOptions` object to inject custom properties. Do not build thick class abstractions to map advanced capabilities (like `structured-outputs` schemas, usage limits, or reasoning controls); simply append `{ providerOptions: { YOUR_PROVIDER_NAME: { customOption: 'value' } } }` dynamically.

---

## SDK Documentation & Advanced Usage Reference
You MUST implement the providers strictly adhering to this official `@ai-sdk` syntax.

### 1. [`@ai-sdk/openai-compatible`](https://ai-sdk.dev/providers/openai-compatible-providers) Reference
**Setup & Core Instantiation:**
```ts
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
const provider = createOpenAICompatible({
  name: 'openrouter', // e.g., openrouter, groq, nvidia
  apiKey: process.env.PROVIDER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  includeUsage: true,
  supportsStructuredOutputs: true // Set if applicable
});
```

**Passing Provider-Specific Options (`providerOptions`):**
Use `providerOptions.[name]` to inject custom settings, metadata, or explicit behaviors not natively supported by the Core AI API.
```ts
const { text } = await generateText({
  model: provider('model-id'),
  prompt: 'Hello',
  providerOptions: {
    openrouter: { 
      customOption: 'magic-value' 
    },
  },
});
```

### 2. [`@ai-sdk/mistral`](https://ai-sdk.dev/providers/ai-sdk-providers/mistral) Reference
**Setup & Basic Call:**
```ts
import { mistral, type MistralLanguageModelOptions } from '@ai-sdk/mistral';
```

**Document OCR Execution:**
Mistral natively supports PDF OCR by ingesting file payloads directly dynamically configured via `providerOptions.mistral`.
```ts
const result = await generateText({
  model: mistral('mistral-ocr-latest'), // Use appropriate OCR model
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Extract data from this document' },
        { 
          type: 'file', 
          data: pdfBufferOrUrl, // URL instance or raw buffer
          mediaType: 'application/pdf' 
        },
      ],
    },
  ],
  providerOptions: {
    mistral: {
      documentImageLimit: 8,
      documentPageLimit: 64,
    } satisfies MistralLanguageModelOptions,
  },
});
```

**Reasoning Models Configuration:**
If accessing Mistral's reasoning capabilities, retrieve `reasoningText` effortlessly, toggling strict reasoning modes via `MistralLanguageModelOptions`.
```ts
const result = await generateText({
  model: mistral('magistral-small-2507'),
  prompt: 'Solve step-by-step',
  providerOptions: {
    mistral: { reasoningEffort: 'high' } satisfies MistralLanguageModelOptions,
  },
});
console.log('REASONING:', result.reasoningText);
console.log('ANSWER:', result.text);
```
