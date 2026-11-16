import { describe, expect, it } from "vitest";

import type { MarksheetDocument, TranscriptDocument } from "@edapex/contracts";

import { renderMarksheet } from "@/lib/templates/marksheet";
import { renderTranscript } from "@/lib/templates/transcript";
import { renderTemplate } from "@/lib/templates";
import { dataUri, escapeHtml, text } from "@/lib/templates/shared";

/**
 * Template tests.
 *
 * A report card embeds free text a human typed — student names, guardian names, teacher
 * remarks — into HTML that a renderer turns into a PDF. IronPress sanitises as a
 * backstop, but the primary guard is escaping, so these tests attack the template
 * rather than trusting the sanitiser.
 */

function marksheet(overrides: Partial<MarksheetDocument> = {}): MarksheetDocument {
  return {
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
      category: "LOWERBASIC",
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
        category: "LOWERBASIC"
      }
    ],
    ratings: [],
    ...overrides
  };
}

function transcriptDocument(): TranscriptDocument {
  return {
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
      category: "LOWERBASIC",
      className: "Basic 3",
      sectionName: "A",
      adminNo: 1042,
      sessionYear: "2026/2027",
      daysOpened: 60,
      daysAbsent: 2,
      daysPresent: 58,
      token: "tok_123"
    },
    academicYear: { id: 1, title: "2026/2027", year: "2026" },
    terms: [{ examTypeId: 1, title: "First Term", isAverage: false }],
    subjects: [
      {
        subjectId: 1,
        subject: "Mathematics",
        subjectCode: "MTH",
        marks: [68],
        total: 68,
        percentage: 68,
        grade: "B"
      }
    ],
    classAverage: 61.4,
    studentAverage: 68,
    yearlyTotal: 68,
    yearlyAverage: 68,
    maxPossibleTotal: 100
  };
}

describe("escaping", () => {
  it("escapes every HTML control character", () => {
    expect(escapeHtml(`<script>"x"&'y'</script>`)).toBe(
      "&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;"
    );
  });

  it("renders nullish values as an em dash, not the string null", () => {
    expect(text(null)).toBe("—");
    expect(text(undefined)).toBe("—");
    expect(text("")).toBe("—");
    expect(text(0)).toBe("0");
  });

  it("keeps a zero mark as zero", () => {
    // A truthiness check here would show "—" for a genuine zero, which reads to a
    // parent as "not marked".
    expect(text(0)).toBe("0");
  });
});

describe("dataUri", () => {
  it("returns null for absent images so the element is omitted", () => {
    expect(dataUri(undefined, "image/png")).toBeNull();
    expect(dataUri("", "image/png")).toBeNull();
  });

  it("does not double-prefix an existing data URI", () => {
    const existing = "data:image/png;base64,AAAA";
    expect(dataUri(existing, "image/png")).toBe(existing);
  });

  it("prefixes raw base64 with the given MIME type", () => {
    expect(dataUri("AAAA", "image/jpeg")).toBe("data:image/jpeg;base64,AAAA");
  });
});

describe("marksheet template", () => {
  it("embeds a hostile student name as text, never as markup", () => {
    const document = marksheet();
    const html = renderMarksheet({
      ...document,
      student: {
        ...document.student,
        fullName: `<img src=x onerror="alert(1)">`
      }
    });

    // The `onerror=` text survives escaping, and that is correct — without a real `<`
    // it is inert text. What must not survive is the tag itself.
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
    expect(html).toContain("&quot;&gt;");
  });

  it("escapes a hostile teacher remark", () => {
    const html = renderMarksheet(
      marksheet({ remark: { remark: `<script>steal()</script>` } })
    );
    expect(html).not.toContain("<script>steal()");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders ABS instead of a zero for an absent mark", () => {
    const document = marksheet();
    const html = renderMarksheet({
      ...document,
      records: [{ ...document.records[0]!, absent: [true, false] }]
    });
    expect(html).toContain("ABS");
  });

  it("shows the mark over its maximum, because a bare number is unreadable", () => {
    const html = renderMarksheet(marksheet());
    expect(html).toContain("12");
    expect(html).toContain("/20");
  });

  it("omits the photo element when there is no photo", () => {
    const html = renderMarksheet(marksheet());
    expect(html).not.toContain("<img src=\"data:image/jpeg");
  });

  it("keeps a light colour scheme even though the app may be dark", () => {
    const html = renderMarksheet(marksheet());
    // A report card is printed; inheriting the app's dark tokens would produce a
    // black page on a school printer.
    expect(html).toContain("color-scheme: light only");
    expect(html).toContain("background: #ffffff");
  });

  it("derives the mark columns from the record, because they vary by category", () => {
    const document = marksheet();
    const html = renderMarksheet({
      ...document,
      records: [
        {
          ...document.records[0]!,
          titles: ["Attendance", "Participation", "Creativity"],
          marks: [4, 5, 3],
          fullMarks: [5, 5, 5]
        }
      ]
    });
    expect(html).toContain("Attendance");
    expect(html).toContain("Creativity");
  });
});

describe("transcript template", () => {
  it("renders one column per term", () => {
    const document = transcriptDocument();
    const html = renderTranscript({
      ...document,
      terms: [
        { examTypeId: 1, title: "First Term", isAverage: false },
        { examTypeId: 2, title: "Second Term", isAverage: false }
      ],
      subjects: [{ ...document.subjects[0]!, marks: [68, 74] }]
    });
    expect(html).toContain("First Term");
    expect(html).toContain("Second Term");
  });

  it("renders a missing term mark as an em dash rather than zero", () => {
    const html = renderTranscript(
      transcriptDocumentWithMarks([68, null], 1)
    );
    expect(html).toContain("—");
  });
});

function transcriptDocumentWithMarks(
  marks: readonly (number | null)[],
  termCount: number
): TranscriptDocument {
  const document = transcriptDocument();
  return {
    ...document,
    terms: Array.from({ length: termCount }, (_, index) => ({
      examTypeId: index + 1,
      title: `Term ${index + 1}`,
      isAverage: false
    })),
    subjects: [{ ...document.subjects[0]!, marks }]
  };
}

describe("template dispatch", () => {
  it("renders a marksheet payload", () => {
    const rendered = renderTemplate({
      templateVersion: "marksheet@1",
      version: 1,
      publishedAt: null,
      filename: "adaeze.pdf",
      document: marksheet()
    });
    expect(rendered.filename).toBe("adaeze.pdf");
    expect(rendered.html).toContain("Report card");
  });

  it("refuses an unimplemented template instead of falling back", () => {
    // Falling back to the transcript template would drop every term and still look
    // like a valid document, which is the worst failure for a kept record.
    expect(() =>
      renderTemplate({
        templateVersion: "transcript-history@1",
        version: 0,
        publishedAt: null,
        filename: "history.pdf",
        document: {
          studentId: 7,
          sessions: [
            {
              sessionId: 1,
              label: "2025/2026",
              terms: [
                {
                  termId: 1,
                  sequence: 1,
                  total: 320,
                  average: 64,
                  grade: "B",
                  gpa: 3.1,
                  position: 12,
                  subjectCount: 5
                }
              ],
              archive: null
            }
          ]
        }
      })
    ).toThrow(/not implemented/i);
  });
});
