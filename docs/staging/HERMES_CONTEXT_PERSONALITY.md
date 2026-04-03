# Staging: Hermes Context & Personality Integration for EdApex V2

Formalizing agent identity, hierarchical project context, and inline references.

## 1. Personality & Identity (SOUL.md)
EdApex adopts the Hermes **SOUL Pattern** to maintain a consistent professional voice.

- **Global Identity (`src/services/ai/strategy/SOUL.md`)**: The "Institutional Soul". Defines EdApex as an ethical, precise, and supportive educational authority.
- **Supervisor Personas**: Extends the global SOUL with domain-specific professional traits (e.g., the Bursar is fiscally conservative and detail-oriented).
- **Prompt Injection**: The `Orchestrator` injects the SOUL content into the **Identity Slot (#1)** of every LLM interaction.

## 2. Hierarchical Context Files
To maintain grounding without token bloat, EdApex uses a filtered hierarchy:
1. **AGENTS.md (Root)**: Global project rules and 8-layer architecture mandates.
2. **SKILL.md (Domain)**: Procedural rules for the active Supervisor (mapped to Hermes `personality`).
3. **.hermes.md (Local)**: Ephemeral directory-specific instructions for sub-tasks.

## 3. Context References (@-syntax)
Implementing the `@-syntax` for proactive grounding in user/agent messages.

| Reference | EdApex Implementation | Edge Optimization |
| :--- | :--- | :--- |
| `@file:path` | `FileLoader` service | 20k char truncation (70/20 head-tail). |
| `@folder:path` | `DirectoryTree` service | Depth-limited recursive walk (max depth 2). |
| `@diff` | `GitBridge` service | Summarized diff for token efficiency. |
| `@url:link` | `WebReader` service | Markdown conversion + semantic chunking. |

## 4. Implementation Workflow
1. **Identity**: Create the default `SOUL.md` in the strategy directory.
2. **Parser**: Implement the `ContextParser` in `src/services/ai/orchestrator/`.
3. **Truncation**: Integrate the Hermes 70/20 truncation logic to ensure context window safety.
4. **Skills**: Force the `edapex-domain-architect` to generate a `PERSONALITY.md` for every new domain supervisor.

## 5. IMPACT: Strategic Registry
Update `src/services/ai/strategy/registry.ts` to include a `persona` field for each agent, pointing to its corresponding personality definition.
