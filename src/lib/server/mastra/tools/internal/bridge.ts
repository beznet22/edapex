import type { ToolExecutionContext } from '@mastra/core/tools';
import {
	buildMastraToolContext,
	type MastraToolContext
} from '$lib/server/mastra/tenant-context';

/**
 * Bridges a raw Mastra `ToolExecutionContext` into the
 * `MastraToolContext` shape that every `*Logic` helper in
 * `src/lib/server/mastra/tools/**` consumes (`tenantContext`, `getRepo`,
 * `getService`, `audit`). The bridged fields are merged onto the original
 * context so `writer`, `abortSignal`, and any other Mastra-provided fields
 * remain available to the tool.
 *
 * Background: several tools historically cast the raw context directly
 * to `MastraToolContext`, which works only when the bridge has already
 * been applied upstream. When the tool is invoked directly by an agent
 * (the `agent.stream` path in `assistant-step.ts`), no upstream bridge
 * exists, so `getRepo`/`tenantContext` were `undefined` and calls like
 * `getRepo(StudentRepository)` threw `TypeError: getRepo is not a
 * function`. Calling this helper at the top of `execute` is the fix.
 *
 * Usage:
 *   execute: async (input, context) => {
 *     const ctx = await bridgeToolContext(context);
 *     return myLogic(ctx, input);
 *   }
 *
 * If `requestContext` is `undefined`, `buildMastraToolContext` returns a
 * locked default whose `getRepo`/`getService` throw — matching the
 * pre-existing test-only fallback semantics.
 */
export async function bridgeToolContext(
	context: ToolExecutionContext
): Promise<ToolExecutionContext & MastraToolContext> {
	const bridged = await buildMastraToolContext(context.requestContext);
	return Object.assign(context, {
		tenantContext: bridged.tenantContext,
		getRepo: bridged.getRepo,
		getService: bridged.getService,
		getProvider: bridged.getProvider,
		audit: bridged.audit,
		mastra: bridged.mastra
	}) as ToolExecutionContext & MastraToolContext;
}
