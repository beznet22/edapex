import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const inputSchema = z.object({
  taskId: z.string(),
  tenantId: z.string(),
  reason: z.string(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium')
});

export interface AiServiceContract {
  updateTask(tenantId: string, taskId: string, data: Record<string, any>): Promise<any>;
}

/**
 * request_human_operator
 * Tool for agents to escalate tasks to a human operator when confidence is low
 * or when a policy requires human-in-the-loop (HITL) approval.
 */
export const requestHumanOperatorTool = (aiService: AiServiceContract) => 
  createTool({
    id: 'request_human_operator',
    description: 'Request a human operator to intervene or provide approval.',
    inputSchema,
    execute: async ({ input }: { input: z.infer<typeof inputSchema> }) => {
      const { taskId, tenantId, reason, priority } = input;

      // 1. Update task status in DB
      // We use a generic updateTask call on the service
      if (aiService?.updateTask) {
        await aiService.updateTask(tenantId, taskId, {
          status: 'pending_human', // Standardized cross-domain status
          metadata: {
            handoff_reason: reason,
            priority,
            handoff_at: new Date().toISOString(),
          }
        });
      }

      return {
        success: true,
        message: 'Human operator requested. Task status updated to pending_human.',
        taskId,
      };
    },
  });
