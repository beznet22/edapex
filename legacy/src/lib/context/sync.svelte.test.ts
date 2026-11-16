import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AvailableModelsHolder, AVAILABLE_MODELS_STALE_MS, SelectedClass } from './sync.svelte';
import type { AugmentedModelInfo } from '$lib/provider/spec';
import type { ClassSection } from '$lib/types/result-types';

function makeModel(overrides: Partial<AugmentedModelInfo> = {}): AugmentedModelInfo {
	return {
		id: 'groq/test',
		providerId: 'groq',
		name: 'Test',
		capabilities: { tools: true, input: ['text/*'], output: ['text/*'], reasoning: false, thinkingEffort: false, vision: false },
		request: { headers: {}, body: {}, generation: {}, options: {} },
		variants: [],
		status: 'active',
		enabled: true,
		limit: { context: 8192, output: 4096 },
		tier: 'mid',
		description: '',
		isCatalogKnown: true,
		source: 'user',
		...overrides
	};
}

describe('AvailableModelsHolder', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('constructor', () => {
		it('marks the holder as fresh when given SSR data', () => {
			const holder = new AvailableModelsHolder([makeModel()], [], []);
			expect(holder.lastSyncedAt).toBe(Date.now());
			expect(holder.isStale).toBe(false);
		});

		it('marks the holder as not-synced when given no data', () => {
			const holder = new AvailableModelsHolder([], [], []);
			expect(holder.lastSyncedAt).toBe(0);
			expect(holder.isStale).toBe(true);
		});

		it('marks the holder as fresh when given hidden/enabled ids but no models', () => {
			const holder = new AvailableModelsHolder([], ['hidden-1'], ['enabled-1']);
			expect(holder.lastSyncedAt).toBe(Date.now());
			expect(holder.isStale).toBe(false);
		});
	});

	describe('isStale', () => {
		it('returns true after the configured stale window elapses', () => {
			const holder = new AvailableModelsHolder([makeModel()], [], []);
			vi.advanceTimersByTime(AVAILABLE_MODELS_STALE_MS + 1);
			expect(holder.isStale).toBe(true);
		});

		it('returns false within the configured stale window', () => {
			const holder = new AvailableModelsHolder([makeModel()], [], []);
			vi.advanceTimersByTime(AVAILABLE_MODELS_STALE_MS - 1);
			expect(holder.isStale).toBe(false);
		});
	});

	describe('isEnabled', () => {
		let holder: AvailableModelsHolder;

		beforeEach(() => {
			holder = new AvailableModelsHolder(
				[
					makeModel({ id: 'groq/auto-1', isCatalogKnown: true }),
					makeModel({ id: 'groq/auto-2', isCatalogKnown: true }),
					makeModel({ id: 'groq/discovered-1', isCatalogKnown: false })
				],
				['groq/auto-2'],
				['groq/discovered-1']
			);
		});

		it('returns true for catalog-known models not in hiddenIds', () => {
			expect(holder.isEnabled(makeModel({ id: 'groq/auto-1', isCatalogKnown: true }))).toBe(true);
		});

		it('returns false for catalog-known models in hiddenIds', () => {
			expect(holder.isEnabled(makeModel({ id: 'groq/auto-2', isCatalogKnown: true }))).toBe(false);
		});

		it('returns true for non-catalog models in enabledIds', () => {
			expect(holder.isEnabled(makeModel({ id: 'groq/discovered-1', isCatalogKnown: false }))).toBe(true);
		});

		it('returns false for non-catalog models NOT in enabledIds', () => {
			expect(holder.isEnabled(makeModel({ id: 'groq/discovered-2', isCatalogKnown: false }))).toBe(false);
		});
	});

	describe('visibleModels', () => {
		it('excludes hidden catalog models', () => {
			const holder = new AvailableModelsHolder(
				[
					makeModel({ id: 'groq/auto-1', isCatalogKnown: true }),
					makeModel({ id: 'groq/auto-2', isCatalogKnown: true })
				],
				['groq/auto-2'],
				[]
			);
			expect(holder.visibleModels.map((m) => m.id)).toEqual(['groq/auto-1']);
		});

		it('excludes non-catalog models that are not opted in', () => {
			const holder = new AvailableModelsHolder(
				[
					makeModel({ id: 'groq/auto-1', isCatalogKnown: true }),
					makeModel({ id: 'groq/discovered-1', isCatalogKnown: false })
				],
				[],
				[]
			);
			expect(holder.visibleModels.map((m) => m.id)).toEqual(['groq/auto-1']);
		});

		it('includes opted-in non-catalog models', () => {
			const holder = new AvailableModelsHolder(
				[
					makeModel({ id: 'groq/auto-1', isCatalogKnown: true }),
					makeModel({ id: 'groq/discovered-1', isCatalogKnown: false })
				],
				[],
				['groq/discovered-1']
			);
			expect(holder.visibleModels.map((m) => m.id).sort()).toEqual(['groq/auto-1', 'groq/discovered-1']);
		});
	});

	describe('replace', () => {
		it('updates models, hiddenIds, enabledIds, and lastSyncedAt atomically', () => {
			const holder = new AvailableModelsHolder([], [], []);
			expect(holder.lastSyncedAt).toBe(0);
			vi.advanceTimersByTime(1000);
			holder.replace(
				[makeModel({ id: 'groq/replaced', isCatalogKnown: true })],
				['hidden-x'],
				['enabled-y']
			);
			expect(holder.models.map((m) => m.id)).toEqual(['groq/replaced']);
			expect(holder.hiddenIds.has('hidden-x')).toBe(true);
			expect(holder.enabledIds.has('enabled-y')).toBe(true);
			expect(holder.lastSyncedAt).toBe(Date.now());
			expect(holder.syncing).toBe(false);
		});

		it('clears syncing on replace', () => {
			const holder = new AvailableModelsHolder([makeModel()], [], []);
			holder.markSyncing(true);
			expect(holder.syncing).toBe(true);
			holder.replace([makeModel()], [], []);
			expect(holder.syncing).toBe(false);
		});
	});

	describe('markSyncing', () => {
		it('toggles the syncing flag', () => {
			const holder = new AvailableModelsHolder([], [], []);
			expect(holder.syncing).toBe(false);
			holder.markSyncing(true);
			expect(holder.syncing).toBe(true);
			holder.markSyncing(false);
			expect(holder.syncing).toBe(false);
		});
	});
});

describe('SelectedClass', () => {
	describe('data', () => {
		it('round-trips a full ClassSection payload through JSON', () => {
			const payload: ClassSection = {
				id: 42,
				classId: 12,
				className: 'Grade 5',
				sectionId: 5,
				sectionName: 'A',
				academicId: 4,
			};
			const selected = new SelectedClass(JSON.stringify(payload));
			expect(selected.data).toEqual(payload);
		});

		it('returns null when value is empty', () => {
			const selected = new SelectedClass('');
			expect(selected.data).toBeNull();
		});

		it('returns null when the value is not valid JSON', () => {
			const selected = new SelectedClass('not-json');
			expect(selected.data).toBeNull();
		});

		it('preserves the underlying JSON value across rehydrate', () => {
			const payload: ClassSection = {
				id: 1,
				classId: 2,
				className: 'Grade 1',
				sectionId: 3,
				sectionName: 'B',
				academicId: 1,
			};
			const selected = new SelectedClass('');
			selected.rehydrate(JSON.stringify(payload));
			expect(selected.value).toBe(JSON.stringify(payload));
			expect(selected.data).toEqual(payload);
		});
	});
});

