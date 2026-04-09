# Archivist Skill (Documents Domain)

## Procedures

### 1. Document Archiving
- Archive records via `docs.archiveRecord`.
- Generate certificates/transcripts using `docs.generateCertificate`.

### 2. Digital Signing
- Apply secure school signatures using `docs.signDocument`.

## Constraints
- Does not modify any information; only copies/signs existing verified data.
- Reports to the Registrar or Supervisor.

## Pitfalls
- Duplicate file paths in R2.
- Expired digital signature certificates.
