import { error, type RequestHandler } from '@sveltejs/kit';
import { mastra } from '$lib/server/mastra';
import { EdApexGateway } from '$lib/server/mastra/gateway';
import { createMastraDb } from '$lib/server/mastra/db';
import { copilotRequestSchema } from '$lib/server/mastra/editor/schemas';

export const POST: RequestHandler = async ({ request, locals: { user } }) => {
	if (!user) error(401, 'Unauthorized');

	try {
		const body = await request.json();
		const parsed = copilotRequestSchema.safeParse(body);

		if (!parsed.success) {
			return new Response(`Invalid request: ${parsed.error.message}`, { status: 400 });
		}

		const mastraDb = createMastraDb();
		const gateway = new EdApexGateway(mastraDb, user.id);
		mastra.addGateway(gateway);

		const agent = mastra.getAgent('editorCopilot');

		const result = await agent.generate(parsed.data.prompt, {
			abortSignal: request.signal,
			instructions: parsed.data.system,
			modelSettings: {
				maxOutputTokens: 50,
				temperature: 0.7,
			},
		});

		return Response.json({ text: result.text });
	} catch (err: any) {
		const isAbort = request.signal.aborted || err.name === 'AbortError' || err.message?.includes('aborted');
		
		if (!isAbort) {
			console.error(`[Copilot] Background generation failed:`, err.message || err);
		}
		
		// Always return 204 No Content for background ghost text errors to prevent frontend 500 console spam.
		// The frontend will simply not show any ghost text, which is the intended graceful degradation.
		return new Response(null, { status: 204 });
	}
};
