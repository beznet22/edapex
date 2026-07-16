import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import {
  parseMarksheetMarkdown,
  autoFixStructure,
  splitDocument,
  diagnoseStructure,
  type ParseContext,
} from '$lib/utils/marksheet-ast-parser';
import { marksheetSchema } from '$lib/schema/marksheet';

const STORAGE = resolve('storage/mock-data');
const STRICT_DIR = resolve(STORAGE, 'strict');
const CONTEXT_DIR = resolve(STORAGE, 'context');
const EXPECTED_DIR = resolve(STORAGE, 'expected');
const OCR_DIR = resolve(STORAGE, 'ocr');
const MARKSHEET_DIR = resolve(STORAGE, 'marksheets');

interface StrictFixture {
  name: string;
  md: string;
  context: ParseContext | undefined;
  expected: any;
}

function loadStrictFiles(): StrictFixture[] {
  return readdirSync(STRICT_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const name = f.replace(/\.md$/, '');
      const md = readFileSync(resolve(STRICT_DIR, f), 'utf-8');
      const contextPath = resolve(CONTEXT_DIR, `${name}.json`);
      const context: ParseContext | undefined = existsSync(contextPath)
        ? JSON.parse(readFileSync(contextPath, 'utf-8'))
        : undefined;
      const expectedPath = resolve(EXPECTED_DIR, `${name}.json`);
      const expected = JSON.parse(readFileSync(expectedPath, 'utf-8'));
      return { name, md, context, expected };
    });
}

function loadOcrFiles(): { name: string; md: string }[] {
  return readdirSync(OCR_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({
      name: f.replace(/\.md$/, ''),
      md: readFileSync(resolve(OCR_DIR, f), 'utf-8'),
    }));
}

describe('parseMarksheetMarkdown — strict markdown fixtures', () => {
  const fixtures = loadStrictFiles();
  test.each(fixtures)('$name matches expected JSON', ({ md, expected }) => {
    const result = parseMarksheetMarkdown(md);
    expect(result).toEqual(expected);
  });
});

describe('parseMarksheetMarkdown — with context, passes Zod', () => {
  const fixtures = loadStrictFiles();
  test.each(fixtures)('$name passes marksheetSchema.parseAsync()', async ({ md, context }) => {
    const result = parseMarksheetMarkdown(md, context);
    const parsed = await marksheetSchema.parseAsync(result);
    expect(parsed).toBeDefined();
    if (context?.tenant?.schoolId != null) {
      expect(parsed.school.id).toBe(context.tenant.schoolId);
    }
    if (context?.roster?.[0]?.id) {
      expect(parsed.student.id).toBe(context.roster[0].id);
    }
  });
});

describe('parseMarksheetMarkdown — raw OCR fixtures', () => {
  const fixtures = loadOcrFiles();
  test.each(fixtures)('$name parses gracefully (no throw)', ({ md }) => {
    const result = parseMarksheetMarkdown(md);
    expect(result).toBeDefined();
    expect(result.student).toBeDefined();
  });
});

describe('parseMarksheetMarkdown — agent-formatted marksheet', () => {
  test('adakole records match existing raw.json', () => {
    const md = readFileSync(resolve(MARKSHEET_DIR, 'adakole_jpg-0adbef75.md'), 'utf-8');
    const raw = JSON.parse(
      readFileSync(resolve(MARKSHEET_DIR, 'adakole_jpg-0adbef75.raw.json'), 'utf-8'),
    );
    const result = parseMarksheetMarkdown(md);
    expect(result.records).toEqual(raw.records);
    expect(result.subjects).toEqual(raw.subjects);
    expect(result.score).toEqual(raw.score);
    expect(result.ratings).toEqual(raw.ratings);
    expect(result.remark).toEqual(raw.remark);
  });

  test('adakole with context passes Zod', async () => {
    const md = readFileSync(resolve(MARKSHEET_DIR, 'adakole_jpg-0adbef75.md'), 'utf-8');
    const context = JSON.parse(
      readFileSync(resolve(CONTEXT_DIR, 'adakole.json'), 'utf-8'),
    );
    const result = parseMarksheetMarkdown(md, context);
    const parsed = await marksheetSchema.parseAsync(result);
    expect(parsed.student.id).toBe(844);
    expect(parsed.school.id).toBe(1);
  });
});

describe('autoFixStructure — strict markdown fixtures', () => {
  const fixtures = loadStrictFiles();
  test.each(fixtures)('$name returns valid result structure', ({ md }) => {
    const result = autoFixStructure(md);
    expect(result.fixedMd).toBeDefined();
    expect(result.parsed).toBeDefined();
  });
});

describe('splitDocument — strict markdown fixtures', () => {
  test.each([
    ['adakole', 5],
    ['CRECHE1', 5],
    ['DC1', 4],
    ['GRADEK1', 5],
    ['LB1', 5],
    ['MB1', 5],
    ['NURSERY1', 5],
  ])('%s splits into %i blocks', (name, expectedBlocks) => {
    const md = readFileSync(resolve(STRICT_DIR, `${name}.md`), 'utf-8');
    const blocks = splitDocument(md);
    expect(blocks.length).toBe(expectedBlocks);
  });
});

describe('diagnoseStructure — strict markdown', () => {
  const fixtures = loadStrictFiles();
  test.each(fixtures)('$name returns diagnostics array', ({ md }) => {
    const blocks = splitDocument(md);
    const diags = diagnoseStructure(blocks);
    const errors = diags.filter((d) => d.severity === 'error');
    expect(Array.isArray(errors)).toBe(true);
  });
});
