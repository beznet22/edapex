import { allowAnonymousChats } from "$lib/constants";
import { error, json, type RequestHandler } from "@sveltejs/kit";
import { mastra } from "$lib/server/mastra";

/**
 * POST /api/chat/cancel
 *
 * Cancels a suspended HITL workflow run so it does not leak as an
 * orphan row in libSQL. Called by the client when the user clicks
 * Skip / Deny in the ActionBar.
 *
 * Body: { runId: string, artifactId?: string }
 *  - 400 if runId is missing
 *  - 401 if no authenticated user
 *  - 404 if no run with that id
 *  - 409 if the run is not in a cancellable state (not 'suspended')
 *  - 500 on unexpected error
 *  - 204 on success
 */
export const POST: RequestHandler = async ({ request, locals: { user, session } }) => {
	if ((!user || !session) && !allowAnonymousChats) error(401, "Unauthorized");
	if (!user) error(401, "User session required");

	let body: { runId?: string; artifactId?: string };
	try {
		body = (await request.json()) as { runId?: string; artifactId?: string };
	} catch {
		return json({ error: "Invalid JSON body" }, { status: 400 });
	}

	const { runId, artifactId } = body;
	if (!runId || typeof runId !== "string") {
		return json({ error: "runId required" }, { status: 400 });
	}

	const workflow = mastra.getWorkflow("chatWorkflow");
	if (!workflow) {
		console.error("[api/chat/cancel] chatWorkflow not registered");
		return json({ error: "workflow not found" }, { status: 500 });
	}

	// Verify the run exists and is in a cancellable state.
	// WorkflowRunStatus = 'running' | 'success' | 'failed' | 'tripwire' |
	//                     'suspended' | 'waiting' | 'pending' | 'canceled' |
	//                     'bailed' | 'paused'
	const runState = await workflow.getWorkflowRunById(runId);
	if (!runState) {
		return new Response(null, { status: 404 });
	}

	if (runState.status !== "suspended") {
		return new Response(null, { status: 409 });
	}

	try {
		// Rehydrate the existing run (do not create a new one) so we can
		// invoke its cancel() method, which aborts the active execution
		// and persists status='canceled' to storage.
		const run = await workflow.createRun({ runId });
		await run.cancel();
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error(`[api/chat/cancel] cancel failed for runId=${runId} artifactId=${artifactId ?? "(none)"}: ${msg}`);
		return json({ error: msg }, { status: 500 });
	}

	return new Response(null, { status: 204 });
};
