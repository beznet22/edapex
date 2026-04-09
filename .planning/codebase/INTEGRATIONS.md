# Integrations (edapex)

External services and internal system integrations for EdApex V2.

## Persistence Integrations
- **Cloudflare D1**: Primary edge-native database for multi-tenant data.
- **External MySQL**: Support for legacy or large-scale institutional hosting.
- **PostgreSQL**: Supported dialect for specific deployment tiers.
- **LibSQL/SQLite**: Local-first persistence and testing.

## AI & LLM Providers
- **OpenAI**: Core intelligence for agents and summarization.
- **Anthropic**: Support for long-context reasoning.
- **Mastra AI SDK**: Unified bridge for agent orchestration and tool management.

## Deployment & Infrastructure
- **Cloudflare Workers**: Serverless execution at the edge.
- **Wrangler CLI**: Deployment and migration management.
- **Docker**: Local development environment (MySQL, Laboratory sidecar).

## Internal Integrations
- **Event Bus**: Distributed event-driven reliability for domain-to-agent communication.
- **PBAC Engine**: Integrated security policy evaluation for all requests.
- **Boneyard UI**: Deep integration for pixel-perfect skeleton loading across all views.
