import mysql from "mysql2/promise";
import { config } from "dotenv";

config();

async function patch() {
  const connection = await mysql.createConnection(process.env.DATABASE_V2_URL!);

  console.log("Patching Enrollments...");
  await connection.query("ALTER TABLE enrollments MODIFY class_id int(11)");
  await connection.query("ALTER TABLE enrollments MODIFY section_id int(11)");

  console.log("Patching Homework Submissions...");
  await connection.query("ALTER TABLE homework_submissions ADD COLUMN enrollment_id int(11) AFTER user_id");
  await connection.query("ALTER TABLE homework_submissions ADD COLUMN class_id int(11) AFTER enrollment_id");
  await connection.query("ALTER TABLE homework_submissions ADD COLUMN section_id int(11) AFTER class_id");

  console.log("Patching Attendances...");
  await connection.query("ALTER TABLE attendances ADD COLUMN enrollment_id int(11) AFTER attendance_date");
  await connection.query("ALTER TABLE attendances ADD COLUMN class_id int(11) AFTER enrollment_id");
  await connection.query("ALTER TABLE attendances ADD COLUMN section_id int(11) AFTER class_id");

  console.log("Patching Ledger Entries...");
  await connection.query("ALTER TABLE ledger_entries ADD COLUMN enrollment_id int(11) AFTER user_id");

  console.log("Patching Fee Assignments...");
  await connection.query("ALTER TABLE fee_assignments ADD COLUMN enrollment_id int(11) AFTER user_id");
  await connection.query("ALTER TABLE fee_assignments ADD COLUMN class_id int(11) AFTER enrollment_id");
  await connection.query("ALTER TABLE fee_assignments ADD COLUMN section_id int(11) AFTER class_id");

  console.log("✅ Database patched successfully.");
  await connection.end();
}

patch().catch(console.error);
