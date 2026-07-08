import { error, type RequestHandler } from '@sveltejs/kit';
import { mastra } from '$lib/server/mastra';
import { copilotRequestSchema } from '$lib/server/mastra/editor/schemas';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';
import { ALLOWED_DESIGNATIONS } from "$lib/types/sms-types";
import { createTenantContext } from '$lib/server/mastra/tenant-context';
import { buildCopilotSystemPrompt } from '$lib/server/mastra/agents/editor-copilot';

export const POST: RequestHandler = async ({ request, locals: { user } }) => {
	if (!user) error(401, 'Unauthorized');

	try {
		const body = await request.json();
		const parsed = copilotRequestSchema.safeParse(body);

		if (!parsed.success) {
			return new Response(`Invalid request: ${parsed.error.message}`, { status: 400 });
		}

		const tenantContext = createTenantContext({
			schoolId: user.schoolId ?? 1,
			userId: user.id,
			staffId: (user as any).staffId ?? 1,
			designationId: (user as any).designationId ?? ALLOWED_DESIGNATIONS.IT,
			roleId: (user as any).roleId ?? null,
			classId: (user as any).classId ?? null,
			sectionId: (user as any).sectionId ?? null,
			examId: null,
			academicId: (user as any).academicId ?? null,
		});
		const requestContext = buildWorkspaceRequestContext(tenantContext);

		const agent = mastra.getAgent('editorCopilot');

		// Prefer the explicit `system` from the client; fall back to a
		// context-aware prompt built from `parsed.data.context` so the
		// auto-debounce path (which sends no system) still gets rich
		// instructions derived from tenant metadata + cursorPosition.
		const instructions =
			parsed.data.system ?? buildCopilotSystemPrompt(parsed.data.context);

		const result = await agent.generate(parsed.data.prompt, {
			abortSignal: request.signal,
			instructions,
			modelSettings: {
				maxOutputTokens: 64,
				temperature: 0.7,
			},
			requestContext,
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
