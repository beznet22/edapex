/**
 * Manifest tests — verify the strict per-exam manifest API:
 *   - writeManifest/addEntry/removeEntry/updateEntryStatus REQUIRE examTypeId
 *   - readManifest/readAllManifests/clearExamArtifacts operate per-exam
 *   - byKind is per-exam scope
 *   - no class-root manifest exists
 *
 * Uses a simple in-memory filesystem mock injected via vi.mock so the
 * tests don't touch the real disk. The mock implements the subset of
 * LocalFilesystem that manifest.ts uses: writeFile, readFile, exists,
 * readdir, rmdir.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- In-memory filesystem mock ----
class InMemoryFs {
	private files = new Map<string, string>();

	private normalize(path: string): string {
		return path.replace(/^\/+/, '');
	}

	async writeFile(path: string, content: string, options?: { recursive?: boolean }): Promise<void> {
		const norm = this.normalize(path);
		const dir = norm.split('/').slice(0, -1).join('/');
		if (options?.recursive && dir) {
			// Mark directory as having a file (we don't store directories explicitly).
		}
		this.files.set(norm, content);
	}

	async readFile(path: string, options?: { encoding?: BufferEncoding }): Promise<string | Buffer> {
		const norm = this.normalize(path);
		const value = this.files.get(norm);
		if (value === undefined) throw new Error(`ENOENT: ${path}`);
		if (options?.encoding === 'utf-8' || options?.encoding === 'utf8') return value;
		return Buffer.from(value, 'utf-8');
	}

	async exists(path: string): Promise<boolean> {
		const norm = this.normalize(path);
		// Direct file match.
		if (this.files.has(norm)) return true;
		// Directory match: any file with this prefix.
		if (norm === '') return this.files.size > 0;
		for (const key of this.files.keys()) {
			if (key === norm || key.startsWith(norm + '/')) return true;
		}
		return false;
	}

	async readdir(path: string, options?: { recursive?: boolean }): Promise<Array<{ name: string; type: 'file' | 'directory' }>> {
		const prefix = this.normalize(path);
		const out = new Map<string, { name: string; type: 'file' | 'directory' }>();
		for (const key of this.files.keys()) {
			if (prefix === '') {
				// Top-level readdir — return files + first-level directories.
				const [head, ...rest] = key.split('/');
				if (!head) continue;
				if (rest.length > 0) {
					out.set(head + '/', { name: head, type: 'directory' });
				} else {
					out.set(head, { name: head, type: 'file' });
				}
			} else if (key === prefix) {
				// exact match — ignored
			} else if (key.startsWith(prefix + '/')) {
				const tail = key.slice(prefix.length + 1);
				if (options?.recursive) {
					out.set(tail, { name: tail, type: 'file' });
				} else {
					const [head, ...rest] = tail.split('/');
					if (rest.length > 0) {
						out.set(head + '/', { name: head, type: 'directory' });
					} else {
						out.set(tail, { name: head, type: 'file' });
					}
				}
			}
		}
		return Array.from(out.values());
	}

	async rmdir(path: string, _options?: { recursive?: boolean }): Promise<void> {
		const prefix = this.normalize(path);
		for (const key of Array.from(this.files.keys())) {
			if (key === prefix || key.startsWith(prefix + '/')) {
				this.files.delete(key);
			}
		}
	}
}

const inMemoryFs = new InMemoryFs();

vi.mock('$lib/server/workspace', () => ({
	get tenantWorkspace() {
		return {
			resolveFilesystem: async () => inMemoryFs
		};
	}
}));

vi.mock('$lib/server/helpers/chat-helper', () => ({
	buildWorkspaceRequestContext: () => ({})
}));

const { createTenantContext } = await import('$lib/server/mastra/tenant-context');
const {
	addEntry,
	readManifest,
	writeManifest,
	readAllManifests,
	clearExamArtifacts,
	removeEntry,
	updateEntryStatus,
	emptyManifest,
	WorkspaceScopeError
} = await import('$lib/server/workspace/manifest');
const { manifestPath } = await import('$lib/server/workspace/paths');

const tenant = createTenantContext({
	schoolId: 1,
	userId: 1,
	staffId: 1,
	classId: 18,
	sectionId: 6,
	academicId: 5,
	className: 'LOWER BASIC 2',
	sectionName: 'B',
	academicYearTitle: '2024-2025'
});

beforeEach(() => {
	// Clear the in-memory fs between tests.
	for (const key of Array.from((inMemoryFs as any).files.keys())) {
		(inMemoryFs as any).files.delete(key);
	}
});

afterEach(() => {
	vi.clearAllMocks();
});

describe('manifestPath', () => {
	it('returns exams/examType-{id}/manifest.json', () => {
		expect(manifestPath(1)).toBe('exams/examType-1/manifest.json');
		expect(manifestPath(42)).toBe('exams/examType-42/manifest.json');
	});
});

describe('emptyManifest', () => {
	it('returns a manifest with the given examTypeId', () => {
		const m = emptyManifest(tenant, 1);
		expect(m.examTypeId).toBe(1);
		expect(m.entries).toEqual({});
		expect(m.byKind).toEqual({
			marksheets: [],
			transcripts: [],
			ocrUploads: [],
			pdfs: [],
			notes: []
		});
	});
});

describe('addEntry (strict examTypeId)', () => {
	it('throws when examTypeId is null', async () => {
		await expect(
			// @ts-expect-error — intentionally passing null at runtime
			addEntry(tenant, { path: 'x.md', kind: 'note', uploadedAt: '', modifiedAt: '' }, null)
		).rejects.toThrow(WorkspaceScopeError);
	});

	it('throws when examTypeId is undefined', async () => {
		await expect(
			// @ts-expect-error — intentionally passing undefined at runtime
			addEntry(tenant, { path: 'x.md', kind: 'note', uploadedAt: '', modifiedAt: '' }, undefined)
		).rejects.toThrow(WorkspaceScopeError);
	});

	it('writes to per-exam manifest when examTypeId is set', async () => {
		await addEntry(
			tenant,
			{ path: 'exams/examType-1/notes/policy.md', kind: 'note', uploadedAt: '2025-01-01', modifiedAt: '2025-01-01' },
			1
		);
		const m = await readManifest(tenant, 1);
		expect(m.examTypeId).toBe(1);
		expect(Object.keys(m.entries)).toContain('exams/examType-1/notes/policy.md');
		expect(m.byKind.notes).toHaveLength(1);
	});

	it('maintains byKind inside the per-exam manifest only', async () => {
		await addEntry(
			tenant,
			{ path: 'exams/examType-1/notes/a.md', kind: 'note', uploadedAt: '', modifiedAt: '' },
			1
		);
		await addEntry(
			tenant,
			{ path: 'exams/examType-2/notes/b.md', kind: 'note', uploadedAt: '', modifiedAt: '' },
			2
		);
		const m1 = await readManifest(tenant, 1);
		const m2 = await readManifest(tenant, 2);
		expect(m1.byKind.notes.map((n) => n.path)).toEqual(['exams/examType-1/notes/a.md']);
		expect(m2.byKind.notes.map((n) => n.path)).toEqual(['exams/examType-2/notes/b.md']);
	});
});

describe('readManifest', () => {
	it('returns emptyManifest when no file exists', async () => {
		const m = await readManifest(tenant, 1);
		expect(m.examTypeId).toBe(1);
		expect(Object.keys(m.entries)).toHaveLength(0);
	});

	it('reads per-exam manifest', async () => {
		await addEntry(
			tenant,
			{ path: 'exams/examType-1/uploads/foo.jpg', kind: 'user-file', uploadedAt: '', modifiedAt: '' },
			1
		);
		const m = await readManifest(tenant, 1);
		expect(Object.keys(m.entries)).toContain('exams/examType-1/uploads/foo.jpg');
	});

	it('does not fall back to class root', async () => {
		// No manifest exists anywhere. The class root has no manifest by design.
		const m = await readManifest(tenant, 1);
		expect(m.examTypeId).toBe(1);
		expect(m.entries).toEqual({});
	});
});

describe('readAllManifests', () => {
	it('returns empty array for fresh workspace', async () => {
		const all = await readAllManifests(tenant);
		expect(all).toEqual([]);
	});

	it('reads every per-exam manifest in parallel and sorts by examTypeId', async () => {
		await addEntry(
			tenant,
			{ path: 'exams/examType-1/notes/a.md', kind: 'note', uploadedAt: '', modifiedAt: '' },
			1
		);
		await addEntry(
			tenant,
			{ path: 'exams/examType-3/notes/b.md', kind: 'note', uploadedAt: '', modifiedAt: '' },
			3
		);
		await addEntry(
			tenant,
			{ path: 'exams/examType-2/notes/c.md', kind: 'note', uploadedAt: '', modifiedAt: '' },
			2
		);
		const all = await readAllManifests(tenant);
		expect(all.map((m) => m.examTypeId)).toEqual([1, 2, 3]);
	});
});

describe('removeEntry', () => {
	it('removes from the right per-exam manifest', async () => {
		await addEntry(
			tenant,
			{ path: 'exams/examType-1/notes/a.md', kind: 'note', uploadedAt: '', modifiedAt: '' },
			1
		);
		await addEntry(
			tenant,
			{ path: 'exams/examType-2/notes/b.md', kind: 'note', uploadedAt: '', modifiedAt: '' },
			2
		);
		await removeEntry(tenant, 'exams/examType-1/notes/a.md', 1);
		const m1 = await readManifest(tenant, 1);
		const m2 = await readManifest(tenant, 2);
		expect(m1.entries).toEqual({});
		expect(Object.keys(m2.entries)).toContain('exams/examType-2/notes/b.md');
	});

	it('throws when examTypeId is null', async () => {
		await expect(
			// @ts-expect-error — intentionally passing null at runtime
			removeEntry(tenant, 'x.md', null)
		).rejects.toThrow(WorkspaceScopeError);
	});
});

describe('updateEntryStatus', () => {
	it('updates status in the per-exam manifest', async () => {
		await addEntry(
			tenant,
			{
				path: 'exams/examType-1/marksheets/123.json',
				kind: 'marksheet-json',
				studentId: 123,
				uploadedAt: '2025-01-01',
				modifiedAt: '2025-01-01'
			},
			1
		);
		await updateEntryStatus(tenant, 'exams/examType-1/marksheets/123.json', 'validated', 1);
		const m = await readManifest(tenant, 1);
		expect(m.entries['exams/examType-1/marksheets/123.json']?.marksheetStatus).toBe('validated');
	});

	it('throws when examTypeId is null', async () => {
		await expect(
			// @ts-expect-error — intentionally passing null at runtime
			updateEntryStatus(tenant, 'x.md', 'validated', null)
		).rejects.toThrow(WorkspaceScopeError);
	});
});

describe('writeManifest', () => {
	it('stamps the validated examTypeId on the manifest', async () => {
		const m = emptyManifest(tenant, 7);
		m.entries['x.md'] = {
			path: 'x.md',
			kind: 'note',
			uploadedAt: '',
			modifiedAt: ''
		};
		await writeManifest(tenant, m, 7);
		const read = await readManifest(tenant, 7);
		expect(read.examTypeId).toBe(7);
	});

	it('throws when examTypeId is null', async () => {
		const m = emptyManifest(tenant, 1);
		await expect(
			// @ts-expect-error — intentionally passing null at runtime
			writeManifest(tenant, m, null)
		).rejects.toThrow(WorkspaceScopeError);
	});
});

describe('clearExamArtifacts', () => {
	it('removes the entire exams/examType-{id}/ directory', async () => {
		await addEntry(
			tenant,
			{ path: 'exams/examType-1/notes/a.md', kind: 'note', uploadedAt: '', modifiedAt: '' },
			1
		);
		await addEntry(
			tenant,
			{ path: 'exams/examType-2/notes/b.md', kind: 'note', uploadedAt: '', modifiedAt: '' },
			2
		);
		await clearExamArtifacts(tenant, 1);
		const m1 = await readManifest(tenant, 1);
		const m2 = await readManifest(tenant, 2);
		expect(m1.entries).toEqual({});
		expect(Object.keys(m2.entries)).toContain('exams/examType-2/notes/b.md');
	});

	it('does not affect other exam directories', async () => {
		await addEntry(
			tenant,
			{ path: 'exams/examType-1/notes/a.md', kind: 'note', uploadedAt: '', modifiedAt: '' },
			1
		);
		await addEntry(
			tenant,
			{ path: 'exams/examType-2/notes/b.md', kind: 'note', uploadedAt: '', modifiedAt: '' },
			2
		);
		await clearExamArtifacts(tenant, 1);
		const all = await readAllManifests(tenant);
		expect(all.map((m) => m.examTypeId)).toEqual([2]);
	});
});
