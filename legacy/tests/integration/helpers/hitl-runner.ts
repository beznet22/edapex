import { handleWorkflowStream } from '@mastra/ai-sdk';
import type { RequestContext } from '@mastra/core/request-context';
import { randomUUID } from 'crypto';
import { buildRequestContext } from '$lib/server/helpers/chat-helper';
import { mastra } from '$lib/server/mastra';
import type { TenantContext } from '$lib/server/mastra/tenant-context';
import { collectStream, type CollectedStream, type DataEvent } from './stream-consumer';

interface RunWorkflowOptions {
  tenant: TenantContext;
  prompt: string;
}

interface ResumeGateOptions {
  tenant: TenantContext;
  runId: string;
  stepId: string;
  selectedOptionId: string;
  originalPrompt: string;
}

interface WorkflowResult {
  dataEvents: DataEvent[];
  pendingGate: {
    stepId: string;
    options: Array<{ label: string; id: string }>;
  } | null;
  runId: string;
}

function extractPendingGate(collected: CollectedStream): WorkflowResult['pendingGate'] {
  const selectEvent = collected.dataEvents.find((e) => e.type === 'data-selectOption');
  if (!selectEvent) return null;
  const data = selectEvent.data as {
    stepId?: string;
    options?: Array<{ label: string; id: string }>;
  };
  return {
    stepId: data.stepId ?? 'unknown',
    options: data.options ?? []
  };
}

export async function runWorkflow({ tenant, prompt }: RunWorkflowOptions): Promise<WorkflowResult> {
  const requestContext = await buildRequestContext({
    context: tenant,
    userId: tenant.userId,
    modelId: '',
    isSlashCommand: prompt.trim().startsWith('/'),
    lastMessage: prompt
  });

  const runId = randomUUID();
  const stream = await handleWorkflowStream({
    version: 'v6',
    mastra,
    workflowId: 'chatWorkflow',
    params: {
      runId,
      inputData: {
        threadId: randomUUID(),
        resourceId: `user-${tenant.userId}`,
        promptText: prompt,
        fileReferences: []
      },
      requestContext: requestContext as RequestContext<unknown>
    },
    sendReasoning: false,
    sendSources: false
  });

  const collected = await collectStream(stream as never, { label: 'runWorkflow', timeoutMs: 180_000 });
  return {
    dataEvents: collected.dataEvents,
    pendingGate: extractPendingGate(collected),
    runId
  };
}

export async function resumePendingGate({
  tenant,
  runId,
  selectedOptionId,
  originalPrompt
}: ResumeGateOptions): Promise<{ dataEvents: DataEvent[] }> {
  const requestContext = await buildRequestContext({
    context: tenant,
    userId: tenant.userId,
    modelId: '',
    isSlashCommand: originalPrompt.trim().startsWith('/'),
    lastMessage: originalPrompt
  });

  requestContext.set('pendingSelection', {
    id: selectedOptionId,
    label: selectedOptionId
  } as never);

  const stream = await handleWorkflowStream({
    version: 'v6',
    mastra,
    workflowId: 'chatWorkflow',
    params: {
      runId,
      inputData: {
        threadId: randomUUID(),
        resourceId: `user-${tenant.userId}`,
        promptText: originalPrompt,
        fileReferences: []
      },
      resumeData: {
        selectedOptionId
      },
      requestContext: requestContext as RequestContext<unknown>
    },
    sendReasoning: false,
    sendSources: false
  });

  const collected = await collectStream(stream as never, { label: 'resumePendingGate', timeoutMs: 180_000 });
  return { dataEvents: collected.dataEvents };
}
