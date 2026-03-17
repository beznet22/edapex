import mysql from "mysql2/promise";
import { config } from "dotenv";

config();

async function check() {
  const connection = await mysql.createConnection(process.env.DATABASE_V2_URL!);

  console.log("--- Table: exam_setups ---");
  const [examSetups] = await connection.query(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN class_id IS NULL THEN 1 ELSE 0 END) as null_class,
      SUM(CASE WHEN section_id IS NULL THEN 1 ELSE 0 END) as null_section,
      SUM(CASE WHEN enrollment_id IS NULL THEN 1 ELSE 0 END) as null_enrollment
    FROM exam_setups
  `);
  console.table(examSetups);

  console.log("--- Table: exam_marks ---");
  const [examMarks] = await connection.query(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN enrollment_id IS NULL THEN 1 ELSE 0 END) as null_enrollment
    FROM exam_marks
  `);
  console.table(examMarks);

  console.log("--- Table: computed_results ---");
  const [computedResults] = await connection.query(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN class_id IS NULL THEN 1 ELSE 0 END) as null_class,
      SUM(CASE WHEN section_id IS NULL THEN 1 ELSE 0 END) as null_section,
      SUM(CASE WHEN enrollment_id IS NULL THEN 1 ELSE 0 END) as null_enrollment
    FROM computed_results
  `);
  console.table(computedResults);

  await connection.end();
}

check().catch(console.error);
