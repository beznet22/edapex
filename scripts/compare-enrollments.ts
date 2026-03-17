import mysql from "mysql2/promise";
import { config } from "dotenv";

config();

async function compare() {
  const v1Conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const v2Conn = await mysql.createConnection(process.env.DATABASE_V2_URL!);

  const [[{ count: v1Count }]]: any = await v1Conn.query("SELECT COUNT(*) as count FROM student_records");
  const [[{ count: v2Count }]]: any = await v2Conn.query("SELECT COUNT(*) as count FROM enrollments");

  console.log(`V1 student_records: ${v1Count}`);
  console.log(`V2 enrollments: ${v2Count}`);

  if (v1Count !== v2Count) {
    console.log("--- Missing IDs from V1 ---");
    const [missing]: any = await v1Conn.query(`
      SELECT id FROM student_records 
      WHERE id NOT IN (SELECT id FROM edapex_v2.enrollments)
      LIMIT 10
    `);
    console.table(missing);
  }

  await v1Conn.end();
  await v2Conn.end();
}

compare().catch(console.error);
