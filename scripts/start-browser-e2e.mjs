import { cpSync, existsSync, readFileSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import {
  parseRc02TestDatabaseUrl,
  verifyRc02TestDatabase,
} from "./test-db-guard.mjs";

const url = parseRc02TestDatabaseUrl(process.env.DATABASE_URL);
if (process.env.PDH_TEST_UI_MOCKS === "true") {
  if (url.port !== "1")
    throw new Error("Mock UI tests require the closed database port");
} else {
  const db = new PrismaClient();
  try {
    await verifyRc02TestDatabase(db, url.toString());
  } finally {
    await db.$disconnect();
  }
}

// Exercise the built application. A release gate must not depend on dev compilation/HMR.
const dist = resolve(".next");
if (!existsSync(join(dist, "BUILD_ID")))
  throw new Error("Run npm run build before browser E2E");
const files = JSON.parse(
  readFileSync(join(dist, "required-server-files.json"), "utf8"),
);
const standalone = join(dist, "standalone");
const runtime = resolve(standalone, files.relativeAppDir ?? "");
if (relative(standalone, runtime).startsWith(".."))
  throw new Error("Invalid standalone runtime path");
const server = join(runtime, "server.js");
if (!existsSync(server))
  throw new Error("Standalone build is missing server.js");
cpSync(resolve("public"), join(runtime, "public"), {
  recursive: true,
  force: false,
});
cpSync(join(dist, "static"), join(runtime, ".next", "static"), {
  recursive: true,
  force: false,
});
process.env.NODE_ENV = "production";
process.env.OTP_PROVIDER = "disabled";
process.env.EMAIL_PROVIDER = "disabled";
await import(pathToFileURL(server).href);
