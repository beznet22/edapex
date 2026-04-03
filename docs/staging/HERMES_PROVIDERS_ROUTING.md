# Staging: Hermes AI Providers, Routing & Fallback Integration

Establishing a resilient, cost-optimized multi-LLM gateway for EdApex V2.

## 1. Multi-Provider Registry
EdApex moves from hardcoded switching to a registry-based provider system.

- **Primary Providers**:
  - `workers-ai`: Default for latency and cost (Edge native).
  - `openai`: Default for high-reasoning tasks.
  - `anthropic`: Backup for high-reasoning.
- **Secondary/Local Providers**:
  - `ollama`: For self-hosted Stress Labs or VPS deployments.
  - `openrouter`: For access to niche models with unified billing.

## 2. Smart Routing Strategy
Implementing the Hermes routing logic within the `AiOrchestrator`:
- **Sort by Cost (`sort: "price"`)**: default for background tasks.
- **Sort by Latency (`sort: "latency"`)**: default for interactive chat.
- **Constraint Handling**: Use `only` or `ignore` to enforce data residency (e.g., "only use EU-based providers for German tenants").

## 3. Automatic Failover (Resilience)
If a primary model request fails (429, 500, or timeout), the Orchestrator executes an immediate **Mid-Session Swap**:

- **Failover Chain**: `Workers AI (Llama 3.1)` -> `OpenAI (GPT-4o-mini)` -> `Anthropic (Haiku)`.
- **State Retention**: The conversation context is passed to the fallback provider without requiring a user retry.

## 4. API Gateway (Interoperability)
Exposing the EdApex HMAS ecosystem as an OpenAI-compatible API.

- **Endpoint**: `/v1/chat/completions` (authenticated via Tenant API Key).
- **Benefit**: Students or Teachers can use the "EdApex Agent" as a backend for third-party tools like **Cursor**, **Zed**, or custom educational dashboards.

## 5. IMPACT: Strategic Registry
Update `src/services/ai/strategy/registry.ts` to include a `providers` block for each agent:
```typescript
{
  id: 'homeschool-supervisor',
  providers: {
    primary: 'openai/gpt-4o',
    fallback: 'anthropic/claude-3-5-sonnet',
    auxiliary: 'workers-ai/llama-3.1-8b'
  }
}
```
