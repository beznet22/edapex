---
title: EdApex V2 Architecture
description: Core system architecture patterns
---

# Architecture Overview

EdApex V2 relies on a decoupled, edge-native architecture focusing on role-based access, strict multi-tenancy, and AI-first workflows. 

## Domain Topology

The backend data topology relies on a centralized repository-based pattern that abstracts Drizzle ORM interactions from the application logic. 
- **Repositories (`src/lib/server/repository`)**: Core single-responsibility data accessors (Auth, Chat, Student, Staff, Result, etc.). These methods inherit from an Abstract `BaseRepository` that handles config orchestration and caching.
- **Service Layer (`src/lib/server/service`)**: Contains business logic (e.g., `AssessmentService`, `AuthService`, `AgentService`) bridging API requests to database repositories.

## Multi-Tenancy Strategy

Multi-tenancy is enforced natively at the table level in the Drizzle ORM.
- **Isolators**: Every primary document/entity enforces a `schoolId` and `academicId` foreign key boundary.
- **Execution**: The `AgentService` and API middleware extract implicit user context (`user.schoolId`) bounding all subsequent queries natively.

## AI Orchestration

The application contains an internal *HMAS (Human-Machine Agent System)* interface.
- **Provider Router (`src/lib/server/provider/router.ts`)**: Decouples logic between Qwen (fast analytical tasks), OpenRouter, and Google API models.
- **Context Injection**: Uses extensive instruction prompting injected tightly with real-time class/user metadata directly loaded from Svelte components via chat context (`$lib/context/chat-history.svelte.js`).
- **Tool Access Constraint**: Tools are sandboxed into `coordinatorTools`, `teacherTools`, and `defaultTools` determining explicit constraints per user execution.

## Auth & Session

- **Stateless Verification**: Uses a split JWT implementation (Access/Refresh Token pairing inside Secure Cookies).
- **Brute Force Protection**: Deep implementation in `AuthService` tracking failure timestamps.
- **Device Fingerprinting**: Cross-correlates standard User-Agents against device IDs generated via PWA bindings to mitigate replay and session-hijack attacks.

## Extensibility

- **UI Event Bus**: Integrates standard SSE pipelines and hooks (`classAttendances`, `chat_conversations`) tying real-time event updates to the pulse of the application layer.
