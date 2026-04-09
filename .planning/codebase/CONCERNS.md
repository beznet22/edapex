# Concerns (edapex)

Identified tech debt, architectural risks, and implementation challenges.

## Critical Risks
- **MySQL PK Constraints**: Existing issue with MySQL primary key constraints during migrations needs careful handling.
- **Edge CPU Limits**: Cloudflare's 10ms CPU budget is a hard constraint for AI orchestration; requires stateless execution and aggressive caching.
- **Legacy Parity**: Ensuring 100% logic parity with the legacy Laravel codebase (`/home/beznet/Workspace/schoolify`) at the service layer is critical for migration success.

## Technical Debt
- **Context Truncation**: Agent context requires a 70/20 head-tail truncation strategy to stay within edge memory limits.
- **Multi-Tenant Leakage**: Constant vigilance needed to ensure every repository query includes the `tenant_id` filter (automated linting/verification desired).

## Future Proofing
- **Stateless AI**: Ongoing effort to fully decouple from LLM-vendor lock-in (`TODO_STATELESS_AI.md`).
- **Global Scaling**: Moving school structural definitions into dynamic "AI Skills" rather than hard-coding in DB schema to support varying global education models.
