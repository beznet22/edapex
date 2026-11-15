/**
 * End-to-end: template → HTML → PDF bytes.
 *
 * Runs the **Node** entry of ironpress, not the browser entry, because vitest here is a
 * Node process. That covers the template and the engine, which is where the real risk
 * lives — CSS IronPress cannot parse shows up as a broken layout, not an exception. It
 * does not cover WASM instantiation in a browser; the Playwright suite and the manual
 * export check do.
 */

import { describe, expect, it } from "vitest";

import initIronpress, { HtmlConverter } from "ironpress/node";

import { renderTemplate } from "@/lib/templates";

await initIronpress();

function marksheetPayload() {
  return {
    templateVersion: "marksheet@1" as const,
    version: 1,
    publishedAt: null,
    filename: "report.pdf",
    document: {
      school: {
        id: 1,
        name: "Sunrise Academy",
        email: "office@sunrise.test",
        phone: "+234 800 000 0000",
        city: "Lagos",
        state: "Lagos",
        title: "Sunrise Academy",
        vacation_date: "2026-07-31"
      },
      student: {
        id: 7,
        examTypeId: 2,
        fullName: "Adaeze Okonkwo",
        gender: "F",
        parentEmail: "parent@test.dev",
        parentName: "Chidi Okonkwo",
        term: "First Term",
        title: "Mid-term",
        category: "LOWERBASIC" as const,
        className: "Basic 3",
        sectionName: "A",
        adminNo: 1042,
        sessionYear: "2026/2027",
        daysOpened: 60,
        daysAbsent: 2,
        daysPresent: 58,
        token: "tok_123"
      },
      subjects: [{ subjectId: 1, subjectCode: "MTH" }],
      records: [
        {
          studentId: 7,
          resultId: 1,
          subjectId: 1,
          subject: "Mathematics",
          subjectCode: "MTH",
          objectives: null,
          titles: ["Test 1", "Test 2"],
          marks: [12, 15],
          fullMarks: [20, 20],
          totalScore: 68,
          grade: "B",
          category: "LOWERBASIC" as const
        }
      ],
      ratings: [{ attribute: "Punctuality", rate: 4, remark: null, color: null }],
      remark: { remark: "Steady progress this term." }
    }
  };
}

describe("pdf pipeline", () => {
  it("turns a marksheet template into a valid PDF", async () => {
    const rendered = renderTemplate(marksheetPayload());
    const converter = new HtmlConverter();
    const bytes = converter.htmlToPdf(rendered.html);
    converter.free();

    expect(bytes.length).toBeGreaterThan(1000);
    // A PDF that starts with the right magic bytes but is tiny means the layout engine
    // produced an empty page, which is a silent failure worth catching.
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("honours the page size rather than ignoring the caller", async () => {
    const rendered = renderTemplate(marksheetPayload());
    const a4 = new HtmlConverter();
    a4.pageSize("A4");
    const a4Bytes = a4.htmlToPdf(rendered.html);
    a4.free();

    const letter = new HtmlConverter();
    letter.pageSize("Letter");
    const letterBytes = letter.htmlToPdf(rendered.html);
    letter.free();

    // Different media box means different bytes; identical output would mean
    // `pageSize` was silently dropped.
    expect(a4Bytes.length).not.toBe(letterBytes.length);
  });
});
