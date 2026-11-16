/**
 * `transcript@1` — the year view.
 *
 * Same shell as the report card, but transposed: subjects down, terms across. The point
 * of a transcript is the trend, so the yearly row is emphasised and per-term marks are
 * secondary.
 */

import type { TranscriptDocument } from "@edapex/contracts";

import { dataUri, documentShell, escapeHtml, text } from "./shared";

export function renderTranscript(document: TranscriptDocument): string {
  const { school, student, academicYear, terms, subjects } = document;

  const logo = dataUri(school.logo, "image/png");
  const photo = dataUri(student.studentPhoto, "image/jpeg");

  const headCells = terms
    .map((term) => `<th class="num">${escapeHtml(term.title)}</th>`)
    .join("");

  const rows = subjects
    .map((row) => {
      const cells = terms
        .map((_, index) => {
          const mark = row.marks[index];
          return `<td class="num">${mark === null || mark === undefined ? "—" : escapeHtml(String(mark))}</td>`;
        })
        .join("");
      return `<tr>
  <td class="subject">${text(row.subject)}<div style="font-weight:400;font-size:8pt;color:#6b665c">${text(row.subjectCode)}</div></td>
  ${cells}
  <td class="num" style="font-weight:700">${escapeHtml(String(row.total))}</td>
  <td class="num">${escapeHtml(row.percentage.toFixed(1))}%</td>
  <td class="num"><span class="grade">${text(row.grade)}</span></td>
</tr>`;
    })
    .join("");

  const facts = [
    ["Admission no.", String(student.adminNo)],
    ["Class", `${student.className} ${student.sectionName}`.trim()],
    ["Academic year", academicYear.year],
    ["Yearly total", String(document.yearlyTotal)],
    ["Yearly average", `${document.yearlyAverage.toFixed(1)}%`],
    ["Class average", `${document.classAverage.toFixed(1)}%`]
  ]
    .map(([label, value]) => `<div class="fact"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`)
    .join("");

  const body = `<div class="masthead">
  ${logo ? `<img class="logo" src="${logo}" alt="">` : ""}
  <div class="identity">
    <h1>${text(school.name)}</h1>
    <div class="contact">${text(school.city)}, ${text(school.state)} · ${text(school.phone)} · ${text(school.email)}</div>
  </div>
  <div class="doc-title"><strong>Transcript</strong>${text(academicYear.title)}</div>
</div>

${photo ? `<div style="display:flex;align-items:center;gap:12pt;margin-top:12pt"><img src="${photo}" alt="" style="width:54pt;height:54pt;object-fit:cover;border:0.5pt solid #e2ded3"><div><div style="font-size:13pt;font-weight:700">${text(student.fullName)}</div><div style="font-size:8.5pt;color:#57534a">Guardian: ${text(student.parentName)}</div></div></div>` : `<div style="margin-top:12pt"><div style="font-size:13pt;font-weight:700">${text(student.fullName)}</div><div style="font-size:8.5pt;color:#57534a">Guardian: ${text(student.parentName)}</div></div>`}

<dl class="facts">${facts}</dl>

<table>
  <thead><tr><th>Subject</th>${headCells}<th class="num">Yearly</th><th class="num">%</th><th class="num">Grade</th></tr></thead>
  <tbody>${rows}</tbody>
</table>

<div class="summary">
  <div class="item"><div class="label">Student average</div><div class="value">${escapeHtml(document.studentAverage.toFixed(1))}%</div></div>
  <div class="item"><div class="label">Out of</div><div class="value">${escapeHtml(String(document.maxPossibleTotal))}</div></div>
</div>`;

  return documentShell({
    title: `${student.fullName} — ${academicYear.year} transcript`,
    body,
    footerNote: `${school.name} · ${academicYear.title}`
  });
}
