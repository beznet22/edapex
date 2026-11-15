/**
 * MarkdownV2-safe caption builder for the result PDF.
 *
 * Pulls fields exclusively from the validated `Marksheet` schema. No
 * LLM output is interpolated, so the caption is byte-identical for the
 * same `(studentId, examTypeId, academicId)` triple.
 */
import type { Marksheet } from "$lib/schema/marksheet";
import { escape } from "./messages";

export interface CaptionInput {
  marksheet: Marksheet;
  termTitle: string;
  academicYearLabel: string;
}

function safeNumber(value: number | null | undefined, fallback: string): string {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  return String(value);
}

export function buildCaption(input: CaptionInput): string {
  const { marksheet, termTitle, academicYearLabel } = input;
  const student = marksheet.student;
  const score = marksheet.score ?? { total: 0, average: 0, classAverage: { min: { value: "0" }, max: { value: "0" } }, maxScores: 100 };
  const records = marksheet.records;

  const fullName = escape(student.fullName || "Student");
  const schoolName = escape(marksheet.school.name || "School");
  const className = escape(student.className || "?");
  const sectionName = escape(student.sectionName || "?");
  const safeTerm = escape(termTitle);
  const safeYear = escape(academicYearLabel);
  const total = safeNumber(score.total, "?");
  const max = safeNumber(score.maxScores, "100");
  const grade = escape(student.term ? "" : ""); // unused; grade lives on the records
  void grade;

  // Pull the overall grade from the first record with a non-empty grade
  // (most marksheet templates have a "Total" row at index 0).
  const overall = records.find((r) => r.grade && r.grade.trim() !== "");
  const overallGrade = overall ? escape(overall.grade) : "—";

  const lines: string[] = [
    `📄 *Result for ${fullName}*`,
    `🏫 ${schoolName} · Class ${className} · Sec ${sectionName}`,
    `📚 Term: ${safeTerm} \\(${safeYear}\\)`,
    `🎯 Total: ${total}/${max} · Grade ${overallGrade}`,
  ];

  if (student.daysOpened > 0) {
    lines.push(
      `📅 Attendance: ${student.daysPresent}/${student.daysOpened} days`,
    );
  }

  return lines.join("\n");
}
