import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
  env: {
    DATABASE_URL: 'mysql://test:test@localhost:3306/test',
    TOKEN_ENCRYPTION_KEY: 'test-encryption-key-32-chars-ok!'
  }
}));

import {
  SSEManager,
  formatSSE,
  type StepEvent,
  type WorkflowCompleteEvent,
} from '$lib/server/mastra/sse-manager';
import { createTenantContext } from '$lib/server/mastra/tenant-context';

/**
 * Creates a mock ReadableStreamDefaultController that captures enqueued chunks.
 */
function createMockController() {
  const chunks: Uint8Array[] = [];
  let closed = false;
  const controller = {
    enqueue(chunk: Uint8Array) {
      if (closed) throw new Error('Controller is closed');
      chunks.push(chunk);
    },
    close() {
      if (closed) throw new Error('Controller already closed');
      closed = true;
    },
    error(_reason?: any) {
      closed = true;
    },
    get desiredSize() {
      return 1;
    },
  } as unknown as ReadableStreamDefaultController;

  return {
    controller,
    getMessages(): string[] {
      return chunks.map((c) => new TextDecoder().decode(c));
    },
    getRawChunks() {
      return chunks;
    },
    isClosed() {
      return closed;
    },
    simulateClose() {
      closed = true;
    },
  };
}

function createTestTenantContext() {
  return createTenantContext({
    schoolId: 1,
    userId: 42,
    designationId: 8,
    classId: 10,
    sectionId: 2,
  });
}

describe('SSEManager', () => {
  let manager: SSEManager;

  beforeEach(() => {
    manager = new SSEManager();
  });

  afterEach(() => {
    manager.stopKeepalive();
  });

  describe('formatSSE', () => {
    it('formats event with type and JSON data', () => {
      const result = formatSSE('step-progress', { runId: 'run-1', step: 1 });
      expect(result).toBe('event: step-progress\ndata: {"runId":"run-1","step":1}\n\n');
    });

    it('handles complex nested data', () => {
      const data = { steps: [{ name: 'extract', index: 1 }], status: 'running' };
      const result = formatSSE('catchup', data);
      expect(result).toContain('event: catchup\n');
      expect(result).toContain(`data: ${JSON.stringify(data)}\n\n`);
    });

    it('handles empty data object', () => {
      const result = formatSSE('connected', {});
      expect(result).toBe('event: connected\ndata: {}\n\n');
    });
  });

  describe('registerClient', () => {
    it('returns a unique client ID', () => {
      const mock = createMockController();
      const ctx = createTestTenantContext();
      const clientId = manager.registerClient('run-1', ctx, mock.controller);

      expect(clientId).toBeDefined();
      expect(typeof clientId).toBe('string');
      expect(clientId.length).toBeGreaterThan(0);
    });

    it('increments client count', () => {
      const mock = createMockController();
      const ctx = createTestTenantContext();

      expect(manager.clientCount).toBe(0);
      manager.registerClient('run-1', ctx, mock.controller);
      expect(manager.clientCount).toBe(1);
      manager.registerClient('run-2', ctx, mock.controller);
      expect(manager.clientCount).toBe(2);
    });

    it('generates unique IDs for each client', () => {
      const mock1 = createMockController();
      const mock2 = createMockController();
      const ctx = createTestTenantContext();

      const id1 = manager.registerClient('run-1', ctx, mock1.controller);
      const id2 = manager.registerClient('run-1', ctx, mock2.controller);

      expect(id1).not.toBe(id2);
    });
  });

  describe('removeClient', () => {
    it('removes a registered client', () => {
      const mock = createMockController();
      const ctx = createTestTenantContext();
      const clientId = manager.registerClient('run-1', ctx, mock.controller);

      expect(manager.clientCount).toBe(1);
      manager.removeClient(clientId);
      expect(manager.clientCount).toBe(0);
    });

    it('does nothing for non-existent client ID', () => {
      expect(() => manager.removeClient('non-existent')).not.toThrow();
      expect(manager.clientCount).toBe(0);
    });
  });

  describe('emitProgress', () => {
    it('sends step-progress event to clients subscribed to the runId', () => {
      const mock = createMockController();
      const ctx = createTestTenantContext();
      manager.registerClient('run-1', ctx, mock.controller);

      const event: StepEvent = {
        runId: 'run-1',
        stepName: 'extract',
        stepIndex: 1,
        totalSteps: 3,
        status: 'Extracting data from document',
      };

      manager.emitProgress(event);

      const messages = mock.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain('event: step-progress\n');
      expect(messages[0]).toContain('"runId":"run-1"');
      expect(messages[0]).toContain('"stepName":"extract"');
    });

    it('does not send to clients subscribed to a different runId', () => {
      const mock1 = createMockController();
      const mock2 = createMockController();
      const ctx = createTestTenantContext();
      manager.registerClient('run-1', ctx, mock1.controller);
      manager.registerClient('run-2', ctx, mock2.controller);

      manager.emitProgress({
        runId: 'run-1',
        stepName: 'extract',
        stepIndex: 1,
        totalSteps: 3,
        status: 'Working...',
      });

      expect(mock1.getMessages()).toHaveLength(1);
      expect(mock2.getMessages()).toHaveLength(0);
    });

    it('truncates status to 200 characters', () => {
      const mock = createMockController();
      const ctx = createTestTenantContext();
      manager.registerClient('run-1', ctx, mock.controller);

      const longStatus = 'A'.repeat(300);
      manager.emitProgress({
        runId: 'run-1',
        stepName: 'extract',
        stepIndex: 1,
        totalSteps: 3,
        status: longStatus,
      });

      const messages = mock.getMessages();
      const parsed = JSON.parse(messages[0].split('data: ')[1].trim());
      expect(parsed.status.length).toBe(200);
    });
  });

  describe('emitStepComplete', () => {
    it('sends step-complete event to subscribed clients', () => {
      const mock = createMockController();
      const ctx = createTestTenantContext();
      manager.registerClient('run-1', ctx, mock.controller);

      const event: StepEvent = {
        runId: 'run-1',
        stepName: 'extract',
        stepIndex: 1,
        totalSteps: 3,
        status: 'Done',
        durationMs: 1500,
      };

      manager.emitStepComplete(event);

      const messages = mock.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain('event: step-complete\n');
      expect(messages[0]).toContain('"durationMs":1500');
    });

    it('buffers completed steps for catchup', () => {
      const mock = createMockController();
      const ctx = createTestTenantContext();
      manager.registerClient('run-1', ctx, mock.controller);

      manager.emitStepComplete({
        runId: 'run-1',
        stepName: 'step-1',
        stepIndex: 1,
        totalSteps: 3,
        status: 'Done',
        durationMs: 100,
      });

      manager.emitStepComplete({
        runId: 'run-1',
        stepName: 'step-2',
        stepIndex: 2,
        totalSteps: 3,
        status: 'Done',
        durationMs: 200,
      });

      const steps = manager.getCompletedSteps('run-1');
      expect(steps).toHaveLength(2);
      expect(steps[0].stepName).toBe('step-1');
      expect(steps[1].stepName).toBe('step-2');
    });

    it('truncates status to 200 characters', () => {
      const mock = createMockController();
      const ctx = createTestTenantContext();
      manager.registerClient('run-1', ctx, mock.controller);

      manager.emitStepComplete({
        runId: 'run-1',
        stepName: 'extract',
        stepIndex: 1,
        totalSteps: 3,
        status: 'X'.repeat(250),
        durationMs: 100,
      });

      const steps = manager.getCompletedSteps('run-1');
      expect(steps[0].status.length).toBe(200);
    });
  });

  describe('emitStepError', () => {
    it('sends step-error event with error details', () => {
      const mock = createMockController();
      const ctx = createTestTenantContext();
      manager.registerClient('run-1', ctx, mock.controller);

      manager.emitStepError('run-1', 'validate', 'Validation failed: missing fields', true);

      const messages = mock.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain('event: step-error\n');
      expect(messages[0]).toContain('"stepName":"validate"');
      expect(messages[0]).toContain('"canContinue":true');
      expect(messages[0]).toContain('"error":"Validation failed: missing fields"');
    });

    it('truncates error message to 500 characters', () => {
      const mock = createMockController();
      const ctx = createTestTenantContext();
      manager.registerClient('run-1', ctx, mock.controller);

      const longError = 'E'.repeat(700);
      manager.emitStepError('run-1', 'validate', longError, false);

      const messages = mock.getMessages();
      const parsed = JSON.parse(messages[0].split('data: ')[1].trim());
      expect(parsed.error.length).toBe(500);
      expect(parsed.canContinue).toBe(false);
    });
  });

  describe('emitWorkflowComplete', () => {
    it('sends workflow-complete event', () => {
      const mock = createMockController();
      const ctx = createTestTenantContext();
      manager.registerClient('run-1', ctx, mock.controller);

      const event: WorkflowCompleteEvent = {
        runId: 'run-1',
        status: 'success',
        totalDurationMs: 5000,
        stepsCompleted: 3,
        stepsFailed: 0,
      };

      manager.emitWorkflowComplete(event);

      const messages = mock.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain('event: workflow-complete\n');
      expect(messages[0]).toContain('"status":"success"');
      expect(messages[0]).toContain('"totalDurationMs":5000');
    });

    it('cleans up completed steps buffer after workflow completes', () => {
      const mock = createMockController();
      const ctx = createTestTenantContext();
      manager.registerClient('run-1', ctx, mock.controller);

      manager.emitStepComplete({
        runId: 'run-1',
        stepName: 'step-1',
        stepIndex: 1,
        totalSteps: 2,
        status: 'Done',
        durationMs: 100,
      });

      expect(manager.getCompletedSteps('run-1')).toHaveLength(1);

      manager.emitWorkflowComplete({
        runId: 'run-1',
        status: 'success',
        totalDurationMs: 1000,
        stepsCompleted: 2,
        stepsFailed: 0,
      });

      expect(manager.getCompletedSteps('run-1')).toHaveLength(0);
    });

    it('handles partial-failure status', () => {
      const mock = createMockController();
      const ctx = createTestTenantContext();
      manager.registerClient('run-1', ctx, mock.controller);

      manager.emitWorkflowComplete({
        runId: 'run-1',
        status: 'partial-failure',
        totalDurationMs: 3000,
        stepsCompleted: 2,
        stepsFailed: 1,
      });

      const messages = mock.getMessages();
      const parsed = JSON.parse(messages[0].split('data: ')[1].trim());
      expect(parsed.status).toBe('partial-failure');
      expect(parsed.stepsFailed).toBe(1);
    });
  });

  describe('emitCatchup', () => {
    it('sends catchup event with completed steps to a late-joining client', () => {
      const mock1 = createMockController();
      const mock2 = createMockController();
      const ctx = createTestTenantContext();

      // First client receives live events
      manager.registerClient('run-1', ctx, mock1.controller);

      manager.emitStepComplete({
        runId: 'run-1',
        stepName: 'step-1',
        stepIndex: 1,
        totalSteps: 3,
        status: 'Done',
        durationMs: 100,
      });

      manager.emitStepComplete({
        runId: 'run-1',
        stepName: 'step-2',
        stepIndex: 2,
        totalSteps: 3,
        status: 'Done',
        durationMs: 200,
      });

      // Late-joining client
      const clientId2 = manager.registerClient('run-1', ctx, mock2.controller);
      manager.emitCatchup(clientId2);

      const messages = mock2.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain('event: catchup\n');

      const parsed = JSON.parse(messages[0].split('data: ')[1].trim());
      expect(parsed.currentStepIndex).toBe(2);
      expect(parsed.totalSteps).toBe(3);
      expect(parsed.completedSteps).toHaveLength(2);
      expect(parsed.completedSteps[0].stepName).toBe('step-1');
      expect(parsed.completedSteps[1].stepName).toBe('step-2');
    });

    it('does nothing if no completed steps exist for the run', () => {
      const mock = createMockController();
      const ctx = createTestTenantContext();
      const clientId = manager.registerClient('run-1', ctx, mock.controller);

      manager.emitCatchup(clientId);

      expect(mock.getMessages()).toHaveLength(0);
    });

    it('does nothing for non-existent client', () => {
      expect(() => manager.emitCatchup('non-existent')).not.toThrow();
    });
  });

  describe('keepalive', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('sends keepalive comment every 30 seconds', () => {
      const mock = createMockController();
      const ctx = createTestTenantContext();
      manager.registerClient('run-1', ctx, mock.controller);

      manager.startKeepalive();

      vi.advanceTimersByTime(30_000);

      const messages = mock.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toBe(': keepalive\n\n');
    });

    it('sends multiple keepalives over time', () => {
      const mock = createMockController();
      const ctx = createTestTenantContext();
      manager.registerClient('run-1', ctx, mock.controller);

      manager.startKeepalive();

      vi.advanceTimersByTime(90_000); // 3 intervals

      const messages = mock.getMessages();
      expect(messages).toHaveLength(3);
      messages.forEach((msg) => expect(msg).toBe(': keepalive\n\n'));
    });

    it('removes client on write failure during keepalive', () => {
      const mock = createMockController();
      const ctx = createTestTenantContext();
      manager.registerClient('run-1', ctx, mock.controller);

      expect(manager.clientCount).toBe(1);

      // Simulate connection close
      mock.simulateClose();

      manager.startKeepalive();
      vi.advanceTimersByTime(30_000);

      expect(manager.clientCount).toBe(0);
    });

    it('does not start multiple intervals', () => {
      const mock = createMockController();
      const ctx = createTestTenantContext();
      manager.registerClient('run-1', ctx, mock.controller);

      manager.startKeepalive();
      manager.startKeepalive(); // second call should be no-op

      vi.advanceTimersByTime(30_000);

      // Should only get 1 keepalive, not 2
      expect(mock.getMessages()).toHaveLength(1);
    });

    it('stopKeepalive stops the interval', () => {
      const mock = createMockController();
      const ctx = createTestTenantContext();
      manager.registerClient('run-1', ctx, mock.controller);

      manager.startKeepalive();
      vi.advanceTimersByTime(30_000);
      expect(mock.getMessages()).toHaveLength(1);

      manager.stopKeepalive();
      vi.advanceTimersByTime(60_000);

      // No additional keepalives after stop
      expect(mock.getMessages()).toHaveLength(1);
    });
  });

  describe('connection failure handling', () => {
    it('removes client and closes controller on broadcast write failure', () => {
      const mock = createMockController();
      const ctx = createTestTenantContext();
      manager.registerClient('run-1', ctx, mock.controller);

      // Simulate connection close
      mock.simulateClose();

      manager.emitProgress({
        runId: 'run-1',
        stepName: 'extract',
        stepIndex: 1,
        totalSteps: 3,
        status: 'Working...',
      });

      expect(manager.clientCount).toBe(0);
    });

    it('only removes the failed client, not others on the same runId', () => {
      const mock1 = createMockController();
      const mock2 = createMockController();
      const ctx = createTestTenantContext();
      manager.registerClient('run-1', ctx, mock1.controller);
      manager.registerClient('run-1', ctx, mock2.controller);

      // Simulate first client disconnecting
      mock1.simulateClose();

      manager.emitProgress({
        runId: 'run-1',
        stepName: 'extract',
        stepIndex: 1,
        totalSteps: 3,
        status: 'Working...',
      });

      expect(manager.clientCount).toBe(1);
      expect(mock2.getMessages()).toHaveLength(1);
    });
  });

  describe('multi-client scenarios', () => {
    it('broadcasts to multiple clients on the same runId', () => {
      const mock1 = createMockController();
      const mock2 = createMockController();
      const ctx = createTestTenantContext();
      manager.registerClient('run-1', ctx, mock1.controller);
      manager.registerClient('run-1', ctx, mock2.controller);

      manager.emitProgress({
        runId: 'run-1',
        stepName: 'extract',
        stepIndex: 1,
        totalSteps: 3,
        status: 'Working...',
      });

      expect(mock1.getMessages()).toHaveLength(1);
      expect(mock2.getMessages()).toHaveLength(1);
    });

    it('isolates events between different runIds', () => {
      const mock1 = createMockController();
      const mock2 = createMockController();
      const ctx = createTestTenantContext();
      manager.registerClient('run-1', ctx, mock1.controller);
      manager.registerClient('run-2', ctx, mock2.controller);

      manager.emitStepComplete({
        runId: 'run-1',
        stepName: 'step-1',
        stepIndex: 1,
        totalSteps: 2,
        status: 'Done',
        durationMs: 100,
      });

      manager.emitStepError('run-2', 'step-1', 'Failed', false);

      expect(mock1.getMessages()).toHaveLength(1);
      expect(mock1.getMessages()[0]).toContain('step-complete');

      expect(mock2.getMessages()).toHaveLength(1);
      expect(mock2.getMessages()[0]).toContain('step-error');
    });
  });
});
