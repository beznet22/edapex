# `edapex-core`

Platform-neutral local state and health for the EdApex clients. Deliberately
small: it is the seam where local capabilities attach, not a runtime.

| | |
|---|---|
| Crate | `edapex-core` (`crates/core`) |
| Deps | `serde`, `serde_json` |
| Depended on by | `apps/desktop/src-tauri` |

## The rule this crate encodes

**School data is authoritative in `services/sms-api`, never here.** This crate
holds local, device-scoped state. Anything a school owns — marks, students,
attendance, report settings — must be fetched, and any local copy is a cache with
an explicit lifetime, not a second source of truth.

The same rule applies to credentials: no provider key and no session token is
stored by this crate.

## Current surface

| Item | Purpose |
|---|---|
| `CORE_VERSION` | Reported by the desktop `runtime_health` command |
| `LOCAL_STATE_SCHEMA_VERSION` | Bumped when local state shape changes |
| `CoreHealth` | `core_version`, `local_state_schema`, `agent_connected` |
| `health()` | Constructs the snapshot the shell displays |

`health()` deliberately reports `agent_connected: false`: connectivity is owned by
`edapex-agent`'s `AgentHost`, and this crate must not guess at it.

## Growth

Planned attachments — local document handling, Cactus Needle, sandbox execution —
land here when their chunk arrives. **iroh is deferred** and guarded by a CI test
that fails if it becomes a dependency; see `docs/workspace/specs/41-storage-sync.md`.

## Verification

```bash
cargo test -p edapex-core
```
