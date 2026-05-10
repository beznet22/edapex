import { GRADE_RANGES } from "$lib/server/service/assessment.service";
import type { Category } from "$lib/schema/result-output";

/**
 * Transforms raw mapping data into a concise Markdown lookup index for LLM reasoning.
 */
export function formatMappingDataToIndex(data: any): string {
  const lines: string[] = ["## Lookup Reference Index"];

  if (data.subjects) {
    lines.push("\n### Subjects");
    data.subjects.forEach((s: any) => {
      lines.push(`- ID ${s.subjectId}: ${s.subjectName} (${s.subjectCode})`);
    });
  }

  if (data.examTypes) {
    lines.push(`\n### Exam Term/Type\n- ID ${data.examTypes.id}: ${data.examTypes.title}`);
  }

  if (data.classSection) {
    lines.push(`\n### Current Class Context\n- Class: ${data.classSection.className}\n- Section: ${data.classSection.sectionName}`);
  }

  return lines.join("\n");
}

/**
 * Applies grading business logic and HTML formatting to the raw extracted JSON.
 */
export function applyGradingBusinessLogic(data: any, category: Category): any {
  if (!data.marksData) return data;

  const ranges = (category === "LOWERBASIC" || category === "MIDDLEBASIC" ? GRADE_RANGES.GRADERS : GRADE_RANGES.EYFS) as any;

  data.marksData = data.marksData.map((subject: any) => {
    if (subject.total !== undefined) {
      const score = subject.total;
      const match = ranges.find((r: any) => score >= r.min && score <= r.max);
      
      const label = match ? match.grade : "N/A";
      const color = match ? match.color : "bg-gray-200";

      subject.grade = `<span class="${color} text-violet-600 py-1 px-3 rounded-full text-xs">${label}</span>`;
    }
    return subject;
  });

  return data;
}

/**
 * Validates attendance consistency: daysPresent + daysAbsent MUST equal daysOpened.
 */
export function validateAttendance(attendance: any): any {
  if (!attendance) return attendance;
  
  const opened = Number(attendance.daysOpened || 0);
  const present = Number(attendance.daysPresent || 0);
  const absent = Number(attendance.daysAbsent || 0);

  if (opened > 0 && present + absent !== opened) {
    // If inconsistent, we prioritize opened and present if present <= opened
    if (present <= opened) {
      attendance.daysAbsent = opened - present;
    } else {
      attendance.daysOpened = present + absent;
    }
  }

  return attendance;
}
