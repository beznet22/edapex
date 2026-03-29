# PROMPT: EdApex Settings Domain Architecture Documentation Agent

## 🎯 OBJECTIVE
Perform architectural analysis and documentation for the **Settings** domain (General Configuration, Modules, Themes).

## 📂 SOURCE CONTEXT
1.  **Legacy Source**: Analyze `/home/beznet/Workspace/schoolify/app/Models/SmGeneralSettings.php`.
    - **Exhaustive Search**: You MUST search the entire `/home/beznet/Workspace/schoolify` directory (including Middleware, Helpers, and Event Listeners) to ensure 100% logic parity. Do not leave any code path behind.
2.  **Legacy Schema**: Reference `docs/infix_edu.sql` (Tables: `sm_general_settings`, `sm_modules`).
3.  **Modern Foundation**: Read `docs/MASTER_ARCHITECTURE.md`.
4.  **Modern Schema**: Analyze `src/db/domain-settings.ts`.

## 📝 OUTPUT REQUIREMENTS
Generate `docs/domains/settings.md` following the structure in `docs/prompts/template.md`.
**Particular focus**:
- Centralized vs Tenant-specific configuration overrides.
- Recommendations for a "Feature Flag" architecture for planet-scale deployment.
