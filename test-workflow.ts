import { mastra } from './src/lib/server/mastra';
import { handleWorkflowStream } from '@mastra/ai-sdk';

async function test() {
  console.log('Testing handleWorkflowStream...');
  try {
    const workflowObj = mastra.getWorkflowById('chatWorkflow');
    console.log('WorkflowObj:', !!workflowObj);

    const stream = await handleWorkflowStream({
      version: 'v6',
      mastra,
      workflowId: 'chatWorkflow',
      params: {
        inputData: {
          threadId: 'test-thread',
          resourceId: 'test-resource',
          promptText: 'Hello',
          fileReferences: []
        }
      }
    });

    console.log('Got stream!', stream);

    // Read from stream
    const reader = stream.getReader();
    console.log('Reading...');
    const res1 = await reader.read();
    console.log('Res1:', res1);

  } catch (err) {
    console.error('Error:', err);
  }
}

test();
