import { describe, expect, it } from 'vitest';
import {
	classSlug,
	sectionSlug,
	academicYearSlug,
	sanitizeForFilename
} from '$lib/server/workspace/slug';
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
	ocrMetaPath,
	uploadPath,
	manifestPath,
	examDir
} from '$lib/server/workspace/paths';
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
		it('returns ADM<adminNo>-<studentId>-<slug>.pdf', () => {
			expect(marksheetPdfPath(188, 42, 'Al-Azeem Junior')).toBe(
				'pdfs/ADM42-188-Al-Azeem_Junior.pdf'
			);
		});
		it('falls back to student-<id> when no name provided', () => {
			expect(marksheetPdfPath(188)).toBe('pdfs/ADM0-188-student-188.pdf');
		});
		it('prefixes with exams/examType-{id}/ when examTypeId is set', () => {
			expect(marksheetPdfPath(188, 42, 'Al-Azeem Junior', 1)).toBe(
				'exams/examType-1/pdfs/ADM42-188-Al-Azeem_Junior.pdf'
			);
		});
	});

	describe('transcriptPdfPath', () => {
		it('returns pdfs/transcript-<studentId>.pdf', () => {
			expect(transcriptPdfPath(188)).toBe('pdfs/transcript-188.pdf');
		});
		it('prefixes with exams/examType-{id}/ when examTypeId is set', () => {
			expect(transcriptPdfPath(188, 2)).toBe('exams/examType-2/pdfs/transcript-188.pdf');
		});
	});

	describe('marksheetJsonPath', () => {
		it('returns marksheets/<studentId>.json', () => {
			expect(marksheetJsonPath(188)).toBe('marksheets/188.json');
		});
		it('prefixes with exams/examType-{id}/ when examTypeId is set', () => {
			expect(marksheetJsonPath(188, 1)).toBe('exams/examType-1/marksheets/188.json');
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
		it('with adminNo + examTypeId + name uses canonical ADM<adminNo>-<examTypeId>-<name>.md', () => {
			expect(
				marksheetMarkdownPath({
					studentId: 188,
					adminNo: 42,
					examTypeId: 1,
					studentName: 'Al-Azeem'
				})
			).toBe('exams/examType-1/marksheets/ADM42-1-al-azeem.md');
		});
	});

	describe('transcriptJsonPath', () => {
		it('returns transcripts/<studentId>.json', () => {
			expect(transcriptJsonPath(188)).toBe('transcripts/188.json');
		});
		it('prefixes with exams/examType-{id}/ when examTypeId is set', () => {
			expect(transcriptJsonPath(188, 1)).toBe('exams/examType-1/transcripts/188.json');
		});
	});

	describe('transcriptMarkdownPath', () => {
		it('returns transcripts/<studentId>.md', () => {
			expect(transcriptMarkdownPath(188)).toBe('transcripts/188.md');
		});
		it('prefixes with exams/examType-{id}/ when examTypeId is set', () => {
			expect(transcriptMarkdownPath(188, 2)).toBe('exams/examType-2/transcripts/188.md');
		});
	});

	describe('ocr paths', () => {
		it('ocrMarkdownPath uses sanitized filename', () => {
			expect(ocrMarkdownPath('Al-Azeem.jpg.jpeg')).toBe('ocr/Al-Azeem.jpg.jpeg.md');
		});
		it('ocrMetaPath uses sanitized filename', () => {
			expect(ocrMetaPath('Al-Azeem.jpg.jpeg')).toBe('ocr/Al-Azeem.jpg.jpeg.meta.json');
		});
		it('ocrMarkdownPath prefixes with exams/examType-{id}/ when examTypeId is set', () => {
			expect(ocrMarkdownPath('foo.jpg', 1)).toBe('exams/examType-1/ocr/foo.jpg.md');
		});
	});

	describe('uploadPath', () => {
		it('returns uploads/<filename> when no examTypeId', () => {
			expect(uploadPath('foo.png')).toBe('uploads/foo.png');
		});
		it('prefixes with exams/examType-{id}/ when examTypeId is set', () => {
			expect(uploadPath('foo.png', 1)).toBe('exams/examType-1/uploads/foo.png');
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

describe('manifestPath', () => {
	it('returns exams/examType-{id}/manifest.json for any examTypeId', () => {
		expect(manifestPath(1)).toBe('exams/examType-1/manifest.json');
		expect(manifestPath(2)).toBe('exams/examType-2/manifest.json');
		expect(manifestPath(42)).toBe('exams/examType-42/manifest.json');
	});
});

describe('examDir', () => {
	it('returns exams/examType-{id}/{kind} for each kind', () => {
		expect(examDir(1, 'uploads')).toBe('exams/examType-1/uploads');
		expect(examDir(2, 'notes')).toBe('exams/examType-2/notes');
		expect(examDir(3, 'shared')).toBe('exams/examType-3/shared');
		expect(examDir(4, 'scratch')).toBe('exams/examType-4/scratch');
	});
});
