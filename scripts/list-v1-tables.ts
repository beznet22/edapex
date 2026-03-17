import mysql from "mysql2/promise";
import { config } from "dotenv";

config();

async function listTables() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL!);
  
  console.log("--- V1 Tables ---");
  const [tables]: any = await connection.query("SHOW TABLES");
  console.table(tables);

  await connection.end();
}

listTables().catch(console.error);
