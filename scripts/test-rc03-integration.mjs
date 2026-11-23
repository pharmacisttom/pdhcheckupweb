import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { verifyRc02TestDatabase } from "./test-db-guard.mjs";

if (existsSync(".env")) loadEnvFile(".env");
const db = new PrismaClient();
try {
  await verifyRc02TestDatabase(db, process.env.DATABASE_URL);
} finally {
  await db.$disconnect();
}
// No URL rewriting, implicit migrations, seeds or resets. Provision explicitly in CI.
const result = spawnSync(
  process.execPath,
  [
    "node_modules/vitest/vitest.mjs",
    "run",
    ...(process.argv.includes("--all")
      ? ["tests/integration"]
      : [
          "tests/integration/rc03.test.ts",
          "tests/integration/registration-recovery.test.ts",
        ]),
    "--maxWorkers=1",
  ],
  {
    env: {
      ...process.env,
      RUN_DB_TESTS: "true",
      APP_URL: "http://localhost:3037",
      OTP_PROVIDER: "test",
      EMAIL_PROVIDER: "disabled",
    },
    stdio: "inherit",
    windowsHide: true,
  },
);
process.exitCode = result.status ?? 1;
