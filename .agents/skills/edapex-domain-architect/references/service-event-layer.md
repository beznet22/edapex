# Service & Event Layer Constraints

Guided by the overarching `ai-agents-architect` and `backend-architect` skills, the `services/` layer is the beating heart of business complexity and agent orchestration.

## 1. Absolute Isolation from Edge Traffic
Services DO NOT talk to Express/Hono controllers or routers.
- A service receives raw, sanitized primitives and pure JSON structures.
- **Error Propagation**: A service throws specialized `DomainError` or `ValidationError` with machine-readable codes. These are caught by the `BaseController` and mapped to Hono RPC envelopes.
- **8-Layer Logging**: Every operation MUST use the structured JSON logger (`src/utils/logger.ts`) with mandatory `layer: 'services'` and `run_id` tags for chain-of-thought traceability.

## 2. Infrastructure Unawareness
Services DO NOT rely on specific database dialects.
- A service relies heavily on `domain/interfaces/` fetched through dependency injection.
- Services MUST receive repositories via **constructor injection**.

```typescript
// ✅ Correct: Constructor injection
export class FinanceService {
  constructor(private readonly financeRepo: IFinanceRepository) {}
  
  async recordPayment(tenantId: number, data: PaymentInput) {
    return this.financeRepo.createLedgerEntry(tenantId, data);
  }
}
```

## 3. Provider-Agnostic AI (Mastra & HMAS)
- **Unified Orchestration**: All AI tasks MUST use [Mastra](https://mastra.ai/) as taught in the `mastra` skill.
- **HMAS Hierarchy**: Follow the **Executive -> Supervisor -> Task Agent** pattern.
- **Recursive Goal Hierarchy**: Decompose objectives into **Institution > Department > Agent > Task** tiers.
- **Stateless Agents**: Agents MUST not hold internal state; offload memory to D1/KV (see `ai-agents-architect`).
- **Stateless Execution Pattern**: Load DB history → Map to LLM payloads → Invoke agent statelessly → Persist response.
- **Financial Attribution**: EVERY agent run MUST report token/cent costs via `ai_cost_events` to ensure departmental budget accountability.
- **Forensic Auditing**: Emit `ai_activity_logs` for every major decision or tool call to enable post-execution forensics.

```typescript
// Standard Stateless Invocation Pattern
const dbMessages = await aiRepo.getMessages(chatId);
const response = await agent.generate([
  ...standardMessages,
  { role: 'user', content: req.text }
]);
await aiRepo.saveMessage(chatId, 'assistant', response.text);
```

## 4. The Event Bus (Preventing Coupling)
Publish domain events via the `events/` layer.
- **Event-Driven Consistency**: Cross-domain side effects MUST be handled via events.
- **Reactive Notifications**: Use the event bus to trigger the `CommunicationService` for high-urgency alerts (WebPush, SMS) like `ON_PBAC_VIOLATION`.
- **Idempotency**: Event handlers MUST be idempotent. Use `idempotency_key` to prevent duplicate processing.

## 5. Distributed Transaction Strategies
For multi-step operations that span multiple repositories or domains (Saga Pattern):
- **Saga Orchestration**: Use a compensation-aware sequence of local transactions.
- **No Global Transactions**: D1/SQLite does not support distributed transactions.
- **Compensating Actions**: If step 3 fails, steps 1-2 must have defined reversal logic.

