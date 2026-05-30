/// <reference lib="webworker" />

export interface ExtractionWorkerMessage {
  type: 'START_BATCH';
  payload: {
    workspace: string;
    fileKeys: string[];
  };
}

export interface ExtractionWorkerResponse {
  type: 'PROGRESS' | 'COMPLETE' | 'ERROR';
  payload?: any;
  error?: string;
}

const pollInterval = 3000; // 3 seconds

self.addEventListener('message', async (e: MessageEvent<ExtractionWorkerMessage>) => {
  const { type, payload } = e.data;

  if (type === 'START_BATCH') {
    try {
      // 1. Start batch job
      const startRes = await fetch('/api/file/ocr/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!startRes.ok) {
        throw new Error(`Failed to start batch job: ${await startRes.text()}`);
      }
      
      const { jobId, totalFiles } = await startRes.json();
      
      postMessage({ type: 'PROGRESS', payload: { status: 'STARTED', jobId, totalFiles, succeeded: 0, failed: 0 } });

      // 2. Poll status
      let isComplete = false;
      let outputFileId: string | null = null;
      let succeeded = 0;
      let failed = 0;
      let total = totalFiles;

      while (!isComplete) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        const pollRes = await fetch(`/api/file/ocr/batch?jobId=${jobId}`);
        if (!pollRes.ok) {
          throw new Error(`Failed to poll batch job: ${await pollRes.text()}`);
        }
        
        const status = await pollRes.json();
        succeeded = status.succeeded;
        failed = status.failed;
        total = status.total;

        postMessage({ type: 'PROGRESS', payload: { status: status.status, jobId, totalFiles: total, succeeded, failed } });

        if (status.status === 'SUCCESS' || status.status === 'ERROR' || status.status === 'CANCELED') {
          isComplete = true;
          outputFileId = status.outputFileId;
        }
      }

      if (outputFileId) {
        // 3. Download results
        const downloadRes = await fetch('/api/file/ocr/batch/results', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId, workspace: payload.workspace, outputFileId })
        });
        
        if (!downloadRes.ok) {
          throw new Error(`Failed to download batch results: ${await downloadRes.text()}`);
        }
        
        const { results } = await downloadRes.json();
        postMessage({ type: 'COMPLETE', payload: { jobId, results, succeeded, failed, total } });
      } else {
        throw new Error(`Batch job did not return an outputFileId`);
      }

    } catch (error: any) {
      postMessage({ type: 'ERROR', error: error.message });
    }
  }
});
