# TODO: Future Design Strategy - Stateless Agent Invocation

> **Status**: Deferred (Planned for post-V2 launch)  
> **Goal**: Prevent vendor lock-in with AI SDKs (like Mastra) by decoupling database persistence from the SDK's internal storage mechanisms.

## current V2 Architecture Constraints
Currently, EdApex integrates with the Mastra AI SDK using a custom `[DB]Store` adapter (e.g., `MysqlStore`, `PostgresStore`) that implements the `MastraStorage` interface.
This tightly couples our native Drizzle ORM schemas (`ai_chats`, `ai_messages`) to the specific constraints and data shapes that Mastra requires internally for its agent memory layer.

## The Future Architecture: Pure Stateless Execution
To guarantee that EdApex can eventually swap out the Mastra SDK for any other AI framework without rewriting the `ai_*` database domain tables, we will adopt a **Stateless Execution Pattern**.

### Core Tenets
1. **Schema Independence**: The Drizzle schemas for `aiChats`, `aiMessages`, and `aiAgentActions` will remain completely isolated and free from `MastraStorage` interfaces.
2. **Stateless Invocation**: Agents will be invoked without relying on the SDK's persistent memory. The application's core `AiService` will be entirely responsible for fetching the chat history directly from our DB before calling the LLM.

### Roadmap & Implementation Steps
1. **Remove Custom Adapters**: Delete custom `MysqlStore` or `PostgresStore` components that enforce Mastra's interface over our tables.
2. **Drizzle Repositories**: Create and utilize standard `AiRepository` interfaces targeting `aiChats` and `aiMessages`.
3. **Stateless API Mapping**: Modify the Hono `AiController` to manually map database history to standard LLM arrays before generation.

### Code Blueprint
```typescript
// 1. Fetch Conversation History independently
const dbMessages = await aiRepository.getMessages(chatId);

// 2. Map standard DB rows into generic conversational parts
const standardMessages = dbMessages.map(msg => ({
  role: msg.role,
  content: msg.parts
})); 

// 3. Stateless Invocation (no persistent SDK memory required)
const response = await agent.generate([ 
  ...standardMessages, 
  { role: 'user', content: req.text } 
]);

// 4. Save native response back to DB automatically
await aiRepository.saveMessage(chatId, 'assistant', response.text);
```

By completing this TODO, EdApex remains a pristine, multi-database architecture where AI logic never dictates the persistence structure.
