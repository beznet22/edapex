/**
 * Map the agent-loop output into the shared branch-input shape
 * ({ text, resolvedFiles }) so both `awaitValidationStep` and
 * `passthroughStep` can consume it. Replaces a `.map()` step for the
 * same reason as `seedAgentLoopStep` — see that file's header.
 */
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { agentLoopOutputSchema, chatWorkflowOutputSchema } from "$lib/server/mastra/utils/chat-schemas";

export const seedBranchInputStep = createStep({
    id: "seed-branch-input",
    description:
        "Project the agent-loop output into the { text, resolvedFiles } shape the downstream branch expects.",
    inputSchema: agentLoopOutputSchema,
    outputSchema: chatWorkflowOutputSchema,
    execute: async ({ inputData }) => ({
        text: inputData.text,
        resolvedFiles: inputData.resolvedFiles ?? [],
    }),
});
