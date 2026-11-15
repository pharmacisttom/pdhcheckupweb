import { loadEnvFile } from "node:process";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

loadEnvFile(".env");
const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
const requestedDatabase = decodeURIComponent(databaseUrl.pathname.slice(1));
if (
  !["localhost", "127.0.0.1"].includes(databaseUrl.hostname) ||
  !/(^test_|_test$)/i.test(requestedDatabase) ||
  /prod|staging|uat/i.test(requestedDatabase) ||
  decodeURIComponent(databaseUrl.username) !== "pdh_test"
)
  throw new Error("Admin CRUD E2E requires a restricted localhost *_test database");

databaseUrl.pathname = "/pdh_healthcheck_test";
const env = {
  ...process.env,
  DATABASE_URL: databaseUrl.toString(),
  APP_URL: "http://localhost:3037",
  NODE_ENV: "development",
  SEED_DEMO: "true",
  OTP_PROVIDER: "test",
  EMAIL_PROVIDER: "disabled",
  PDH_TEST_DIST_DIR: ".local/next-admin-crud-e2e",
  PDH_TEST_E2E_MANAGED_SERVER: "true",
};
const { PrismaClient } = await import("@prisma/client");
const grantCheck = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
try {
  const rows = await grantCheck.$queryRaw`SHOW GRANTS FOR CURRENT_USER()`;
  const grants = rows.map((row) => String(Object.values(row)[0] ?? "").toUpperCase());
  if (
    grants.some((grant) =>
      / ON `?\*`?\.\* .*ALL PRIVILEGES| ON `?PDH_HEALTHCHECK`?\.| ON `?PDH_HEALTHCHECK_STAGING`?\./.test(grant),
    )
  )
    throw new Error("pdh_test has broad or Production/Staging database privileges");
} finally {
  await grantCheck.$disconnect();
}

for (const host of ["localhost", "127.0.0.1"]) {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(3037, host, () => probe.close(resolve));
  });
}

const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname=localhost", "--port=3037"],
  { cwd: process.cwd(), env, windowsHide: true, stdio: "inherit" },
);
const stopTree = (pid) => {
  if (!pid) return;
  if (process.platform === "win32")
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
};
const stopServer = () => stopTree(server.pid);
const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      windowsHide: true,
      stdio: ["inherit", "pipe", "pipe"],
    });
    let output = "";
    let finished = false;
    let forceTimer;
    const onOutput = (stream, data) => {
      const chunk = String(data);
      stream.write(chunk);
      output += chunk;
      if (/^\s*\d+\s+(?:passed|failed)(?:,.*)?\s*\([^\r\n]*\)/m.test(output)) {
        // Playwright has completed all tests, but its Windows worker may keep
        // an HMR socket alive. Stop our isolated server, then reap the runner
        // only if it still has not exited after teardown has had time to finish.
        stopServer();
        forceTimer ??= setTimeout(() => {
          if (!finished) {
            const failedSummary = /^\s*\d+\s+failed\b/m.test(output);
            stopTree(child.pid);
            process.exit(failedSummary ? 1 : 0);
          }
        }, 5000);
      }
    };
    child.stdout.on("data", (data) => onOutput(process.stdout, data));
    child.stderr.on("data", (data) => onOutput(process.stderr, data));
    child.once("error", reject);
    child.once("close", (code, signal) => {
      finished = true;
      clearTimeout(forceTimer);
      const failedSummary = /^\s*\d+\s+failed\b/m.test(output);
      resolve(code ?? (signal || failedSummary ? 1 : 0));
    });
  });

let ready = false;
try {
  for (let attempt = 0; attempt < 240; attempt++) {
    if (server.exitCode !== null) throw new Error("Next test server exited before readiness");
    try {
      const response = await fetch("http://localhost:3037/api/v1/health", {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // Next may still be compiling its first request.
    }
    await delay(500);
  }
  if (!ready) throw new Error("Next test server did not become ready within 120 seconds");
  process.exitCode = await run(process.execPath, [
    "node_modules/playwright/cli.js",
    "test",
    "--config=playwright.admin-crud.config.ts",
    "--reporter=line",
    ...process.argv.slice(2),
  ]);
} finally {
  if (process.platform === "win32") stopServer();
  else if (server.exitCode === null) {
    server.kill("SIGTERM");
  }
}
process.stdin.pause();
process.exit(process.exitCode ?? 0);
