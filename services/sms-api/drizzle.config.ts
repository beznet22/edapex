import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/lib/server/db/schema/index.ts",
  out: "./src/lib/server/db/migrations",
  strict: true,
  verbose: true
});
