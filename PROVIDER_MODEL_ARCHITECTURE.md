# Opencode Provider & Model Configuration and Routing Architecture

This document details the comprehensive low-level system for provider and model configuration, specification, and routing across Opencode's desktop UI, backend services, and SDK.

## Table of Contents
1. [Core Concept](#core-concept)
2. [Type System](#type-system)
3. [Provider Specification](#provider-specification)
4. [Model Specification](#model-specification)
5. [API Relationship](#api-relationship)
6. [Configuration Layers](#configuration-layers)
7. [Desktop UI Flow](#desktop-ui-flow)
8. [Backend Routing Execution](#backend-routing-execution)
9. [Request Transformation Pipeline](#request-transformation-pipeline)
10. [Error Handling & Propagation](#error-handling--propagation)
11. [Example Implementation](#example-implementation)

---

## Core Concept

The opencode system separates concerns into three distinct domains:

1. **Provider Specification** (`ProviderV2.Info`) – Defines what a provider IS (capabilities, auth, endpoints, SDK package)
2. **Model Specification** (`ModelV2.Info`) – Defines what a model IS (capabilities, limits, costs, variants, api routing)
3. **Routing/Routing Strategy** – How to execute a request through selected provider+model+variant combination
4. **Request Transformation** – How to adapt generic LLM requests into provider-specific wire formats
5. **Error Handling** – Structured error types with provider/model context and smart suggestions

This **strict separation** is key: a Provider doesn't select which Model to use, and a Model carries execution metadata but doesn't handle the actual HTTP/endpoint management.

---

## Type System

### Provider Identity and Metadata (`packages/core/src/provider.ts`)

```typescript
// Strong typed provider ID (branded string)
export const ID = Schema.String.pipe(
  Schema.brand("ProviderV2.ID"),
  withStatics((schema) => ({
    opencode: schema.make("opencode"),
    anthropic: schema.make("anthropic"),
    openai: schema.make("openai"),
    google: schema.make("google"),
    // ... well-known providers
  })),
)
export type ID = typeof ID.Type
```

**Key properties:**
- **ID is opaque string** – wrapped in a branded type to prevent string confusion
- **Predefined well-known providers** – schema has static accessors for common ones
- **Extensible** – any string can be a provider ID; not limited to the static set

### Provider API Specification

Two API types supported:

```typescript
// AI SDK (package-based) - requires npm package to invoke
export const AISDK = Schema.Struct({
  type: Schema.Literal("aisdk"),
  package: Schema.String,           // e.g. "@ai-sdk/openai"
  url: Schema.String.pipe(Schema.optional),  // optional URL override
  settings: Schema.Record(Schema.String, Schema.Unknown).pipe(Schema.optional),
})

// Native (direct HTTP) - custom protocol, no SDK wrapper needed
export const Native = Schema.Struct({
  type: Schema.Literal("native"),
  url: Schema.String.pipe(Schema.optional),
  settings: Schema.Record(Schema.String, Schema.Unknown),
})

export const Api = Schema.Union([AISDK, Native]).pipe(Schema.toTaggedUnion("type"))
```

### Provider Info Class

```typescript
export class Info extends Schema.Class<Info>("ProviderV2.Info")({
  id: ID,
  name: Schema.String,
  
  // Enabled state: false | via env | via credential | via custom data
  enabled: Schema.Union([
    Schema.Literal(false),
    Schema.Struct({
      via: Schema.Literal("env"),
      name: Schema.String,  // env var name, e.g. "OPENAI_API_KEY"
    }),
    Schema.Struct({
      via: Schema.Literal("credential"),
      credentialID: Credential.ID,
    }),
    Schema.Struct({
      via: Schema.Literal("custom"),
      data: Schema.Record(Schema.String, Schema.Any),
    }),
  ]),
  
  env: Schema.String.pipe(Schema.Array),  // list of env vars to check
  api: Api,  // API specification (AISDK or Native)
  
  request: Request,  // default headers/body
})
```

**Why this structure:**
- **enabled state is tagged union** – separates "not configured" from "configured via env", "via credential", etc.
- **env array** – multiple env vars can satisfy one provider (fallback chain)
- **api is tagged union** – discriminates between AI SDK and Native at the type level
- **request holds defaults** – header/body customizations applied to all models under this provider

### Model Identity and Metadata (`packages/core/src/model.ts`)

```typescript
export const ID = Schema.String.pipe(Schema.brand("ModelV2.ID"))
export type ID = typeof ID.Type

export const VariantID = Schema.String.pipe(Schema.brand("VariantID"))
export type VariantID = typeof VariantID.Type

export const Family = Schema.String.pipe(Schema.brand("Family"))
export type Family = typeof Family.Type  // e.g. "claude-opus", "gpt-4o"
```

**Key insight:**
- **Model ID can contain `/`** – format is typically `namespace/version` (e.g. `gpt-4o-2024-11-20`)
- **VariantID is separate from Model ID** – variants are reasoning_effort levels, thinking budgets, etc.
- **Family groups similar models** – used for sorting/filtering in UI

### Model Capabilities and Limits

```typescript
export const Capabilities = Schema.Struct({
  tools: Schema.Boolean,
  input: Schema.String.pipe(Schema.Array),   // mime patterns
  output: Schema.String.pipe(Schema.Array),
})

export const Cost = Schema.Struct({
  tier: Schema.Struct({
    type: Schema.Literal("context"),
    size: Schema.Int,  // tokens
  }).pipe(Schema.optional),
  input: Schema.Finite,     // price per 1M tokens
  output: Schema.Finite,
  cache: Schema.Struct({
    read: Schema.Finite,
    write: Schema.Finite,
  }),
})

export class Info extends Schema.Class<Info>("ModelV2.Info")({
  id: ID,
  providerID: ProviderV2.ID,  // **Parent provider reference**
  family: Family.pipe(Schema.optional),
  name: Schema.String,
  api: Api,  // **Separate API spec per model**
  capabilities: Capabilities,
  
  request: Schema.Struct({
    headers: Schema.Record(Schema.String, Schema.String),
    body: Schema.Record(Schema.String, Schema.Any),
    generation: Schema.Record(Schema.String, Schema.Any),  // temp, topP, etc.
    options: Schema.Record(Schema.String, Schema.Any),
    variant: Schema.String.pipe(Schema.optional),
  }),
  
  variants: Schema.Struct({
    id: VariantID,
    headers: Schema.Record(Schema.String, Schema.String),
    body: Schema.Record(Schema.String, Schema.Any),
    generation: Schema.Record(Schema.String, Schema.Any),
    options: Schema.Record(Schema.String, Schema.Any),
  }).pipe(Schema.Array),
  
  time: Schema.Struct({
    released: DateTimeUtcFromMillis,
  }),
  cost: Cost.pipe(Schema.Array),  // **Multiple cost tiers**
  status: Schema.Literals(["alpha", "beta", "deprecated", "active"]),
  enabled: Schema.Boolean,
  limit: Schema.Struct({
    context: Schema.Int,
    input: Schema.Int.pipe(Schema.optional),
    output: Schema.Int,
  }),
})
```

---

## Provider Specification

### Provider Metadata Layer

Providers define:
1. **Authentication method** – how to supply credentials
2. **SDK package** – which AI SDK to use (or native if not using SDK)
3. **Base URL/endpoint** – where the API lives
4. **Default headers/body** – applied to all models

### Provider Info Example: OpenAI

```typescript
const openaiProvider: ProviderV2.Info = {
  id: ProviderV2.ID.make("openai"),
  name: "OpenAI",
  
  enabled: {
    via: "env",
    name: "OPENAI_API_KEY",  // checks $OPENAI_API_KEY
  },
  
  env: ["OPENAI_API_KEY"],
  
  api: {
    type: "aisdk",
    package: "@ai-sdk/openai",
    url: "https://api.openai.com/v1",  // optional override
  },
  
  request: {
    headers: {
      "User-Agent": "opencode/...",
    },
    body: {},
  },
}
```

### Provider Info Example: Custom OpenAI-Compatible

```typescript
const customProvider: ProviderV2.Info = {
  id: ProviderV2.ID.make("custom-llm"),
  name: "Custom LLM",
  
  enabled: {
    via: "custom",
    data: {
      apiKey: "user-provided-key-123",
    },
  },
  
  env: ["CUSTOM_LLM_API_KEY"],
  
  api: {
    type: "aisdk",
    package: "@ai-sdk/openai-compatible",
    url: "https://api.custom-llm.com/v1",
  },
  
  request: {
    headers: {
      "Authorization": "Bearer ${apiKey}",  // template would be filled
    },
    body: {},
  },
}
```

---

## Model Specification

### Model Metadata Layer

Models define:
1. **Execution route** – which API spec (can differ from provider's default)
2. **Capability matrix** – input/output modalities, reasoning support, tool support
3. **Cost structure** – input/output prices, tiered pricing
4. **Variants** – reasoning effort levels, thinking budgets
5. **Request defaults** – model-specific headers, generation options

### Model Info Example: Claude Opus (Anthropic)

```typescript
const claudeOpusModel: ModelV2.Info = {
  id: ModelV2.ID.make("claude-opus-4-20250514"),
  providerID: ProviderV2.ID.make("anthropic"),
  family: ModelV2.Family.make("claude-opus"),
  name: "Claude Opus 4",
  
  api: {
    id: ModelV2.ID.make("claude-opus-4-20250514"),
    type: "aisdk",
    package: "@ai-sdk/anthropic",
    url: "https://api.anthropic.com/v1",  // may differ from provider default
  },
  
  capabilities: {
    tools: true,
    input: ["text/*", "image/*", "application/pdf"],
    output: ["text/*"],
  },
  
  request: {
    headers: {},
    body: {},
    generation: {
      temperature: undefined,  // Claude has rules about temperature
    },
    options: {},
    variant: undefined,  // default variant
  },
  
  variants: [
    {
      id: ModelV2.VariantID.make("thinking-low"),
      headers: {},
      body: {},
      generation: {},
      options: {
        thinking: {
          type: "enabled",
          budgetTokens: 8000,  // reasoning budget
        },
      },
    },
    {
      id: ModelV2.VariantID.make("thinking-high"),
      headers: {},
      body: {},
      generation: {},
      options: {
        thinking: {
          type: "enabled",
          budgetTokens: 31999,
        },
      },
    },
  ],
  
  time: {
    released: DateTime.makeUnsafe(new Date("2025-05-14").getTime()),
  },
  
  cost: [
    {
      input: 15.0,        // $15 per 1M input tokens
      output: 45.0,       // $45 per 1M output tokens
      cache: {
        read: 1.5,
        write: 18.0,
      },
    },
  ],
  
  status: "active",
  enabled: true,
  
  limit: {
    context: 200000,
    input: undefined,
    output: 4096,
  },
}
```

### Model Info Example: OpenAI GPT-5 (OpenAI)

```typescript
const gpt5Model: ModelV2.Info = {
  id: ModelV2.ID.make("gpt-5.4"),
  providerID: ProviderV2.ID.make("openai"),
  family: ModelV2.Family.make("gpt-5"),
  name: "GPT-5.4",
  
  api: {
    id: ModelV2.ID.make("gpt-5.4"),
    type: "aisdk",
    package: "@ai-sdk/openai",
    url: "https://api.openai.com/v1",
  },
  
  capabilities: {
    tools: true,
    input: ["text/*", "image/*"],
    output: ["text/*"],
  },
  
  request: {
    headers: {},
    body: {},
    generation: {},
    options: {
      reasoningEffort: "medium",  // default reasoning effort
      store: false,  // disable response caching by default
    },
    variant: undefined,
  },
  
  variants: [
    {
      id: ModelV2.VariantID.make("reasoning-low"),
      headers: {},
      body: {},
      generation: {},
      options: {
        reasoningEffort: "low",
        reasoningSummary: "auto",
        include: ["reasoning.encrypted_content"],
      },
    },
    {
      id: ModelV2.VariantID.make("reasoning-medium"),
      headers: {},
      body: {},
      generation: {},
      options: {
        reasoningEffort: "medium",
        reasoningSummary: "auto",
        include: ["reasoning.encrypted_content"],
      },
    },
    {
      id: ModelV2.VariantID.make("reasoning-high"),
      headers: {},
      body: {},
      generation: {},
      options: {
        reasoningEffort: "high",
        reasoningSummary: "auto",
        include: ["reasoning.encrypted_content"],
      },
    },
  ],
  
  time: {
    released: DateTime.makeUnsafe(new Date("2025-01-01").getTime()),
  },
  
  cost: [
    {
      input: 10.0,
      output: 40.0,
      cache: {
        read: 1.25,
        write: 5.0,
      },
    },
  ],
  
  status: "active",
  enabled: true,
  
  limit: {
    context: 128000,
    input: undefined,
    output: 16000,
  },
}
```

---

## API Relationship

### Key Pattern: Models Can Override Provider API

While a **Provider defines its default SDK package and URL**, each **Model can specify a different API package or URL**:

```
Provider (Anthropic)
  ├─ api.package: "@ai-sdk/anthropic"
  ├─ api.url: "https://api.anthropic.com"
  │
  └─ Models:
      ├─ claude-opus
      │  └─ api.package: "@ai-sdk/anthropic"  (uses provider default)
      │     api.url: "https://api.anthropic.com"
      │
      └─ claude-opus-via-bedrock
         └─ api.package: "@ai-sdk/amazon-bedrock"  (OVERRIDES provider)
            api.url: "https://bedrock.amazonaws.com"  (OVERRIDES provider)
```

This enables:
1. **Model-specific SDK swaps** – route the same model through different providers' SDKs
2. **Regional endpoints** – use a different URL for a region-specific deployment
3. **Gateway routing** – use `@ai-sdk/gateway` to route through Cloudflare/custom gateways

### Request Merging Strategy

Configuration flows from **Provider → Model → Variant → User request**:

```typescript
// 1. Provider base (global defaults)
providerRequest: {
  headers: { "User-Agent": "opencode/..." },
  body: {},
}

// 2. Model default request
modelRequest: {
  headers: {},
  body: {},
  generation: { temperature: 0.7 },
  options: { store: false },
}

// 3. Selected variant
variantRequest: {
  headers: {},
  body: {},
  generation: { temperature: 1.0 },  // override model default
  options: { reasoning: { effort: "high" } },
}

// 4. User/session request
userRequest: {
  generation: { topP: 0.9 },  // can layer on top
  options: { promptCache: "session-123" },
}

// Final merged (deep merge, later layers override earlier)
final = {
  headers: { "User-Agent": "opencode/..." },
  generation: { temperature: 1.0, topP: 0.9 },
  options: { store: false, reasoning: { effort: "high" }, promptCache: "session-123" },
}
```

---

## Configuration Layers

### Layer 1: JSON Config File (`opencode.json`)

```json
{
  "$schema": "https://opencode.ai/config.json",
  
  "provider": {
    "openai": {
      "name": "OpenAI",
      "env": ["OPENAI_API_KEY"],
      "api": {
        "type": "aisdk",
        "package": "@ai-sdk/openai"
      },
      "request": {
        "headers": {},
        "body": {}
      },
      "models": {
        "gpt-4o": {
          "name": "GPT-4o",
          "api": {
            "id": "gpt-4o",
            "type": "aisdk",
            "package": "@ai-sdk/openai"
          },
          "capabilities": {
            "tools": true,
            "input": ["text/*", "image/*"],
            "output": ["text/*"]
          },
          "request": {
            "variant": "default",
            "options": { "store": false }
          },
          "variants": [
            {
              "id": "reasoning-low",
              "options": { "reasoningEffort": "low" }
            }
          ],
          "cost": {
            "input": 5.0,
            "output": 15.0,
            "cache": { "read": 0.625, "write": 2.5 }
          },
          "limit": {
            "context": 128000,
            "output": 4096
          }
        }
      }
    },
    
    "custom-provider": {
      "name": "Custom LLM",
      "api": {
        "type": "aisdk",
        "package": "@ai-sdk/openai-compatible",
        "url": "https://api.custom.com/v1"
      },
      "options": {
        "apiKey": "${CUSTOM_API_KEY}"
      }
    }
  },
  
  "model": "openai/gpt-4o"
}
```

### Layer 2: Environment Variables

```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
CUSTOM_LLM_API_KEY=...
```

### Layer 3: Credential Store

Credentials stored in system keychain, database, or vault:

```typescript
// From credentials table/vault
type CredentialEntry = {
  id: Credential.ID,
  providerID: ProviderV2.ID,
  createdAt: DateTime,
  data: Record<string, string>,  // e.g. { apiKey: "sk-..." }
}
```

### Layer 4: Runtime Overrides

User selection in UI, CLI flags:

```typescript
// From CLI
opencode run --model anthropic/claude-opus-4

// From UI state
const selected = {
  providerID: "openai",
  modelID: "gpt-4o",
  variant: "reasoning-high",
}
```

---

## Desktop UI Flow

### Model Selection Architecture (`packages/app/src/context/local.tsx`)

```typescript
type LocalState = {
  model: {
    // Get currently selected model (providerID + modelID)
    current(): { providerID: string; modelID: string } | undefined
    
    // Set model
    set(value: { providerID: string; modelID: string } | undefined, opts: { recent: boolean }): void
    
    // Get available models for current provider
    list(): ModelInfo[]
    
    // Check if model is visible (user hasn't hidden it)
    visible(model: { providerID: string; modelID: string }): boolean
    
    // Model variants (reasoning levels, etc)
    variant: {
      selected(): string | undefined      // "reasoning-low" or undefined
      current(): string | undefined       // resolved fallback chain
      list(): string[]                   // available variants for current model
      set(value: string | undefined): void
    }
  }
}
```

### Model Selection UI Component (`packages/app/src/components/dialog-select-model.tsx`)

```tsx
// Main model picker dialog
export const DialogSelectModel: Component = () => {
  const dialog = useDialog()
  const language = useLanguage()
  
  // Launch provider selection dialog
  const selectProvider = () => {
    void import("./dialog-select-provider").then((x) => {
      dialog.show(() => <x.DialogSelectProvider />)
    })
  }
  
  // Launch model management dialog
  const manageModels = () => {
    void import("./dialog-manage-models").then((x) => {
      dialog.show(() => <x.DialogManageModels />)
    })
  }
  
  return (
    <Dialog title={language.t("dialog.model.select.title")}>
      {/* Model list with search, filtering, favorites, recent */}
      <ModelList 
        onSelect={() => dialog.clear()}
        action={<Button onClick={selectProvider}>Connect Provider</Button>}
      />
    </Dialog>
  )
}

// Model list rendering
const ModelList: Component<{
  provider?: string
  onSelect: () => void
}> = (props) => {
  const model = useLocal().model
  const language = useLanguage()
  
  const models = createMemo(() =>
    model
      .list()
      .filter((m) => model.visible({ modelID: m.id, providerID: m.provider.id }))
      .filter((m) => (props.provider ? m.provider.id === props.provider : true))
  )
  
  return (
    <List
      items={models}
      key={(x) => `${x.provider.id}:${x.id}`}
      onSelect={(item) => {
        // Update state
        model.set(
          { modelID: item.id, providerID: item.provider.id },
          { recent: true }
        )
        props.onSelect()
      }}
    >
      {(item) => (
        <div class="flex items-center gap-x-2">
          <span>{item.name}</span>
          <Show when={isFree(item.provider.id, item.cost)}>
            <Tag>{language.t("model.tag.free")}</Tag>
          </Show>
          <Show when={item.latest}>
            <Tag>{language.t("model.tag.latest")}</Tag>
          </Show>
        </div>
      )}
    </List>
  )
}
```

### Variant Selection Cascade

Once user selects a model with variants:

```tsx
function onSelect(providerID: string, modelID: string) {
  // Set model
  local.model.set({ providerID, modelID }, { recent: true })
  
  // Check available variants
  const list = local.model.variant.list()  // ["low", "medium", "high"]
  const cur = local.model.variant.selected()
  
  // If no variants or selected variant is valid, close dialog
  if (list.length === 0) {
    dialog.clear()
    return
  }
  
  // If selected variant still exists, close
  if (cur === "default" || list.includes(cur)) {
    dialog.clear()
    return
  }
  
  // Otherwise, show variant selection dialog
  dialog.replace(() => <DialogVariant />)
}
```

---

## Backend Routing Execution

### Provider Loader Pattern (`packages/opencode/src/provider/provider.ts`)

The Provider service uses a **loader pattern** to configure and load providers:

```typescript
type CustomLoader = (provider: Provider.Info) => Effect.Effect<{
  autoload: boolean
  options: Record<string, any>
  vars(options: Record<string, any>): Record<string, string>
  getModel(sdk: any, modelID: string, options?: Record<string, any>, model?: Model): Promise<any>
}>

const custom = (dep: CustomDep): Record<string, CustomLoader> => ({
  openai: () => Effect.succeed({
    autoload: false,  // don't load automatically
    options: {
      // default provider options
      headers: { "User-Agent": "opencode/..." }
    },
    
    vars(options: Record<string, any>) {
      // Extract variables from options for env expansion
      return {}
    },
    
    async getModel(sdk: any, modelID: string, options?: Record<string, any>, model?: Model) {
      // Return an SDK model instance
      // sdk is the loaded @ai-sdk/openai module
      return sdk.createOpenAI({ apiKey: env.OPENAI_API_KEY })(modelID)
    },
  }),
  
  anthropic: () => Effect.succeed({
    autoload: false,
    options: {
      headers: {
        "anthropic-beta": "interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14"
      },
    },
    // ...
  }),
  
  custom: (input: Provider.Info) => {
    // Custom provider logic
    const endpoint = input.options?.endpoint ?? input.options?.baseURL
    
    return Effect.succeed({
      autoload: true,
      options: {
        baseURL: endpoint
      },
      
      async getModel(sdk: any, modelID: string, options?: Record<string, any>, model?: Model) {
        // Use OpenAI-compatible SDK for custom endpoint
        return sdk.createOpenAICompatible({
          name: input.name,
          apiKey: input.options?.apiKey,
        })(modelID)
      },
    })
  },
})
```

### Model Resolution Service

```typescript
const getModel = Effect.fn("Provider.getModel")(function* (
  providerID: ProviderV2.ID,
  modelID: ModelV2.ID
) {
  const state = yield* InstanceState.get(stateRef)
  
  // Lookup provider
  const provider = state.providers[providerID]
  if (!provider) {
    const suggestions = fuzzysort
      .go(providerID, Object.keys(state.providers), { limit: 3 })
      .map((m) => m.target)
    return yield* new ModelNotFoundError({
      providerID,
      modelID,
      suggestions,
    })
  }
  
  // Lookup model within provider
  const info = provider.models[modelID]
  if (!info) {
    const suggestions = modelSuggestions(provider, modelID)
    return yield* new ModelNotFoundError({
      providerID,
      modelID,
      suggestions,
    })
  }
  
  // Load SDK module if API is AISDK type
  let sdk: any = undefined
  if (info.api.type === "aisdk") {
    const module = await import(info.api.npm)
    sdk = module
  }
  
  // Get configured model from loader
  const loader = customLoaders[providerID]
  const modelInstance = await loader.getModel(sdk, modelID, info.request.options, info)
  
  return modelInstance
})
```

---

## Request Transformation Pipeline

### The Transform Module (`packages/opencode/src/provider/transform.ts`)

The transform module handles **provider-specific request mutations** before sending to the wire.

#### 1. Message Normalization

Sanitizes and normalizes message format for the target provider:

```typescript
function normalizeMessages(
  msgs: ModelMessage[],
  model: Provider.Model,
  options: Record<string, unknown>,
): ModelMessage[] {
  // Anthropic rejects empty messages
  if (model.api.npm === "@ai-sdk/anthropic") {
    msgs = msgs
      .map((msg) => {
        if (typeof msg.content === "string") {
          if (msg.content === "") return undefined
          return msg
        }
        if (!Array.isArray(msg.content)) return msg
        
        // Filter empty text/reasoning parts
        const filtered = msg.content.filter((part) => {
          if (part.type === "text") return part.text !== ""
          if (part.type === "reasoning") {
            return (
              part.text.trim().length > 0 ||
              part.providerOptions?.anthropic?.signature != null
            )
          }
          return true
        })
        if (filtered.length === 0) return undefined
        return { ...msg, content: filtered }
      })
      .filter((msg): msg is ModelMessage => msg !== undefined)
  }
  
  // Claude models need sanitized tool call IDs
  if (model.api.id.includes("claude")) {
    const scrub = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "_")
    msgs = msgs.map((msg) => {
      if (msg.role === "assistant" && Array.isArray(msg.content)) {
        return {
          ...msg,
          content: msg.content.map((part) => {
            if (part.type === "tool-call" || part.type === "tool-result") {
              return { ...part, toolCallId: scrub(part.toolCallId) }
            }
            return part
          }),
        }
      }
      return msg
    })
  }
  
  return msgs
}
```

#### 2. Caching Application

Applies provider-specific cache control headers:

```typescript
function applyCaching(msgs: ModelMessage[], model: Provider.Model): ModelMessage[] {
  const system = msgs.filter((msg) => msg.role === "system").slice(0, 2)
  const final = msgs.filter((msg) => msg.role !== "system").slice(-2)
  
  const providerOptions = {
    anthropic: {
      cacheControl: { type: "ephemeral" },
    },
    openai: {
      cache_control: { type: "ephemeral" },
    },
    bedrock: {
      cachePoint: { type: "default" },
    },
    openaiCompatible: {
      cache_control: { type: "ephemeral" },
    },
  }
  
  for (const msg of unique([...system, ...final])) {
    const useMessageLevel = model.providerID === "anthropic"
    const shouldUseContent = !useMessageLevel && Array.isArray(msg.content)
    
    if (shouldUseContent) {
      const lastContent = msg.content[msg.content.length - 1]
      if (lastContent && typeof lastContent === "object") {
        lastContent.providerOptions = mergeDeep(
          lastContent.providerOptions ?? {},
          providerOptions
        )
      }
    } else {
      msg.providerOptions = mergeDeep(msg.providerOptions ?? {}, providerOptions)
    }
  }
  
  return msgs
}
```

#### 3. Model Variant Computation

Generates provider-specific variant structures:

```typescript
export function variants(model: Provider.Model): Record<string, Record<string, any>> {
  if (!model.capabilities.reasoning) return {}
  
  const id = model.id.toLowerCase()
  
  // OpenAI variants
  if (model.api.npm === "@ai-sdk/openai") {
    const efforts = openaiReasoningEfforts(model.api.id, model.release_date)
    return Object.fromEntries(
      efforts.map((effort) => [
        effort,
        {
          reasoningEffort: effort,
          reasoningSummary: "auto",
          include: ["reasoning.encrypted_content"],
        },
      ])
    )
  }
  
  // Anthropic variants
  if (model.api.npm === "@ai-sdk/anthropic") {
    const adaptiveEfforts = anthropicAdaptiveEfforts(model.api.id)
    if (adaptiveEfforts) {
      return Object.fromEntries(
        adaptiveEfforts.map((effort) => [
          effort,
          {
            thinking: {
              type: "adaptive",
              display: "summarized",
            },
            effort,
          },
        ])
      )
    }
    
    return {
      high: {
        thinking: {
          type: "enabled",
          budgetTokens: 16000,
        },
      },
      max: {
        thinking: {
          type: "enabled",
          budgetTokens: 31999,
        },
      },
    }
  }
  
  // Google Gemini variants
  if (model.api.npm === "@ai-sdk/google") {
    return Object.fromEntries(
      googleThinkingLevelEfforts(model.api.id).map((effort) => [
        effort,
        {
          thinkingConfig: {
            includeThoughts: true,
            thinkingLevel: effort,
          },
        },
      ])
    )
  }
  
  return {}
}
```

#### 4. Default Options Injection

Applies model-specific defaults and runtime options:

```typescript
export function options(input: {
  model: Provider.Model
  sessionID: string
  providerOptions?: Record<string, any>
}): Record<string, any> {
  const result: Record<string, any> = {}
  
  // Anthropic doesn't stream tools reliably
  if (
    input.model.api.npm === "@ai-sdk/google-vertex/anthropic" ||
    (!input.model.api.id.includes("claude") && input.model.api.npm === "@ai-sdk/anthropic")
  ) {
    result["toolStreaming"] = false
  }
  
  // OpenAI models should disable response storage
  if (input.model.providerID === "openai" || input.model.api.npm === "@ai-sdk/openai") {
    result["store"] = false
  }
  
  // Azure needs prompt caching key
  if (input.model.api.npm === "@ai-sdk/azure") {
    result["store"] = false
    result["promptCacheKey"] = input.sessionID
  }
  
  // GPT-5 models default to medium reasoning effort
  if (input.model.api.id.includes("gpt-5") && !input.model.api.id.includes("gpt-5-chat")) {
    if (!input.model.api.id.includes("gpt-5-pro")) {
      result["reasoningEffort"] = "medium"
      result["reasoningSummary"] = "auto"
      result["include"] = ["reasoning.encrypted_content"]
    }
  }
  
  // Google models need explicit thinking config
  if (input.model.api.npm === "@ai-sdk/google" && input.model.capabilities.reasoning) {
    result["thinkingConfig"] = {
      includeThoughts: true,
    }
  }
  
  return result
}
```

#### 5. Provider-Specific Option Key Mapping

Maps generic option keys to provider-specific SDK keys:

```typescript
function sdkKey(npm: string): string | undefined {
  switch (npm) {
    case "@ai-sdk/github-copilot":
      return "copilot"
    case "@ai-sdk/azure":
      return "azure"
    case "@ai-sdk/openai":
      return "openai"
    case "@ai-sdk/anthropic":
      return "anthropic"
    case "@ai-sdk/google":
      return "google"
    case "@ai-sdk/gateway":
      return "gateway"
    case "@openrouter/ai-sdk-provider":
      return "openrouter"
    default:
      return undefined
  }
}

export function providerOptions(model: Provider.Model, options: { [x: string]: any }) {
  // Gateway routes options under upstream provider slug
  if (model.api.npm === "@ai-sdk/gateway") {
    const slug = model.api.id.split("/")[0]  // e.g. "anthropic" from "anthropic/claude"
    const gateway = options.gateway
    const rest = Object.fromEntries(Object.entries(options).filter(([k]) => k !== "gateway"))
    
    const result: Record<string, any> = {}
    if (gateway !== undefined) result.gateway = gateway
    if (Object.keys(rest).length > 0 && slug) {
      result[slug] = rest
    }
    return result
  }
  
  // Standard SDK wrapping
  const key = sdkKey(model.api.npm)
  if (model.api.npm === "@ai-sdk/azure") {
    // Azure needs both keys
    return { openai: options, azure: options }
  }
  return { [key ?? model.providerID]: options }
}
```

---

## Error Handling & Propagation

### Error Type Hierarchy

Opencode uses **tagged error classes** that carry context and propagate through the system:

```typescript
// Core error types (packages/opencode/src/provider/provider.ts)
export class ModelNotFoundError extends Schema.TaggedErrorClass<ModelNotFoundError>()(
  "ProviderModelNotFoundError",
  {
    providerID: ProviderV2.ID,
    modelID: ModelV2.ID,
    suggestions: Schema.optional(Schema.Array(Schema.String)),
    cause: Schema.optional(Schema.Defect),
  }
) {
  static isInstance(input: unknown): input is ModelNotFoundError {
    return input instanceof ModelNotFoundError
  }
}

export class InitError extends Schema.TaggedErrorClass<InitError>()(
  "ProviderInitError",
  {
    providerID: ProviderV2.ID,
    cause: Schema.optional(Schema.Defect),
  }
) {}

export class NoProvidersError extends Schema.TaggedErrorClass<NoProvidersError>()(
  "ProviderNoProvidersError",
  {}
) {}

export class NoModelsError extends Schema.TaggedErrorClass<NoModelsError>()(
  "ProviderNoModelsError",
  {
    providerID: ProviderV2.ID,
  }
) {}

// Session-level errors (packages/core/src/session/runner/model.ts)
export class ModelNotSelectedError extends Schema.TaggedErrorClass<ModelNotSelectedError>()(
  "SessionRunnerModel.ModelNotSelectedError",
  {
    sessionID: SessionSchema.ID,
  }
) {}

export class UnsupportedApiError extends Schema.TaggedErrorClass<UnsupportedApiError>()(
  "SessionRunnerModel.UnsupportedApiError",
  {
    providerID: ProviderV2.ID,
    modelID: ModelV2.ID,
    api: Schema.String,
  }
) {}

// Catalog errors (packages/core/src/catalog.ts)
export class ProviderNotFoundError extends Schema.TaggedErrorClass<ProviderNotFoundError>()(
  "CatalogV2.ProviderNotFound",
  {
    providerID: ProviderV2.ID,
  }
) {}

export class ModelNotFoundError extends Schema.TaggedErrorClass<ModelNotFoundError>()(
  "CatalogV2.ModelNotFound",
  {
    providerID: ProviderV2.ID,
    modelID: ModelV2.ID,
  }
) {}
```

### Smart Error Suggestions

When a model is not found, the system provides intelligent suggestions using fuzzy matching:

```typescript
function modelSuggestions(
  provider: Info | undefined,
  modelID: ModelV2.ID,
  enableExperimentalModels: boolean
): string[] {
  if (!provider) return []
  
  const candidates = Object.values(provider.models)
    .filter((m) => {
      if (!enableExperimentalModels && m.status === "alpha") return false
      return m.status !== "deprecated"
    })
    .map((m) => m.id)
  
  // Use fuzzysort to find similar model names
  return fuzzysort
    .go(modelID, candidates, { limit: 3, threshold: -10000 })
    .map((m) => m.target)
}
```

### CLI Error Formatting (`packages/opencode/src/cli/error.ts`)

Errors are formatted for CLI display with user-friendly messages and context:

```typescript
export function FormatError(input: unknown): string | undefined {
  // ProviderModelNotFoundError: { providerID: string, modelID: string, suggestions?: string[] }
  const providerModelNotFound = configData(input, "ProviderModelNotFoundError")
  if (providerModelNotFound) {
    const suggestions = Array.isArray(providerModelNotFound.suggestions)
      ? providerModelNotFound.suggestions.filter((x) => typeof x === "string")
      : []
    return [
      `Model not found: ${stringField(providerModelNotFound, "providerID")}/${stringField(providerModelNotFound, "modelID")}`,
      ...(suggestions.length ? ["Did you mean: " + suggestions.join(", ")] : []),
      `Try: \`opencode models\` to list available models`,
      `Or check your config (opencode.json) provider/model names`,
    ].join("\n")
  }

  // ProviderInitError: { providerID: string }
  const providerInit = configData(input, "ProviderInitError")
  if (providerInit) {
    return `Failed to initialize provider "${stringField(providerInit, "providerID")}". Check credentials and configuration.`
  }

  // ProviderNoProvidersError
  const noProviders = configData(input, "ProviderNoProvidersError")
  if (noProviders) {
    return [
      `No providers available. Please set up at least one provider.`,
      `Run: \`opencode /connect\` to add a provider`,
    ].join("\n")
  }

  // ProviderNoModelsError
  const noModels = configData(input, "ProviderNoModelsError")
  if (noModels) {
    return `No models available for provider "${stringField(noModels, "providerID")}".`
  }

  return undefined
}
```

### Frontend Error Display (`packages/app/src/utils/server-errors.ts`)

Frontend errors are parsed and rendered with translation support:

```typescript
export function formatServerError(error: unknown, translate?: Translator, fallback?: string) {
  const unwrapped = unwrapNamedError(error)
  if (isConfigInvalidErrorLike(unwrapped)) return parseReadableConfigInvalidError(unwrapped, translate)
  if (isProviderModelNotFoundErrorLike(unwrapped)) return parseReadableProviderModelNotFoundError(unwrapped, translate)
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "string" && error) return error
  if (fallback) return fallback
  return tr(translate, "error.chain.unknown", "Unknown error")
}

function parseReadableProviderModelNotFoundError(
  errorInput: ProviderModelNotFoundError,
  translator?: Translator
) {
  const p = errorInput.data.providerID.trim()
  const m = errorInput.data.modelID.trim()
  const list = (errorInput.data.suggestions ?? []).map((v) => v.trim()).filter(Boolean)
  
  const body = tr(
    translator,
    "error.chain.modelNotFound",
    `Model not found: ${p}/${m}`,
    { provider: p, model: m }
  )
  const tail = tr(
    translator,
    "error.chain.checkConfig",
    "Check your config (opencode.json) provider/model names"
  )
  
  if (list.length) {
    const suggestions = list.slice(0, 5).join(", ")
    return [
      body,
      tr(
        translator,
        "error.chain.didYouMean",
        `Did you mean: ${suggestions}`,
        { suggestions }
      ),
      tail,
    ].join("\n")
  }
  
  return [body, tail].join("\n")
}
```

### Toast Notifications

Errors are displayed to users as toast notifications in the UI:

```tsx
// TUI Toast (packages/tui/src/ui/toast.tsx)
export type ToastOptions = {
  title?: string
  message: string
  variant: "info" | "success" | "warning" | "error"
  duration: number
}

function init() {
  const toast = {
    show(options: ToastInput) {
      const toastOptions = { ...options, duration: options.duration ?? 5000 }
      setStore("currentToast", toastOptions)
      if (timeoutHandle) clearTimeout(timeoutHandle)
      timeoutHandle = setTimeout(() => {
        setStore("currentToast", null)
      }, toastOptions.duration).unref()
    },
    
    error: (err: any) => {
      if (err instanceof Error)
        return toast.show({
          variant: "error",
          message: err.message,
        })
      toast.show({
        variant: "error",
        message: "An unknown error has occurred",
      })
    },
  }
  return toast
}

// Web App Toast (packages/app/src/context/notification.tsx)
export type ErrorNotification = NotificationBase & {
  type: "error"
  error: EventSessionError["properties"]["error"]
}

// Session error handling (packages/tui/src/app.tsx)
event.on("session.error", (evt, { workspace }) => {
  if (workspace !== project.workspace.current()) return
  const error = evt.properties.error
  if (error && typeof error === "object" && error.name === "MessageAbortedError") return
  
  const message = errorMessage(error)
  toast.show({
    variant: "error",
    message,
    duration: 5000,
  })
})
```

### Error Event Propagation

Errors flow through the event system to reach the UI:

```typescript
// From session (packages/opencode/src/session/prompt.ts)
const exit = yield* provider.getModel(providerID, modelID).pipe(Effect.exit)
if (Exit.isSuccess(exit)) return exit.value

const err = Cause.squash(exit.cause)
if (Provider.ModelNotFoundError.isInstance(err)) {
  const hint = err.suggestions?.length ? ` Did you mean: ${err.suggestions.join(", ")}?` : ""
  yield* events.publish(Session.Event.Error, {
    sessionID,
    error: new NamedError.Unknown({
      message: `Model not found: ${err.providerID}/${err.modelID}.${hint}`,
    }).toObject(),
  })
}
return yield* Effect.die(err)
```

---

## Example Implementation

### Complete Flow: User Selects GPT-5 and Runs a Task

#### 1. **UI: Model Selection**

```typescript
// User clicks model selector, finds "GPT-5.4" under OpenAI
const local = useLocal()
local.model.set(
  { providerID: "openai", modelID: "gpt-5.4" },
  { recent: true }
)

// Variant dialog appears (reasoning-low, reasoning-high)
local.model.variant.set("reasoning-high")

// Dialog closes, model is now:
// { providerID: "openai", modelID: "gpt-5.4", variant: "reasoning-high" }
```

#### 2. **Backend: Model Resolution**

```typescript
// Request comes in with model selection
const req = {
  providerID: "openai",
  modelID: "gpt-5.4",
  variant: "reasoning-high",
  prompt: "Write a function...",
}

// Provider service resolves model
const provider = yield* Provider.use.getProvider("openai")
const model = yield* Provider.use.getModel("openai", "gpt-5.4")

// Result contains:
// {
//   id: "gpt-5.4",
//   providerID: "openai",
//   name: "GPT-5.4",
//   api: {
//     type: "aisdk",
//     package: "@ai-sdk/openai",
//     id: "gpt-5.4"
//   },
//   capabilities: { tools: true, input: ["text/*", "image/*"], output: ["text/*"] },
//   request: {
//     options: { store: false, reasoningEffort: "medium" }
//   },
//   variants: [
//     {
//       id: "reasoning-low",
//       options: { reasoningEffort: "low", reasoningSummary: "auto", ... }
//     },
//     {
//       id: "reasoning-high",
//       options: { reasoningEffort: "high", reasoningSummary: "auto", ... }
//     }
//   ]
// }
```

#### 3. **Backend: Request Transformation**

```typescript
const messages = [
  { role: "user", content: "Write a function..." }
]

// Apply transformations
let transformed = messages

// 1. Normalize for provider
transformed = ProviderTransform.message(transformed, model, {})

// 2. Apply caching
transformed = applyCaching(transformed, model)

// 3. Get default options
const defaultOptions = ProviderTransform.options({
  model,
  sessionID: "session-123"
})
// Result: { store: false, reasoningEffort: "medium", reasoningSummary: "auto", ... }

// 4. Get variant options
const variantOptions = model.variants.find(v => v.id === "reasoning-high")?.options
// Result: { reasoningEffort: "high", reasoningSummary: "auto", include: [...] }

// 5. Merge all options (model default + variant + user)
const finalOptions = {
  ...defaultOptions,
  ...variantOptions,
  ...userOptions,  // any runtime overrides
}

// 6. Map to provider-specific SDK keys
const sdkOptions = ProviderTransform.providerOptions(model, finalOptions)
// Result: {
//   openai: {
//     store: false,
//     reasoningEffort: "high",
//     reasoningSummary: "auto",
//     include: ["reasoning.encrypted_content"]
//   }
// }
```

#### 4. **Backend: SDK Invocation**

```typescript
// Load OpenAI SDK
const openai = await import("@ai-sdk/openai")

// Get model from provider loader
const modelLoader = customLoaders["openai"]
const sdkModel = await modelLoader.getModel(
  openai,
  "gpt-5.4",
  sdkOptions
)

// Call generation
const response = await generateText({
  model: sdkModel,
  messages: transformed,
  system: "You are a helpful coding assistant",
  ...sdkOptions,  // reasoning_effort, store, etc.
})

// Response includes reasoning content
console.log(response.reasoning)      // Extended thinking output
console.log(response.text)           // Final response
console.log(response.usage)          // Token counts
```

#### 5. **Error Path: Model Not Found**

```typescript
// User selects non-existent model: "openai/gpt-99-mega"
const result = yield* Provider.use.getModel(
  ProviderV2.ID.make("openai"),
  ModelV2.ID.make("gpt-99-mega")
)
// Throws ModelNotFoundError with:
// {
//   providerID: "openai",
//   modelID: "gpt-99-mega",
//   suggestions: ["gpt-4o", "gpt-5.4", "gpt-4-turbo"]
// }

// CLI Error Formatting
// Output: 
// Model not found: openai/gpt-99-mega
// Did you mean: gpt-4o, gpt-5.4, gpt-4-turbo
// Try: `opencode models` to list available models
// Or check your config (opencode.json) provider/model names

// Frontend Error Display (toast)
showToast({
  variant: "error",
  message: "Model not found: openai/gpt-99-mega. Did you mean: gpt-4o, gpt-5.4, gpt-4-turbo?",
  duration: 5000
})
```

---

## Key Design Principles

1. **Separation of Concerns**
   - **Provider** = authentication, SDK choice, base URL
   - **Model** = capabilities, costs, limits, variants
   - **Transform** = request mutation per provider
   - **Route** = execution path (SDK + HTTP + serialization)
   - **Error** = structured context with suggestions

2. **Type Safety**
   - All IDs are branded types (`ProviderV2.ID`, `ModelV2.ID`, `VariantID`)
   - API types are tagged unions (`AISDK | Native`)
   - Enabled states are tagged unions (env | credential | custom)
   - Error types are tagged classes with static type guards
   - Configuration validates against schemas

3. **Composition Over Inheritance**
   - Models compose variant definitions
   - Transforms compose multiple mutation steps
   - Options merge from Provider → Model → Variant → User
   - Errors propagate with full context chain

4. **Extensibility**
   - Custom providers can be defined in config
   - Loaders pattern allows provider-specific logic
   - Transform module can be extended per provider
   - API types support both SDK and native protocols
   - Error handlers can be customized at each layer

5. **Fallback Chains**
   - Env vars: check multiple env names per provider
   - Variants: fall back to model default if variant unavailable
   - Models: fuzzy suggestions on not-found errors
   - Providers: credential fallback chain
   - Errors: structured recovery hints via suggestions

---

## Summary

Opencode's provider/model system is fundamentally a **configuration composition engine** that:

1. **Specifies** what providers and models ARE (metadata, capabilities, APIs)
2. **Routes** requests through chosen provider+model+variant
3. **Transforms** generic LLM requests into provider-specific wire formats
4. **Merges** configuration from multiple layers (file → env → credentials → runtime)
5. **Handles errors** with structured types, intelligent suggestions, and user-friendly messages
6. **Propagates errors** from backend through CLI/UI layers with context preservation

This enables flexible, extensible, type-safe model routing with strong separation between specification (what) and execution (how), all backed by robust error handling and recovery mechanisms.