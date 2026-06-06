import { watch, type FSWatcher } from 'chokidar';
import { writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { SkillRegistry } from './skill-registry';

interface WatcherState {
	status: 'running' | 'paused' | 'dead';
	lastEvent: number;
	lockReason: string | null;
}

/**
 * Dev-only file watcher for `.skill.md` hot-reload.
 * Implements 500ms debounce, Agent-Lock (pause during WriteTurn),
 * and auto-healing on watcher death (spec: mastra_migration_specs.md L47, L77-80).
 */
export class SkillWatcher {
	private watcher: FSWatcher | null = null;
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private state: WatcherState = { status: 'dead', lastEvent: 0, lockReason: null };
	private pendingReloads = new Set<string>();
	private readonly DEBOUNCE_MS = 500;
	private readonly AUTO_HEAL_MS = 2000;

	constructor(
		private readonly skillDir: string,
		private readonly registry: SkillRegistry,
		private readonly knownTools: Set<string>,
		private readonly onReload?: (files: string[]) => void
	) {}

	start(): void {
		if (this.watcher) return;

		this.watcher = watch(join(this.skillDir, '*.skill.md'), {
			persistent: true,
			ignoreInitial: false,
			awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }
		});

		this.watcher
			.on('add', (path: string) => this.handleFileEvent(path))
			.on('change', (path: string) => this.handleFileEvent(path))
			.on('error', (error: unknown) => this.handleError(error as Error));

		this.state.status = 'running';
	}

	stop(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}

		if (this.watcher) {
			this.watcher.close();
			this.watcher = null;
		}

		this.state.status = 'dead';
		this.pendingReloads.clear();
	}

	/**
	 * Agent-Lock: pause watcher events during WriteTurn to prevent
	 * watcher thrashing from agent-generated filesystem mutations.
	 */
	pauseWatcher(reason: string): void {
		this.state.status = 'paused';
		this.state.lockReason = reason;
	}

	resumeWatcher(): void {
		this.state.status = 'running';
		this.state.lockReason = null;

		if (this.pendingReloads.size > 0) {
			this.flushPendingReloads();
		}
	}

	getStatus(): WatcherState {
		return { ...this.state };
	}

	private handleFileEvent(filePath: string): void {
		if (this.state.status === 'paused') {
			this.pendingReloads.add(filePath);
			return;
		}

		this.pendingReloads.add(filePath);

		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}

		this.debounceTimer = setTimeout(() => {
			this.flushPendingReloads();
		}, this.DEBOUNCE_MS);
	}

	private async flushPendingReloads(): Promise<void> {
		const files = Array.from(this.pendingReloads);
		this.pendingReloads.clear();

		try {
			await this.registry.loadFromDirectory(this.skillDir, this.knownTools);
			this.state.lastEvent = Date.now();
			this.onReload?.(files);
		} catch (error) {
			console.error('[SkillWatcher] Reload failed:', error);
		}
	}

	private handleError(error: Error): void {
		console.error('[SkillWatcher] Watcher error:', error);
		this.state.status = 'dead';

		// Auto-healing: recreate after 2s delay
		setTimeout(() => {
			if (this.state.status === 'dead') {
				console.log('[SkillWatcher] Auto-healing: restarting watcher');
				this.watcher = null;
				this.start();
			}
		}, this.AUTO_HEAL_MS);
	}
}

/**
 * Transactional write: write to a temp file then atomically rename.
 * Prevents watcher from seeing partial writes (spec: implementation_checklist.md L25).
 */
export function transactionalWrite(targetPath: string, content: string): void {
	const dir = dirname(targetPath);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}

	const tempPath = join(dir, `.tmp-${randomBytes(8).toString('hex')}`);

	writeFileSync(tempPath, content, 'utf-8');
	renameSync(tempPath, targetPath);
}
