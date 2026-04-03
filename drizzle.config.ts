import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({
  path: ".env",
});

if (!process.env.DATABASE_V2_URL) throw new Error("DATABASE_V2_URL is not set");

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/mysql/schema.ts",
  dialect: "mysql",
  dbCredentials: {
    url: process.env.DATABASE_V2_URL!,
  },
  verbose: true,
  strict: true,
});
