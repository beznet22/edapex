import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ParseContext, Marksheet } from '$lib/utils/marksheet-ast-parser';
import { parseMarksheetMarkdown, generateMarksheetMarkdown } from '$lib/utils/marksheet-ast-parser';
import { marksheetSchema } from '$lib/schema/marksheet';

const STRICT = resolve('storage/mock-data/strict');
const CONTEXT = resolve('storage/mock-data/context');

const FIXTURES = ['adakole', 'CRECHE1', 'DC1', 'GRADEK1', 'LB1', 'MB1', 'NURSERY1'];

interface Fixture {
  name: string;
  md: string;
  context: ParseContext;
}

function load(): Fixture[] {
  return FIXTURES.map((name) => {
    const md = readFileSync(resolve(STRICT, `${name}.md`), 'utf-8');
    const context = JSON.parse(readFileSync(resolve(CONTEXT, `${name}.json`), 'utf-8')) as ParseContext;
    return { name, md, context };
  });
}

describe('generateMarksheetMarkdown — round-trip integrity', () => {
  const fixtures = load();

  for (const { name, md, context } of fixtures) {
    test(`${name} — round-trip preserves records marks`, () => {
      const reference = parseMarksheetMarkdown(md, context);
      const generatedMd = generateMarksheetMarkdown(reference);
      const reParsed = parseMarksheetMarkdown(generatedMd, context);

      expect(reParsed.records.length).toBe(reference.records.length);
      for (let i = 0; i < reference.records.length; i++) {
        expect(reParsed.records[i].marks).toEqual(reference.records[i].marks);
        if (reference.records[i].category !== 'DAYCARE') {
          expect(reParsed.records[i].titles).toEqual(reference.records[i].titles);
          expect(reParsed.records[i].fullMarks).toEqual(reference.records[i].fullMarks);
        }
        expect(reParsed.records[i].subjectCode).toBe(reference.records[i].subjectCode);
        expect(reParsed.records[i].subject).toBe(reference.records[i].subject);
        if (reference.records[i].category === 'DAYCARE') {
          expect(reParsed.records[i].learningOutcome).toBe(reference.records[i].learningOutcome);
        }
      }
    });

    test(`${name} — round-trip preserves student info`, () => {
      const reference = parseMarksheetMarkdown(md, context);
      const generatedMd = generateMarksheetMarkdown(reference);
      const reParsed = parseMarksheetMarkdown(generatedMd, context);

      expect(reParsed.student.fullName).toBe(reference.student.fullName);
      expect(reParsed.student.adminNo).toBe(reference.student.adminNo);
      expect(reParsed.student.className).toBe(reference.student.className);
      expect(reParsed.student.sectionName).toBe(reference.student.sectionName);
      expect(reParsed.student.term).toBe(reference.student.term);
      expect(reParsed.student.sessionYear).toBe(reference.student.sessionYear);
      expect(reParsed.student.daysOpened).toBe(reference.student.daysOpened);
      expect(reParsed.student.daysPresent).toBe(reference.student.daysPresent);
      expect(reParsed.student.daysAbsent).toBe(reference.student.daysAbsent);
    });

    test(`${name} — round-trip preserves ratings`, () => {
      const reference = parseMarksheetMarkdown(md, context);
      const generatedMd = generateMarksheetMarkdown(reference);
      const reParsed = parseMarksheetMarkdown(generatedMd, context);

      expect(reParsed.ratings.length).toBe(reference.ratings.length);
      for (let i = 0; i < reference.ratings.length; i++) {
        expect(reParsed.ratings[i].attribute).toBe(reference.ratings[i].attribute);
        expect(reParsed.ratings[i].rate).toBe(reference.ratings[i].rate);
      }
    });

    test(`${name} — round-trip preserves remark`, () => {
      const reference = parseMarksheetMarkdown(md, context);
      const generatedMd = generateMarksheetMarkdown(reference);
      const reParsed = parseMarksheetMarkdown(generatedMd, context);

      expect(reParsed.remark?.remark).toBe(reference.remark?.remark);
    });

    test(`${name} — round-trip validates against marksheetSchema`, async () => {
      const reference = parseMarksheetMarkdown(md, context);
      const generatedMd = generateMarksheetMarkdown(reference);
      const reParsed = parseMarksheetMarkdown(generatedMd, context);

      const result = await marksheetSchema.safeParseAsync(reParsed);
      if (!result.success) {
        console.error(`${name} schema errors:`, result.error.issues);
      }
      expect(result.success).toBe(true);
    });
  }
});
