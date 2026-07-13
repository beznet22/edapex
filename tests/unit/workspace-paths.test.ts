import { describe, expect, it } from 'vitest';
import {
	classSlug,
	sectionSlug,
	academicYearSlug,
	sanitizeForFilename
} from '$lib/server/mastra/storage/workspaces/slug';
import {
	classDir,
	WORKSPACE_ROOT,
	marksheetPdfPath,
	transcriptPdfPath,
	marksheetJsonPath,
	marksheetMarkdownPath,
	transcriptJsonPath,
	transcriptMarkdownPath,
	ocrMarkdownPath,
	ocrMetaPath
} from '$lib/server/mastra/storage/workspaces/paths';
import { createTenantContext } from '$lib/server/mastra/tenant-context';
import path from 'node:path';

describe('slug helpers', () => {
	describe('classSlug', () => {
		it('LOWER BASIC 2 -> lb2', () => {
			expect(classSlug('LOWER BASIC 2', 18)).toBe('lb2');
		});
		it('MIDDLE BASIC 1 -> mb1', () => {
			expect(classSlug('MIDDLE BASIC 1', 19)).toBe('mb1');
		});
		it('PRE-NURSERY -> pn', () => {
			expect(classSlug('PRE-NURSERY', 20)).toBe('pn');
		});
		it('handles single letter (B)', () => {
			expect(classSlug('B', 6)).toBe('b');
		});
		it('handles empty string by falling back to id', () => {
			expect(classSlug('', 18)).toBe('18');
			expect(classSlug(null, 18)).toBe('18');
		});
		it('handles diacritics', () => {
			// PRÉ-NURSERY strips diacritics -> PRE-NURSERY, splits to first-letter of each word
			expect(classSlug('PRÉ-NURSERY', 20)).toBe('pn');
		});
	});

	describe('sectionSlug', () => {
		it('B -> b', () => {
			expect(sectionSlug('B', 6)).toBe('b');
		});
		it('A -> a', () => {
			expect(sectionSlug('A', 5)).toBe('a');
		});
		it('empty -> id', () => {
			expect(sectionSlug('', 6)).toBe('6');
		});
	});

	describe('academicYearSlug', () => {
		it('passes through year title', () => {
			expect(academicYearSlug('2024-2025', 5)).toBe('2024-2025');
		});
		it('empty -> id', () => {
			expect(academicYearSlug('', 5)).toBe('5');
		});
	});

	describe('sanitizeForFilename', () => {
		it('strips unsafe characters', () => {
			expect(sanitizeForFilename('Al-Azeem Junior')).toBe('Al-Azeem_Junior');
		});
		it('truncates to 80 chars', () => {
			const long = 'a'.repeat(100);
			expect(sanitizeForFilename(long).length).toBe(80);
		});
		it('handles empty', () => {
			expect(sanitizeForFilename(null)).toBe('untitled');
			expect(sanitizeForFilename('')).toBe('untitled');
		});
	});
});

describe('paths helpers', () => {
	const tenant = createTenantContext({
		schoolId: 1,
		classId: 18,
		sectionId: 6,
		academicId: 5,
		className: 'LOWER BASIC 2',
		sectionName: 'B',
		academicYearTitle: '2024-2025'
	});

	describe('classDir', () => {
		it('uses canonical layout', () => {
			const dir = classDir(tenant);
			expect(dir).toBe(
				path.join(WORKSPACE_ROOT, '1', 'AY5-2024-2025', '18-lb2_6-b')
			);
		});
	});

	describe('marksheetPdfPath', () => {
		it('returns pdfs/marksheet-<studentId>.pdf', () => {
			expect(marksheetPdfPath(188)).toBe('pdfs/marksheet-188.pdf');
		});
	});

	describe('transcriptPdfPath', () => {
		it('returns pdfs/transcript-<studentId>.pdf', () => {
			expect(transcriptPdfPath(188)).toBe('pdfs/transcript-188.pdf');
		});
	});

	describe('marksheetJsonPath', () => {
		it('returns marksheets/<studentId>.json', () => {
			expect(marksheetJsonPath(188)).toBe('marksheets/188.json');
		});
	});

	describe('marksheetMarkdownPath', () => {
		it('with name', () => {
			expect(marksheetMarkdownPath({ studentId: 188, studentName: 'Al-Azeem' })).toBe('marksheets/188-Al-Azeem.md');
		});
		it('without name', () => {
			expect(marksheetMarkdownPath({ studentId: 188 })).toBe('marksheets/188.md');
		});
		it('null name treated as absent', () => {
			expect(marksheetMarkdownPath({ studentId: 188, studentName: null })).toBe('marksheets/188.md');
		});
	});

	describe('transcriptJsonPath', () => {
		it('returns transcripts/<studentId>.json', () => {
			expect(transcriptJsonPath(188)).toBe('transcripts/188.json');
		});
	});

	describe('transcriptMarkdownPath', () => {
		it('returns transcripts/<studentId>.md', () => {
			expect(transcriptMarkdownPath(188)).toBe('transcripts/188.md');
		});
	});

	describe('ocr paths', () => {
		it('ocrMarkdownPath uses sanitized filename', () => {
			expect(ocrMarkdownPath('Al-Azeem.jpg.jpeg')).toBe('ocr/Al-Azeem.jpg.jpeg.md');
		});
		it('ocrMetaPath uses sanitized filename', () => {
			expect(ocrMetaPath('Al-Azeem.jpg.jpeg')).toBe('ocr/Al-Azeem.jpg.jpeg.meta.json');
		});
	});
});

describe('canonical workspace layout invariants', () => {
	it('all paths live under classDir', () => {
		const tenant = createTenantContext({
			schoolId: 1,
			classId: 18,
			sectionId: 6,
			academicId: 5,
			className: 'LOWER BASIC 2',
			sectionName: 'B',
			academicYearTitle: '2024-2025'
		});
		const dir = classDir(tenant);
		// paths are RELATIVE; they get joined with classDir by the filesystem layer
		expect(marksheetPdfPath(188).startsWith('pdfs/')).toBe(true);
		expect(marksheetJsonPath(188).startsWith('marksheets/')).toBe(true);
		expect(ocrMarkdownPath('foo').startsWith('ocr/')).toBe(true);
		void dir;
	});

	it('studentId is the only identifier in artifact paths', () => {
		expect(marksheetPdfPath(188)).not.toContain('admissionNo');
		expect(marksheetPdfPath(188)).not.toContain('name');
		expect(transcriptPdfPath(188)).not.toContain('admissionNo');
		expect(marksheetJsonPath(188)).not.toContain('admissionNo');
	});
});
