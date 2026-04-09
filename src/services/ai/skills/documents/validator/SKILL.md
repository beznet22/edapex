# Document Validator Skill (Documents Domain)

## Procedures

### 1. Integrity Auditing
- Verify digital signatures via `docs.signDocument` (verification mode).
- Cross-reference document metadata with `Academic` source records.

### 2. Approval Lifecycle
- Flag document anomalies to the `Archivist`.
- Approve documents for final distribution after successful audit.

## Constraints
- Does not modify document content.
- Reports to the Registrar or Supervisor.

## Pitfalls
- Stale verification keys.
- Misinterpreting minor metadata variations as critical errors.
