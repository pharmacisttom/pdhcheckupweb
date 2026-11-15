import { loadEnvFile } from "node:process";
import { spawnSync } from "node:child_process";
loadEnvFile(".env");
const url = new URL(process.env.DATABASE_URL);
if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost")
  throw new Error(
    "Only explicitly isolated localhost test databases are supported",
  );
const requestedDatabase = decodeURIComponent(url.pathname.slice(1));
if (!/(^test_|_test$)/i.test(requestedDatabase) || /prod|staging|uat/i.test(requestedDatabase))
  throw new Error("Integration tests require a separately named *_test or test_* database");
if (decodeURIComponent(url.username) !== "pdh_test" || /prod|stg|staging/i.test(url.username))
  throw new Error("Integration tests require the restricted pdh_test database user");
url.pathname = "/pdh_healthcheck_test";
const env = {
  ...process.env,
  DATABASE_URL: url.toString(),
  APP_URL: "http://localhost:3036",
  RUN_DB_TESTS: "true",
  OTP_PROVIDER: "test",
  EMAIL_PROVIDER: "disabled",
};
const { PrismaClient } = await import("@prisma/client");
const grantCheck = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
try {
  const rows = await grantCheck.$queryRaw`SHOW GRANTS FOR CURRENT_USER()`;
  const grants = rows.map((row) => String(Object.values(row)[0] ?? "").toUpperCase());
  if (grants.some((grant) => / ON `?\*`?\.\* .*ALL PRIVILEGES| ON `?PDH_HEALTHCHECK`?\.| ON `?PDH_HEALTHCHECK_STAGING`?\./.test(grant)))
    throw new Error("pdh_test has global or production/staging database privileges; refusing tests");
} finally {
  await grantCheck.$disconnect();
}
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
