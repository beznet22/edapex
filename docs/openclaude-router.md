## Comprehensive Analysis: Setting-Based Model/Agent Routing in OpenClaude

I'll provide you with a detailed code flow analysis of how OpenClaude's agent routing and smart model routing systems work.

---

### **1. Core Architecture Overview**

OpenClaude implements **two complementary routing systems**:

1. **Agent Routing**: Routes different agent types/names to different models + providers
2. **Smart Model Routing**: Routes individual turns to cheap vs. strong models based on input complexity

---

### **2. Agent Routing System**

#### **Settings Configuration**

```json
{
  "agentModels": {
    "deepseek-v4-flash": {
      "base_url": "https://api.deepseek.com/v1",
      "api_key": "sk-your-key"
    },
    "gpt-4o": {
      "base_url": "https://api.openai.com/v1",
      "api_key": "sk-your-key"
    }
  },
  "agentRouting": {
    "Explore": "deepseek-v4-flash",
    "Plan": "gpt-4o",
    "general-purpose": "gpt-4o",
    "frontend-dev": "deepseek-v4-flash",
    "default": "gpt-4o"
  }
}
```

#### **Core Function: `resolveAgentProvider`**

```typescript
// Location: src/services/api/agentRouting.ts
export interface ProviderOverride {
  model: string              // e.g., "deepseek-chat", "gpt-4o"
  baseURL: string            // OpenAI-compatible endpoint
  apiKey: string             // Provider-specific API key
}

export function resolveAgentProvider(
  name: string | undefined,
  subagentType: string | undefined,
  settings: SettingsJson | null,
): ProviderOverride | null {
  if (!settings) return null

  const routing = settings.agentRouting
  const models = settings.agentModels
  if (!routing || !models) return null

  // === STEP 1: Normalize routing keys for case/hyphen-insensitive matching ===
  const normalizedRouting = new Map<string, string>()
  for (const [key, value] of Object.entries(routing)) {
    const nk = normalize(key)  // toLowerCase() + replace(/-_/g, '')
    if (normalizedRouting.has(nk)) {
      console.error(`[agentRouting] Warning: collision on "${nk}". First entry wins.`)
    }
    if (!normalizedRouting.has(nk)) {
      normalizedRouting.set(nk, value)
    }
  }

  // === STEP 2: Priority lookup: name > subagentType > "default" ===
  const candidates = [name, subagentType, 'default'].filter(Boolean) as string[]
  let modelName: string | undefined

  for (const candidate of candidates) {
    const match = normalizedRouting.get(normalize(candidate))
    if (match) {
      modelName = match
      break
    }
  }

  if (!modelName) return null

  // === STEP 3: Look up model configuration ===
  const modelConfig = models[modelName]
  if (!modelConfig) return null

  // === STEP 4: Return provider override ===
  return {
    model: modelName,
    baseURL: modelConfig.base_url,
    apiKey: modelConfig.api_key,
  }
}

// Normalize helper: case-insensitive, hyphen/underscore-agnostic
function normalize(key: string): string {
  return key.toLowerCase().replace(/[-_]/g, '')
}
```

#### **Call Flow Example**

```
┌─────────────────────────────────────────────────────────────────────┐
│ Agent Execution (e.g., Explore agent creates a subagent)            │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│ resolveAgentProvider(                                               │
│   name: "frontend-dev",                                             │
│   subagentType: "Explore",                                          │
│   settings: loadedSettings                                          │
│ )                                                                   │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
        ┌───────────────────────────────────────────────────┐
        │ Normalize routing config:                          │
        │ "Explore" → "explore"                             │
        │ "general-purpose" → "generalpurpose"              │
        │ "frontend-dev" → "frontendev"                     │
        └───────────────────────────────────────────────────┘
                                  ↓
        ┌───────────────────────────────────────────────────┐
        │ Priority lookup:                                   │
        │ 1. name="frontend-dev"   → "frontendev" ✓ Match   │
        │    → returns "deepseek-v4-flash"                  │
        └───────────────────────────────────────────────────┘
                                  ↓
        ┌───────────────────────────────────────────────────┐
        │ Resolve model config:                              │
        │ agentModels["deepseek-v4-flash"] = {              │
        │   base_url: "https://api.deepseek.com/v1",        │
        │   api_key: "sk-ds"                                │
        │ }                                                 │
        └───────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Return ProviderOverride {                                           │
│   model: "deepseek-v4-flash",                                       │
│   baseURL: "https://api.deepseek.com/v1",                           │
│   apiKey: "sk-ds"                                                   │
│ }                                                                   │
└─────────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│ API Client uses override instead of global env vars                 │
└─────────────────────────────────────────────────────────────────────┘
```

#### **Priority Chain Behavior**

```typescript
// Test cases demonstrating priority
test('name takes priority over subagentType', () => {
  const result = resolveAgentProvider('frontend-dev', 'Explore', baseSettings)
  // Input: name='frontend-dev', subagentType='Explore'
  // Lookup: 'frontendev' (name) finds 'deepseek-v4-flash' FIRST
  // Result: deepseek (not gpt-4o from Explore)
  expect(result?.model).toBe('deepseek-v4-flash')
})

test('subagentType used when name has no match', () => {
  const result = resolveAgentProvider('unknown-name', 'Explore', baseSettings)
  // Input: name='unknown-name', subagentType='Explore'
  // Lookup: 'unknownname' (name) — no match
  // Lookup: 'explore' (subagentType) — finds 'deepseek-v4-flash'
  // Result: deepseek
  expect(result?.model).toBe('deepseek-v4-flash')
})

test('falls back to "default" when neither match', () => {
  const result = resolveAgentProvider('nobody', 'unknown-type', baseSettings)
  // Input: name='nobody', subagentType='unknown-type'
  // Lookup: 'nobody' — no match
  // Lookup: 'unknowntype' — no match
  // Lookup: 'default' — finds 'gpt-4o'
  // Result: gpt-4o
  expect(result?.model).toBe('gpt-4o')
})

test('returns null when no routing match and no default', () => {
  const settings = {
    agentModels: baseSettings.agentModels,
    agentRouting: { Explore: 'deepseek-chat' },  // No 'default' key
  }
  const result = resolveAgentProvider('nobody', 'unknown-type', settings)
  // No match for name, subagentType, or default
  // Result: null → fall back to global provider
  expect(result).toBeNull()
})
```

#### **Edge Cases & Normalization**

```typescript
test('matching is case-insensitive', () => {
  const result = resolveAgentProvider(undefined, 'explore', baseSettings)
  // 'explore' normalizes to 'explore' (matches 'Explore' → 'explore')
  expect(result?.model).toBe('deepseek-v4-flash')
})

test('matching is case-insensitive (UPPER)', () => {
  const result = resolveAgentProvider(undefined, 'EXPLORE', baseSettings)
  // 'EXPLORE' → lowercase → 'explore' (matches)
  expect(result?.model).toBe('deepseek-v4-flash')
})

test('hyphen and underscore are equivalent', () => {
  const result = resolveAgentProvider(undefined, 'general_purpose', baseSettings)
  // 'general_purpose' → remove hyphens/underscores → 'generalpurpose'
  // 'general-purpose' in routing → 'generalpurpose' (matches)
  expect(result?.model).toBe('gpt-4o')
})

test('underscore in config matches hyphen in input', () => {
  const settings = {
    agentModels: baseSettings.agentModels,
    agentRouting: { general_purpose: 'deepseek-chat' },  // Config: underscore
  }
  const result = resolveAgentProvider(undefined, 'general-purpose', settings)
  // Input: 'general-purpose' → 'generalpurpose'
  // Config: 'general_purpose' → 'generalpurpose' (matches)
  expect(result?.model).toBe('deepseek-chat')
})
```

---

### **3. Smart Model Routing System**

#### **Configuration (Optional)**

Smart routing is **opt-in** via settings and disabled by default.

```typescript
// From src/services/api/smartModelRouting.ts
export type SmartRoutingConfig = {
  enabled: boolean      // Must be explicitly true
  simpleModel: string   // Model for "simple" turns (cheap)
  strongModel: string   // Model for "complex" turns (capable)
  simpleMaxChars?: number  // Default: 160
  simpleMaxWords?: number  // Default: 28
}

export type RoutingDecision = {
  model: string
  complexity: 'simple' | 'strong'
  reason: string  // Human-readable for logging/UI
}
```

#### **Core Function: `routeModel`**

```typescript
export function routeModel(
  input: RoutingInput,
  config: SmartRoutingConfig,
): RoutingDecision {
  // === STEP 1: Check if enabled ===
  if (!config.enabled) {
    return {
      model: config.strongModel,
      complexity: 'strong',
      reason: 'smart-routing disabled',
    }
  }

  // === STEP 2: Validate configuration ===
  if (!config.simpleModel || !config.strongModel) {
    return {
      model: config.strongModel,
      complexity: 'strong',
      reason: 'simpleModel or strongModel missing from config',
    }
  }

  if (config.simpleModel === config.strongModel) {
    return {
      model: config.strongModel,
      complexity: 'strong',
      reason: 'simpleModel equals strongModel',
    }
  }

  // === STEP 3: Extract and normalize input ===
  const text = input.userText ?? ''
  const trimmed = text.trim()

  // === STEP 4: Route to simple model if obviously simple ===
  if (!trimmed) {
    // Empty input (resuming tool-use chain) = cheap
    return {
      model: config.simpleModel,
      complexity: 'simple',
      reason: 'empty user text',
    }
  }

  if (input.turnNumber === 1) {
    // First turn is task-setup = always use strong
    return {
      model: config.strongModel,
      complexity: 'strong',
      reason: 'first turn of session',
    }
  }

  // === STEP 5: Heuristic checks for "strong" triggers ===
  const maxChars = config.simpleMaxChars ?? 160
  const maxWords = config.simpleMaxWords ?? 28

  if (hasCode(trimmed)) {
    return {
      model: config.strongModel,
      complexity: 'strong',
      reason: 'contains code block or inline code',
    }
  }

  if (hasStrongKeyword(trimmed)) {
    return {
      model: config.strongModel,
      complexity: 'strong',
      reason: 'contains reasoning/planning keyword',
    }
  }

  if (hasMultiParagraph(trimmed)) {
    return {
      model: config.strongModel,
      complexity: 'strong',
      reason: 'multi-paragraph input',
    }
  }

  if (trimmed.length > maxChars) {
    return {
      model: config.strongModel,
      complexity: 'strong',
      reason: `input > ${maxChars} chars`,
    }
  }

  if (countWords(trimmed) > maxWords) {
    return {
      model: config.strongModel,
      complexity: 'strong',
      reason: `input > ${maxWords} words`,
    }
  }

  // === STEP 6: Default to simple model ===
  return {
    model: config.simpleModel,
    complexity: 'simple',
    reason: `short (${trimmed.length} chars, ${countWords(trimmed)} words)`,
  }
}

// === Helper Functions ===
const STRONG_KEYWORDS = [
  'plan', 'design', 'architect', 'refactor', 'debug',
  'investigate', 'analyze', 'implement', 'optimize',
  'review', 'audit', 'diagnose', 'root cause', 'why does',
  'why is', 'how should', 'propose', 'trace', 'reproduce',
]

const STRONG_KEYWORD_RE = new RegExp(
  `\\b(?:${STRONG_KEYWORDS.map(k => k.replace(/[-]/g, '[-\\s]')).join('|')})\\b`,
  'i',
)

const CODE_FENCE_RE = /```[\s\S]*?```|`[^`\n]+`/

function hasCode(text: string): boolean {
  return CODE_FENCE_RE.test(text)
}

function hasStrongKeyword(text: string): boolean {
  return STRONG_KEYWORD_RE.test(text)
}

function hasMultiParagraph(text: string): boolean {
  return /\n\s*\n/.test(text)
}

function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}
```

#### **Decision Tree / Examples**

```typescript
// Example 1: Simple acknowledgment
routeModel(
  { userText: 'ok', turnNumber: 5 },
  { enabled: true, simpleModel: 'haiku', strongModel: 'opus' }
)
// → 'haiku' (reason: "short (2 chars, 1 words)")

// Example 2: First turn (always strong)
routeModel(
  { userText: 'fix the bug', turnNumber: 1 },
  { enabled: true, simpleModel: 'haiku', strongModel: 'opus' }
)
// → 'opus' (reason: "first turn of session")

// Example 3: Code input (always strong)
routeModel(
  { userText: 'Here is the code:\n```js\nfunction foo() {}\n```', turnNumber: 5 },
  { enabled: true, simpleModel: 'haiku', strongModel: 'opus' }
)
// → 'opus' (reason: "contains code block or inline code")

// Example 4: Planning keyword (always strong)
routeModel(
  { userText: 'plan the refactor', turnNumber: 5 },
  { enabled: true, simpleModel: 'haiku', strongModel: 'opus' }
)
// → 'opus' (reason: "contains reasoning/planning keyword")

// Example 5: Long input
routeModel(
  { userText: 'This is a very long message that exceeds the default 160 character threshold for simple routing so it will route to the strong model instead', turnNumber: 5 },
  { enabled: true, simpleModel: 'haiku', strongModel: 'opus' }
)
// → 'opus' (reason: "input > 160 chars")

// Example 6: Empty/null (cheap)
routeModel(
  { userText: '', turnNumber: 5 },
  { enabled: true, simpleModel: 'haiku', strongModel: 'opus' }
)
// → 'haiku' (reason: "empty user text")
```

---

### **4. Main Loop Model Selection (Session-Level)**

This is the **global model** that serves as the fallback when neither agent routing nor smart routing applies.

```typescript
// src/utils/model/model.ts

export function getMainLoopModel(): ModelName {
  const model = getUserSpecifiedModelSetting()
  if (model !== undefined && model !== null) {
    return parseUserSpecifiedModel(model)
  }
  return getDefaultMainLoopModel()
}

export function getUserSpecifiedModelSetting(): ModelSetting | undefined {
  // === Priority Order ===
  // 1. Model override during session (/model command)
  const modelOverride = getMainLoopModelOverride()
  if (modelOverride !== undefined) {
    return modelOverride
  }

  // 2. Startup flag (--model)
  const settings = getSettings_DEPRECATED() || {}
  const setting = normalizeModelSetting(settings.model)

  // 3. Environment variable (provider-specific)
  const provider = getAPIProvider()
  const specifiedModel =
    (provider === 'gemini' ? process.env.GEMINI_MODEL : undefined) ||
    (provider === 'mistral' ? process.env.MISTRAL_MODEL : undefined) ||
    (isOpenAIShimProvider(provider) ? process.env.OPENAI_MODEL : undefined) ||
    (provider === 'firstParty' ? process.env.ANTHROPIC_MODEL : undefined) ||
    setting ||
    undefined

  // 4. Validate against allowlist
  if (specifiedModel && !isModelAllowed(specifiedModel)) {
    return undefined
  }

  return specifiedModel
}

function isOpenAIShimProvider(provider: string): boolean {
  return [
    'openai', 'codex', 'github',
    'nvidia-nim', 'minimax',
    'xiaomi-mimo', 'xai'
  ].includes(provider)
}
```

---

### **5. Integrated Flow: End-to-End Example**

```
USER STARTS SESSION
  ↓
getMainLoopModel()
  ├─ Check: /model override during session? No
  ├─ Check: --model startup flag? No
  ├─ Check: ANTHROPIC_MODEL env var? No
  ├─ Check: settings.json model field? No
  └─ Default: getDefaultMainLoopModel()
      → "claude-opus-4-7" (for Max users)
  ↓
Global Provider: FirstParty Anthropic
Global Model: opus-4-7
  ↓
USER INVOKES AGENT "Explore"
  ↓
resolveAgentProvider(
  name: undefined,
  subagentType: "Explore",
  settings: {
    agentModels: { "deepseek-v4-flash": {...} },
    agentRouting: { "Explore": "deepseek-v4-flash", "default": "gpt-4o" }
  }
)
  → ProviderOverride {
      model: "deepseek-v4-flash",
      baseURL: "https://api.deepseek.com/v1",
      apiKey: "sk-ds"
    }
  ↓
Agent "Explore" uses: DeepSeek (overrides global Anthropic)
  ↓
USER SENDS MESSAGE IN EXPLORE AGENT: "ok, sounds good"
  ↓
routeModel(
  { userText: "ok, sounds good", turnNumber: 5 },
  config: { enabled: true, simpleModel: "mini", strongModel: "deepseek-v4-flash" }
)
  → RoutingDecision {
      model: "mini",
      complexity: "simple",
      reason: "short (17 chars, 4 words)"
    }
  ↓
Turn routed to: DeepSeek Mini (cheap)
  ↓
API Call uses:
  - baseURL: "https://api.deepseek.com/v1"
  - apiKey: "sk-ds"
  - model: "mini"
```

---

### **6. Settings Schema Definitions**

```typescript
// src/utils/settings/types.ts

agentModels: z
  .record(
    z.string(),
    z.object({
      base_url: z.string().url(),
      api_key: z.string(),
    }),
  )
  .optional()
  .describe(
    'Map of model name to provider connection info. ' +
      'Example: { "deepseek-chat": { "base_url": "https://api.deepseek.com/v1", "api_key": "sk-xxx" } }',
  ),

agentRouting: z
  .record(z.string(), z.string())
  .optional()
  .describe(
    'Map of agent identifier (subagent_type or team member name) to model name. ' +
      'Use "default" key as fallback. Model name must exist in agentModels. ' +
      'Example: { "Explore": "deepseek-chat", "general-purpose": "gpt-4o", "default": "gpt-4o" }',
  ),
```

---

### **7. Key Design Principles**

| Aspect | Details |
|--------|---------|
| **Settings-Driven** | All routing is configured declaratively in `~/.openclaude.json` |
| **Normalization** | Keys are case-insensitive and treat `-` and `_` as identical |
| **Priority Chain** | name > subagentType > default (explicit, checked in order) |
| **Fallback** | Missing routing → return `null` → use global provider |
| **Opt-In Smart Routing** | Disabled by default; users must set `enabled: true` |
| **Heuristic-Based** | Simple vs. strong decided by: code, keywords, length, paragraphs, turn #1 |
| **Pure Functions** | `resolveAgentProvider` & `routeModel` are pure (no side effects) |
| **No Silent Failures** | Collision warnings logged; null returns explicit |

---

### **8. Summary Table**

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ROUTING DECISION HIERARCHY                       │
├─────────────────────────────────────────────────────────────────────┤
│ 1. AGENT ROUTING (if applicable)                                    │
│    • Resolve ProviderOverride via agentModels + agentRouting        │
│    • Uses: name → subagentType → default                            │
│    • Returns: { model, baseURL, apiKey } or null                    │
│                                                                     │
│ 2. SMART MODEL ROUTING (if enabled)                                 │
│    • Decide simple vs. strong based on input heuristics             │
│    • Uses: hasCode, hasKeyword, hasMultiParagraph, length, turn#    │
│    • Returns: { model (simple|strong), reason }                     │
│                                                                     │
│ 3. MAIN LOOP MODEL (fallback)                                       │
│    • Used when no routing applies                                   │
│    • Priority: /model > --model > env var > settings > default      │
│    • Returns: single global model string                            │
│                                                                     │
│ 4. GLOBAL PROVIDER                                                  │
│    • Used when no agent override applies                            │
│    • Set via env vars (CLAUDE_CODE_USE_OPENAI, etc.)                │
│    • Returns: API client config (baseURL, apiKey, etc.)             │
└─────────────────────────────────────────────────────────────────────┘
```

---

This comprehensive breakdown shows how OpenClaude's routing is **modular, declarative, and composable**—each layer can be independently configured without affecting others.