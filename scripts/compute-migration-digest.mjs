import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export function computeMigrationDigest(baseDir = process.cwd()) {
  const migrationsDir = join(baseDir, "prisma", "migrations");
  const entries = [];
  
  function walk(dir) {
    for (const f of readdirSync(dir)) {
      const full = join(dir, f);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (f === "migration.sql") {
        entries.push(full);
      }
    }
  }
  
  walk(migrationsDir);
  // Sort with same order as `sort -z` in POSIX (byte order)
  entries.sort();

  let intermediate = "";
  for (const file of entries) {
    // Normalizing CRLF to LF to match Git blob / Linux checkout
    const raw = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    const fileHash = createHash("sha256").update(raw, "utf8").digest("hex");
    
    // Normalize path to forward slash relative to workspace root (prisma/migrations/...)
    let relPath = file.replace(/\\/g, "/");
    const idx = relPath.indexOf("prisma/migrations/");
    if (idx !== -1) {
      relPath = relPath.slice(idx);
    }
    
    // Exactly matches Linux sha256sum output format: "<hash>  <relpath>\n" (two spaces)
    intermediate += `${fileHash}  ${relPath}\n`;
  }

  return createHash("sha256").update(intermediate, "utf8").digest("hex");
}

if (process.argv[1]?.endsWith("compute-migration-digest.mjs")) {
  const digest = computeMigrationDigest();
  console.log("Computed Migration Digest:", digest);
}
