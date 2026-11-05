# 03b — Endpoint Inventory

Every SvelteKit endpoint and remote function, classified for the Hono port.

**Generated** by `scripts/gen-endpoint-map.mjs`. Regenerate after changing routes:

```bash
node scripts/gen-endpoint-map.mjs
```

## Summary

| Metric | Value |
|---|---|
| Files scanned | 44 |
| Endpoint handler exports | 55 |
| In scope (catalog only) | 8 |
| In scope (mixed catalog + app-db) | 16 |
| Out of scope (app-db/Mastra only) | 20 |

**Scope rule:** in scope when the request needs catalog data, even if it also touches app-db.

## Full inventory

| Route | Methods | Domain | Catalog | App DB | Auth | Scope |
|---|---|---|---|---|---|---|
| `rpc:agent` | saveUserCredential (command), deleteUserCredential (command), getUserCredentials (command), updateUserCredential (command), updateModelVisibility (command), setAllModelVisibility (command), getModelVisibility (command), getAgentSettings (command), updateAgentSettings (command), getAvailableModels (command), getSettingsModels (command), getPlatformDefaults (command), exportPotluckDonations (command), importPotluckDonations (command), donateUserCredential (command), getMyDonations (command), revokeMyDonation (command) | agent | yes | yes | yes | in (mixed) |
| `rpc:assessment` | generateResultPdf (command), publishResult (command), assignSubjects (command), doExtraction (command) | assessment | yes | yes | yes | in (mixed) |
| `rpc:auth` | signup (form), login (form), signout (command), updatePassword (command), getUser (query), requestReset (form) | auth | yes | no | yes | in |
| `rpc:chat` | updateHistory (command), getHistory (query), deleteChat (command), syncCookie (command), updateVisibility (command), extractFile (command), suggestion (command), vote (command), getResources (query), getStudents (query) | chat | yes | yes | yes | in (mixed) |
| `/api/[authType]` | POST | [authType] | yes | no | no | in |
| `/google` | — | google | yes | no | no | in |
| `/api/ai/editor/command` | POST | ai | no | yes | no | out |
| `/api/ai/editor/copilot` | POST | ai | no | yes | no | out |
| `/api/chat` | POST, GET | chat | no | yes | no | out |
| `/api/class-roster/toggle-status` | POST | class-roster | yes | yes | yes | in (mixed) |
| `/api/commit` | POST | commit | yes | yes | yes | in (mixed) |
| `/api/demo` | GET | demo | no | yes | no | out |
| `/api/demo/admit` | POST | demo | yes | yes | no | in (mixed) |
| `/api/demo/commit` | POST, GET | demo | yes | yes | yes | in (mixed) |
| `/api/demo/generate` | POST, GET | demo | yes | yes | yes | in (mixed) |
| `/api/demo/publish` | POST, GET | demo | yes | yes | yes | in (mixed) |
| `/api/demo/validate` | POST, GET | demo | yes | yes | yes | in (mixed) |
| `/api/demo/write` | POST, GET | demo | no | yes | yes | out |
| `/api/file/[...path]` | GET, POST, DELETE, PUT | file | yes | yes | yes | in (mixed) |
| `/api/file/share` | POST | file | no | yes | no | out |
| `/api/file/shared/[token]` | GET | file | no | yes | no | out |
| `/api/format-document` | POST | format-document | yes | yes | yes | in (mixed) |
| `/api/mentions/search` | GET | mentions | yes | yes | no | in (mixed) |
| `/api/models` | GET | models | no | yes | no | out |
| `/api/ocr/direct` | POST | ocr | no | yes | yes | out |
| `/api/parents/connect-telegram` | POST | parents | yes | no | yes | in |
| `/api/photos/claim` | POST | photos | yes | no | yes | in |
| `/api/publish` | GET | publish | no | yes | yes | out |
| `/api/results/[token]` | GET | results | yes | yes | no | in (mixed) |
| `/api/results/generate-pdf` | POST | results | yes | yes | yes | in (mixed) |
| `/api/results/publish-pdf` | POST | results | no | yes | yes | out |
| `/api/results/validate-marksheet` | POST | results | no | yes | yes | out |
| `/api/settings/academic-calendar` | GET, POST | settings | yes | no | no | in |
| `/api/settings/ai` | POST | settings | no | no | no | out |
| `/api/settings/general` | GET, POST | settings | yes | no | no | in |
| `/api/settings/model-registry` | GET, POST | settings | no | yes | no | out |
| `/api/settings/platform-providers` | GET, POST | settings | no | yes | no | out |
| `/api/settings/potluck` | GET, POST | settings | no | yes | no | out |
| `/api/settings/report-templates` | GET, POST | settings | yes | no | no | in |
| `/api/telegram/set-webhook` | POST | telegram | no | no | no | out |
| `/api/telegram/webhook-info` | GET | telegram | no | no | no | out |
| `/api/telegram/webhook` | POST | telegram | no | no | no | out |
| `/api/uploads` | POST, DELETE | uploads | yes | yes | no | in (mixed) |
| `/uploads/[...path]` | GET | uploads | no | no | no | out |
