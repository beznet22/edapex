import { describe, test, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ParseContext } from '$lib/utils/marksheet-ast-parser';
import { parseMarksheetMarkdown } from '$lib/utils/marksheet-ast-parser';
import { marksheetSchema } from '$lib/schema/marksheet';
import type { Marksheet } from '$lib/schema/marksheet';

const STRICT = resolve('storage/mock-data/strict');
const CONTEXT = resolve('storage/mock-data/context');
const GENERATED = resolve('storage/mock-data/generated');

interface RawNumbers {
  admissionNo: number;
  daysOpened: number;
  daysPresent: number;
  daysAbsent: number;
  subjectMarks: { subject: string; marks: number[] }[];
}

function extractNumbers(md: string): RawNumbers {
  const lines = md.split('\n');

  const getField = (label: string): number | null => {
    const re = new RegExp(`\\|\\s*${label}\\s*\\|\\s*(\\d+)\\s*\\|`);
    for (const line of lines) {
      const m = line.match(re);
      if (m) return Number(m[1]);
    }
    return null;
  };

  const admissionNo = getField('Admission No');
  const daysOpened = getField('Days Open');
  const daysPresent = getField('Days Present');
  const daysAbsent = getField('Days Absent');

  if (admissionNo == null) throw new Error('Admission No not found');
  if (daysOpened == null) throw new Error('Days Open not found');
  if (daysPresent == null) throw new Error('Days Present not found');
  if (daysAbsent == null) throw new Error('Days Absent not found');

  const perfIdx = lines.findIndex((l) => l.trim().startsWith('## Academic Performance'));
  const nextSectionIdx = lines.slice(perfIdx + 1).findIndex((l) => l.trim().startsWith('## '));
  const tableLines = nextSectionIdx === -1
    ? lines.slice(perfIdx + 1)
    : lines.slice(perfIdx + 1, perfIdx + 1 + nextSectionIdx);

  const subjectMarks: { subject: string; marks: number[] }[] = [];

  let dataStart = 0;
  for (let i = 0; i < tableLines.length; i++) {
    const trimmed = tableLines[i].trim();
    if (trimmed.startsWith('| ---')) {
      dataStart = i + 1;
      break;
    }
  }

  for (let i = dataStart; i < tableLines.length; i++) {
    const line = tableLines[i].trim();
    if (!line.startsWith('|') || !line.endsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length < 2) continue;
    const subject = cells[0];
    const marks = cells.slice(1).map(Number).filter((n) => !isNaN(n));
    if (marks.length > 0) {
      subjectMarks.push({ subject, marks });
    }
  }

  return { admissionNo, daysOpened, daysPresent, daysAbsent, subjectMarks };
}

interface StudentNumerics {
  adminNo: number;
  daysOpened: number;
  daysAbsent: number;
  daysPresent: number;
}

function pickStudentNumerics(s: Marksheet['student']): StudentNumerics {
  return { adminNo: s.adminNo, daysOpened: s.daysOpened, daysAbsent: s.daysAbsent, daysPresent: s.daysPresent };
}

const FIXTURES = ['adakole', 'CRECHE1', 'DC1', 'GRADEK1', 'LB1', 'MB1', 'NURSERY1'];

function load(): Fixture[] {
  return FIXTURES.map((name) => {
    const md = readFileSync(resolve(STRICT, `${name}.md`), 'utf-8');
    const ctxPath = resolve(CONTEXT, `${name}.json`);
    const context = existsSync(ctxPath)
      ? (JSON.parse(readFileSync(ctxPath, 'utf-8')) as ParseContext)
      : undefined;
    const genPath = resolve(GENERATED, `${name}.json`);
    const generated = JSON.parse(readFileSync(genPath, 'utf-8')) as Marksheet;
    return { name, md, context, generated };
  });
}

interface Fixture {
  name: string;
  md: string;
  context?: ParseContext;
  generated: Marksheet;
}

describe('marksheet numeric integrity — markdown raw vs parser', () => {
  const fixtures = load();

  for (const { name, md, generated } of fixtures) {
    test(`${name} — raw markdown numbers match parser output`, () => {
      const raw = extractNumbers(md);
      const parsed = parseMarksheetMarkdown(md);

      expect(parsed.student.adminNo).toBe(raw.admissionNo);
      expect(parsed.student.daysOpened).toBe(raw.daysOpened);
      expect(parsed.student.daysPresent).toBe(raw.daysPresent);
      expect(parsed.student.daysAbsent).toBe(raw.daysAbsent);

      if (raw.subjectMarks.length === 0) return;

      expect(parsed.records.length).toBe(raw.subjectMarks.length);
      for (let i = 0; i < parsed.records.length; i++) {
        expect(parsed.records[i].marks).toEqual(raw.subjectMarks[i].marks);
      }
    });

    test(`${name} — raw markdown numbers match generated.json`, () => {
      const raw = extractNumbers(md);

      expect(generated.student.adminNo).toBe(raw.admissionNo);
      expect(generated.student.daysOpened).toBe(raw.daysOpened);
      expect(generated.student.daysPresent).toBe(raw.daysPresent);
      expect(generated.student.daysAbsent).toBe(raw.daysAbsent);

      if (raw.subjectMarks.length === 0) return;

      expect(generated.records.length).toBe(raw.subjectMarks.length);
      for (let i = 0; i < generated.records.length; i++) {
        expect(generated.records[i].marks).toEqual(raw.subjectMarks[i].marks);
      }
    });
  }
});

describe('marksheet numeric integrity — unenriched vs generated (marks only)', () => {
  const fixtures = load();

  for (const { name, md, generated } of fixtures) {
    test(`${name} — record marks preserved through pipeline`, () => {
      const baseline = parseMarksheetMarkdown(md);

      expect(baseline.records.length).toBe(generated.records.length);
      for (let i = 0; i < baseline.records.length; i++) {
        expect(baseline.records[i].marks).toEqual(generated.records[i].marks);
      }

      expect(pickStudentNumerics(baseline.student)).toEqual(
        pickStudentNumerics(generated.student)
      );
    });
  }
});

describe('marksheet numeric integrity — unenriched vs context-enriched (pre-Zod, marks only)', () => {
  const fixtures = load();

  for (const { name, md, context } of fixtures) {
    test(`${name} — context merge does not alter mark values`, () => {
      const baseline = parseMarksheetMarkdown(md);
      const enriched = parseMarksheetMarkdown(md, context);

      expect(baseline.records.length).toBe(enriched.records.length);
      for (let i = 0; i < baseline.records.length; i++) {
        expect(baseline.records[i].marks).toEqual(enriched.records[i].marks);
      }

      expect(pickStudentNumerics(baseline.student)).toEqual(
        pickStudentNumerics(enriched.student)
      );
    });
  }
});
