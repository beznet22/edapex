import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const requestSelectionSchema = z.object({
	options: z.array(z.object({ id: z.string(), label: z.string(), icon: z.string().optional() })),
	prompt: z.string(),
	contextKey: z.string(),
});

export type RequestSelectionInput = z.infer<typeof requestSelectionSchema>;

export type RequestSelectionResult = { status: "NEEDS_SELECTION" };

export async function requestSelectionLogic(
	context: { set(key: string, value: unknown): void },
	params: RequestSelectionInput,
): Promise<RequestSelectionResult> {
	context.set("pendingSelection", {
		options: params.options,
		prompt: params.prompt,
		contextKey: params.contextKey,
	});
	return { status: "NEEDS_SELECTION" };
}

export const requestSelectionTool = createTool({
	id: "request-selection",
	description:
		"Present a set of option cards to the user and suspend further processing until they make a choice. " +
		"The selected value is stored in the request context under the provided contextKey.",
	inputSchema: requestSelectionSchema,
	outputSchema: z.object({ status: z.literal("NEEDS_SELECTION") }),
	execute: async (input, context) => {
		const requestContext = context.requestContext;
		if (!requestContext) {
			throw new Error("REQUEST_CONTEXT_REQUIRED: request-selection requires an active request context");
		}
		return requestSelectionLogic(requestContext, input);
	},
	toModelOutput: (output) => {
		return output.status;
	},
});
