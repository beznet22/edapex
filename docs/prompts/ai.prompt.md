# PROMPT: EdApex AI Domain Architecture Documentation Agent

## 🎯 OBJECTIVE
Perform architectural analysis and documentation for the **AI** domain (Agents, Memory, Tools, Orchestration) using the **Mastra AI SDK**.
**AI Domain Exception:** This module is entirely NEW and does not exist in the legacy `schoolify` project. Its agent prompt is dedicated to architecting a modern, AI-first orchestration layer from scratch within the EdApex ecosystem, powered by **Mastra**.

## 📂 SOURCE CONTEXT
1.  **Modern Foundation**: Read `docs/MASTER_ARCHITECTURE.md` (specifically Section 8: AI Engine & Mastra SDK).
2.  **Modern Schema**: Analyze `src/db/domain-ai.ts`. This serves as your fundamental grounding, but you are **encouraged to provide architectural recommendations** for schema improvements (e.g., custom memory adapters, thread persistence) that best support Mastra's HMAS and recursive reasoning features.

## 📝 OUTPUT REQUIREMENTS
Generate `docs/domains/ai.md` following the structure in `docs/prompts/template.md`.
**Particular focus**:
- **Mastra Integration**: Detailed implementation of `Mastra.Agent`, `Mastra.Workflow`, and `Mastra.Memory`.
- **Hierarchical Multi-Agent System (HMAS)**: Orchestration logic using Mastra's Supervisor patterns.
- **Memory Persistence**: Design for a MySQL-compatible Mastra Storage adapter.
- **Agent continuity**: How `agent_memories` and Mastra's thread system handle long-term vs short-term recall.
