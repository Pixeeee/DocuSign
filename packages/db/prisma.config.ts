import { defineConfig, env } from "prisma/config";
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === "production";

config({ path: path.resolve(__dirname, "../../.env.local"), override: !isProduction });
config({ path: path.resolve(__dirname, ".env.local"), override: !isProduction });

const migrationDatabaseUrl = process.env.DIRECT_URL || env("DATABASE_URL");

export default defineConfig({
  schema: "./prisma/schema.prisma",
  migrations: {
    path: "./prisma/migrations",
  },
  datasource: {
    url: migrationDatabaseUrl,
  },
});
