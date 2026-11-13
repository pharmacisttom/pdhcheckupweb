import { defineConfig } from "@playwright/test";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { sandboxEnabled } from "./src/lib/sandbox";
Object.assign(process.env, parseEnv(readFileSync(".env.sandbox", "utf8")));
if (!sandboxEnabled()) throw Error("Dedicated sandbox required");
export default defineConfig({
  testDir: "./tests/e2e", testMatch: "sandbox.spec.ts", workers: 1,
  timeout: 60000, expect: { timeout: 20000 },
  use: { baseURL: "http://localhost:33318" },
  webServer: {
    command: "npm run sandbox:dev", url: "http://localhost:33318/sandbox",
    reuseExistingServer: true, timeout: 120000,
  },
});
