import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { mastra } from '$lib/server/mastra';
import { z } from 'zod';
import { createMastraDb } from '$lib/server/mastra/db';
import { EdApexGateway } from '$lib/server/mastra/gateway';
import { createWorkflowStateReader } from '@mastra/core/workflows';

const resumeRequestSchema = z.object({
  workflowId: z.string(),
  runId: z.string(),
  stepId: z.string(),
  resumeData: z.any()
});

export const POST: RequestHandler = async ({ request, locals }) => {
  const { session, user } = locals;
  if (!user) error(401, 'Unauthorized');

  try {
    const body = await request.json();
    const parsed = resumeRequestSchema.safeParse(body);
    if (!parsed.success) {
      error(400, `Invalid request: ${parsed.error.message}`);
    }

    const { workflowId, runId, stepId, resumeData } = parsed.data;

    const mastraDb = createMastraDb();
    const gateway = new EdApexGateway(mastraDb, user.id);
    mastra.addGateway(gateway);

    const workflow = mastra.getWorkflow(workflowId);
    if (!workflow) {
      error(404, `Workflow ${workflowId} not found`);
    }

    const state = await workflow.getWorkflowRunById(runId);
    if (!state) {
      error(404, `Run ${runId} not found`);
    }
    
    if (state.status !== 'suspended') {
      error(400, `Workflow run is not suspended. Status: ${state.status}`);
    }

    const reader = createWorkflowStateReader(state);
    const suspended = reader.getSuspendedStep();
    if (!suspended) {
      error(400, `No suspended step found in run: ${runId}`);
    }

    const run = await workflow.createRun({ runId: state.runId });

    const result = await run.resume({
      step: suspended.path as any,
      resumeData,
      forEachIndex: suspended.foreachIndex
    });

    return json({
      success: true,
      result
    });
  } catch (err: any) {
    console.error('[workflow-resume] Failed to resume workflow:', err);
    error(500, err.message || 'Internal server error resuming workflow');
  }
};
