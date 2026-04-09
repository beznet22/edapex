---
title: EdApex V2 Integrations
description: Third-party API bindings and system integrations
---

# Integrations Overview

The platform uses several strict third-party provider bindings. Integration paths abstract away provider nuance allowing universal orchestration interfaces.

## 1. AI Providers (HMAS Core)
Implemented via the Vercel AI SDK adapters inside `src/lib/server/provider/`:
- **OpenRouter & Qwen**: Default bindings for processing instructions using `@ai-sdk/openai` wrappers configured to OpenRouter execution URLs via `.env` credentials (`OPENROUTER_API_KEY`).
- **Google Generative AI**: Configured via `@ai-sdk/google` for specialized execution or high-context document interactions (`GOOGLE_GENERATIVE_AI_API_KEY`).

## 2. Persistence Integrations
- **MySQL Execution Engine**: Handled via `drizzle-orm` utilizing a connection pool driver via `mysql2`.
- **Blob/FileSystem Storage**: Tied to internal handlers (e.g. `studentFileStorage`), capable of ingesting ExtractedAssessment outputs and writing them either to local caches or pushing them to S3 targets internally.

## 3. Communication Logistics
- **SMTP Job Interface**: The system processes email results utilizing structured JSON blocks containing raw SMTP `response` signatures for tracing explicit deliveries per student (`sendStudentResult` tools).
- **Push Notifications**: Relies directly on VAPID integrations handled securely inside the PWA interface and backed by standard web-push keys in `.env` arrays.

## 4. UI Library Mapping
- **shadcn-svelte (Tailwind V4)**: Tightly integrated into structural components (`Select`, `AlertDialog`, `Sonner`). All design abstractions map directly against primitive classes defined under `components/ui`.
