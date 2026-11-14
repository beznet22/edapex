# `@edapex/connectors`

Server-side connector implementations: a governed MCP client and per-person
Google Workspace.

**Imported by `services/cowork-api` and nothing else.** Spec 60 requires zero
connector bytes in any app bundle, the Tauri binary or the APK. That is enforced
twice in `apps/web/tests/dependency-boundary.test.ts`: once against the package
manifest and once against every source file in `apps/web`, so a deep import or a
dynamic one cannot slip past.

## Why server-side

A connector is **reach**, not control. It lets an agent act in a third-party
system from inside a Worker. It does not let a browser drive anything, and it
never moves a credential closer to the user's device.

## MCP

The Worker is an MCP *client*. It dials a configured server; it never spawns a
process, and it never accepts a server named by model output at runtime.

| Rule | Where |
|---|---|
| HTTPS only, no private or link-local hosts | `validateServerUrl` |
| Only configured tools are callable | `allowTools` allowlist, checked before any request |
| A tool is a write unless configured as a read | `accessFor` / `classifyAccess` |
| Results are data, never instructions | returned as values; the prompt framing is the caller's job |

The URL check runs at call time, not just at configuration, because a config that
looks right can be followed by a redirect. IPv6 literals arrive bracketed from
`URL`, so they are unwrapped before comparison — otherwise `[::1]` slips through
as a public host.

## Google

- **Per person.** Each user connects their own account. There is no
  deployment-wide mailbox token.
- **Read and send are separate scopes.** A read connection requests
  `gmail.readonly`; only a write connection requests `gmail.send`. A connection
  granted read-only months ago cannot send today — `scopeCovers` is checked at use
  time.
- **The endpoint is a path, not a URL.** `callGoogle` prefixes
  `https://www.googleapis.com`, so a caller cannot redirect the bearer token to
  another host.
- **Error bodies are not read.** Google echoes the rejected token in its errors,
  so only the status is surfaced, and `redactGoogleError` cleans anything else
  that escapes.

## Catalogue

`CATALOGUE` describes what can be connected, for display only: no credential, no
server URL, no tool implementation. Brokered and paid connectors (Composio, Arcade)
are excluded by spec, so `isOffered` is a closed set rather than a flag.

## Verification

```bash
pnpm --dir packages/connectors run typecheck
pnpm --dir packages/connectors test
```
