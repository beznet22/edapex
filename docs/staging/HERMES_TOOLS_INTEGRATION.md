# Staging: Hermes Tools Integration for EdApex V2

Integrating production-grade tool execution and the "Stress Lab" sandbox.

## 1. The EdApex Stress Lab (Sidecar Isolation)
The sandbox is an instance of the EdApex V2 backend running in `STRESS_LAB` mode.
- **The "Flight Simulator" Rationale**: Deployed agents require a "Safety Lab" to test resilience logic (Chaos Mesh/Load tests) without risking live school data. 
- **Production Airgap**: Explicitly isolates destructive tools from the **Cloudflare D1/KV** production backbone.
- **Performance Benchmarking**: Mandatory for verifying Section 24 (10ms CPU limits) using `cgroups` resource capping.
- **Telemetry**: Failure modes are reported back as **WorkProducts** via the **Background Protocol (`session_id`)**.

## 2. Cost-Efficient Scaling Lifecycle (Cloudflare)
To minimize costs on the Cloudflare Free Tier:
- **Phase 1 (Free)**: Stress Lab runs **Locally** only (Docker on Dev machine). Edge workers communicate via a local tunnel (Cloudflared).
- **Phase 2 (Paid)**: Stress Lab scales to a **Shared Institutional Sandbox** for live cloud diagnostics.

## 3. Toolset Nesting & Least-Privilege
- **Executive**: Zero tools; manages supervisors.
- **Supervisor**: Management tools (Approval, Audit).
- **Task Agent**: Domain-specific workers (e.g., `enroll_student`).

## 4. IMPACT: Section 41 (Proactive Auditing)
The "Auditor Agent" will now run its anomaly detection as a background process, ensuring zero impact on the responsiveness of the main School Management UI.
