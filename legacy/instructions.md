Format this OCR into a strict marksheet markdown.
Use the context below to fill in the correct values as plain text (no spans).

# FullName — ExamTitle

## Student Information (| Field | Details |)
Full Name, Admission No, Class, Section, Category, Term, Academic Year, Days Open, Days Present, Days Absent

## Academic Performance (single table, subjects as rows)
Infer category, pick columns:
DAYCARE: Subject Code | Learning Outcome
NURSERY: Subject Code | CA (30) | ORAL (5) | PSYCHO (5) | HW (10) | EXAM (50)
GRADEK: Subject Code | CA1 (20) | CA2 (20) | HW (2) | REPORT (4) | PSYCHO (4) | EXAM (50)
LOWERBASIC: Subject Code | MTA (30) | CA (10) | REPORT (10) | EXAM (50)
MIDDLEBASIC: Subject Code | MTA (30) | CA (10) | REPORT (10) | EXAM (50)
No Total/Grade rows. DAYCARE must include Learning Outcome column. Use exact Title (Max) format.

## Learner's Rating (| Trait | Rating | 1-5)
Traits: Adherent and independent, Flexibility and creativity, Meticulous, Neatness, Self-control and interaction, Overall progress.

## Teacher's Remark
> blockquote

No markdown fences, no commentary.

--- CONTEXT ---
Class: CRECHE (id=12)
Section: B (id=6)
Term: THIRD TERM EXAMINATION- JULY/2026
Academic Year: 2025/2026

STUDENT ROSTER (admissionNo here is AUTHORITATIVE):
  - AARON SENATER MAKIR (Adm#790)
  - ASHER CHIBUDOM EZEDINMA (Adm#879)
  - AVATOR SHANGBUM (Adm#890)
  - BOR MIMIDOO PENIEL (Adm#891)
  - DEBORAH OCHANYA BENJAMIN (Adm#882)
  - DOMINION CHIAMAKA TOCHI (Adm#889)
  - FORTUNE NENSHATER WACHIN (Adm#878)
  - GAVRILA CHIMDUTO UDEH (Adm#887)
  - GODSGERALD INALEGWU OMABA (Adm#881)
  - IVESETER IVETTE UNONGU (Adm#784)
  - JONATHAN OWOICHOLOFU GABRIEL (Adm#888)
  - JOSEPHINE OGO AWAKE (Adm#886)
  - LUCY OROGO AJEGI (Adm#880)
  - LUSHAN TORTSUWA (Adm#885)
  - MHEMBEUTER SHIMAKAA (Adm#798)
  - MICHELLE MNEUTER IORDYE (Adm#892)
  - NGUMIMI NATALIA SHAKPANDE (Adm#883)
  - SALEM OBA MICHAELIGHT (Adm#893)
  - SAMUEL OLUDARE ABE (Adm#805)
  - SAMUEL UCHECHUKWU CHUKWUMA (Adm#786)
  - SENATOR KUNAV (Adm#884)
  - SHEILA MIMIDOO NONGU (Adm#894)
  - SHEKINA OYARE GABRIEL (Adm#792)
  - URIEL CHIMEZIE ALBERT (Adm#806)
  - ZOE IYANU SAMUEL (Adm#706)
If exactly one name matches, use the roster admissionNo in the Admission No field — NOT the value from the OCR. If multiple students share the same name, PRESERVE the admissionNo from the OCR input to disambiguate.

SUBJECT CODES:
  - BIBLE
  - BIBLE
  - BIBLE
  - CLL/JP
  - CLL/JP
  - CLL/JP
  - KUW/EAD
  - KUW/EAD
  - KUW/EAD
  - PSED/PD
  - PSED/PD
  - PSED/PD
  - PSRN
  - PSRN
  - PSRN

--- OCR INPUT ---
# LEARNER ASSESSMENT LOG BOOK FOR CRECHE ARM

ACADEMIC YEAR:

|  LEARNER'S DETAILS  |   |   |   |   |   |
| --- | --- | --- | --- | --- | --- |
|  Full Name: | EMMANUEL ADAKOLE RYAN  |   |   |   |   |
|  Term: | SECOND TERM  |   |   |   |   |
|  Admission No: | 921 | Class: A |  | Category: | CRECHE  |
|  Days Opened: | 94 | Days Present: | 80 | Days Absent: | 14  |

|  LEARNER'S PERFORMANCE  |   |   |   |   |   |
| --- | --- | --- | --- | --- | --- |
|  SUBJECT CODE | H/W | CA | PSYCHO | ORAL | EXAM  |
|  BIBLE | 10 | 30 | 5 | 5 | 50  |
|  CLL/JP | 10 | 24 | 5 | 5 | 50  |
|  KUW/EAD | 10 | 30 | 5 | 5 | 45  |
|  PSED/PD | 10 | 30 | 5 | 5 | 50  |
|  PSRN | 10 | 24 | 5 | 5 | 36  |

|  LEARNER'S RATING  |   |
| --- | --- |
|  Adherent and independent |   |
|  Flexibility and creativity |   |
|  Meticulous |   |
|  Neatness |   |
|  Self-control and interaction |   |
|  Overall progress |   |

|  TEACHER'S REMARK  |
| --- |
|  ADAKOLE IS WELL BEHAVED AND DEVELOPING CONFIDENCE. REGULAR WRITING PRACTICE WILL ENHANCE HIS SKILLS IN WRITING LETTERS AND NUMBERS  |