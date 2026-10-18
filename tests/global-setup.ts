import { execSync } from "node:child_process";
import { config } from "dotenv";

export default function setup() {
  config({ path: ".env.test", override: true });
  if (!process.env.DATABASE_URL?.includes("test")) {
    throw new Error("Refusing to run tests: DATABASE_URL in .env.test must point at a test database.");
  }
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
}
