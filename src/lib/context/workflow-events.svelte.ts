/**
 * WorkflowEventSource — SSE client for real-time workflow status updates.
 *
 * Connects to /api/workflow/events?runId={runId} using the browser's native
 * EventSource API. Manages reactive state via Svelte 5 $state runes and
 * handles reconnection with exponential backoff.
 *
 * Validates: Requirements 14.4, 14.5
 */

export interface StepEvent {
	runId: string;
	stepName: string;
	stepIndex: number;
	totalSteps: number;
	status: string;
	durationMs?: number;
}

export type WorkflowPhase =
	| 'idle'
	| 'generating'
	| 'extracting'
	| 'awaiting-ocr-review'
	| 'awaiting-validation'
	| 'validating'
	| 'awaiting-publish'
	| 'publishing'
	| 'complete'
	| 'error';

export type ConnectionStatus = 'connected' | 'reconnecting' | 'failed';

export class WorkflowEventSource {
	private source: EventSource | null = null;
	private reconnectAttempts = 0;
	private maxAttempts = 10;
	private baseDelay = 1000; // 1s, 2s, 4s, ... max 30s
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private currentRunId: string | null = null;

	// Reactive state (Svelte 5 $state runes)
	currentStep = $state<StepEvent | null>(null);
	completedSteps = $state<StepEvent[]>([]);
	workflowStatus = $state<WorkflowPhase>('idle');
	connectionStatus = $state<ConnectionStatus>('connected');
	error = $state<string | null>(null);
	
	// Callback for suspend events (Phase 7.7)
	onSuspend = $state<((data: any) => void) | null>(null);

	/**
	 * Connect to the SSE endpoint for a given workflow run.
	 * Closes any existing connection before opening a new one.
	 */
	connect(runId: string): void {
		// Clean up any existing connection
		this.disconnect();

		this.currentRunId = runId;
		this.error = null;
		this.connectionStatus = 'connected';

		const url = `/api/workflow/events?runId=${encodeURIComponent(runId)}`;
		this.source = new EventSource(url);

		// Handle native EventSource events
		this.source.addEventListener('connected', (event: MessageEvent) => {
			this.connectionStatus = 'connected';
			this.reconnectAttempts = 0;
		});

		this.source.addEventListener('catchup', (event: MessageEvent) => {
			try {
				const data = JSON.parse(event.data) as {
					currentStepIndex: number;
					totalSteps: number;
					completedSteps: Array<{
						stepName: string;
						stepIndex: number;
						status: string;
						durationMs: number;
					}>;
				};
				this.completedSteps = data.completedSteps.map((step) => ({
					runId,
					stepName: step.stepName,
					stepIndex: step.stepIndex,
					totalSteps: data.totalSteps,
					status: step.status,
					durationMs: step.durationMs,
				}));
			} catch {
				// Ignore malformed catchup data
			}
		});

		this.source.addEventListener('step-progress', (event: MessageEvent) => {
			try {
				const data = JSON.parse(event.data) as StepEvent;
				this.currentStep = data;
				this.workflowStatus = this.derivePhase(data.stepName);
			} catch {
				// Ignore malformed step-progress data
			}
		});

		this.source.addEventListener('step-complete', (event: MessageEvent) => {
			try {
				const data = JSON.parse(event.data) as StepEvent;
				this.completedSteps = [...this.completedSteps, data];
				this.currentStep = data;
			} catch {
				// Ignore malformed step-complete data
			}
		});

		this.source.addEventListener('step-error', (event: MessageEvent) => {
			try {
				const data = JSON.parse(event.data) as {
					runId: string;
					stepName: string;
					error: string;
					canContinue: boolean;
				};
				this.error = data.error;
				this.workflowStatus = 'error';
			} catch {
				// Ignore malformed step-error data
			}
		});

		this.source.addEventListener('suspend', (event: MessageEvent) => {
			try {
				const data = JSON.parse(event.data);
				this.workflowStatus = 'awaiting-ocr-review';
				if (this.onSuspend) {
					this.onSuspend(data);
				}
			} catch {
				// Ignore malformed suspend data
			}
		});

		this.source.addEventListener('workflow-complete', (event: MessageEvent) => {
			try {
				const data = JSON.parse(event.data) as {
					runId: string;
					status: 'success' | 'partial-failure';
					totalDurationMs: number;
					stepsCompleted: number;
					stepsFailed: number;
				};
				this.workflowStatus = 'complete';
				this.currentStep = null;
			} catch {
				// Ignore malformed workflow-complete data
			}
		});

		// Handle connection errors — attempt reconnection
		this.source.onerror = () => {
			this.handleReconnect();
		};
	}

	/**
	 * Disconnect from the SSE endpoint and clean up all state.
	 */
	disconnect(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		if (this.source) {
			this.source.close();
			this.source = null;
		}
		this.reconnectAttempts = 0;
		this.currentRunId = null;
	}

	/**
	 * Handle reconnection with exponential backoff.
	 * After maxAttempts (10), sets connectionStatus to 'failed'.
	 */
	private handleReconnect(): void {
		// Close the broken connection
		if (this.source) {
			this.source.close();
			this.source = null;
		}

		if (this.reconnectAttempts >= this.maxAttempts) {
			this.connectionStatus = 'failed';
			return;
		}

		this.connectionStatus = 'reconnecting';
		const delay = this.getBackoffDelay();
		this.reconnectAttempts++;

		this.reconnectTimer = setTimeout(() => {
			if (this.currentRunId) {
				this.connect(this.currentRunId);
			}
		}, delay);
	}

	/**
	 * Calculate exponential backoff delay: min(baseDelay * 2^attempts, 30000)
	 */
	getBackoffDelay(): number {
		return Math.min(this.baseDelay * Math.pow(2, this.reconnectAttempts), 30_000);
	}

	/**
	 * Derive the workflow phase from the current step name.
	 * Maps known step names to WorkflowPhase values.
	 */
	private derivePhase(stepName: string): WorkflowPhase {
		const normalized = stepName.toLowerCase();
		if (normalized.includes('generat')) return 'generating';
		if (normalized.includes('extract')) return 'extracting';
		if (normalized.includes('suspend') || normalized.includes('review')) return 'awaiting-ocr-review';
		if (normalized.includes('await') && normalized.includes('valid')) return 'awaiting-validation';
		if (normalized.includes('valid')) return 'validating';
		if (normalized.includes('await') && normalized.includes('publish')) return 'awaiting-publish';
		if (normalized.includes('publish') || normalized.includes('dispatch')) return 'publishing';
		if (normalized.includes('complete')) return 'complete';
		return this.workflowStatus; // Keep current phase if unrecognized
	}
}
