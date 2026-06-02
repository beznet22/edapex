/**
 * Singleton Mastra Instance — EdApex Sovereign Gateway
 *
 * Creates and exports a single Mastra instance with all agents registered.
 * This is the central entry point for the Mastra framework in EdApex.
 *
 * WHY A SINGLETON: Mastra's memory lifecycle requires agents to be registered
 * on a persistent Mastra instance for lifecycle hooks to fire correctly.
 * The `requestContext` mechanism provides tenant isolation without per-request instantiation.
 */
import { Mastra } from '@mastra/core';
import { supervisorAgent, assistantAgent, titleAgent } from './agents';
import { editorEditAgent, editorGenerateAgent, editorCopilotAgent, resultMapperAgent } from './agents';
import { editorCommandWorkflow } from './workflows/editor-command';
import { validationWorkflow } from './workflows/validation';
import { publishWorkflow } from './workflows/publish';
import { extractionWorkflow } from './workflows/extraction';
import { generateWorkflow } from './workflows/generate';
import { createMastraStorage } from './storage';

// ─── Singleton Mastra Instance ──────────────────────────────────────────────

/**
 * The singleton Mastra instance with all agents registered and shared storage.
 * Reuses the existing `createMastraStorage()` singleton from storage.ts.
 *
 * Agents registered here benefit from Mastra's full lifecycle management:
 * - Memory auto-persistence (save-messages hook fires after stream completes)
 * - Progressive streaming (text-delta chunks arrive as generated)
 * - Agent registry (agents discoverable via `mastra.getAgent(id)`)
 *
 * Custom gateways (EdApexGateway) are registered dynamically per-request
 * via `mastra.addGateway()` in the API route handler.
 */
export const mastra = new Mastra({
  agents: {
    assistant: assistantAgent,
    title: titleAgent,
    editorEdit: editorEditAgent,
    editorGenerate: editorGenerateAgent,
    editorCopilot: editorCopilotAgent,
    'result-mapper': resultMapperAgent,
  },
  workflows: {
    editorCommandWorkflow,
    validationWorkflow,
    publishWorkflow,
    extractionWorkflow,
    generateWorkflow,
  },
  storage: createMastraStorage(),
  server: {
    middleware: [
      async (context, next) => {
        await next();
      },
    ],
  },
});

// ─── Convenience Accessors ──────────────────────────────────────────────────

/**
 * Returns the singleton Mastra instance.
 */
export function getMastra(): Mastra {
  return mastra;
}

/**
 * Retrieves a registered agent by ID from the singleton Mastra instance.
 */
export function getAgent(id: 'supervisor' | 'assistant' | 'title' | 'editorEdit' | 'editorGenerate' | 'editorCopilot' | 'result-mapper') {
  return mastra.getAgent(id);
}

/**
 * Mastra Storage Helpers
 * 
 * These functions use the static Memory instance from the singleton Mastra
 * supervisor agent. This ensures the sidebar reads from the same Memory
 * instance that the agent writes to during streaming.
 */

export async function getMemory() {
  return await mastra.getAgent('assistant').getMemory();
}