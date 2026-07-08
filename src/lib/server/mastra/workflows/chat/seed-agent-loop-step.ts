/**
 * Map the workflow envelope (output of `hitlVerifyStep`) into the agent-loop
 * input shape. Replaces a `.map()` step because the internal mapping step
 * ships with `z.any()` for both input and output schemas, which silently
 * forwards `undefined` fields downstream and surfaces as cryptic
 * `WORKFLOW_STEP_INPUT_VALIDATION_FAILED` errors at the agent-loop step
 * (Mastra issues #10407, #11505, #14181).
 *
 * The typed input schema here makes the upstream contract explicit and
 * catches malformed envelopes before they reach the agent. Defensive
 * fallbacks (`?? init.x`) keep the step working whether the original
 * envelope or `getInitData()` carries the field — both should be present
 * in practice, but the `??` chain degrades gracefully if Mastra evolves
 * one of the two sources out of existence.
 */
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";
import {
    chatWorkflowInputSchema,
    fileStreamItemSchema,
    workflowEnvelopeSchema,
} from "$lib/server/mastra/utils/chat-schemas";

const outputSchema = z.object({
    promptText: z.string(),
    threadId: z.string(),
    resourceId: z.string(),
    resolvedFiles: z.array(fileStreamItemSchema).default([]),
    iteration: z.number().int().nonnegative().default(0),
});

export const seedAgentLoopStep = createStep({
    id: "seed-agent-loop",
    description:
        "Map the workflow envelope into the agent-loop input shape. Reads threadId/resourceId from the envelope and promptText from getInitData() with the envelope as a fallback.",
    inputSchema: workflowEnvelopeSchema,
    outputSchema,
    execute: async ({ inputData, getInitData }) => {
        const init =
            (getInitData() ?? {}) as Partial<
                z.infer<typeof chatWorkflowInputSchema>
            >;
        return {
            promptText: init.promptText ?? inputData.promptText ?? "",
            threadId: inputData.threadId ?? init.threadId ?? "",
            resourceId: inputData.resourceId ?? init.resourceId ?? "",
            resolvedFiles: inputData.fileItems ?? [],
            iteration: 0,
        };
    },
});
