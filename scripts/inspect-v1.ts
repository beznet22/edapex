import mysql from "mysql2/promise";
import { config } from "dotenv";

config();

async function inspect() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL!);
  
  console.log("--- V1 sm_exam_setups columns ---");
  const [columns]: any = await connection.query("SHOW COLUMNS FROM sm_exam_setups");
  console.table(columns);

  await connection.end();
}

inspect().catch(console.error);
