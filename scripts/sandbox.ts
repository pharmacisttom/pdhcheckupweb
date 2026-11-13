import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { spawnSync } from "node:child_process";
import { sandboxEnabled } from "../src/lib/sandbox";

const command = process.argv[2];
if (command === "init") {
  const password = randomBytes(24).toString("hex");
  const values = {
    PDH_SANDBOX_MODE: "true", NODE_ENV: "development",
    MYSQL_ROOT_PASSWORD: randomBytes(24).toString("hex"),
    MYSQL_DATABASE: "pdh_healthcheck_sandbox", MYSQL_USER: "pdh_sandbox", MYSQL_PASSWORD: password,
    DATABASE_URL: `mysql://pdh_sandbox:${password}@127.0.0.1:33319/pdh_healthcheck_sandbox`,
    APP_URL: "http://localhost:33318", PORT: "33318", HOSTNAME: "127.0.0.1",
    DATA_ENCRYPTION_KEY: randomBytes(32).toString("hex"), OTP_PEPPER: randomBytes(32).toString("hex"),
    SEED_DEMO: "true", SEED_ADMIN_EMAIL: "sandbox-admin@example.invalid", SEED_ADMIN_PASSWORD: randomBytes(20).toString("hex"),
    OTP_PROVIDER: "disabled", EMAIL_PROVIDER: "disabled", CHAT_ENABLED: "false", CHAT_AI_ENABLED: "false",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  writeFileSync(".env.sandbox", Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n") + "\n", { flag: "wx", mode: 0o600 });
  console.log("Created isolated .env.sandbox with unique synthetic credentials. Existing files are never overwritten.");
} else {
  const env = { ...process.env, ...parseEnv(readFileSync(".env.sandbox", "utf8")) };
  if (!sandboxEnabled(env)) throw new Error("Sandbox mode is required");
  if (new URL(env.APP_URL!).origin !== "http://localhost:33318" || env.PORT !== "33318") {
    throw new Error("Sandbox launcher is restricted to localhost:33318");
  }
  function run(args: string[], extra: Record<string, string> = {}) {
    const result = spawnSync(process.execPath, args, { env: { ...env, ...extra }, stdio: "inherit" });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  if (command === "prepare") {
    if (env.NODE_ENV === "production") throw new Error("Synthetic seeding is forbidden in production mode");
    run(["node_modules/prisma/build/index.js", "generate"]);
    run(["node_modules/prisma/build/index.js", "migrate", "deploy"]);
    run(["--import", "tsx", "prisma/seed.ts"]);
    console.log("Sandbox prepared using existing schema, migrations and synthetic seed. Staff MFA remains required.");
  } else if (command === "dev") {
    run(["node_modules/next/dist/bin/next", "dev", "--hostname", "localhost", "--port", "33318"]);
  } else if (command === "build") {
    run(["node_modules/next/dist/bin/next", "build", "--webpack"], { NODE_ENV: "production" });
  } else if (command === "start") {
    run(["node_modules/next/dist/bin/next", "start", "--hostname", "localhost", "--port", "33318"], { NODE_ENV: "production" });
  } else throw new Error("Use init, prepare, dev, build or start");
}
