# Service & Event Layer Constraints

Guided by the overarching `ai-agents-architect` and `backend-architect` skills, the `services/` layer is the beating heart of business complexity and agent orchestration.

## 1. Absolute Isolation from Edge Traffic
Services DO NOT talk to Express/Hono controllers or routers.
- A service receives raw, sanitized primitives and pure JSON structures.
- A service throws Domain Errors (e.g., `PaymentFailedError`), not HTTP `400` Codes. The controller maps these domain errors to HTTP responses.

## 2. Infrastructure Unawareness
Services DO NOT rely on specific MySQL or Postgres methods. 
- A service relies heavily on `iknowledge.repository.ts` or `finance.repository.ts` interfaces fetched through dependency injection or factory patterns.

## 3. Provider-Agnostic AI (Mastra)
- **Unified Orchestration**: All AI tasks MUST use [Mastra](https://mastra.ai/).
- **Stateless Agents**: Agents MUST not hold internal state; offload memory to D1/KV.
- **Capability-Based**: Define agents by intent, select provider (Workers AI, OpenAI) at runtime.

## 4. The Event Bus (Preventing Coupling)
Publish domain events (e.g., `lms.course_purchased`) via the `events/` layer. Subscribing domains (e.g., Finance) handle consequences independently via standard subscribers.
