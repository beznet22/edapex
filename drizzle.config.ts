import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({
  path: ".env",
});

if (!process.env.DB_HOST) throw new Error("DB_HOST is not set");
if (!process.env.DB_USER) throw new Error("DB_USER is not set");
if (!process.env.DB_PASSWORD) throw new Error("DB_PASSWORD is not set");
if (!process.env.DB_NAME) throw new Error("DB_NAME is not set");

export default defineConfig({
  out: "./drizzle",
  schema: "./src/lib/server/db/schema.ts",
  dialect: "mysql",
  dbCredentials: {
    host: process.env.DB_HOST!,
    port: parseInt(process.env.DB_PORT || "3306"),
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_NAME!,
  },
  verbose: true,
  strict: true,
});
