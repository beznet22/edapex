# Service & Event Layer Constraints

Guided by the overarching `ai-agents-architect` and `backend-architect` skills, the `services/` layer is the beating heart of business complexity and agent orchestration.

## 1. Absolute Isolation from Edge Traffic
Services DO NOT talk to Express/Hono controllers or routers.
- A service receives raw, sanitized primitives and pure JSON structures.
- A service throws Domain Errors (e.g., `PaymentFailedError`), not HTTP `400` Codes. The controller maps these domain errors to HTTP responses via `BaseController.sendError`.

## 2. Infrastructure Unawareness
Services DO NOT rely on specific MySQL or Postgres methods. 
- A service relies heavily on `domain/interfaces/` (e.g., `IFinanceRepository`, `ICoreRepository`) fetched through dependency injection or factory patterns.
- Services MUST receive repositories via **constructor injection**. Direct instantiation of repositories inside a service is a critical anti-pattern.

```typescript
// ✅ Correct: Constructor injection
export class FinanceService {
  constructor(private readonly financeRepo: IFinanceRepository) {}
  
  async recordPayment(tenantId: number, data: PaymentInput) {
    return this.financeRepo.createLedgerEntry(tenantId, data);
  }
}

// ❌ Wrong: Direct instantiation
export class FinanceService {
  async recordPayment(tenantId: number, data: PaymentInput) {
    const repo = new SqliteFinanceRepository(); // ANTI-PATTERN
    return repo.createLedgerEntry(tenantId, data);
  }
}
```

## 3. Provider-Agnostic AI (Mastra)
- **Unified Orchestration**: All AI tasks MUST use [Mastra](https://mastra.ai/).
- **Stateless Agents**: Agents MUST not hold internal state; offload memory to D1/KV.
- **Capability-Based**: Define agents by intent, select provider (Workers AI, OpenAI) at runtime.
- **Stateless Execution Pattern**: Load DB history → Map to LLM payloads → Invoke agent statelessly → Persist response. This avoids heavy Mastra Memory adapter initialization within the 10ms edge window.

```typescript
// Standard Stateless Invocation Pattern
const dbMessages = await aiRepo.getMessages(chatId);
const standardMessages = dbMessages.map(m => ({
  role: m.role,
  content: m.parts[0]?.text || '',
}));

const response = await agent.generate([
  ...standardMessages,
  { role: 'user', content: req.text }
]);
await aiRepo.saveMessage(chatId, 'assistant', response.text);
```

## 4. The Event Bus (Preventing Coupling)
Publish domain events (e.g., `lms.course_purchased`) via the `events/` layer. Subscribing domains (e.g., Finance) handle consequences independently via standard subscribers.
- **Event-Driven Consistency**: Cross-domain side effects (e.g., generating a ledger entry when a course is purchased) MUST be handled via events, not direct service-to-service calls.
- **Idempotency**: Event handlers MUST be idempotent. Use `idempotency_key` to prevent duplicate processing on retries.

## 5. Distributed Transaction Strategies
For multi-step operations that span multiple repositories or domains:
- **Saga Pattern**: Orchestrate a sequence of local transactions with compensating actions for rollback.
- **No Global Transactions**: D1/SQLite does not support distributed transactions. Each step must be independently atomic.
- **Compensating Actions**: If step 3 of a 5-step saga fails, steps 1-2 must have defined reversal logic.
