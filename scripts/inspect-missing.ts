import mysql from "mysql2/promise";
import { config } from "dotenv";

config();

async function inspectMissing() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL!);
  
  const [rows]: any = await connection.query("SELECT * FROM student_records WHERE id IN (757, 758, 1359)");
  console.table(rows);

  await connection.end();
}

inspectMissing().catch(console.error);
