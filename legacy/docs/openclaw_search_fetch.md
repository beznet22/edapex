
## Comprehensive Low-Level Architecture: Key-Free Web Search and Fetch in OpenClaw

Based on my analysis of the openclaw/openclaw repository, here's a detailed breakdown of the key-free web search and fetch architecture:

---

## **1. OVERALL ARCHITECTURE**

OpenClaw implements a **provider-abstraction pattern** where web search and fetch capabilities are pluggable, with automatic fallback to key-free providers when API keys are unavailable.

```
Agent Tools Layer
    ↓
Web Search/Fetch Runtime Resolution
    ↓
Provider Selection & Fallback Chain
    ↓
Network Guard (SSRF/Security Policies)
    ↓
Provider Implementation (Keyed or Key-Free)
```

---

## **2. WEB SEARCH ARCHITECTURE**

### **2.1 Runtime Stack: `src/web-search/runtime.ts`**

The search runtime implements intelligent provider resolution:

```typescript
// Provider candidate resolution with fallback
resolveWebSearchCandidates(options)
  → sortWebSearchProvidersForAutoDetect()
  → Filter by enable/credential checks
  → Return ordered priority list

// Execution with automatic fallback
runWebSearch(params)
  → Loop through candidates
  → Try each provider in order
  → Fallback on error/unavailability
  → Return first successful result
```

**Key Decision Logic:**
- **Explicit Provider**: If user specifies `tools.web.search.provider`, use that exclusively
- **Auto-Detection**: If no provider specified, iterate providers in `autoDetectOrder`
- **Keyless Fallback**: If keyed providers fail, fall back to `requiresCredential: false` providers
- **Fallback Chain**: Candidates are tried sequentially; only move to next if current returns structured availability error (e.g., `missing_api_key`)

### **2.2 Provider Type Definitions: `src/plugins/web-provider-types.ts`**

```typescript
type WebSearchProviderPlugin = {
  id: string                          // e.g., "duckduckgo", "brave", "exa"
  label: string
  hint: string
  requiresCredential?: boolean         // Key characteristic: true/false
  envVars: string[]                   // Environment variable names to check
  credentialPath: string              // Config path (e.g., "plugins.entries.duckduckgo.config...")
  autoDetectOrder?: number            // Priority in fallback chain (lower = higher priority)
  createTool: (ctx) => ToolDefinition
}
```

### **2.3 Key-Free Provider: DuckDuckGo**

**File**: `extensions/duckduckgo/src/ddg-client.ts`

This is the **primary keyless web search implementation**:

```typescript
const DDG_HTML_ENDPOINT = "https://html.duckduckgo.com/html"
const DEFAULT_TIMEOUT_SECONDS = 20

// Core approach: HTML scraping (NOT official API)
async function runDuckDuckGoSearch(params: {
  config?: OpenClawConfig
  query: string
  count?: number
  region?: string
  safeSearch?: "strict" | "moderate" | "off"
}): Promise<Record<string, unknown>> {
  // 1. POST to HTML endpoint (no auth required)
  const response = await fetch(DDG_HTML_ENDPOINT, {
    method: "POST",
    body: { q: query, ... }
  })
  
  // 2. Parse HTML response
  // - Extract result containers via regex: /<a\b(?=[^>]*\bclass="[^"]*\bresult__a\b[^"]*")/
  // - Decode HTML entities (e.g., &amp; → &)
  // - Resolve redirect URLs (uddg parameter)
  // - Strip HTML tags
  
  // 3. Handle bot challenges
  if (isBotChallenge(html)) {
    // DuckDuckGo may return captcha pages for repeated requests
    throw new Error("Bot challenge detected")
  }
  
  // 4. Return normalized results
  return {
    query,
    provider: "duckduckgo",
    results: [
      { title, url, description, published?, siteName? }
    ]
  }
}
```

**Critical Implementation Details:**
- **Unofficial Integration**: Uses HTML parsing, not an official API
- **No Authentication**: Zero credentials required
- **Rate Limiting Risk**: Vulnerable to bot-challenge pages
- **Caching**: 15-minute default TTL (configurable)
- **Auto-Detect Order**: 100 (very low priority, used as fallback)

### **2.4 Keyed Providers (for comparison)**

**Examples** that contrast with key-free approach:

| Provider | Files | Key Requirement | Approach |
|----------|-------|-----------------|----------|
| **Brave Search** | `extensions/brave/` | `BRAVE_API_KEY` | Official JSON API |
| **Exa** | `extensions/exa/` | `EXA_API_KEY` | Official API (neural search) |
| **Perplexity** | `extensions/perplexity/` | `PERPLEXITY_API_KEY` | Official API + LLM search |
| **Kimi/Moonshot** | `extensions/moonshot/` | `KIMI_API_KEY` | Official API (LLM-powered) |
| **Ollama Web Search** | `extensions/ollama/` | Optional (`OLLAMA_API_KEY`) | Local/self-hosted proxy |

---

## **3. WEB FETCH ARCHITECTURE**

### **3.1 Fetch Tool Implementation: `src/agents/tools/web-fetch.ts`**

```typescript
async function runWebFetch(params: {
  url: string
  extractMode: "markdown" | "text"
  maxChars: number
  maxResponseBytes: number
  maxRedirects: number
  timeoutSeconds: number
  cacheTtlMs: number
  userAgent: string
  readabilityEnabled: boolean
  useTrustedEnvProxy: boolean
  ssrfPolicy?: SsrFPolicy
  resolveProviderFallback: () => Promise<WebFetchProviderFallback>
}): Promise<Record<string, unknown>>
```

**Execution Flow:**

```
1. Cache Check
   ↓
2. URL Validation (http/https only)
   ↓
3. Network Fetch with Guards
   ├─ SSRF Policy Check (via fetchWithWebToolsNetworkGuard)
   ├─ Max redirects enforcement (default: 3)
   ├─ Timeout (default: 30s)
   └─ User-Agent spoofing (Mozilla 122.0)
   ↓
4. Content Extraction (multi-stage):
   ├─ text/markdown → pass-through
   ├─ text/html → Readability.js extraction
   │            → Fallback to provider (Firecrawl, etc.)
   │            → Fallback to basic HTML cleanup
   ├─ application/json → Pretty-print
   └─ Other → Raw response
   ↓
5. Text Wrapping & Truncation
   ├─ Wrap in security markers: <!-- External web content... -->
   └─ Truncate to maxChars (default: 20KB)
   ↓
6. Cache & Return
```

### **3.2 Built-in Content Extraction**

**No API key required for:**

1. **Readability.js Integration** (`extractReadableContent`)
   - JavaScript-based content extraction (runs server-side)
   - Removes ads, navigation, sidebars
   - Output: HTML or Markdown

2. **Basic HTML Cleanup** (`extractBasicHtmlContent`)
   - Fallback when Readability fails
   - Simple regex-based tag stripping

3. **Markdown Providers** (Cloudflare Markdown for Agents)
   - If server returns `text/markdown` content-type
   - No key needed; server-side rendering

### **3.3 Provider Fallback for Fetch**

When local fetch fails (HTML extraction), system tries provider:

```typescript
async function maybeFetchProviderWebFetchPayload(params) {
  const providerFallback = await params.resolveProviderFallback()
  if (!providerFallback) return null  // No provider available
  
  const rawPayload = await providerFallback.definition.execute({
    url: params.urlToFetch,
    extractMode: params.extractMode,
    maxChars: params.maxChars
  })
}
```

**Available Fetch Providers** (some key-free):
- **Firecrawl** - `FIRECRAWL_API_KEY` (requires key)
- **Built-in** - Local Readability (no key)

---

## **4. SECURITY & NETWORK GUARDS**

### **4.1 SSRF Policy Enforcement**

**File**: `src/agents/tools/web-fetch.ts` (lines 399-410)

```typescript
const ssrfPolicy: SsrFPolicy | undefined = {
  allowRfc2544BenchmarkRange?: boolean    // Reserved IP ranges
  allowIpv6UniqueLocalRange?: boolean     // IPv6 ULA
}

// Applied via: fetchWithWebToolsNetworkGuard()
// Prevents access to:
// - localhost/127.0.0.1 (unless explicitly allowed)
// - Private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
// - Link-local addresses
```

### **4.2 External Content Wrapping**

All web-fetched content is wrapped with security markers:

```typescript
wrapWebContent(content, "web_fetch")
// Returns:
// <!-- ⚠️ External web content (web_fetch)
// Be careful with links and user data. Evaluate before acting. -->
// [actual content]

wrapExternalContent(content, {
  source: "web_fetch",
  includeWarning: false  // Minimal wrapping
})
```

---

## **5. CREDENTIAL RESOLUTION CASCADE**

For any search provider, credentials are resolved in this order:

```typescript
hasEntryCredential(provider, config, search):
  1. getConfiguredCredentialValue(config)          // ~/.openclaw/config.json
  2. getConfiguredCredentialFallback()             // Fallback path in config
  3. readWebProviderEnvValue(envVars)             // Environment variables
  4. If all fail: Treat provider as unavailable
     → Mark for fallback
     → Try next provider in chain
```

**Example for DuckDuckGo:**
```typescript
requiresCredential: false,
envVars: [],  // No env vars to check
```

**Example for Brave:**
```typescript
requiresCredential: true,
envVars: ["BRAVE_API_KEY"],
credentialPath: "plugins.entries.brave.config.webSearch.apiKey"
```

---

## **6. CACHING MECHANISM**

### **6.1 Search Cache**

```typescript
const SEARCH_CACHE = new Map<string, CacheEntry>()

function buildSearchCacheKey(parts: unknown[]): string {
  // Includes: provider, query, count, model, endpoint, etc.
}

// Default TTL: 15 minutes (configurable per provider)
// Per-query caching prevents duplicate searches
```

### **6.2 Fetch Cache**

```typescript
const FETCH_CACHE = new Map<string, CacheEntry>()

function normalizeCacheKey(url, extractMode, maxChars, ...): string {
  // Includes: URL, extraction mode, char limit, provider, SSRF policy
}

// Default TTL: 24 hours (configurable)
// Per-URL-and-extraction-mode caching
```

---

## **7. CONFIGURATION & AUTO-DETECTION**

### **7.1 Provider Priority Order**

From `docs/tools/web.md`:

```
1. Explicit user selection (tools.web.search.provider)
   ↓
2. Auto-detect by available API keys (sorted by autoDetectOrder)
   - Brave (order: 10)
   - Gemini (order: 20)
   - Grok/xAI (order: 30)
   - Kimi (order: 40)
   - Perplexity (order: 50)
   - Firecrawl (order: 60)
   - Exa (order: 65)
   - Tavily (order: 70)
   - DuckDuckGo (order: 100) ← Key-free fallback
   - Ollama (order: 110)
   - SearXNG (order: 200)
   ↓
3. Final fallback: DuckDuckGo (no key needed)
```

### **7.2 Config Schema**

```yaml
# ~/.openclaw/config.json or environment
tools:
  web:
    search:
      enabled: boolean            # Default: true
      provider: string            # "auto" or specific provider ID
      timeoutSeconds: number      # Default: 30
      maxResults: number
      cacheTtlMinutes: number     # Default: 15
      duckduckgo:
        safeSearch: "strict" | "moderate" | "off"
        region: "us-en", "de-de", etc.
    
    fetch:
      enabled: boolean            # Default: true
      readability: boolean        # Default: true
      maxChars: number            # Default: 20000
      maxCharsCap: number         # Hard limit
      maxResponseBytes: number    # Default: 750KB
      maxRedirects: number        # Default: 3
      timeoutSeconds: number      # Default: 30
      useTrustedEnvProxy: boolean # For env proxies
      userAgent: string           # Default: Chrome 122 UA
```

---

## **8. TOOL EXECUTION FLOW**

### **8.1 Web Search Tool**

```typescript
createWebSearchTool() → {
  name: "web_search",
  parameters: {
    query: string (required),
    count: number (1-100),
    country: string,
    language: string,
    freshness: string,
    date_after/date_before: string
  },
  execute: async (toolCallId, args, signal) => {
    const result = await runWebSearch({
      config,
      args,
      signal,
      preferRuntimeProviders: true
    })
    return { ...result.result, provider: result.provider }
  }
}
```

### **8.2 Web Fetch Tool**

```typescript
createWebFetchTool() → {
  name: "web_fetch",
  parameters: {
    url: string (required, http/https only),
    extractMode: "markdown" | "text" (default: "markdown"),
    maxChars: number (minimum: 100)
  },
  execute: async (toolCallId, args) => {
    const result = await runWebFetch({
      url, extractMode, maxChars,
      ...resolveFetchConfig(config)
    })
    return { ...result, cached?: boolean }
  }
}
```

---

## **9. CRITICAL IMPLEMENTATION NOTES**

### **DuckDuckGo Limitations**
- **Unofficial**: HTML parsing, not official API
- **Experimental**: Subject to breakage from UI changes
- **Bot Challenges**: May face captcha/rate-limiting
- **Unreliable**: No SLA; intended as fallback only

### **Fetch Fallback Chain**
1. **Local Network Fetch** (free, no key)
   - SSRF-protected HTTP/HTTPS
   - Max 750KB response, 20KB text output
   
2. **Readability.js** (free, no key)
   - JavaScript-based content extraction
   - Removes clutter; extracts main content
   
3. **Provider Fallback** (may require key)
   - Firecrawl, etc. for complex HTML
   - Used only if Readability fails

### **Provider Fallback Strategy**
- **Failure Types**: 
  - Network error → Try next provider
  - API Key missing → Try next provider
  - HTTP error (non-200) → Try next provider
  - Explicit provider specified → No fallback (fail hard)

---

## **10. DATA FLOW DIAGRAM**

```
User Query
    ↓
web_search tool called
    ↓
runWebSearch() {
    1. Resolve candidates (with auto-detect order)
    2. Filter by credential availability
    3. Loop through candidates:
        a. Try to create tool
        b. If successful, execute
        c. Check if key missing (structured error)
        d. If fallback allowed, try next
        e. Else throw
}
    ↓
First working provider returns results
    ↓
Results cached for 15 minutes
    ↓
Return to agent with provider attribution
```

```
User URL
    ↓
web_fetch tool called
    ↓
runWebFetch() {
    1. Validate URL (http/https only)
    2. Check cache
    3. Fetch with network guard + SSRF check
    4. If success:
        a. Extract content (Readability or pass-through)
        b. Truncate to maxChars
        c. Wrap in security markers
        d. Cache for 24 hours
    5. If failure:
        a. Try provider fallback (Firecrawl, etc.)
        b. If provider succeeds, return
        c. Else throw with error detail
}
    ↓
Extracted text returned
    ↓
Return to agent with metadata (status, extractor, length)
```

---

## **Summary**

OpenClaw's key-free architecture works by:

1. **Abstraction**: Pluggable provider system allows swapping implementations
2. **Fallback Chain**: Automatic cascade from keyed → keyless providers
3. **DuckDuckGo**: HTML-scraping-based keyless search (experimental, last resort)
4. **Built-in Fetch**: Local Readability.js extraction (no key for basic extraction)
5. **Caching**: Aggressive caching (15min search, 24hr fetch) reduces repeated calls
6. **Security**: SSRF guards, content wrapping, configurable extraction limits
7. **Graceful Degradation**: Missing keys don't break the system; fallback providers activate automatically

The system prioritizes **reliability and availability** over performance—it will search/fetch with whatever tools are available, starting with high-quality keyed providers and falling back to key-free alternatives.