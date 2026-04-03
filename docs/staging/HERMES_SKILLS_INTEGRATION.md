# Staging: Hermes Skills Integration for EdApex V2

Integrating the Hermes Agent "Skills" pattern into the edge-native EdApex V2 platform.

## 1. Technical Specification: From Files to Skills
Hermes defines skills as a directory structure (`SKILL.md`, `scripts/`, `templates/`). EdApex adopts this for all 18 domains.

| Component | EdApex Location | Purpose |
| :--- | :--- | :--- |
| **Logic** | `src/services/ai/skills/` | Domain-specific procedural memory. |
| **Scripts** | `src/services/ai/skills/{domain}/scripts/` | Executable bash/js tools for the agent. |
| **Templates** | `src/services/ai/skills/{domain}/templates/` | Standardized report/product formats. |
| **Prompt** | `SKILL.md` (Level 1 Context) | Higher-order reasoning instructions. |

## 2. Progressive Disclosure (Context Tiering)
To maintain 10ms edge execution and token efficiency:
- **Level 0 (Inherent)**: Core PBAC and architectural rules in the System Prompt.
- **Level 1 (Procedural)**: `SKILL.md` loaded *only* when the Supervisor is awake.
- **Level 2 (Deep)**: `scripts/` and `templates/` loaded conditionally via the Toolset bridge.

## 3. Integration Workflow
1. **Directory Structure**: Initialize `src/services/ai/skills/` with domain-specific sub-folders.
2. **Skill Registry**: Update the HMAS Executive to map `domain_id` to its corresponding Skill path.
3. **Bootloader**: Implement the `SkillLoader` service to pre-fetch and cache `SKILL.md` at session start.
4. **Validation**: Every script in the skill directory MUST have a corresponding Zod schema for its output.

## 4. Cost-Efficient Scaling (Institutional Sandbox)
- **Local Dev**: Skills are edited and tested in the Stress Lab.
- **Production**: Verified skills are pushed to the **Durable Objects / KV** cache for sub-millisecond retrieval.
