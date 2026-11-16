/**
 * Tests that `OcrBatchService` re-resolves the Mistral API key on every
 * call (no module-level capture). The service must always use the
 * per-request user key (tier 1) → pool (tier 2) → env (tier 3) walk
 * defined by `resolveMistralApiKey`, never a captured env value.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const resolveMistralApiKeyMock = vi.fn();

vi.mock('$lib/server/mastra/provider/ocr-key-resolver', () => ({
	resolveMistralApiKey: (...args: unknown[]) => resolveMistralApiKeyMock(...args)
}));

let mistralConstructCount = 0;
const batchJobsGetMock = vi.fn();

vi.mock('@mistralai/mistralai', () => {
	function MockMistral() {
		mistralConstructCount++;
		return {
			batch: { jobs: { get: batchJobsGetMock } }
		};
	}
	return { Mistral: MockMistral };
});

import { ocrBatchService } from './ocr-batch.service';
import type { SerializedTenant } from '$lib/types/background-tasks';

function makeTenant(overrides: Partial<SerializedTenant> = {}): SerializedTenant {
	return {
		schoolId: 7,
		userId: 42,
		designationId: 8,
		staffId: 42,
		classId: 18,
		sectionId: 6,
		examTypeId: 1,
		academicId: 5,
		className: 'LOWER BASIC 2',
		sectionName: 'B',
		academicYearTitle: '2024-2025',
		userRole: 'class_teacher',
		...overrides
	};
}

beforeEach(() => {
	resolveMistralApiKeyMock.mockReset();
	batchJobsGetMock.mockReset();
	mistralConstructCount = 0;
	resolveMistralApiKeyMock.mockResolvedValue('gsk-test-key');
	batchJobsGetMock.mockResolvedValue({
		id: 'job-1',
		status: 'SUCCESS',
		succeededRequests: 3,
		failedRequests: 0,
		totalRequests: 3,
		outputFile: 'out-1',
		errorFile: 'err-1'
	});
});

describe('OcrBatchService — per-request key resolution (no module-level capture)', () => {
	it('forwards the tenant userRole to resolveMistralApiKey on every call', async () => {
		const tenant = makeTenant({ userId: 42, schoolId: 7, userRole: 'class_teacher' });

		await ocrBatchService.pollBatch('job-1', tenant, {} as any);

		expect(resolveMistralApiKeyMock).toHaveBeenCalledTimes(1);
		expect(resolveMistralApiKeyMock).toHaveBeenCalledWith(
			expect.objectContaining({ userId: 42, schoolId: 7, userRole: 'class_teacher' })
		);
	});

	it('does NOT cache the key between calls with different users', async () => {
		await ocrBatchService.pollBatch('job-1', makeTenant({ userId: 42, userRole: 'class_teacher' }), {} as any);
		await ocrBatchService.pollBatch('job-2', makeTenant({ userId: 99, userRole: 'coordinator' }), {} as any);

		expect(resolveMistralApiKeyMock).toHaveBeenCalledTimes(2);
		expect(resolveMistralApiKeyMock).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ userId: 42, userRole: 'class_teacher' })
		);
		expect(resolveMistralApiKeyMock).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ userId: 99, userRole: 'coordinator' })
		);
	});

	it('constructs a new Mistral client per call (no shared instance)', async () => {
		await ocrBatchService.pollBatch('job-1', makeTenant({ userId: 1 }), {} as any);
		await ocrBatchService.pollBatch('job-2', makeTenant({ userId: 2 }), {} as any);

		expect(mistralConstructCount).toBe(2);
	});

	it('passes userRole: null when the tenant has no role set (graceful fallback)', async () => {
		const tenant = makeTenant({ userRole: null });

		await ocrBatchService.pollBatch('job-1', tenant, {} as any);

		expect(resolveMistralApiKeyMock).toHaveBeenCalledWith(
			expect.objectContaining({ userRole: null })
		);
	});
});
