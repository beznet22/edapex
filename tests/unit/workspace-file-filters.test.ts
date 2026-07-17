/**
 * File mention filter — verifies the @-mention filter excludes the
 * examType-scoped `exams/examType-{id}/ocr/` and `scratch/` directories
 * introduced by the workspace refactor, while still excluding the
 * legacy top-level `ocr/` and `scratch/`.
 */
import { describe, it, expect } from 'vitest';
import { isMentionableFile, filterMentionableFiles } from '$lib/server/workspace/file-filters';

describe('file-filters / isMentionableFile', () => {
	describe('rejects non-files', () => {
		it('rejects directory entries', () => {
			expect(isMentionableFile({ name: 'marksheets', type: 'directory' })).toBe(false);
			expect(isMentionableFile({ name: 'exams', type: 'directory' })).toBe(false);
		});
	});

	describe('rejects dot-entries', () => {
		it('rejects "." and ".."', () => {
			expect(isMentionableFile({ name: '.', type: 'file' })).toBe(false);
			expect(isMentionableFile({ name: '..', type: 'file' })).toBe(false);
		});
	});

	describe('rejects JSON sidecars', () => {
		it('rejects any file ending in .json', () => {
			expect(isMentionableFile({ name: 'manifest.json', type: 'file' })).toBe(false);
			expect(isMentionableFile({ name: 'foo.meta.json', type: 'file' })).toBe(false);
		});
	});

	describe('rejects legacy top-level ocr/ and scratch/', () => {
		it('rejects ocr/<filename>', () => {
			expect(isMentionableFile({ name: 'ocr/al-azeem.md', type: 'file' })).toBe(false);
		});
		it('rejects scratch/<filename>', () => {
			expect(isMentionableFile({ name: 'scratch/notes.md', type: 'file' })).toBe(false);
		});
	});

	describe('rejects exam-scoped ocr/ and scratch/ under exams/examType-{id}/', () => {
		it('rejects exams/examType-1/ocr/<filename>', () => {
			expect(
				isMentionableFile({ name: 'exams/examType-1/ocr/al-azeem.md', type: 'file' })
			).toBe(false);
		});
		it('rejects exams/examType-2/scratch/<filename>', () => {
			expect(
				isMentionableFile({ name: 'exams/examType-2/scratch/notes.md', type: 'file' })
			).toBe(false);
		});
	});

	describe('accepts legitimate file kinds', () => {
		it('accepts uploads/<filename> (the user-uploaded file itself)', () => {
			expect(isMentionableFile({ name: 'uploads/al-azeem.jpg.jpeg', type: 'file' })).toBe(true);
		});
		it('accepts marksheets/<filename> (formatted marksheet)', () => {
			expect(isMentionableFile({ name: 'marksheets/123.json', type: 'file' })).toBe(false); // .json rejected
			expect(isMentionableFile({ name: 'marksheets/123.md', type: 'file' })).toBe(true);
		});
		it('accepts pdfs/<filename>', () => {
			expect(isMentionableFile({ name: 'pdfs/marksheet-123.pdf', type: 'file' })).toBe(true);
		});
		it('accepts exam-scoped uploads', () => {
			expect(
				isMentionableFile({ name: 'exams/examType-1/uploads/al-azeem.jpg.jpeg', type: 'file' })
			).toBe(true);
		});
		it('accepts exam-scoped marksheets (markdown)', () => {
			expect(
				isMentionableFile({ name: 'exams/examType-1/marksheets/123.md', type: 'file' })
			).toBe(true);
		});
	});
});

describe('file-filters / filterMentionableFiles', () => {
	it('returns only the legitimate file entries', () => {
		const entries = [
			{ name: 'uploads/al-azeem.jpg.jpeg', type: 'file' },
			{ name: 'ocr/al-azeem.md', type: 'file' },
			{ name: 'exams/examType-1/ocr/al-azeem.md', type: 'file' },
			{ name: 'exams/examType-1/uploads/photo.jpg', type: 'file' },
			{ name: 'manifest.json', type: 'file' },
			{ name: '.', type: 'file' },
			{ name: 'marksheets', type: 'directory' }
		];
		const out = filterMentionableFiles(entries).map((e) => e.name);
		expect(out).toEqual([
			'uploads/al-azeem.jpg.jpeg',
			'exams/examType-1/uploads/photo.jpg'
		]);
	});
});
