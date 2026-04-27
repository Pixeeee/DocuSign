import { defineConfig, env } from "prisma/config";
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === "production";

config({ path: path.resolve(__dirname, "../../.env.local"), override: !isProduction });
config({ path: path.resolve(__dirname, ".env.local"), override: !isProduction });

export default defineConfig({
  schema: "./prisma/schema.prisma",
  migrations: {
    path: "./prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
