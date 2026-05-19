// Uses native Mastra API: workflow.watch() for WorkflowStreamEvent subscription.
// Custom SSE adapter layer handles browser delivery, keepalive, and reconnection.

import type { TenantContext } from './tenant-context';
import { randomUUID } from 'node:crypto';

export interface SSEClient {
  id: string;
  runId: string;
  tenantContext: TenantContext;
  controller: ReadableStreamDefaultController;
  lastKeepalive: number;
}

export interface StepEvent {
  runId: string;
  stepName: string;
  stepIndex: number;
  totalSteps: number;
  status: string; // max 200 chars
  durationMs?: number;
}

export interface WorkflowCompleteEvent {
  runId: string;
  status: 'success' | 'partial-failure';
  totalDurationMs: number;
  stepsCompleted: number;
  stepsFailed: number;
}

/**
 * Formats a payload as an SSE message string.
 * Format: `event: {type}\ndata: {json}\n\n`
 */
export function formatSSE(type: string, data: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * SSE Manager — thin adapter over Mastra's native workflow event system.
 * Manages client connections, keepalive, and event delivery to browsers.
 */
export class SSEManager {
  private clients = new Map<string, SSEClient>();
  private completedSteps = new Map<string, StepEvent[]>(); // runId → steps
  private keepaliveInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Register a new SSE client for a workflow run.
   * Returns the generated client ID.
   */
  registerClient(
    runId: string,
    tenantContext: TenantContext,
    controller: ReadableStreamDefaultController
  ): string {
    const clientId = randomUUID();
    const client: SSEClient = {
      id: clientId,
      runId,
      tenantContext,
      controller,
      lastKeepalive: Date.now(),
    };
    this.clients.set(clientId, client);
    return clientId;
  }

  /**
   * Remove a client from the registry.
   */
  removeClient(clientId: string): void {
    this.clients.delete(clientId);
  }

  /**
   * Emit a step progress event to all clients subscribed to the given runId.
   * Status is truncated to 200 characters.
   */
  emitProgress(event: StepEvent): void {
    const truncatedEvent: StepEvent = {
      ...event,
      status: event.status.slice(0, 200),
    };
    this.broadcast(event.runId, 'step-progress', truncatedEvent);
  }

  /**
   * Emit a step-complete event and buffer it for late-joining clients.
   */
  emitStepComplete(event: StepEvent): void {
    const truncatedEvent: StepEvent = {
      ...event,
      status: event.status.slice(0, 200),
    };

    // Buffer for catchup
    if (!this.completedSteps.has(event.runId)) {
      this.completedSteps.set(event.runId, []);
    }
    this.completedSteps.get(event.runId)!.push(truncatedEvent);

    this.broadcast(event.runId, 'step-complete', truncatedEvent);
  }

  /**
   * Emit a step-error event. Error message is truncated to 500 characters.
   */
  emitStepError(
    runId: string,
    stepName: string,
    error: string,
    canContinue: boolean
  ): void {
    const payload = {
      runId,
      stepName,
      error: error.slice(0, 500),
      canContinue,
    };
    this.broadcast(runId, 'step-error', payload);
  }

  /**
   * Emit a workflow-complete event and clean up the completed steps buffer.
   */
  emitWorkflowComplete(event: WorkflowCompleteEvent): void {
    this.broadcast(event.runId, 'workflow-complete', event);
    // Clean up completed steps buffer for this run
    this.completedSteps.delete(event.runId);
  }

  /**
   * Send catchup data to a late-joining client.
   * Delivers all previously completed steps for the client's runId.
   */
  emitCatchup(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const steps = this.completedSteps.get(client.runId);
    if (!steps || steps.length === 0) return;

    const lastStep = steps[steps.length - 1];
    const payload = {
      currentStepIndex: lastStep.stepIndex,
      totalSteps: lastStep.totalSteps,
      completedSteps: steps.map((s) => ({
        stepName: s.stepName,
        stepIndex: s.stepIndex,
        status: s.durationMs !== undefined ? 'completed' : 'failed',
        durationMs: s.durationMs ?? 0,
      })),
    };

    this.sendToClient(client, formatSSE('catchup', payload));
  }

  /**
   * Start the 30-second keepalive interval.
   * Sends `: keepalive\n\n` comment to all connected clients.
   * If a write fails, the client is terminated and removed.
   */
  startKeepalive(): void {
    if (this.keepaliveInterval) return;

    this.keepaliveInterval = setInterval(() => {
      const now = Date.now();
      for (const [clientId, client] of this.clients) {
        const success = this.sendToClient(client, ': keepalive\n\n');
        if (success) {
          client.lastKeepalive = now;
        } else {
          // Write failed — connection is closed, terminate and remove
          this.terminateClient(clientId);
        }
      }
    }, 30_000);
  }

  /**
   * Stop the keepalive interval.
   */
  stopKeepalive(): void {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
    }
  }

  /**
   * Get the number of connected clients (useful for testing/monitoring).
   */
  get clientCount(): number {
    return this.clients.size;
  }

  /**
   * Get the completed steps buffer for a run (useful for testing).
   */
  getCompletedSteps(runId: string): StepEvent[] {
    return this.completedSteps.get(runId) ?? [];
  }

  /**
   * Broadcast an SSE event to all clients subscribed to a given runId.
   */
  private broadcast(runId: string, eventType: string, data: unknown): void {
    const message = formatSSE(eventType, data);
    for (const [clientId, client] of this.clients) {
      if (client.runId === runId) {
        const success = this.sendToClient(client, message);
        if (!success) {
          this.terminateClient(clientId);
        }
      }
    }
  }

  /**
   * Send a raw SSE string to a client's controller.
   * Returns true on success, false if the write fails (connection closed).
   */
  private sendToClient(client: SSEClient, message: string): boolean {
    try {
      client.controller.enqueue(new TextEncoder().encode(message));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Terminate a client connection and remove from registry.
   */
  private terminateClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      try {
        client.controller.close();
      } catch {
        // Already closed, ignore
      }
      this.clients.delete(clientId);
    }
  }
}
