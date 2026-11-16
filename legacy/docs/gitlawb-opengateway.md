# **Complete Low-Level Technical Specification for Gitlawb Opengateway Integration**

## **Table of Contents**
1. [Gateway Architecture](#gateway-architecture)
2. [Authentication & Headers](#authentication--headers)
3. [Request/Response Protocols](#requestresponse-protocols)
4. [Model Specifications & Capabilities](#model-specifications--capabilities)
5. [Transport Layer Configuration](#transport-layer-configuration)
6. [Error Handling & Retry Logic](#error-handling--retry-logic)
7. [Implementation Checklist](#implementation-checklist)
8. [Code Examples](#code-examples)

---

## **Gateway Architecture**

### **Core Properties**

```typescript
{
  id: 'gitlawb-opengateway',
  label: 'Gitlawb Opengateway',
  category: 'aggregating',
  vendorId: 'openai',  // Implements OpenAI-compatible API
  supportsModelRouting: true,
  
  // Gateway endpoint URLs (supports both)
  primaryEndpoint: 'https://opengateway.gitlawb.com/v1',
  fallbackEndpoint: 'https://opengateway.fly.dev/v1',  // Geographic fallback
  
  // Request routing behavior
  routingStrategy: 'model_name_based',
  // mimo-v2.5-pro → Xiaomi MiMo provider
  // google/* → Google/GMI Cloud provider
  // zai-org/* → Zhipu AI GLM provider
}
```

### **Critical URL Normalization Rules**

```typescript
// The gateway normalizes these URLs to the same canonical form
const normalizedUrls = [
  'https://opengateway.gitlawb.com/v1',
  'https://opengateway.gitlawb.com/v1/',
  'https://opengateway.gitlawb.com/v1/xiaomi-mimo',  // becomes /v1
  'https://opengateway.gitlawb.com/v1/gmi-cloud',    // becomes /v1
  'https://opengateway.fly.dev/v1',
]

// All resolve to: 'https://opengateway.gitlawb.com/v1'
```

---

## **Authentication & Headers**

### **Security Properties**

```typescript
{
  requiresAuth: false,
  authMode: 'none',
  
  // Optional header if user provides it (not validated)
  defaultAuthHeader: {
    name: 'api-key',
    scheme: 'raw',  // NOT 'Bearer'
  },
  
  // These auth-related env vars are checked but not enforced
  apiKeyEnvVars: ['OPENAI_API_KEY'],
  baseUrlEnvVars: ['OPENGATEWAY_BASE_URL', 'OPENAI_BASE_URL'],
  modelEnvVars: ['OPENAI_MODEL'],
}
```

### **Complete Request Headers**

```typescript
// MINIMAL REQUIRED (gateway accepts even without these)
{
  'Content-Type': 'application/json',
}

// RECOMMENDED HEADERS (OpenClaude sends these)
{
  'Content-Type': 'application/json',
  'api-key': 'anything',  // Optional, value not validated
  'x-app': 'cli',
  'User-Agent': 'OpenClaude/1.0',
  'X-Claude-Code-Session-Id': '<unique-session-id>',
}

// HEADERS THAT WILL BE STRIPPED BY GATEWAY (filtered out)
{
  // These are auto-filtered to prevent credential leakage
  'x-anthropic-*',        // Any header starting with this
  'anthropic-*',          // Any header starting with this
  'x-claude-*',           // Any header starting with this
  'x-api-key',            // Explicitly stripped
  'authorization',        // Explicitly stripped
}
```

### **Header Construction Logic (Pseudo-Code)**

```python
def build_headers(api_key=None, custom_auth_header=None, custom_auth_scheme=None):
    headers = {
        'Content-Type': 'application/json'
    }
    
    if api_key:
        if custom_auth_header and is_valid_header_name(custom_auth_header):
            # Custom auth header like 'x-api-key'
            if custom_auth_scheme == 'bearer':
                headers[custom_auth_header] = f'Bearer {api_key}'
            else:
                headers[custom_auth_header] = api_key
        else:
            # Default: use 'api-key' with raw scheme (NO Bearer prefix)
            headers['api-key'] = api_key
    
    return headers
```

---

## **Request/Response Protocols**

### **Endpoint: `/chat/completions`**

**Method:** `POST`  
**Content-Type:** `application/json`  
**Protocol:** HTTP/1.1 or HTTP/2

### **Request Body Schema**

```typescript
interface ChatCompletionRequest {
  // REQUIRED
  model: string;  // See Model IDs table below
  messages: Array<{
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string | Array<ContentBlock>;
    tool_call_id?: string;  // Required if role is 'tool'
    name?: string;
  }>;

  // OPTIONAL - Control parameters
  stream?: boolean;  // Default: false
  temperature?: number;  // 0.0 - 2.0 (default: 1.0)
  top_p?: number;  // 0.0 - 1.0 (default: 1.0)
  
  // CRITICAL: Use 'max_completion_tokens' NOT 'max_tokens'
  max_completion_tokens?: number;  // Default: model's max
  
  // Optional features
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: JSONSchema;  // {type: 'object', properties: {...}}
      strict?: boolean;  // Some models support strict schema validation
    };
  }>;
  
  tool_choice?: 'auto' | 'none' | {
    type: 'function';
    function: { name: string };
  };

  // Internal (usually omitted)
  store?: boolean;  // Default: false
  stream_options?: { include_usage: true };  // For streaming
}

interface ContentBlock {
  type: 'text' | 'image_url';
  text?: string;  // For text blocks
  image_url?: { url: string };  // For image blocks
}
```

### **Response Body Schema (Non-Streaming)**

```typescript
interface ChatCompletionResponse {
  id: string;  // Unique completion ID
  object: 'chat.completion';
  created: number;  // Unix timestamp
  model: string;  // Echoes the requested model
  
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string | null;
      reasoning_content?: string;  // For reasoning models
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;  // JSON string, NOT parsed object
        };
      }>;
    };
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  }>;

  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
  };
}
```

### **Streaming Response (Server-Sent Events)**

When `stream: true`, the response is streaming newline-delimited JSON:

```
HTTP/1.1 200 OK
Transfer-Encoding: chunked
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1715123456,"model":"mimo-v2.5-pro","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1715123456,"model":"mimo-v2.5-pro","choices":[{"index":0,"delta":{"content":" there"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1715123456,"model":"mimo-v2.5-pro","choices":[{"index":0,"delta":{"content":"!"},"finish_reason":"stop"}]}

data: [DONE]
```

### **Stream Chunk Parser**

```typescript
// Pseudo-code for parsing SSE
async function* parseStream(response: Response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';  // Keep incomplete line

      for (const line of lines) {
        const trimmed = line.trim();
        
        // Skip empty lines and the [DONE] sentinel
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        
        // Parse 'data: {...}' format
        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6);
          try {
            const chunk = JSON.parse(jsonStr);
            yield chunk;
          } catch (e) {
            console.error('Failed to parse chunk:', e);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
```

---

## **Model Specifications & Capabilities**

### **Full Model Catalog**

#### **Xiaomi MiMo Models (5 variants)**

```typescript
const XIAOMI_MIMO_MODELS = {
  'mimo-v2.5-pro': {
    apiName: 'mimo-v2.5-pro',
    classification: ['chat', 'reasoning', 'coding'],
    contextWindow: 1_000_000,  // 1M tokens
    maxOutputTokens: 128_000,
    capabilities: {
      supportsStreaming: true,
      supportsFunctionCalling: true,
      supportsJsonMode: true,
      supportsReasoning: true,
      supportsVision: false,
      supportsPreciseTokenCount: false,
    },
    tier: 'flagship',
    description: 'Latest flagship model with 1M context',
    estimatedCostPerMTok: {
      input: 0.0,
      output: 0.0,
    },
  },
  
  'mimo-v2-pro': {
    apiName: 'mimo-v2-pro',
    classification: ['chat', 'reasoning', 'coding'],
    contextWindow: 1_000_000,
    maxOutputTokens: 128_000,
    capabilities: {
      supportsStreaming: true,
      supportsFunctionCalling: true,
      supportsJsonMode: true,
      supportsReasoning: true,
      supportsVision: false,
      supportsPreciseTokenCount: false,
    },
    tier: 'pro',
    description: 'Previous generation professional model',
  },
  
  'mimo-v2.5': {
    apiName: 'mimo-v2.5',
    classification: ['chat', 'reasoning', 'vision', 'coding'],
    contextWindow: 1_000_000,
    maxOutputTokens: 128_000,
    capabilities: {
      supportsStreaming: true,
      supportsFunctionCalling: true,
      supportsJsonMode: true,
      supportsReasoning: true,
      supportsVision: true,  // ← KEY DIFFERENCE: includes vision
      supportsPreciseTokenCount: false,
    },
    tier: 'flagship_vision',
    description: 'Flagship model with multimodal (vision) support',
  },
  
  'mimo-v2-omni': {
    apiName: 'mimo-v2-omni',
    classification: ['chat', 'reasoning', 'vision', 'coding'],
    contextWindow: 256_000,  // 256K (vs 1M for v2.5)
    maxOutputTokens: 128_000,
    capabilities: {
      supportsStreaming: true,
      supportsFunctionCalling: true,
      supportsJsonMode: true,
      supportsReasoning: true,
      supportsVision: true,
      supportsPreciseTokenCount: false,
    },
    tier: 'omni',
    description: 'Balanced multimodal model with 256K context',
  },
  
  'mimo-v2-flash': {
    apiName: 'mimo-v2-flash',
    classification: ['chat', 'reasoning', 'coding'],
    contextWindow: 256_000,  // 256K
    maxOutputTokens: 64_000,  // Lower max output vs Pro models
    capabilities: {
      supportsStreaming: true,
      supportsFunctionCalling: true,
      supportsJsonMode: true,
      supportsReasoning: true,
      supportsVision: false,
      supportsPreciseTokenCount: false,
    },
    tier: 'speed',
    description: 'Fast inference model optimized for speed',
  },
}
```

#### **Google Gemini Models (via GMI Cloud)**

```typescript
const GOOGLE_GEMINI_MODELS = {
  'google/gemini-3.1-flash-lite-preview': {
    apiName: 'google/gemini-3.1-flash-lite-preview',
    displayName: 'Gemini 3.1 Flash Lite Preview',
    classification: ['chat', 'reasoning', 'vision', 'coding'],
    contextWindow: 1_048_576,  // 1M tokens
    maxOutputTokens: 65_536,
    capabilities: {
      supportsStreaming: true,
      supportsFunctionCalling: true,
      supportsJsonMode: true,
      supportsReasoning: true,
      supportsVision: true,
      supportsPreciseTokenCount: false,
    },
    tier: 'lite',
    provider: 'google',
    availableThroughGateway: true,
  },
}
```

#### **Zhipu GLM-5 Models (via GMI Cloud)**

```typescript
const ZHIPU_GLM_MODELS = {
  'zai-org/GLM-5.1-FP8': {
    apiName: 'zai-org/GLM-5.1-FP8',
    displayName: 'GLM 5.1 FP8',
    classification: ['chat', 'reasoning', 'coding'],
    contextWindow: 202_752,  // 200K tokens
    maxOutputTokens: 131_072,  // 128K max output
    capabilities: {
      supportsStreaming: true,
      supportsFunctionCalling: true,
      supportsJsonMode: true,
      supportsReasoning: true,  // Includes chain-of-thought
      supportsVision: false,
      supportsPreciseTokenCount: false,
    },
    reasoningCapability: {
      enabled: true,
      chainOfThoughtInReasoningContent: true,  // Reasoning output appears in `reasoning_content` field
      detailedThinking: true,
    },
    tier: 'reasoning',
    provider: 'zhipu',
    availableThroughGateway: true,
  },
}
```

### **Capability Matrix**

```
Model                                Vision  Streaming  Functions  JSON   Reasoning  Context    Max Out
─────────────────────────────────────────────────────────────────────────────────────────────────────
mimo-v2.5-pro                          ✗       ✓         ✓         ✓       ✓       1,000K      128K
mimo-v2-pro                            ✗       ✓         ✓         ✓       ✓       1,000K      128K
mimo-v2.5                              ✓       ✓         ✓         ✓       ✓       1,000K      128K
mimo-v2-omni                           ✓       ✓         ✓         ✓       ✓         256K      128K
mimo-v2-flash                          ✗       ✓         ✓         ✓       ✓         256K       64K
google/gemini-3.1-flash-lite           ✓       ✓         ✓         ✓       ✓       1,048K       65K
zai-org/GLM-5.1-FP8                    ✗       ✓         ✓         ✓       ✓         202K      131K
```

---

## **Transport Layer Configuration**

### **OpenAI Shim Configuration**

```typescript
const OPENGATEWAY_TRANSPORT_CONFIG = {
  kind: 'openai-compatible',
  
  // Authentication handling
  defaultAuthHeader: {
    name: 'api-key',
    scheme: 'raw',  // Send as-is, NOT as "Bearer <value>"
  },
  supportsAuthHeaders: false,  // User can't customize auth header
  
  // Request body normalization
  maxTokensField: 'max_completion_tokens',  // NOT 'max_tokens'
  removeBodyFields: [],  // Don't strip any standard fields
  
  // Response interpretation
  preserveReasoningContent: true,  // Keep reasoning_content from GLM-5
  requireReasoningContentOnAssistantMessages: true,  // Mandatory for tool calls
  reasoningContentFallback: '',  // Empty string if reasoning is missing
  
  // Thinking tag handling
  thinkingRequestFormat: 'none',  // Gateway doesn't support explicit thinking requests
  
  // API format flexibility
  supportsApiFormatSelection: false,  // Only /chat/completions, no /responses
  
  // No custom headers per-model
  headers: {},
}
```

### **Transport Decision Tree**

```
if (baseUrl.includes('opengateway.gitlawb.com')) {
  transport = 'chat_completions'
  
  // The /chat/completions endpoint handles all models
  // Gateway internally routes based on model name:
  // - mimo-* → Xiaomi MiMo internal routing
  // - google/* → GMI Cloud routing
  // - zai-org/* → Zhipu AI routing
} else {
  // Standard OpenAI-compatible provider
  transport = 'chat_completions'
}
```

---

## **Error Handling & Retry Logic**

### **HTTP Status Codes**

```typescript
const HTTP_STATUS_HANDLERS = {
  200: { action: 'PROCESS_RESPONSE', retryable: false },
  201: { action: 'PROCESS_RESPONSE', retryable: false },
  400: {
    action: 'PARSE_ERROR_AND_FAIL',
    retryable: false,
    commonCauses: [
      'Invalid model name',
      'Malformed JSON in request',
      'Tool schema validation failed',
      'Unsupported field in request',
    ],
  },
  401: {
    action: 'AUTH_ERROR',
    retryable: false,
    cause: 'Invalid or expired API key (though gateway doesn\'t validate)',
  },
  403: {
    action: 'PERMISSION_ERROR',
    retryable: false,
    cause: 'Insufficient permissions or rate limit reached',
  },
  429: {
    action: 'RATE_LIMIT',
    retryable: true,
    strategy: 'exponential_backoff',
    initialDelayMs: 1000,
    maxDelayMs: 32000,
    maxRetries: 3,
  },
  500: {
    action: 'SERVER_ERROR',
    retryable: true,
    strategy: 'exponential_backoff',
    maxRetries: 3,
  },
  502: {
    action: 'BAD_GATEWAY',
    retryable: true,
    cause: 'Upstream provider temporarily unavailable',
  },
  503: {
    action: 'SERVICE_UNAVAILABLE',
    retryable: true,
    strategy: 'exponential_backoff',
  },
}
```

### **Retry Strategy (Exponential Backoff)**

```typescript
function calculateBackoffDelay(
  attempt: number,
  baseDelayMs: number = 1000,
  maxDelayMs: number = 32000,
  jitter: boolean = true
): number {
  let delay = baseDelayMs * Math.pow(2, attempt);
  delay = Math.min(delay, maxDelayMs);
  
  if (jitter) {
    // Add ±20% random jitter
    const jitterAmount = delay * 0.2;
    delay += Math.random() * jitterAmount - jitterAmount / 2;
  }
  
  return Math.floor(delay);
}

// Example retry sequence:
// Attempt 0: Wait 1000ms  (or ~800-1200 with jitter)
// Attempt 1: Wait 2000ms  (or ~1600-2400 with jitter)
// Attempt 2: Wait 4000ms  (or ~3200-4800 with jitter)
// Attempt 3: Wait 8000ms  (or ~6400-9600 with jitter)
```

### **Common Error Messages**

```typescript
const ERROR_CATEGORIES = {
  INVALID_MODEL: {
    pattern: /model.*not.*found|unknown.*model|invalid.*model/i,
    action: 'VALIDATE_MODEL_ID',
    validModels: ['mimo-v2.5-pro', 'mimo-v2-pro', '...'],
  },
  
  TOOL_SCHEMA_ERROR: {
    pattern: /tool|function|schema/i,
    action: 'VALIDATE_TOOL_DEFINITIONS',
    commonIssues: [
      'Missing "required" array in parameters',
      'Schema has properties not in "required" array',
      'Circular references in schema',
    ],
  },
  
  RATE_LIMIT: {
    pattern: /429|too.*many|rate.*limit/i,
    action: 'BACKOFF_AND_RETRY',
  },
  
  TIMEOUT: {
    pattern: /timeout|ECONNRESET|ETIMEDOUT/i,
    action: 'RETRY_WITH_LONGER_TIMEOUT',
    timeoutMs: 120_000,  // 2 minutes max
  },
}
```

---

## **Transport Layer Specifics**

### **Streaming Timeout Behavior**

```typescript
const STREAM_BEHAVIOR = {
  // How long to wait without receiving data before giving up
  IDLE_TIMEOUT_MS: 120_000,  // 2 minutes
  
  // What happens if idle:
  onIdleTimeout: 'THROW_ERROR',
  errorMessage: 'Stream idle for {elapsed}s. Connection likely dropped.',
  
  // The server should send at least one chunk every 2 minutes
  // If no data arrives within this window, the connection is considered dead
}
```

### **Streaming Usage Tracking**

```typescript
if (stream === true) {
  // For streaming responses, usage data comes inline with chunks
  // NOT as a separate HTTP header
  
  // Usage chunks appear as:
  {
    "choices": [
      {
        "delta": { ... },
        "finish_reason": null
      }
    ],
    "usage": {  // ← This appears in some chunks
      "prompt_tokens": 25,
      "completion_tokens": 10,
      "total_tokens": 35
    }
  }
  
  // The last chunk contains final usage stats
  // Aggregate all usage chunks to get total
}
```

### **Abort/Cancellation Handling**

```typescript
// For fetch() with AbortSignal:
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30000);

try {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: controller.signal,  // Cancellable
  });
} catch (err) {
  if (err.name === 'AbortError') {
    // User cancelled or timeout fired
    clearTimeout(timeoutId);
    throw new CancellationError();
  }
}
```

---

## **Implementation Checklist**

### **Phase 1: Core Setup**

- [ ] Create HTTP client with configurable base URL
  - Primary: `https://opengateway.gitlawb.com/v1`
  - Fallback: `https://opengateway.fly.dev/v1` (optional)

- [ ] Implement URL normalization
  ```typescript
  // Strip trailing slashes
  // Normalize /v1/xiaomi-mimo → /v1
  // Normalize /v1/gmi-cloud → /v1
  ```

- [ ] Setup request builder
  - Required fields: `model`, `messages`
  - Optional: `stream`, `temperature`, `top_p`, `max_completion_tokens`, `tools`
  - Field normalization: `max_tokens` → `max_completion_tokens`

- [ ] Build header constructor
  - Always include: `Content-Type: application/json`
  - Optional: `api-key: <anything>` (not validated by gateway)
  - Strip: auth-related headers for security

### **Phase 2: Response Handling**

- [ ] Non-streaming response parser
  ```typescript
  // Parse JSON response
  // Extract: choices[0].message.content
  // Extract usage: prompt_tokens, completion_tokens
  // Handle errors: choice.finish_reason
  ```

- [ ] Streaming response parser (SSE)
  ```typescript
  // Parse "data: {...}" lines
  // Aggregate `delta.content` chunks
  // Detect "[DONE]" sentinel
  // Extract final usage from last chunks
  ```

- [ ] Reason content extraction (for GLM-5)
  ```typescript
  // If reasoning_content field exists
  // Emit as separate "thinking" block
  // Keep separate from main text content
  ```

### **Phase 3: Tool Calling**

- [ ] Tool schema validator
  ```typescript
  // Validate tool definitions:
  // - function.name is required
  // - function.parameters must be valid JSON schema
  // - additionalProperties should be false (for strict providers)
  // - All properties in "properties" should be in "required" (optional)
  ```

- [ ] Tool call parser
  ```typescript
  // Parse tool_calls from response
  // Extract: id, function.name, function.arguments (JSON string)
  // Parse arguments JSON
  ```

- [ ] Tool result submission
  ```typescript
  // New message with role: 'tool'
  // tool_call_id: <matching ID>
  // content: <tool output>
  ```

### **Phase 4: Retry & Error Handling**

- [ ] Implement exponential backoff for 429/5xx
- [ ] Add stream idle timeout (120 seconds)
- [ ] Parse error messages and categorize
- [ ] Implement request cancellation via AbortSignal
- [ ] Log all API calls for debugging

### **Phase 5: Model Support**

- [ ] Create model catalog with all 7 models
- [ ] Implement capability checking per model
- [ ] Add model-specific parameter validation
- [ ] Document context window limits

### **Phase 6: Streaming Optimization**

- [ ] Use ReadableStream for memory efficiency
- [ ] Implement streaming backpressure handling
- [ ] Track token usage across chunks
- [ ] Support streaming cancellation

---

## **Code Examples**

### **Complete Request Implementation (TypeScript)**

```typescript
interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_call_id?: string;
}

interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

async function callOpengateway(options: {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_completion_tokens?: number;
  tools?: ToolDefinition[];
  signal?: AbortSignal;
}): Promise<Response> {
  const baseUrl = 'https://opengateway.gitlawb.com/v1';
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'api-key': 'dummy-key-not-validated',  // Gateway accepts any value
  };

  const body = {
    model: options.model,
    messages: options.messages,
    stream: options.stream ?? false,
    
    // IMPORTANT: Use max_completion_tokens, NOT max_tokens
    max_completion_tokens: options.max_completion_tokens ?? 2048,
    
    ...(options.temperature !== undefined && {
      temperature: options.temperature,
    }),
    
    ...(options.tools && options.tools.length > 0 && {
      tools: options.tools,
      tool_choice: 'auto',
    }),
  };

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error ${response.status}: ${error}`);
  }

  return response;
}
```

### **Streaming Response Parser**

```typescript
async function* parseStreamingResponse(
  response: Response
): AsyncGenerator<{
  type: 'delta' | 'tool_call' | 'done';
  content?: string;
  toolCall?: { id: string; name: string; arguments: string };
  usage?: { prompt_tokens: number; completion_tokens: number };
}> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lastDataTime = Date.now();

  const IDLE_TIMEOUT_MS = 120_000;

  try {
    while (true) {
      // Read with timeout
      const readPromise = reader.read();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          const elapsed = Math.round((Date.now() - lastDataTime) / 1000);
          reject(
            new Error(
              `Stream idle for ${elapsed}s (limit: ${IDLE_TIMEOUT_MS / 1000}s)`
            )
          );
        }, IDLE_TIMEOUT_MS);
      });

      const { done, value } = (await Promise.race([
        readPromise,
        timeoutPromise,
      ])) as ReadableStreamReadResult<Uint8Array>;

      if (done) break;

      lastDataTime = Date.now();
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';  // Keep incomplete line

      for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const chunk = JSON.parse(trimmed.slice(6));

          // Check for usage data
          if (chunk.usage) {
            yield {
              type: 'done',
              usage: {
                prompt_tokens: chunk.usage.prompt_tokens,
                completion_tokens: chunk.usage.completion_tokens,
              },
            };
          }

          // Check for content delta
          const delta = chunk.choices?.[0]?.delta;
          if (!delta) continue;

          if (delta.content) {
            yield {
              type: 'delta',
              content: delta.content,
            };
          }

          // Check for tool calls
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (tc.id && tc.function?.name) {
                yield {
                  type: 'tool_call',
                  toolCall: {
                    id: tc.id,
                    name: tc.function.name,
                    arguments: tc.function.arguments ?? '',
                  },
                };
              }
            }
          }
        } catch (e) {
          console.error('Failed to parse chunk:', e);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
```

### **Tool Validation**

```typescript
function validateToolSchema(tool: ToolDefinition): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate function name
  if (!tool.function.name || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tool.function.name)) {
    errors.push('Function name must be alphanumeric with underscores');
  }

  // Validate parameters
  const params = tool.function.parameters;
  if (params.type !== 'object') {
    errors.push('Parameters must be of type "object"');
  }

  if (!params.properties || typeof params.properties !== 'object') {
    errors.push('Parameters must have a "properties" object');
  }

  // Check required fields
  const requiredFields = params.required ?? [];
  const propertyKeys = Object.keys(params.properties || {});

  for (const required of requiredFields) {
    if (!propertyKeys.includes(required)) {
      errors.push(
        `Required field "${required}" not found in properties`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
```

### **Model Capability Checking**

```typescript
const MODEL_CAPABILITIES: Record<string, {
  contextWindow: number;
  maxOutputTokens: number;
  supportsVision: boolean;
  supportsReasoning: boolean;
}> = {
  'mimo-v2.5-pro': {
    contextWindow: 1_000_000,
    maxOutputTokens: 128_000,
    supportsVision: false,
    supportsReasoning: true,
  },
  'mimo-v2.5': {
    contextWindow: 1_000_000,
    maxOutputTokens: 128_000,
    supportsVision: true,
    supportsReasoning: true,
  },
  'google/gemini-3.1-flash-lite-preview': {
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    supportsVision: true,
    supportsReasoning: true,
  },
  'zai-org/GLM-5.1-FP8': {
    contextWindow: 202_752,
    maxOutputTokens: 131_072,
    supportsVision: false,
    supportsReasoning: true,
  },
};

function validateRequest(
  model: string,
  request: { max_completion_tokens?: number; tools?: unknown[] }
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const caps = MODEL_CAPABILITIES[model];

  if (!caps) {
    errors.push(`Unknown model: ${model}`);
    return { valid: false, errors };
  }

  if (
    request.max_completion_tokens &&
    request.max_completion_tokens > caps.maxOutputTokens
  ) {
    errors.push(
      `max_completion_tokens ${request.max_completion_tokens} exceeds model limit ${caps.maxOutputTokens}`
    );
  }

  if (request.tools && !model.includes('mimo') && !model.includes('gemini') && !model.includes('glm')) {
    errors.push(`Model ${model} does not support tool calling`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
```

---

## **Testing Checklist**

```typescript
describe('Gitlawb Opengateway Integration', () => {
  describe('Basic Chat Completion', () => {
    test('should handle simple text-only request', async () => {
      const response = await callOpengateway({
        model: 'mimo-v2.5-pro',
        messages: [{ role: 'user', content: 'Hello' }],
      });
      expect(response.status).toBe(200);
    });

    test('should respect max_completion_tokens', async () => {
      // Verify request uses max_completion_tokens field
      // Verify response has usage.completion_tokens
    });
  });

  describe('Streaming', () => {
    test('should parse SSE stream chunks', async () => {
      const response = await callOpengateway({
        model: 'mimo-v2.5-pro',
        messages: [{ role: 'user', content: 'Count to 3' }],
        stream: true,
      });

      let chunks = 0;
      for await (const chunk of parseStreamingResponse(response)) {
        chunks++;
      }
      expect(chunks).toBeGreaterThan(0);
    });

    test('should handle stream timeout', async () => {
      // Test that idle connections timeout after 120s
    });
  });

  describe('Tool Calling', () => {
    test('should submit tools in request', async () => {
      const response = await callOpengateway({
        model: 'mimo-v2.5-pro',
        messages: [{ role: 'user', content: 'What is 2+2?' }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'add',
              description: 'Add two numbers',
              parameters: {
                type: 'object',
                properties: {
                  a: { type: 'number' },
                  b: { type: 'number' },
                },
                required: ['a', 'b'],
              },
            },
          },
        ],
      });
      expect(response.status).toBe(200);
    });
  });

  describe('Model-Specific Behavior', () => {
    test('GLM-5.1 should return reasoning_content', async () => {
      const response = await callOpengateway({
        model: 'zai-org/GLM-5.1-FP8',
        messages: [{ role: 'user', content: 'Think step by step' }],
      });
      const data = await response.json();
      expect(data.choices[0].message.reasoning_content).toBeDefined();
    });

    test('mimo-v2.5 should accept vision inputs', async () => {
      // Test with image_url in messages
    });
  });

  describe('Error Handling', () => {
    test('should retry on 429 (rate limit)', async () => {
      // Mock 429 response, verify exponential backoff
    });

    test('should fail immediately on 400', async () => {
      // Invalid request should not retry
    });
  });
});
```

---

## **Performance Optimization Tips**

```typescript
// 1. Connection Pooling
const http = require('http');
const https = require('https');
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 10 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 10 });

// 2. Request Batching
// Don't send multiple chat/completions in parallel without rate limiting

// 3. Stream Processing
// Process chunks as they arrive, don't buffer entire response

// 4. Token Budget Tracking
function trackTokenUsage(usage: { prompt_tokens: number; completion_tokens: number }) {
  const totalUsed = usage.prompt_tokens + usage.completion_tokens;
  if (totalUsed > MODEL_CAPABILITIES[model].contextWindow * 0.9) {
    warn(`Approaching context limit: ${totalUsed}/${MODEL_CAPABILITIES[model].contextWindow}`);
  }
}

// 5. Caching
// Cache model catalog info (models list, capabilities)
// Don't cache chat responses (they're not deterministic)
```