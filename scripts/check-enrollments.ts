import mysql from "mysql2/promise";
import { config } from "dotenv";

config();

async function check() {
  const connection = await mysql.createConnection(process.env.DATABASE_V2_URL!);

  console.log("--- Table: enrollments (V2) ---");
  const [enrollments] = await connection.query(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN user_id IS NULL THEN 1 ELSE 0 END) as null_user,
      SUM(CASE WHEN class_id IS NULL THEN 1 ELSE 0 END) as null_class,
      SUM(CASE WHEN section_id IS NULL THEN 1 ELSE 0 END) as null_section
    FROM enrollments
  `);
  console.table(enrollments);

  console.log("--- Table Distribution: enrollments ---");
  const [statusDist] = await connection.query(`
    SELECT status, COUNT(*) as count FROM enrollments GROUP BY status
  `);
  console.table(statusDist);

  await connection.end();
}

check().catch(console.error);
