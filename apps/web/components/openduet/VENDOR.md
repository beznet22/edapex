# Vendored and adapted source

This app starts from `vercel/chatbot` and ports selected interaction source from
`CopilotKit/OpenDuet`. The source pins and license obligations are recorded here.

## vercel/chatbot

- Repository: https://github.com/vercel/chatbot
- Commit: `a8989b522fa3672a2ae52f053105e40993b36ca1`
- License: Apache-2.0 (see `../LICENSE.chatbot`)
- Reused: accessible UI primitives and layout patterns. No starter server code is
  used. AI SDK, Auth.js, Drizzle/Postgres, Redis, Vercel Blob, BotID, and Vercel
  deployment configuration are not dependencies of this app.

## CopilotKit/OpenDuet

- Repository: https://github.com/CopilotKit/OpenDuet
- Commit: `f52288fff5ccdbd3de428d573d9f026fce5ff480`
- License: MIT (see `LICENSE`)
- Reused: presentation structure and interaction behavior for the shell, tab bar,
  message primitives, composer, tool activity, approvals, runtime status, and
  skeleton. CopilotKit, TanStack Query, TanStack Router, and OpenDuet route/persistence
  code are not dependencies.

### File map

| Upstream | Local | Notes |
|---|---|---|
| `openbot/app/src/components/ui/bubble.tsx` | `components/openduet/bubble.tsx` | Removed Base UI render hook; EdApex tokens |
| `openbot/app/src/components/ui/message.tsx` | `packages/chat/src/components/message.tsx` | Shared presentation primitive |
| `openbot/app/src/components/ui/message-scroller.tsx` | `components/openduet/message-scroller.tsx` | Native scroll container |
| `openbot/app/src/components/ui/skeleton.tsx` | `packages/chat/src/components/skeleton.tsx` | Shared presentation primitive |
| `openbot/app/src/components/shell/tab-bar.tsx` | `components/openduet/tab-bar.tsx` | Next links; no motion dependency |
| `openbot/app/src/components/channels/tool-activity.tsx` | `components/openduet/tool-activity.tsx` | Contract-driven; CopilotKit removed |
| `openbot/app/src/components/channels/chat-transcript.tsx` | `components/openduet/chat-transcript.tsx` | Contract-driven transcript; no CopilotKit |
| `openbot/app/src/components/channels/composer/composer.tsx` | `components/openduet/composer.tsx` | Contract-driven composer; no CopilotKit |
| `openbot/app/src/components/approvals/inline-approval.tsx` | `components/openduet/approval-card.tsx` | Rebuilt on `ApprovalPart` |

### Deliberate exclusions

- No CopilotKit or AG-UI imports.
- No OpenDuet route tree, persistence, auth, channel store, TanStack Query, or
  TanStack Router.
- No Duet color tokens or visual identity; EdApex Gold on Slate is authoritative.
- No generation/streaming protocol is inherited. All runtime events are mapped by
  `@edapex/contracts` and `@edapex/chat`.
