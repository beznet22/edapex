import { parseMarksheetMarkdown } from "../../src/lib/utils/marksheet-ast-parser";
import { marksheetSchema } from "../../src/lib/schema/marksheet";

interface ArmTest {
  name: string;
  md: string;
}

const DAYCARE = (name: string) => `# ${name} — FIRST TERM EXAMINATION DEC/2025

## School Information
- **Name:** Sunshine International School
- **Email:** info@sunshine.edu
- **Phone:** 080-1234-5678
- **City:** Lagos
- **State:** Lagos State
- **Title:** LEARNER ASSESSMENT LOG BOOK FOR DAYCARE ARM
- **Vacation Date:** 2025-07-25

---

## Student Information
| Field | Details |
|---|---|
| Full Name | <span data-type="mention" data-id="901" data-category="students" data-admission-no="984" data-student-name="${name}">@${name}</span> |
| Admission No | 984 |
| Gender | Female |
| Class | A |
| Section | A |
| Category | DAYCARE |
| Term | <span data-type="mention" data-id="6" data-category="exam" data-label="FIRST TERM EXAMINATION DEC/2025">@FIRST TERM EXAMINATION DEC/2025</span> |
| Academic Year | <span data-type="mention" data-id="1" data-category="academic_year" data-label="2024/2025">@2024/2025</span> |
| Session Year | 2025/2026 |
| Days Open | 134 |
| Days Present | 104 |
| Days Absent | 30 |

---

## Academic Performance

| Subject Code | Learning Outcome |
|---|---|
| BIBLE | Shows growing interest in Bible time. Keep it up. |
| CLL/JP | Listens attentively to songs and rhymes. |
| KUW/EAD | Shows curiosity about the environment. |
| PSED/PD | Enjoys playing willingly near other children. |
| PSRN | Attempts to solve simple challenges. |

---

## Learner's Rating
| Trait | Rating |
|---|---|
| Adherent and independent | 4 |
| Flexibility and creativity | 4 |
| Meticulous | 4 |
| Neatness | 5 |
| Self-control and interaction | 4 |
| Overall progress | 4 |

---

## Teacher's Remark

> She is adjusting steadily to the classroom environment.
`;

const NURSERY = (name: string) => `# ${name} — FIRST TERM EXAMINATION DEC/2025

## School Information
- **Name:** Sunshine International School
- **Email:** info@sunshine.edu
- **Phone:** 080-1234-5678
- **City:** Lagos
- **State:** Lagos State
- **Title:** LEARNER ASSESSMENT LOG BOOK FOR NURSERY ARM
- **Vacation Date:** 2025-07-25

---

## Student Information
| Field | Details |
|---|---|
| Full Name | <span data-type="mention" data-id="902" data-category="students" data-admission-no="566" data-student-name="${name}">@${name}</span> |
| Admission No | 566 |
| Gender | Male |
| Class | 2C |
| Section | A |
| Category | NURSERY |
| Term | <span data-type="mention" data-id="6" data-category="exam" data-label="FIRST TERM EXAMINATION DEC/2025">@FIRST TERM EXAMINATION DEC/2025</span> |
| Academic Year | <span data-type="mention" data-id="1" data-category="academic_year" data-label="2024/2025">@2024/2025</span> |
| Session Year | 2025/2026 |
| Days Open | 134 |
| Days Present | 128 |
| Days Absent | 6 |

---

## Academic Performance

| Subject Code | CA (30) | ORAL (5) | PSYCHO (5) | HW (10) | EXAM (50) |
|---|---|---|---|---|---|
| BIBLE | 30 | 5 | 5 | 10 | 44 |
| CLL/JP | 24 | 5 | 5 | 10 | 46 |
| KUW/EAD | 30 | 5 | 5 | 10 | 43 |
| PSED/PD | 30 | 5 | 5 | 10 | 44 |
| PSRN | 28 | 5 | 5 | 10 | 38 |

---

## Learner's Rating
| Trait | Rating |
|---|---|
| Adherent and independent | 4 |
| Flexibility and creativity | 3 |
| Meticulous | 4 |
| Neatness | 4 |
| Self-control and interaction | 4 |
| Overall progress | 4 |

---

## Teacher's Remark

> Joseph is showing great improvement in all learning areas.
`;

const GRADEK = (name: string) => `# ${name} — FIRST TERM EXAMINATION DEC/2025

## School Information
- **Name:** Sunshine International School
- **Email:** info@sunshine.edu
- **Phone:** 080-1234-5678
- **City:** Lagos
- **State:** Lagos State
- **Title:** LEARNER ASSESSMENT LOG BOOK FOR GRADE K
- **Vacation Date:** 2025-07-25

---

## Student Information
| Field | Details |
|---|---|
| Full Name | <span data-type="mention" data-id="903" data-category="students" data-admission-no="88" data-student-name="${name}">@${name}</span> |
| Admission No | 88 |
| Gender | Female |
| Class | KA |
| Section | A |
| Category | GRADEK |
| Term | <span data-type="mention" data-id="6" data-category="exam" data-label="FIRST TERM EXAMINATION DEC/2025">@FIRST TERM EXAMINATION DEC/2025</span> |
| Academic Year | <span data-type="mention" data-id="1" data-category="academic_year" data-label="2024/2025">@2024/2025</span> |
| Session Year | 2025/2026 |
| Days Open | 134 |
| Days Present | 125 |
| Days Absent | 9 |

---

## Academic Performance

| Subject Code | CA1 (20) | CA2 (20) | HW (2) | REPORT (4) | PSYCHO (4) | EXAM (50) |
|---|---|---|---|---|---|---|
| BIBLE | 20 | 20 | 2 | 4 | 4 | 50 |
| PSRN/QR | 20 | 20 | 2 | 4 | 4 | 48 |
| JP/LIT | 18 | 20 | 2 | 4 | 4 | 39 |
| CL/VR | 20 | 15 | 2 | 4 | 4 | 50 |
| PSED/PD | 20 | 20 | 2 | 4 | 4 | 50 |
| KUW/EAD | 19 | 18 | 2 | 4 | 4 | 48 |

---

## Learner's Rating
| Trait | Rating |
|---|---|
| Adherent and independent | 5 |
| Flexibility and creativity | 4 |
| Meticulous | 4 |
| Neatness | 5 |
| Self-control and interaction | 4 |
| Overall progress | 4 |

---

## Teacher's Remark

> Deborah is such a treasure to have in class.
`;

const LOWERBASIC = (name: string) => `# ${name} — FIRST TERM EXAMINATION DEC/2025

## School Information
- **Name:** Sunshine International School
- **Email:** info@sunshine.edu
- **Phone:** 080-1234-5678
- **City:** Lagos
- **State:** Lagos State
- **Title:** LEARNER ASSESSMENT LOG BOOK FOR LOWER BASIC
- **Vacation Date:** 2025-07-25

---

## Student Information
| Field | Details |
|---|---|
| Full Name | <span data-type="mention" data-id="904" data-category="students" data-admission-no="187" data-student-name="${name}">@${name}</span> |
| Admission No | 187 |
| Gender | Male |
| Class | 2A |
| Section | A |
| Category | LOWERBASIC |
| Term | <span data-type="mention" data-id="6" data-category="exam" data-label="FIRST TERM EXAMINATION DEC/2025">@FIRST TERM EXAMINATION DEC/2025</span> |
| Academic Year | <span data-type="mention" data-id="1" data-category="academic_year" data-label="2024/2025">@2024/2025</span> |
| Session Year | 2025/2026 |
| Days Open | 134 |
| Days Present | 134 |
| Days Absent | 0 |

---

## Academic Performance

| Subject Code | MTA (30) | CA (10) | REPORT (10) | EXAM (50) |
|---|---|---|---|---|
| MATH | 18 | 8 | 10 | 57 |
| ENG | 23 | 8 | 10 | 49 |
| CCA | 22 | 10 | 10 | 44 |
| CRS | 29 | 10 | 10 | 42 |
| BASIC SCIENCE | 30 | 10 | 10 | 31 |
| ICT | 20 | 10 | 10 | 38 |
| PHE | 30 | 10 | 10 | 49 |
| CIVIC | 25 | 10 | 10 | 36 |

---

## Learner's Rating
| Trait | Rating |
|---|---|
| Adherent and independent | 5 |
| Flexibility and creativity | 4 |
| Meticulous | 4 |
| Neatness | 5 |
| Self-control and interaction | 4 |
| Overall progress | 4 |

---

## Teacher's Remark

> Good performance David. Keep it up.
`;

const MIDDLEBASIC = (name: string) => `# ${name} — FIRST TERM EXAMINATION DEC/2025

## School Information
- **Name:** Sunshine International School
- **Email:** info@sunshine.edu
- **Phone:** 080-1234-5678
- **City:** Lagos
- **State:** Lagos State
- **Title:** LEARNER ASSESSMENT LOG BOOK FOR MIDDLE BASIC
- **Vacation Date:** 2025-07-25

---

## Student Information
| Field | Details |
|---|---|
| Full Name | <span data-type="mention" data-id="905" data-category="students" data-admission-no="412" data-student-name="${name}">@${name}</span> |
| Admission No | 412 |
| Gender | Male |
| Class | 6A |
| Section | A |
| Category | MIDDLEBASIC |
| Term | <span data-type="mention" data-id="6" data-category="exam" data-label="FIRST TERM EXAMINATION DEC/2025">@FIRST TERM EXAMINATION DEC/2025</span> |
| Academic Year | <span data-type="mention" data-id="1" data-category="academic_year" data-label="2024/2025">@2024/2025</span> |
| Session Year | 2025/2026 |
| Days Open | 134 |
| Days Present | 134 |
| Days Absent | 0 |

---

## Academic Performance

| Subject Code | MTA (30) | CA (10) | REPORT (10) | EXAM (50) |
|---|---|---|---|---|
| MATH | 30 | 10 | 10 | 47 |
| ENG | 24 | 9 | 10 | 45 |
| CCA | 25 | 10 | 10 | 48 |
| CRS | 29 | 10 | 10 | 46 |
| BST | 29 | 10 | 10 | 42 |
| BDL | 28 | 10 | 8 | 49 |
| PHE | 26 | 9 | 10 | 43 |
| CIVIC | 28 | 10 | 10 | 43 |
| FRENCH | 29 | 10 | 10 | 32 |

---

## Learner's Rating
| Trait | Rating |
|---|---|
| Adherent and independent | 4 |
| Flexibility and creativity | 4 |
| Meticulous | 4 |
| Neatness | 5 |
| Self-control and interaction | 4 |
| Overall progress | 4 |

---

## Teacher's Remark

> Isaac is diligent and hardworking.
`;

const arms: ArmTest[] = [
  { name: "DAYCARE", md: DAYCARE("SHEKUMA TULE") },
  { name: "NURSERY", md: NURSERY("JOSEPH OLOCHE GABRIEL") },
  { name: "GRADEK", md: GRADEK("DEBORAH AYOSOORE OLUWADARE") },
  { name: "LOWERBASIC", md: LOWERBASIC("DAVID OLUWADARE") },
  { name: "MIDDLEBASIC", md: MIDDLEBASIC("ENENCHE ISAAC GODWIN") },
];

async function run() {
  let passed = 0;
  let failed = 0;

  for (const arm of arms) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`  ARM: ${arm.name}`);
    console.log(`${"=".repeat(60)}`);

    const parsed = parseMarksheetMarkdown(arm.md);

    console.log(`  Student: ${parsed.student.fullName} | Class: ${parsed.student.className} | Category: ${parsed.student.category}`);
    console.log(`  Subjects: ${parsed.subjects.length} | Records: ${parsed.records.length}`);
    console.log(`  Titles: [${parsed.records[0]?.titles?.join(", ") || "none"}]`);
    console.log(`  FullMarks: [${parsed.records[0]?.fullMarks?.join(", ") || "none"}]`);
    console.log(`  Score total: ${parsed.score.total} | avg: ${parsed.score.average}`);
    console.log(`  Ratings: ${parsed.ratings.length} | Remark: ${parsed.remark.remark ? "yes" : "no"}`);
    console.log(`  Learning Outcome: ${parsed.records[0]?.learningOutcome || "(none)"}`);

    const result = await marksheetSchema.safeParseAsync(parsed);
    if (result.success) {
      console.log(`  ✅ ${arm.name}: VALID`);
      passed++;
    } else {
      console.log(`  ❌ ${arm.name}: INVALID`);
      for (const issue of result.error.issues) {
        console.log(`     [${issue.path.join(".")}] ${issue.message}`);
      }
      failed++;
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log(`${"=".repeat(60)}`);
}

run().catch(console.error);
