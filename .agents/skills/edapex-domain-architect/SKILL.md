---
name: edapex-domain-architect
description: Use when adding new domains natively, inserting new features across multiple layers, architecting new business logic, or implementing API routes from database schemas.
metadata:
  category: discipline
  triggers: new feature, add domain, cross-layer, business logic, architect layer, new middleware
---

# EdApex Domain Architect

You are the definitive cross-layer architect for EdApex V2. Your core objective is to ensure that feature additions maintain strict boundary encapsulation entirely avoiding "leaky abstractions" across the 8 layers defined in `docs/MASTER_ARCHITECTURE.md`.

## When to Use This Skill
- Adding a completely new domain (e.g., `domain-transport.ts`).
- Modifying a feature that touches the database edge and surfaces upward via APIs.
- Developing business logic requiring new middleware or specific HMAS capabilities.

## Execution Requirements
You must execute your work by sequentially satisfying the constraints of these 5 core boundaries. DO NOT skip to implementation without completing the Brainstorming Phase.

1. **Strategic Review (Pre-code Phase)**  
   Read and execute the constrained multi-agent setup:  
   👉 [Multi-Agent Review](references/multi-agent-review.md)

2. **Data & Domain Layer (Edge-Native)**  
   Strict Drizzle ORM compliance, Cloudflare D1 optimization, and SQLite repository interfaces:  
   👉 [Database & Domain Layer](references/database-domain-layer.md)

3. **Service & Event Layer (Provider-Agnostic)**  
   Business orchestrations, the Event Bus, and stateless ReAct AI agents:  
   👉 [Service & Event Layer](references/service-event-layer.md)

4. **API, Validation, & PBAC Constraints**  
   Zod schema validations, Standard Error Envelopes, and Auth middleware:  
   👉 [API & Validation Layer](references/api-validation-layer.md)

5. **Frontend, Local-First, & UI Aesthetics**  
   TanStack Start (SPA), TanStack DB synchronization, and mandatory **Shadcn UI** / **AI Elements** integration:  
   👉 [Frontend & Local-First Layer](references/frontend-local-first-layer.md)

6. **UI/UX Pro Max Standards**
   Strictly follow [UI/UX Pro Max](file:///home/beznet/.gemini/antigravity/skills/ui-ux-pro-max/SKILL.md) for premium "wow" factor. No emojis as icons; use Lucide/Radix.

7. **Mandatory Documentation Requirements**  
   Architectural changes MUST be committed to the `docs/` dir:  
   👉 [Documentation Requirements](references/documentation-requirements.md)

## Common Leaky Abstraction Anti-Patterns
❌ **Services importing Drizzle directly**: A service MUST use `domain/interfaces`. 
❌ **Controllers returning custom JSON structures**: A controller MUST use the centralized Payload wrapper.
❌ **Unanonymized API Errors**: Do not let raw SQL tracebacks leak out of the Validation boundaries.

## Cognitive Memory Pattern
When working across the 8 layers, explicitly generate a `task.md` Working Memory checklist. As you navigate from `db/` to `domain/` to `services/`, ensure your schema variable names (e.g., `tenantId`, `academicId`) are mapped into this checklist so subsequent layers utilize perfectly uniform typings.
