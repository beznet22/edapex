import { readFileSync } from "fs";
import { parseMarksheetMarkdown } from "../../src/lib/utils/marksheet-ast-parser";
import { marksheetSchema } from "../../src/lib/schema/marksheet";

const md = readFileSync("tests/manual/strict-template-marksheet.md", "utf-8");

console.log("=== PARSING MARKDOWN ===\n");

const parsed = parseMarksheetMarkdown(md);

console.log("=== SCHOOL ===");
console.log(JSON.stringify(parsed.school, null, 2));

console.log("\n=== STUDENT ===");
console.log(JSON.stringify(parsed.student, null, 2));

console.log("\n=== SUBJECTS ===");
console.log(JSON.stringify(parsed.subjects, null, 2));

console.log("\n=== RECORDS ===");
console.log(JSON.stringify(parsed.records, null, 2));

console.log("\n=== SCORE ===");
console.log(JSON.stringify(parsed.score, null, 2));

console.log("\n=== RATINGS ===");
console.log(JSON.stringify(parsed.ratings, null, 2));

console.log("\n=== REMARK ===");
console.log(JSON.stringify(parsed.remark, null, 2));

console.log("\n=== EXAM TYPE ===");
console.log(JSON.stringify(parsed.examType, null, 2));

console.log("\n=== ZOD VALIDATION ===");

async function validate() {
  const result = await marksheetSchema.safeParseAsync(parsed);
  if (result.success) {
    console.log("✅ VALID — marksheetSchema passed");
  } else {
    console.log("❌ INVALID — marksheetSchema errors:");
    for (const issue of result.error.issues) {
      console.log(`  [${issue.path.join(".")}] ${issue.message} (code: ${issue.code})`);
    }
  }
}

validate().catch(console.error);
