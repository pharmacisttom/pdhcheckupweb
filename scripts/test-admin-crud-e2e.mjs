import { loadEnvFile } from "node:process";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { parseRc02TestDatabaseUrl, verifyRc02TestDatabase } from "./test-db-guard.mjs";

loadEnvFile(".env");
parseRc02TestDatabaseUrl(process.env.DATABASE_URL);
const env = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL,
  APP_URL: "http://localhost:3037",
  NODE_ENV: "development",
  PDH_TEST_ALLOW_SYNTHETIC_FIXTURES: "true",
  OTP_PROVIDER: "test",
  EMAIL_PROVIDER: "disabled",
  PDH_TEST_DIST_DIR: ".local/next-admin-crud-e2e",
  PDH_TEST_E2E_MANAGED_SERVER: "true",
};
const { PrismaClient } = await import("@prisma/client");
const grantCheck = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
try {
  await verifyRc02TestDatabase(grantCheck, env.DATABASE_URL);
} catch {
  throw new Error("Admin CRUD E2E preflight failed; no test server was started");
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
    let timedOutAfterSummary = false;
    let forceTimer;
    const onOutput = (stream, data) => {
      const chunk = String(data);
      stream.write(chunk);
      output += chunk;
      if (/^\s*\d+\s+(?:passed|failed)(?:,.*)?\s*\([^\r\n]*\)/m.test(output)) {
        // Give Playwright time to close browser contexts before stopping Next.
        // A timeout is never converted into success; only a clean exit is accepted.
        forceTimer ??= setTimeout(() => {
          if (!finished) {
            timedOutAfterSummary = true;
            stopTree(child.pid);
            stopServer();
          }
        }, 15000);
      }
    };
    child.stdout.on("data", (data) => onOutput(process.stdout, data));
    child.stderr.on("data", (data) => onOutput(process.stderr, data));
    child.once("error", reject);
    child.once("close", (code, signal) => {
      finished = true;
      clearTimeout(forceTimer);
      resolve(code === 0 && !signal && !timedOutAfterSummary ? 0 : 1);
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
  else if (server.exitCode === null) server.kill("SIGTERM");
}
process.stdin.pause();
