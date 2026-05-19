# EdApex Agent Routing Specification

## 1. Overview
The **Agent Routing Engine** is the intelligence layer responsible for mapping high-level personas (Supervisor, Assistant, Default) or specific tasks (Extraction, Reasoning) to concrete LLM models provided by OpenAI, Anthropic, or DeepSeek. It replaces the legacy task-based routing with a persona-driven architecture that prioritizes cost-efficiency without sacrificing quality.

## 2. Core Personas
The system operates through three primary personas, each resolved via the `agent_routing` table in libSQL.

| Persona | Primary Goal | Model Requirement | Default Profile |
|---------|--------------|-------------------|-----------------|
| **Supervisor** | Intent classification & routing | High reasoning (Smart Switching) | Strong |
| **Assistant** | General conversation & skill execution | Balanced performance | Balanced |
| **Default** | Fallback generic chat | Cost-efficiency | Simple |

## 3. Smart Switching (Strong vs Simple)
To optimize performance and cost, the router utilizes a "Strong vs Simple" logic based on the user's selected provider profile.

- **Strong Models**: Anthropic (Claude 3.5 Sonnet), OpenAI (GPT-4o).
- **Simple Models**: Anthropic (Claude 3 Haiku), OpenAI (GPT-4o-mini).

### 3.1 Resolution Logic
1. **Profile Lookup**: Fetch the user's preferred profile from `agent_settings`.
2. **Task Evaluation**:
   - If the task is **Critical** (Supervisor intent, complex reasoning), use the **Strong** model of the preferred provider.
   - If the task is **Light** (Greeting, formatting), use the **Simple** model.
3. **Provider Failover**: If the preferred provider has no model for the required strength, the router falls back to the next available provider in the user's `provider_credentials`.

## 4. Database Schema (libSQL)
All routing configuration is stored in `mastra.db`.

### 4.1 `agent_routing` Table
| Column | Type | Description |
|--------|------|-------------|
| `userId` | TEXT | Primary partition key (Indexed) |
| `persona` | TEXT | `supervisor`, `assistant`, `default`, `task:extraction`, etc. |
| `provider` | TEXT | `anthropic`, `openai`, `deepseek` |
| `model` | TEXT | Specific model string (e.g., `claude-3-5-sonnet-20240620`) |
| `priority` | INTEGER | Order of execution in failover |

## 5. Failover Protocol
When `AgentRouter.resolve()` is called:
1. Attempt resolution via user-defined `agent_routing`.
2. If no custom route exists, use the **Global Default** (Anthropic Claude 3.5 Sonnet).
3. If the primary model fails (API error), retry with the **Secondary Provider** defined in `provider_credentials`.

## 6. Implementation Constraints
- **Isolation**: Every query MUST include `WHERE userId = ?`.
- **Zero Hallucination**: Model names must match the official provider SDK strings exactly.
- **Performance**: Routing resolution must complete in < 50ms.
