import mysql from "mysql2/promise";
import { config } from "dotenv";

config();

async function audit() {
  const connection = await mysql.createConnection(process.env.DATABASE_V2_URL!);

  const [tables]: any = await connection.query("SHOW TABLES");
  const dbName = process.env.DATABASE_V2_URL!.split("/").pop();

  for (const tableRow of tables) {
    const tableName = tableRow[`Tables_in_${dbName}`];
    const [columns]: any = await connection.query(`SHOW COLUMNS FROM ${tableName}`);
    
    const colNames = columns.map((c: any) => c.Field);
    const targets = ["class_id", "section_id", "enrollment_id"].filter(t => colNames.includes(t));

    if (targets.length > 0) {
      const selectParts = targets.map(t => `SUM(CASE WHEN ${t} IS NULL THEN 1 ELSE 0 END) as null_${t}`);
      const [results]: any = await connection.query(`SELECT COUNT(*) as total, ${selectParts.join(", ")} FROM ${tableName}`);
      
      const res = results[0];
      const hasNulls = targets.some(t => res[`null_${t}`] > 0);
      
      if (hasNulls) {
        console.log(`Table: ${tableName}`);
        console.table(results);
      }
    }
  }

  await connection.end();
}

audit().catch(console.error);
