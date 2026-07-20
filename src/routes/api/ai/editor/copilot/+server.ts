import { error, type RequestHandler } from '@sveltejs/kit';
import { mastra } from '$lib/server/mastra';
import { copilotRequestSchema } from '$lib/server/mastra/editor/schemas';
import { buildWorkspaceRequestContext, resolveWorkspaceContext } from '$lib/server/helpers/chat-helper';
import { buildCopilotSystemPrompt } from '$lib/server/mastra/agents/editor-copilot';
import { resolveModelForRequest, pickDefaultModelId } from '$lib/server/mastra/provider';
import { resolveUserRole } from '$lib/server/mastra/provider/role-resolver';
import { getAppDb } from '$lib/server/mastra/storage/libsql/app-db';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ request, locals: { user }, cookies }) => {
	if (!user) error(401, 'Unauthorized');

	try {
		const body = await request.json();
		const parsed = copilotRequestSchema.safeParse(body);

		if (!parsed.success) {
			return new Response(`Invalid request: ${parsed.error.message}`, { status: 400 });
		}

		const { tenant: tenantContext } = await resolveWorkspaceContext(cookies, {
			id: user.id,
			schoolId: user.schoolId ?? null,
			staffId: (user as { staffId?: number }).staffId ?? null,
			designationId: (user as { designationId?: number }).designationId ?? null,
			roleId: (user as { roleId?: number | null }).roleId ?? null,
		});

		// Resolve the user's per-request model through the 4-tier router
		// so the copilot agent uses their own key (tier 1) before pool
		// (tier 2) and env (tier 3). Failure is non-fatal: the agent's
		// `model` callback falls through to its per-call env default.
		const cookieModel = cookies.get('selected-model') ?? '';
		const db = getAppDb();
		const envKeys = env as Record<string, string | undefined>;
		const traceContext = {
			userId: user.id,
			schoolId: tenantContext.schoolId,
			actorStaffId: tenantContext.staffId,
			userRole: resolveUserRole(tenantContext.designationId),
			todayTokenUsage: 0
		};
		let modelConfig: Awaited<ReturnType<typeof resolveModelForRequest>> | null = null;
		try {
			if (cookieModel) {
				modelConfig = await resolveModelForRequest(
					user.id, cookieModel, db, undefined, traceContext
				);
			} else {
				const defaultId = await pickDefaultModelId(db, envKeys, {
					userId: user.id,
					schoolId: tenantContext.schoolId,
					userRole: traceContext.userRole
				});
				if (defaultId) {
					modelConfig = await resolveModelForRequest(
						user.id, defaultId, db, undefined, traceContext
					);
				}
			}
		} catch (err) {
			console.warn('[editor-copilot] model resolution skipped:', err instanceof Error ? err.message : err);
		}

		const requestContext = buildWorkspaceRequestContext(
			tenantContext,
			modelConfig ? { config: modelConfig.config, providerOptions: modelConfig.providerOptions } : undefined
		);

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
