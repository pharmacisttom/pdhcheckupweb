import { loadEnvFile } from "node:process";
import { spawnSync } from "node:child_process";
loadEnvFile(".env");
const url = new URL(process.env.DATABASE_URL);
if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost")
  throw new Error(
    "Only explicitly isolated localhost test databases are supported",
  );
url.pathname = "/pdh_healthcheck_test";
const env = {
  ...process.env,
  DATABASE_URL: url.toString(),
  RUN_DB_TESTS: "true",
  OTP_PROVIDER: "test",
};
for (const args of [
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  // Policy tests change the singleton booking mode; keep test files isolated in time.
  [
    "node_modules/vitest/vitest.mjs",
    "run",
    "tests/integration",
    "--maxWorkers=1",
  ],
]) {
  const result = spawnSync(process.execPath, args, { env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
