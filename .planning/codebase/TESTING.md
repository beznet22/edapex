---
title: EdApex V2 Testing
description: Overview of testing paradigms
---

# Testing Overview

As the EdApex V2 architecture integrates extensive role-based constraints and AI tool usage, traditional pipeline tests are augmented by structured functional validation schemas.

## 1. Zod as a Testing Pivot
While the application does not have an extensive array of explicit Unit Tests (like Jest or Vitest) defined yet, it heavily relies on **Runtime Validation Testing**.
- Every single AI orchestration boundary uses deep Zod-inferred types for IO bounds checking.

## 2. Agent Workflow Testing Strategy
Given the nature of Agent workflows (which are non-deterministic by default), testing relies on:
- Output constraints defined centrally.
- Fallback tools checking for explicit error-chain logs instead of raw crashes. For example, `validateClassResults` runs explicit bounds validation internally before generating SMTP jobs.

## 3. Recommended Future Expansion
When building test coverage, the priority focuses will be:
- E2E Testing (Playwright / Cypress) validating PWA functionality and the Chat UI Context injection logic.
- Service Layer Unit tests isolating explicit behavior modifications like `assessment.service.ts` processing logic, which transforms and extracts AI-provided markings into database schemas.
