/**
 * `marksheet@1` — the report card.
 *
 * Reads as a document, not a screen: fixed light palette, no interactive affordances,
 * and a table that stays legible when printed on a school's black-and-white laser
 * printer. Grade colour is a hint, never the only signal — the letter is always there.
 */

import type { MarksheetDocument, SubjectRecord } from "@edapex/contracts";

import { dataUri, documentShell, escapeHtml, text } from "./shared";

/** Renders one mark, or ABS when the student was away. */
function markCell(record: SubjectRecord, index: number): string {
  if (record.absent?.[index] === true) {
    return `<td class="num absent">ABS</td>`;
  }
  const mark = record.marks[index];
  if (mark === undefined) return `<td class="num">—</td>`;
  const max = record.fullMarks[index];
  // Showing "12/20" rather than "12" matters: a bare number is unreadable to a parent
  // who does not know the paper was out of 20.
  return max === undefined
    ? `<td class="num">${escapeHtml(String(mark))}</td>`
    : `<td class="num">${escapeHtml(String(mark))}<span style="color:#8a8579">/${escapeHtml(String(max))}</span></td>`;
}

function recordRow(record: SubjectRecord): string {
  return `<tr>
  <td class="subject">${text(record.subject)}<div style="font-weight:400;font-size:8pt;color:#6b665c">${text(record.subjectCode)}</div></td>
  ${record.titles.map((_, index) => markCell(record, index)).join("")}
  <td class="num">${record.totalScore === undefined ? "—" : escapeHtml(String(record.totalScore))}</td>
  <td class="num"><span class="grade">${text(record.grade)}</span></td>
</tr>`;
}

function ratingsSection(ratings: MarksheetDocument["ratings"]): string {
  if (ratings.length === 0) return "";
  const items = ratings
    .filter((entry) => entry.attribute !== null)
    .map(
      (entry) => `<div class="rating">
  <div class="attr">${text(entry.attribute)}</div>
  <div class="val">${entry.rate === null ? "—" : `${escapeHtml(String(entry.rate))}/5`}</div>
</div>`
    )
    .join("");
  return items.length === 0 ? "" : `<h2>Affective &amp; psychomotor</h2><div class="ratings">${items}</div>`;
}

export function renderMarksheet(document: MarksheetDocument): string {
  const { school, student, records, score, ratings, remark } = document;

  const logo = dataUri(school.logo, "image/png");
  const photo = dataUri(student.studentPhoto, "image/jpeg");

  // Titles vary by category, so the header is derived from the first record rather
  // than hard-coded. A daycare marksheet has entirely different columns.
  const titles = records[0]?.titles ?? [];
  const headCells = titles.map((title) => `<th class="num">${escapeHtml(title)}</th>`).join("");

  const facts = [
    ["Admission no.", String(student.adminNo)],
    ["Class", `${student.className} ${student.sectionName}`.trim()],
    ["Term", student.term],
    ["Session", student.sessionYear],
    ["Days present", `${student.daysPresent} of ${student.daysOpened}`],
    ["Days absent", String(student.daysAbsent)]
  ]
    .map(([label, value]) => `<div class="fact"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`)
    .join("");

  const summary = score
    ? `<div class="summary">
  <div class="item"><div class="label">Total</div><div class="value">${escapeHtml(String(score.total))}</div></div>
  <div class="item"><div class="label">Average</div><div class="value">${escapeHtml(score.average.toFixed(1))}%</div></div>
  <div class="item"><div class="label">Class low</div><div class="value">${escapeHtml(score.classAverage.min.value)}</div></div>
  <div class="item"><div class="label">Class high</div><div class="value">${escapeHtml(score.classAverage.max.value)}</div></div>
</div>`
    : "";

  const remarkBlock = remark?.remark
    ? `<h2>Teacher's remark</h2><div class="remark">${escapeHtml(remark.remark)}</div>`
    : "";

  const body = `<div class="masthead">
  ${logo ? `<img class="logo" src="${logo}" alt="">` : ""}
  <div class="identity">
    <h1>${text(school.name)}</h1>
    <div class="contact">${text(school.city)}, ${text(school.state)} · ${text(school.phone)} · ${text(school.email)}</div>
  </div>
  <div class="doc-title"><strong>Report card</strong>${text(student.title)}</div>
</div>

${photo ? `<div style="display:flex;align-items:center;gap:12pt;margin-top:12pt"><img src="${photo}" alt="" style="width:54pt;height:54pt;object-fit:cover;border:0.5pt solid #e2ded3"><div><div style="font-size:13pt;font-weight:700">${text(student.fullName)}</div><div style="font-size:8.5pt;color:#57534a">Guardian: ${text(student.parentName)}</div></div></div>` : `<div style="margin-top:12pt"><div style="font-size:13pt;font-weight:700">${text(student.fullName)}</div><div style="font-size:8.5pt;color:#57534a">Guardian: ${text(student.parentName)}</div></div>`}

<dl class="facts">${facts}</dl>

<table>
  <thead><tr><th>Subject</th>${headCells}<th class="num">Total</th><th class="num">Grade</th></tr></thead>
  <tbody>${records.map(recordRow).join("")}</tbody>
</table>
${summary}
${ratingsSection(ratings)}
${remarkBlock}`;

  return documentShell({
    title: `${student.fullName} — ${student.term} report card`,
    body,
    footerNote: `${school.name} · ${student.sessionYear} · ${student.term}`
  });
}
