# PROMPT: EdApex Domain Architecture Documentation Agent

## 🎯 OBJECTIVE
Your mission is to perform a deep architectural analysis and generate the official documentation for the **[DOMAIN_NAME]** domain within the EdApex Planet-Scale Architecture. You must bridge the technical gap between the legacy Laravel implementation and the new AI-native database layer.

## 📂 SOURCE CONTEXT
1.  **Legacy Source**: Analyze `/home/beznet/Workspace/schoolify` (InfixEdu). Focus on Controllers, Models, and Services related to [DOMAIN_NAME].
    - **Exhaustive Search**: You MUST search the entire `/home/beznet/Workspace/schoolify` directory (including Middleware, Helpers, and Event Listeners) to ensure 100% logic parity. Do not leave any code path behind.
2.  **Legacy Schema**: Reference `docs/infix_edu.sql` to understand how the legacy database was structured.
3.  **Modern Foundation**: Read `docs/MASTER_ARCHITECTURE.md` to understand the Hierarchical Agent System, PBAC, and Multi-Tenancy requirements.
4.  **Modern Schema**: Analyze `src/db/domain-[DOMAIN_FILE].ts` for the current V2 Drizzle implementation.

## 📝 OUTPUT REQUIREMENTS
Generate a detailed markdown file at `docs/domains/[DOMAIN_FILE].md` covering:

### 1. Domain Overview
- High-level purpose of the [DOMAIN_NAME] domain in the EdApex ecosystem.
- Key business logic captured from the legacy analysis.

### 2. Entity Mapping (V1 -> V2)
- Table-by-table mapping from the legacy schema to the modern Drizzle schema.
- Highlighting major structural improvements (e.g., normalization, strict typing).

### 3. AI Agent & Tool Integration
- Identification of Task Agents required for this domain (from `MASTER_ARCHITECTURE.md`).
- List of structured Tools needed (e.g., `create_[entity].tool`).
- How these agents interact with the Domain Service.

### 4. PBAC & Security
- Specific policy rules required for this domain (e.g., "Parent can only view their own child's finance records").
- How environment context (Tenant, Academic Year) is enforced.

### 5. Recommendations & Justifications (IMPORTANT)
- **Detailed analysis** of the current `src/db/domain-[DOMAIN_FILE].ts`.
- **Proposals** for schema refinements to better support AI automation or PBAC.
- **Justifications** for every suggested change.
- **WARNING**: You must NOT modify the code in `src/db/` directly. Your proposals must be reviewed and approved by the USER first.

## 🚀 EXECUTION GUIDELINES
- Be technically precise. No fluff.
- Use Mermaid diagrams for complex domain workflows.
- Ensure all logic aligns with the **Planet-Scale** and **Multi-Tenant** vision.
