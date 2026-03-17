import mysql from "mysql2/promise";
import { config } from "dotenv";

config();

async function patch() {
  const connection = await mysql.createConnection(process.env.DATABASE_V2_URL!);

  console.log("Patching Online Exam Attempts...");
  const [columns]: any = await connection.query("SHOW COLUMNS FROM online_exam_attempts");
  if (!columns.some((c: any) => c.Field === "enrollment_id")) {
    await connection.query("ALTER TABLE online_exam_attempts ADD COLUMN enrollment_id int(11) AFTER user_id");
  }

  // Ensure enrollments allows NULL for legacy data
  console.log("Relaxing Enrollment Constraints...");
  await connection.query("ALTER TABLE enrollments MODIFY class_id int(11)");
  await connection.query("ALTER TABLE enrollments MODIFY section_id int(11)");

  console.log("✅ Database patched for NULL investigation fix.");
  await connection.end();
}

patch().catch(console.error);
