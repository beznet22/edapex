# Service & Event Layer Constraints

Guided by the overarching `ai-agents-architect` and `backend-architect` skills, the `services/` layer is the beating heart of business complexity and agent orchestration.

## 1. Absolute Isolation from Edge Traffic
Services DO NOT talk to Express/Hono controllers or routers.
- A service receives raw, sanitized primitives and pure JSON structures.
- A service throws Domain Errors (e.g., `PaymentFailedError`), not HTTP `400` Codes. The controller maps these domain errors to HTTP responses.

## 2. Infrastructure Unawareness
Services DO NOT rely on specific MySQL or Postgres methods. 
- A service relies heavily on `iknowledge.repository.ts` or `finance.repository.ts` interfaces fetched through dependency injection or factory patterns.

## 3. Hierarchical Multi-Agent System (HMAS) Integration
The Mastra SDK logic lives here. 
- When building a new agent (`src/services/ai/[agent].ts`), ensure it exposes exactly the tools needed without bleeding DB connectivity directly into the tool definition. 
- Agent Tools MUST call Service methods.
- Ensure ReAct (Reason-Act-Observe) limits are explicitly set to prevent infinite LLM token burn.

## 4. The Event Bus (Preventing Cross-Domain Coupling)
If modifying the LMS domain results in a consequence needed in the Finance domain (e.g. charging a fee during enrollment):
- **ANTI-PATTERN**: Do NOT import `FinanceService` into `LmsService`. This creates circular dependencies and monolithic coupling.
- **PATTERN**: Publish an event (e.g., `lms.course_purchased`) via the `events/` layer. The finance module must subscribe to this event and handle the ledger entry independently.
