# Architecture (edapex)

High-level architectural patterns and principles for EdApex V2.

## Pattern: Layered Modular Monolith
The project follows a strict 8-layer edge-native architecture:
1.  **Infrastructure Layer**: Tenant resolution, Auth, Context.
2.  **Security (PBAC)**: Attribute-based access control evaluated before execution.
3.  **Intelligence (HMAS)**: Orchestrator -> Supervisor -> Agent hierarchy.
4.  **Domain Repositories**: Data access layer abstracted via Repository Pattern.
5.  **Persistence**: Dialect-specific implementations (D1, MySQL, etc.).

## Pattern: Hierarchical Multi-Agent System (HMAS)
Intelligence is organized into four levels to ensure reasoning depth:
- **Executive Orchestrator**: High-level intent and multi-domain planning.
- **Domain Supervisors**: Manages task agents for specific domains (Academic, Finance, etc.).
- **Task Agents**: Atomic operations (e.g., Student Registration).
- **Skills System**: Procedural memory (Hermes Standard) injected into agents.

## Multi-Tenant Isolation
- **Logical Partitioning**: Shared database with mandatory `tenant_id` filters on all queries.
- **Tenant Context**: Initialized at the Edge Gateway based on subdomain or custom domain.

## Event-Driven Reliability
- **Domain Events**: Immutable audit logs of all state changes.
- **Reactive Agents**: Agents subscribe to events (e.g., `exam_submitted`) to trigger workflows.

## Edge Constraints
- **Stateless Execution**: Designed to survive Cloudflare's 10ms CPU limit.
- **Zero Lock-in**: Provider-agnostic AI definitions using Mastra.
