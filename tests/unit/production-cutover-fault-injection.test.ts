import { describe, it, expect, afterEach } from "vitest";
import { spawnSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

const BASH =
  process.platform === "win32" &&
  existsSync("C:\\Program Files\\Git\\usr\\bin\\bash.exe")
    ? "C:\\Program Files\\Git\\usr\\bin\\bash.exe"
    : "bash";

const tempDirs: string[] = [];

function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

function sha256File(p: string): string {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

function setupIsolatedFixture() {
  const root = mkdtempSync(join(tmpdir(), "pdh-prod-fi-"));
  tempDirs.push(root);

  const deployRoot = join(root, "deploy-root");
  const sourceWork = join(root, "source-work");
  const originBare = join(root, "origin.git");
  const mockBin = join(root, "mock-bin");
  const stateDir = join(root, "mock-state");
  const systemdDir = join(root, "etc-systemd");
  const unitFile = join(systemdDir, "pdhcheckup-production.service");
  const dropinDir = join(systemdDir, "pdhcheckup-production.service.d");
  const legacyRuntime = join(deployRoot, "releases", "rc01-e75f4d9");

  for (const d of [
    join(deployRoot, "releases", "production"),
    join(deployRoot, "releases", "staging", "rel-stg-1"),
    join(deployRoot, "shared", "production", "backups"),
    join(deployRoot, "shared", "staging"),
    legacyRuntime,
    sourceWork,
    mockBin,
    stateDir,
    dropinDir,
  ]) {
    mkdirSync(d, { recursive: true });
  }

  // Copy deploy/ and prisma/migrations/ into isolated source repo (preserving LF)
  cpSync(join(process.cwd(), "deploy"), join(sourceWork, "deploy"), {
    recursive: true,
  });
  cpSync(
    join(process.cwd(), "prisma", "migrations"),
    join(sourceWork, "prisma", "migrations"),
    { recursive: true },
  );
  writeFileSync(
    join(sourceWork, "package.json"),
    JSON.stringify({ name: "pdh-mock", private: true }) + "\n",
  );

  // Normalize all copied migration.sql and .sh files to LF so Git blobs match Linux
  for (const m of readdirSync(join(sourceWork, "prisma", "migrations"))) {
    const sqlPath = join(sourceWork, "prisma", "migrations", m, "migration.sql");
    if (existsSync(sqlPath)) {
      writeFileSync(sqlPath, readFileSync(sqlPath, "utf8").replace(/\r\n/g, "\n"));
    }
  }
  const normalizeShellTree = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        normalizeShellTree(p);
      } else if (entry.name.endsWith(".sh")) {
        writeFileSync(p, readFileSync(p, "utf8").replace(/\r\n/g, "\n"));
      }
    }
  };
  normalizeShellTree(join(sourceWork, "deploy"));

  const runGit = (cwd: string, args: string[]) => {
    const res = spawnSync("git", args, { cwd, encoding: "utf8" });
    if (res.status !== 0) {
      throw new Error(`git ${args.join(" ")} failed: ${res.stderr}`);
    }
    return res.stdout.trim();
  };

  runGit(sourceWork, ["init", "-b", "feature/rc04-ui-impeccable-playwright"]);
  runGit(sourceWork, ["config", "core.autocrlf", "false"]);
  runGit(sourceWork, ["config", "user.email", "test@pdh.invalid"]);
  runGit(sourceWork, ["config", "user.name", "Test"]);
  runGit(sourceWork, ["add", "."]);
  runGit(sourceWork, ["commit", "-m", "pinned rc04 commit"]);
  const pinnedSha = runGit(sourceWork, ["rev-parse", "HEAD"]);

  runGit(root, ["init", "--bare", originBare]);
  runGit(sourceWork, ["remote", "add", "origin", toPosix(originBare)]);
  runGit(sourceWork, ["push", "origin", "feature/rc04-ui-impeccable-playwright"]);

  // Also clone a clean source checkout at deployRoot/source to verify zero mutation
  runGit(root, [
    "clone",
    "-c",
    "core.autocrlf=false",
    "-b",
    "feature/rc04-ui-impeccable-playwright",
    toPosix(originBare),
    toPosix(join(deployRoot, "source")),
  ]);

  // Compute migration digest & per-file checksums from git blobs
  const migFiles = readdirSync(join(sourceWork, "prisma", "migrations"))
    .sort()
    .map((m) => ({
      name: m,
      path: join(sourceWork, "prisma", "migrations", m, "migration.sql"),
    }))
    .filter((m) => existsSync(m.path));

  let digestLines = "";
  const dbChecksums: string[] = [];
  for (const m of migFiles) {
    const buf = readFileSync(m.path, "utf8").replace(/\r\n/g, "\n");
    const h = createHash("sha256").update(buf, "utf8").digest("hex");
    digestLines += `${h}  prisma/migrations/${m.name}/migration.sql\n`;
    dbChecksums.push(`${m.name}\t${h}`);
  }
  const migrationDigest = createHash("sha256")
    .update(digestLines, "utf8")
    .digest("hex");

  // Protected .env files
  writeFileSync(
    join(deployRoot, "shared", "production", ".env"),
    [
      "DATABASE_URL=mysql://pdhcheckup_prod:ProdSecretOnly_123@127.0.0.1:3306/pdh_healthcheck",
      "NODE_ENV=production",
      "SEED_DEMO=false",
      "HOSTNAME=127.0.0.1",
      "PORT=3036",
      "APP_URL=https://pdhcheckup.pluakdaenghospital.cloud",
      "DATA_ENCRYPTION_KEY=" + "a".repeat(64),
      "OTP_PEPPER=" + "b".repeat(64),
      "OTP_PROVIDER=disabled",
    ].join("\n") + "\n",
    { mode: 0o600 },
  );
  writeFileSync(
    join(deployRoot, "shared", "staging", ".env"),
    [
      "DATABASE_URL=mysql://pdhcheckup_stg:StgSecretOnly_456@127.0.0.1:3306/pdh_healthcheck_staging",
      "NODE_ENV=production",
      "SEED_DEMO=false",
      "HOSTNAME=127.0.0.1",
      "PORT=3037",
      "APP_URL=https://staging-pdhcheckup.pluakdaenghospital.cloud",
      "DATA_ENCRYPTION_KEY=" + "c".repeat(64),
      "OTP_PEPPER=" + "d".repeat(64),
      "OTP_PROVIDER=disabled",
    ].join("\n") + "\n",
    { mode: 0o600 },
  );
  writeFileSync(
    join(deployRoot, "shared", "production", "backup.cnf"),
    "[client]\nuser=pdh_backup\npassword=BackupSecretOnly\n",
    { mode: 0o600 },
  );

  // Legacy runtime minimal files (server.js + .next) for systemd permission & ExecStart checks
  writeFileSync(join(legacyRuntime, "server.js"), "console.log('legacy');\n");
  mkdirSync(join(legacyRuntime, ".next"), { recursive: true });

  // Legacy systemd unit + multi-drop-in site configuration
  const origUnitContent = [
    "[Unit]",
    "Description=PDH Legacy Production",
    "After=network.target mysql.service",
    "",
    "[Service]",
    "Type=simple",
    "User=pdhcheckup",
    `WorkingDirectory=${toPosix(legacyRuntime)}`,
    "Environment=CUSTOM_SITE_FLAG=preserve_me",
    "ExecStart=/usr/bin/node server.js",
    "",
    "[Install]",
    "WantedBy=multi-user.target",
    "",
  ].join("\n");
  writeFileSync(unitFile, origUnitContent);
  const origDropins: Record<string, string> = {
    "10-env.conf": `[Service]\nEnvironmentFile=${toPosix(deployRoot)}/shared/production/.env\n`,
    "20-override.conf": `[Service]\nWorkingDirectory=${toPosix(legacyRuntime)}\nExecStart=\nExecStart=/usr/bin/node server.js\n`,
    "30-hardening.conf": `[Service]\nProtectSystem=strict\nReadWritePaths=${toPosix(legacyRuntime)}/.next\nEnvironment=DROPIN_KEEP=1\n`,
  };
  for (const [name, content] of Object.entries(origDropins)) {
    writeFileSync(join(dropinDir, name), content);
  }

  // Track mock service state
  writeFileSync(join(stateDir, "prod-active"), "active");
  writeFileSync(join(stateDir, "prod-pid"), "1001");
  writeFileSync(join(stateDir, "stg-pid"), "2002");
  writeFileSync(
    join(stateDir, "db-checksums.txt"),
    dbChecksums.join("\n") + "\n",
  );
  writeFileSync(join(stateDir, "calls.log"), "");

  // Helper to evaluate effective systemd properties & ExecStart resets across unit + sorted drop-ins
  writeFileSync(
    join(stateDir, "systemd-eval.cjs"),
    `
const fs = require("node:fs");
const path = require("node:path");

const [mode, prop, unitFile, dropinDir, stateDir] = process.argv.slice(2);
const files = [unitFile];
if (fs.existsSync(dropinDir)) {
  for (const name of fs.readdirSync(dropinDir).sort()) {
    if (name.endsWith(".conf")) files.push(path.join(dropinDir, name));
  }
}

let user = "";
let workdir = "";
let protectSystem = "";
let envFiles = [];
let rwPaths = [];
let execList = [];
let hasDuplicateUnresetExec = false;

for (const f of files) {
  if (!fs.existsSync(f)) continue;
  let inService = false;
  for (const rawLine of fs.readFileSync(f, "utf8").split(/\\r?\\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    if (/^\\[.+\\]$/.test(line)) {
      inService = line === "[Service]";
      continue;
    }
    if (!inService) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (key === "User") user = val;
    else if (key === "WorkingDirectory") workdir = val;
    else if (key === "ProtectSystem") protectSystem = val;
    else if (key === "EnvironmentFile") {
      if (val === "") envFiles = [];
      else envFiles.push(val);
    } else if (key === "ReadWritePaths") {
      if (val === "") rwPaths = [];
      else rwPaths.push(...val.split(/\\s+/).filter(Boolean));
    } else if (key === "ExecStart") {
      if (val === "") {
        execList = [];
      } else {
        if (execList.length > 0) hasDuplicateUnresetExec = true;
        execList.push(val);
      }
    }
  }
}

if (mode === "verify") {
  if (fs.existsSync(path.join(stateDir, "fail-systemd-analyze"))) {
    console.error("systemd-analyze verify: injected unit verification failure");
    process.exit(1);
  }
  if (hasDuplicateUnresetExec || execList.length !== 1) {
    console.error("Service has invalid ExecStart count (" + execList.length + ") without ExecStart= reset");
    process.exit(1);
  }
  if (!workdir) {
    console.error("Missing WorkingDirectory");
    process.exit(1);
  }
  process.exit(0);
}

if (prop === "LoadState") {
  if (fs.existsSync(path.join(stateDir, "fail-load-state")) || hasDuplicateUnresetExec) {
    console.log("bad-setting");
  } else {
    console.log("loaded");
  }
} else if (prop === "User") {
  if (fs.existsSync(path.join(stateDir, "force-wrong-user"))) {
    console.log("root");
  } else {
    console.log(user);
  }
} else if (prop === "WorkingDirectory") {
  console.log(workdir);
} else if (prop === "ExecStart") {
  console.log(execList.map((e) => "{ path=" + e.split(/\\s+/)[0] + " ; argv[]=" + e + " ; ignore_errors=no }").join("\\n"));
} else if (prop === "EnvironmentFiles") {
  console.log(envFiles.map((p) => p + " (ignore_errors=no)").join(" "));
} else if (prop === "ReadWritePaths") {
  console.log(rwPaths.join(" "));
} else if (prop === "ProtectSystem") {
  console.log(protectSystem);
}
`,
  );

  const writeMock = (name: string, body: string) => {
    const p = join(mockBin, name);
    writeFileSync(p, body.replace(/\r\n/g, "\n"), "utf8");
    chmodSync(p, 0o755);
  };

  // Mock commands
  writeMock(
    "sudo",
    `#!/usr/bin/env bash
STATE_DIR="${toPosix(stateDir)}"
DROPIN_DIR="${toPosix(dropinDir)}"
if [[ $1 == "-u" ]]; then
  shift 2
fi
if [[ -f "$STATE_DIR/inject-bad-exec-on-cp" && ! -f "$STATE_DIR/bad-exec-injected" && $1 == "cp" && "$*" == *"$DROPIN_DIR"* ]]; then
  touch "$STATE_DIR/bad-exec-injected"
  "$@"
  rc=$?
  printf '[Service]\\nExecStart=/usr/bin/node stale.js\\n' > "$DROPIN_DIR/99-bad-exec.conf"
  exit $rc
fi
exec "$@"
`,
  );
  writeMock("flock", `#!/usr/bin/env bash\nexit 0\n`);
  writeMock("id", `#!/usr/bin/env bash\necho 1000\n`);
  writeMock("chown", `#!/usr/bin/env bash\nexit 0\n`);
  writeMock(
    "stat",
    `#!/usr/bin/env bash
if [[ $1 == "-c" && $2 == "%a" ]]; then
  echo 600
  exit 0
fi
if [[ $1 == "-c" && $2 == "%Y" ]]; then
  date +%s
  exit 0
fi
exec /usr/bin/stat "$@"
`,
  );

  writeMock(
    "node",
    `#!/usr/bin/env bash
STATE_DIR="${toPosix(stateDir)}"
if [[ -f "$STATE_DIR/fail-commit-state" && $1 == "-e" && $3 == *"rollback-state.json.tmp" && $4 == "committed" ]]; then
  exit 1
fi
if [[ \${1:-} == --env-file=* && \${2:-} == */run.mjs && ( \${3:-} == "npm" || \${3:-} == "npx" ) ]]; then
  exec "${toPosix(mockBin)}/$3" "\${@:4}"
fi
exec "${toPosix(process.execPath)}" "$@"
`,
  );

  writeMock(
    "sha256sum",
    `#!/usr/bin/env bash
STATE_DIR="${toPosix(stateDir)}"
if [[ -f "$STATE_DIR/fail-commit-checksum" && $1 == *"rollback-state.json.tmp" ]] && grep -q '"phase": "committed"' "$1" 2>/dev/null; then
  exit 1
fi
exec /usr/bin/sha256sum "$@"
`,
  );

  writeMock(
    "systemd-analyze",
    `#!/usr/bin/env bash
STATE_DIR="${toPosix(stateDir)}"
UNIT_FILE="${toPosix(unitFile)}"
DROPIN_DIR="${toPosix(dropinDir)}"
echo "systemd-analyze $*" >> "$STATE_DIR/calls.log"
if [[ $1 == "verify" ]]; then
  exec "${toPosix(process.execPath)}" "$STATE_DIR/systemd-eval.cjs" verify "" "$UNIT_FILE" "$DROPIN_DIR" "$STATE_DIR"
fi
exit 0
`,
  );

  if (process.platform === "win32") {
    writeMock(
      "ln",
      `#!/usr/bin/env bash
if [[ $1 == "-s" ]]; then
  target="$2"
  link="$3"
  if [[ -L $link && -d $link ]]; then
    cmd.exe //c rmdir "$(cygpath -w "$link")" >/dev/null 2>&1 || /usr/bin/rm -rf -- "$link"
  else
    /usr/bin/rm -rf -- "$link"
  fi
  if [[ -d $target ]]; then
    cmd.exe //c mklink //J "$(cygpath -w "$link")" "$(cygpath -w "$target")" >/dev/null
    exit $?
  fi
fi
exec /usr/bin/ln "$@"
`,
    );
    writeMock(
      "mv",
      `#!/usr/bin/env bash
if [[ $1 == "-Tf" ]]; then
  src="$2"
  dst="$3"
  if [[ -L $src && -d $src ]]; then
    target=$(readlink -e "$src" 2>/dev/null || readlink "$src")
    if [[ -L $dst && -d $dst ]]; then
      cmd.exe //c rmdir "$(cygpath -w "$dst")" >/dev/null 2>&1 || true
    else
      /usr/bin/rm -rf -- "$dst"
    fi
    cmd.exe //c mklink //J "$(cygpath -w "$dst")" "$(cygpath -w "$target")" >/dev/null
    rc=$?
    cmd.exe //c rmdir "$(cygpath -w "$src")" >/dev/null 2>&1 || /usr/bin/rm -rf -- "$src"
    exit $rc
  fi
  if [[ -L $dst && -d $dst ]]; then
    cmd.exe //c rmdir "$(cygpath -w "$dst")" >/dev/null 2>&1 || true
  fi
fi
exec /usr/bin/mv "$@"
`,
    );
    writeMock(
      "rm",
      `#!/usr/bin/env bash
if [[ $1 == "-f" && $2 == "--" && -L $3 && -d $3 ]]; then
  cmd.exe //c rmdir "$(cygpath -w "$3")" >/dev/null
  exit $?
fi
exec /usr/bin/rm "$@"
`,
    );
  }

  writeMock(
    "systemctl",
    `#!/usr/bin/env bash
STATE_DIR="${toPosix(stateDir)}"
UNIT_FILE="${toPosix(unitFile)}"
echo "systemctl $*" >> "$STATE_DIR/calls.log"
cmd="$1"; shift || true
if [[ $cmd == "is-active" ]]; then
  quiet=false
  if [[ $1 == "--quiet" ]]; then quiet=true; shift; fi
  svc="$1"
  if [[ $svc == "pdhcheckup-staging.service" ]]; then
    [[ $quiet == true ]] || echo "active"
    exit 0
  fi
  st=$(cat "$STATE_DIR/prod-active")
  [[ $quiet == true ]] || echo "$st"
  [[ $st == "active" ]]
  exit $?
fi
if [[ $cmd == "show" ]]; then
  svc="$1"; shift || true
  prop=""
  for a in "$@"; do
    case "$a" in -p) ;; --value) ;; *) prop="$a" ;; esac
  done
  if [[ $svc == "pdhcheckup-staging.service" ]]; then
    if [[ $prop == "MainPID" ]]; then cat "$STATE_DIR/stg-pid"; exit 0; fi
    echo "unknown"; exit 0
  fi
  if [[ $prop == "FragmentPath" ]]; then echo "$UNIT_FILE"; exit 0; fi
  if [[ $prop == "MainPID" ]]; then cat "$STATE_DIR/prod-pid"; exit 0; fi
  exec "${toPosix(process.execPath)}" "$STATE_DIR/systemd-eval.cjs" show "$prop" "$UNIT_FILE" "${toPosix(dropinDir)}" "$STATE_DIR"
fi
if [[ $cmd == "daemon-reload" ]]; then
  if [[ -f "$STATE_DIR/fail-daemon-reload" && ! -f "$STATE_DIR/daemon-reload-failed-once" ]]; then
    touch "$STATE_DIR/daemon-reload-failed-once"
    exit 1
  fi
  exit 0
fi
if [[ $cmd == "restart" ]]; then
  if [[ -f "$STATE_DIR/signal-term-on-restart" && ! -f "$STATE_DIR/sigterm-sent" ]]; then
    touch "$STATE_DIR/sigterm-sent"
    kill -TERM "$PPID" 2>/dev/null || true
    /usr/bin/sleep 0.2 || true
  fi
  if [[ -f "$STATE_DIR/fail-restart" && ! -f "$STATE_DIR/restart-failed-once" ]]; then
    touch "$STATE_DIR/restart-failed-once"
    echo "failed" > "$STATE_DIR/prod-active"
    exit 1
  fi
  if [[ -f "$STATE_DIR/mutate-staging-on-restart" ]]; then
    echo "9999" > "$STATE_DIR/stg-pid"
  fi
  echo "active" > "$STATE_DIR/prod-active"
  echo "1002" > "$STATE_DIR/prod-pid"
  exit 0
fi
exit 0
`,
  );

  writeMock(
    "mysql",
    `#!/usr/bin/env bash
STATE_DIR="${toPosix(stateDir)}"
echo "mysql $*" >> "$STATE_DIR/calls.log"
sql="\${@: -1}"
if [[ $sql == *"CURRENT_USER()"* ]]; then
  echo "pdhcheckup_prod@127.0.0.1|pdh_healthcheck"
  exit 0
fi
if [[ $sql == *"SUM(finished_at"* ]]; then
  echo "14|0"
  exit 0
fi
if [[ $sql == *"SELECT migration_name"* ]]; then
  cat "$STATE_DIR/db-checksums.txt"
  exit 0
fi
exit 0
`,
  );

  writeMock(
    "mysqldump",
    `#!/usr/bin/env bash
STATE_DIR="${toPosix(stateDir)}"
echo "mysqldump $*" >> "$STATE_DIR/calls.log"
if [[ -f "$STATE_DIR/bad-staging-dump" ]]; then
  cat <<'SQL'
CREATE DATABASE /*!32312 IF NOT EXISTS*/ \`pdh_healthcheck_staging\`;
USE \`pdh_healthcheck_staging\`;
CREATE TABLE \`User\` (\`id\` varchar(191) NOT NULL);
SQL
  exit 0
fi
cat <<'SQL'
CREATE DATABASE /*!32312 IF NOT EXISTS*/ \`pdh_healthcheck\`;
USE \`pdh_healthcheck\`;
CREATE TABLE \`User\` (\`id\` varchar(191) NOT NULL);
SQL
if [[ -f "$STATE_DIR/large-sql-dump" ]]; then
  awk 'BEGIN { for (i = 1; i <= 55000; i++) print "INSERT INTO User VALUES (" i "_padding_for_realistic_large_dump_size_verification);" }'
fi
`,
  );

  writeMock(
    "npm",
    `#!/usr/bin/env bash
if [[ $1 == "run" && $2 == "build" ]]; then
  mkdir -p .next/standalone .next/static public
  echo "console.log('mock')" > .next/standalone/server.js
  echo "SECRET=leak" > .next/standalone/.env
fi
exit 0
`,
  );
  writeMock("npx", `#!/usr/bin/env bash\nexit 0\n`);
  writeMock("sleep", `#!/usr/bin/env bash\nexit 0\n`);
  writeMock(
    "ss",
    `#!/usr/bin/env bash
echo "LISTEN 0 511 127.0.0.1:3036 0.0.0.0:*"
`,
  );
  writeMock(
    "curl",
    `#!/usr/bin/env bash
STATE_DIR="${toPosix(stateDir)}"
UNIT_FILE="${toPosix(unitFile)}"
echo "curl $*" >> "$STATE_DIR/calls.log"
url="\${@: -1}"
wd=$(grep -E '^WorkingDirectory=' "$UNIT_FILE" | tail -n1 | cut -d= -f2-)

if [[ -f "$STATE_DIR/fail-legacy-health" && $wd == *"rc01-e75f4d9"* ]]; then
  exit 22
fi
if [[ -f "$STATE_DIR/fail-https-health" && $wd != *"rc01-e75f4d9"* && $url == "https://"* ]]; then
  exit 22
fi

if [[ "$*" == *"%{http_code}"* ]]; then
  if [[ $url == *"/admin/dashboard" ]]; then echo -n "307"; exit 0; fi
  if [[ $url == *"/api/v1/admin/audit" ]]; then echo -n "401"; exit 0; fi
  echo -n "200"
  exit 0
fi

if [[ $url == *"/api/v1/health" ]]; then
  echo '{"data":{"status":"ok","database":true}}'
  exit 0
fi
exit 0
`,
  );

  const pathParts =
    process.platform === "win32"
      ? [
          mockBin,
          "C:\\Program Files\\Git\\mingw64\\bin",
          "C:\\Program Files\\Git\\usr\\bin",
          process.env.PATH || "",
        ]
      : [mockBin, process.env.PATH || ""];

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: pathParts.filter(Boolean).join(delimiter),
    PDH_DEPLOY_ROOT: toPosix(deployRoot),
    PROD_REPO_URL: toPosix(originBare),
    LEGACY_RUNTIME_DIR: toPosix(legacyRuntime),
    APPROVED_MIGRATIONS_SHA256: migrationDigest,
  };

  return {
    root,
    deployRoot,
    sourceWork,
    originBare,
    stateDir,
    unitFile,
    dropinDir,
    legacyRuntime,
    pinnedSha,
    migrationDigest,
    origUnitContent,
    origDropins,
    env,
  };
}

function runCutover(
  fx: ReturnType<typeof setupIsolatedFixture>,
  args: string[],
  extraEnv: Record<string, string | undefined> = {},
) {
  return spawnSync(
    BASH,
    [
      toPosix(
        join(
          fx.deployRoot,
          "source",
          "deploy",
          "production",
          "cutover-legacy-pinned-sha.sh",
        ),
      ),
      ...args,
    ],
    {
      env: { ...fx.env, ...extraEnv } as NodeJS.ProcessEnv,
      encoding: "utf8",
      timeout: 90000,
    },
  );
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("production legacy cutover functional fault-injection suite", () => {
  it("runs --preflight-only cleanly without mutating releases/.git-cache, unit, or legacy runtime", () => {
    const fx = setupIsolatedFixture();
    const res = runCutover(fx, [
      "--preflight-only",
      "feature/rc04-ui-impeccable-playwright",
      fx.pinnedSha,
    ]);
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain("Preflight-only mode completed");
    expect(existsSync(join(fx.deployRoot, "releases", "production", ".git-cache"))).toBe(false);
    expect(readFileSync(fx.unitFile, "utf8")).toBe(fx.origUnitContent);
  }, 60000);

  it("rejects pinned SHA when remote branch tip has moved ahead", () => {
    const fx = setupIsolatedFixture();
    writeFileSync(join(fx.sourceWork, "README_ADV.md"), "ahead\n");
    spawnSync("git", ["add", "README_ADV.md"], { cwd: fx.sourceWork });
    spawnSync("git", ["commit", "-m", "advance tip"], { cwd: fx.sourceWork });
    spawnSync("git", ["push", "origin", "feature/rc04-ui-impeccable-playwright"], {
      cwd: fx.sourceWork,
    });

    const res = runCutover(
      fx,
      ["feature/rc04-ui-impeccable-playwright", fx.pinnedSha],
      { CONFIRM_PRODUCTION_CUTOVER: "pdh_healthcheck" },
    );
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("does not match exact remote branch tip");
  }, 60000);

  it("completes happy-path cutover preserving site unit directives, drop-ins, secrets, and sanitized evidence", () => {
    const fx = setupIsolatedFixture();
    const res = runCutover(
      fx,
      ["feature/rc04-ui-impeccable-playwright", fx.pinnedSha],
      { CONFIRM_PRODUCTION_CUTOVER: "pdh_healthcheck" },
    );
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain("Production Cutover Evidence (Sanitized)");
    expect(res.stdout).not.toContain("ProdSecretOnly_123");
    expect(res.stdout).not.toContain("BackupSecretOnly");

    const updatedUnit = readFileSync(fx.unitFile, "utf8");
    expect(updatedUnit).toContain("Environment=CUSTOM_SITE_FLAG=preserve_me");
    expect(updatedUnit).toContain(
      `WorkingDirectory=${toPosix(fx.deployRoot)}/releases/production/current/runtime`,
    );
    expect(readFileSync(join(fx.dropinDir, "10-env.conf"), "utf8")).toBe(
      fx.origDropins["10-env.conf"],
    );
    const updatedOverride = readFileSync(join(fx.dropinDir, "20-override.conf"), "utf8");
    expect(updatedOverride).toContain("ExecStart=\n");
    expect(updatedOverride).toContain(
      `WorkingDirectory=${toPosix(fx.deployRoot)}/releases/production/current/runtime`,
    );
    const updatedHardening = readFileSync(join(fx.dropinDir, "30-hardening.conf"), "utf8");
    expect(updatedHardening).toContain("Environment=DROPIN_KEEP=1");
    expect(updatedHardening).toContain("ProtectSystem=strict");
    expect(updatedHardening).toContain(
      `${toPosix(fx.deployRoot)}/releases/production/current/runtime/.next`,
    );

    const revPath = join(
      fx.deployRoot,
      "releases",
      "production",
      "current",
      "REVISION",
    );
    expect(readFileSync(revPath, "utf8").trim()).toBe(fx.pinnedSha);
    expect(
      existsSync(
        join(fx.deployRoot, "releases", "production", "current", "runtime", ".env"),
      ),
    ).toBe(false);

    const backupDirs = readdirSync(
      join(fx.deployRoot, "shared", "production", "systemd-backups"),
    );
    expect(backupDirs.length).toBe(1);
    const stateJson = JSON.parse(
      readFileSync(
        join(
          fx.deployRoot,
          "shared",
          "production",
          "systemd-backups",
          backupDirs[0],
          "rollback-state.json",
        ),
        "utf8",
      ),
    );
    expect(stateJson.phase).toBe("committed");
    expect(stateJson.hadDropIns).toBe(true);
    expect(stateJson.dropInNames).toEqual([
      "10-env.conf",
      "20-override.conf",
      "30-hardening.conf",
    ]);
    expect(stateJson.evidenceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(existsSync(join(fx.deployRoot, "shared", "production", "evidence"))).toBe(true);
    const calls = readFileSync(join(fx.stateDir, "calls.log"), "utf8");
    expect(calls).toContain("systemd-analyze verify");
  }, 90000);

  it("rolls back automatically on daemon-reload failure and restores exact original unit, drop-in, and legacy runtime", () => {
    const fx = setupIsolatedFixture();
    writeFileSync(join(fx.stateDir, "fail-daemon-reload"), "1");
    const res = runCutover(
      fx,
      ["feature/rc04-ui-impeccable-playwright", fx.pinnedSha],
      { CONFIRM_PRODUCTION_CUTOVER: "pdh_healthcheck" },
    );
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("Application-only rollback verified against restored legacy runtime");
    expect(res.stderr).toContain("ROLLBACK_SUCCEEDED=true");
    expect(readFileSync(fx.unitFile, "utf8")).toBe(fx.origUnitContent);
    for (const [name, content] of Object.entries(fx.origDropins)) {
      expect(readFileSync(join(fx.dropinDir, name), "utf8")).toBe(content);
    }
    expect(existsSync(join(fx.deployRoot, "releases", "production", "current"))).toBe(
      false,
    );
  }, 90000);

  it("rolls back automatically on failed restart and on HTTPS health failure, verifying legacy runtime health", () => {
    for (const flag of ["fail-restart", "fail-https-health"]) {
      const fx = setupIsolatedFixture();
      writeFileSync(join(fx.stateDir, flag), "1");
      const res = runCutover(
        fx,
        ["feature/rc04-ui-impeccable-playwright", fx.pinnedSha],
        { CONFIRM_PRODUCTION_CUTOVER: "pdh_healthcheck" },
      );
      expect(res.status).not.toBe(0);
      expect(res.stderr).toContain("Application-only rollback verified against restored legacy runtime");
      expect(readFileSync(fx.unitFile, "utf8")).toBe(fx.origUnitContent);
      expect(existsSync(join(fx.deployRoot, "releases", "production", "current"))).toBe(false);
    }
  }, 150000);

  it("triggers automatic rollback when post-cutover staging drift check fails", () => {
    const fx = setupIsolatedFixture();
    writeFileSync(join(fx.stateDir, "mutate-staging-on-restart"), "1");
    const res = runCutover(
      fx,
      ["feature/rc04-ui-impeccable-playwright", fx.pinnedSha],
      { CONFIRM_PRODUCTION_CUTOVER: "pdh_healthcheck" },
    );
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("Staging baseline changed unexpectedly");
    expect(res.stderr).toContain("Application-only rollback verified against restored legacy runtime");
    expect(readFileSync(fx.unitFile, "utf8")).toBe(fx.origUnitContent);
  }, 90000);

  it("handles SIGTERM interruption during activation with idempotent rollback", async () => {
    const fx = setupIsolatedFixture();
    writeFileSync(join(fx.stateDir, "signal-term-on-restart"), "1");

    const child = spawn(
      BASH,
      [
        toPosix(
          join(
            fx.deployRoot,
            "source",
            "deploy",
            "production",
            "cutover-legacy-pinned-sha.sh",
          ),
        ),
        "feature/rc04-ui-impeccable-playwright",
        fx.pinnedSha,
      ],
      {
        env: {
          ...fx.env,
          CONFIRM_PRODUCTION_CUTOVER: "pdh_healthcheck",
        } as NodeJS.ProcessEnv,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stderr = "";
    child.stderr?.on("data", (d: Buffer | string) => (stderr += String(d)));
    const code: number = await new Promise((resolve) =>
      child.on("close", (c: number | null) => resolve(c ?? 1)),
    );
    expect(code).not.toBe(0);
    expect(stderr).toContain("SIGNAL RECEIVED: TERM");
    expect(stderr).toContain("Application-only rollback verified against restored legacy runtime");
    expect(readFileSync(fx.unitFile, "utf8")).toBe(fx.origUnitContent);
  }, 90000);

  it("fails closed if restored legacy runtime fails healthcheck during rollback and records rollback_failed", () => {
    const fx = setupIsolatedFixture();
    writeFileSync(join(fx.stateDir, "fail-https-health"), "1");
    writeFileSync(join(fx.stateDir, "fail-legacy-health"), "1");
    const res = runCutover(
      fx,
      ["feature/rc04-ui-impeccable-playwright", fx.pinnedSha],
      { CONFIRM_PRODUCTION_CUTOVER: "pdh_healthcheck" },
    );
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("FATAL: Automatic rollback failed (ROLLBACK_FAILED=true)");
    const backupDirs = readdirSync(
      join(fx.deployRoot, "shared", "production", "systemd-backups"),
    );
    expect(backupDirs.length).toBe(1);
    const stateJson = JSON.parse(
      readFileSync(
        join(
          fx.deployRoot,
          "shared",
          "production",
          "systemd-backups",
          backupDirs[0],
          "rollback-state.json",
        ),
        "utf8",
      ),
    );
    expect(stateJson.phase).toBe("rollback_failed");
  }, 90000);

  it("manual rollback-legacy-cutover.sh fails closed on tampered unit/state checksums and restores multi-drop-ins when valid", () => {
    const fx = setupIsolatedFixture();
    const ok = runCutover(
      fx,
      ["feature/rc04-ui-impeccable-playwright", fx.pinnedSha],
      { CONFIRM_PRODUCTION_CUTOVER: "pdh_healthcheck" },
    );
    expect(ok.status, ok.stderr).toBe(0);

    const backupDirs = readdirSync(
      join(fx.deployRoot, "shared", "production", "systemd-backups"),
    );
    const sysBackupDir = join(
      fx.deployRoot,
      "shared",
      "production",
      "systemd-backups",
      backupDirs[0],
    );

    // Tamper backed-up unit and confirm fail-closed refusal
    const origBackup = join(sysBackupDir, "pdhcheckup-production.service.orig");
    const savedOrig = readFileSync(origBackup, "utf8");
    writeFileSync(origBackup, savedOrig + "# tampered\n");

    const rbScript = toPosix(
      join(
        fx.deployRoot,
        "source",
        "deploy",
        "production",
        "rollback-legacy-cutover.sh",
      ),
    );
    const failRb = spawnSync(BASH, [rbScript, "--restore-legacy", toPosix(sysBackupDir)], {
      env: {
        ...fx.env,
        SCHEMA_COMPATIBILITY_REVIEWED: "true",
        CONFIRM_PRODUCTION_ROLLBACK: "pdh_healthcheck",
      } as NodeJS.ProcessEnv,
      encoding: "utf8",
    });
    expect(failRb.status).not.toBe(0);
    expect(failRb.stderr).toContain("checksum verification failed");
    expect(readFileSync(fx.unitFile, "utf8")).not.toContain("# tampered");

    // Restore valid backup file and run manual rollback cleanly
    writeFileSync(origBackup, savedOrig);
    const passRb = spawnSync(BASH, [rbScript, "--restore-legacy", toPosix(sysBackupDir)], {
      env: {
        ...fx.env,
        SCHEMA_COMPATIBILITY_REVIEWED: "true",
        CONFIRM_PRODUCTION_ROLLBACK: "pdh_healthcheck",
      } as NodeJS.ProcessEnv,
      encoding: "utf8",
    });
    expect(passRb.status, passRb.stderr).toBe(0);
    expect(passRb.stdout).toContain("verified against restored runtime");
    expect(readFileSync(fx.unitFile, "utf8")).toBe(fx.origUnitContent);
    for (const [name, content] of Object.entries(fx.origDropins)) {
      expect(readFileSync(join(fx.dropinDir, name), "utf8")).toBe(content);
    }
    expect(existsSync(join(fx.deployRoot, "releases", "production", "current"))).toBe(false);
    const calls = readFileSync(join(fx.stateDir, "calls.log"), "utf8");
    expect(sha256File(join(fx.deployRoot, "shared", "production", ".env"))).toBeTruthy();
    expect(calls).not.toContain("restore");
  }, 120000);

  it("handles large (>4 MB) compressed SQL dumps without pipefail SIGPIPE and rejects staging-contaminated dumps", () => {
    const fx = setupIsolatedFixture();
    writeFileSync(join(fx.stateDir, "large-sql-dump"), "1");
    const ok = runCutover(
      fx,
      ["feature/rc04-ui-impeccable-playwright", fx.pinnedSha],
      { CONFIRM_PRODUCTION_CUTOVER: "pdh_healthcheck" },
    );
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.stdout).toContain("Production Cutover Evidence (Sanitized)");

    const fxBad = setupIsolatedFixture();
    writeFileSync(join(fxBad.stateDir, "bad-staging-dump"), "1");
    const bad = runCutover(
      fxBad,
      ["feature/rc04-ui-impeccable-playwright", fxBad.pinnedSha],
      { CONFIRM_PRODUCTION_CUTOVER: "pdh_healthcheck" },
    );
    expect(bad.status).not.toBe(0);
    expect(bad.stderr).toContain("staging database reference");
    expect(readFileSync(fxBad.unitFile, "utf8")).toBe(fxBad.origUnitContent);
  }, 150000);

  it("rejects invalid effective systemd configuration (ExecStart override without reset or wrong User) before restart and rolls back", () => {
    // Case A: Drop-in adds ExecStart without ExecStart= reset during unit installation -> systemd-analyze verify rejects before restart
    const fxExec = setupIsolatedFixture();
    writeFileSync(join(fxExec.stateDir, "inject-bad-exec-on-cp"), "1");
    const resExec = runCutover(
      fxExec,
      ["feature/rc04-ui-impeccable-playwright", fxExec.pinnedSha],
      { CONFIRM_PRODUCTION_CUTOVER: "pdh_healthcheck" },
    );
    expect(resExec.status).not.toBe(0);
    expect(resExec.stderr).toContain("Application-only rollback verified against restored legacy runtime");
    expect(readFileSync(fxExec.unitFile, "utf8")).toBe(fxExec.origUnitContent);
    expect(existsSync(join(fxExec.dropinDir, "99-bad-exec.conf"))).toBe(false);
    for (const [name, content] of Object.entries(fxExec.origDropins)) {
      expect(readFileSync(join(fxExec.dropinDir, name), "utf8")).toBe(content);
    }

    // Case B: Effective User mismatch caught by verify_effective_systemd_config before restart
    const fxUser = setupIsolatedFixture();
    writeFileSync(join(fxUser.stateDir, "force-wrong-user"), "1");
    const resUser = runCutover(
      fxUser,
      ["feature/rc04-ui-impeccable-playwright", fxUser.pinnedSha],
      { CONFIRM_PRODUCTION_CUTOVER: "pdh_healthcheck" },
    );
    expect(resUser.status).not.toBe(0);
    expect(resUser.stderr).toContain("Effective systemd User mismatch");
    expect(resUser.stderr).toContain("Application-only rollback verified against restored legacy runtime");
    expect(readFileSync(fxUser.unitFile, "utf8")).toBe(fxUser.origUnitContent);
    for (const [name, content] of Object.entries(fxUser.origDropins)) {
      expect(readFileSync(join(fxUser.dropinDir, name), "utf8")).toBe(content);
    }
  }, 150000);

  it("rolls back cleanly on post-activation state-write, checksum-write, and evidence-write failures", () => {
    // 1. State-write failure on 'committed'
    const fxState = setupIsolatedFixture();
    writeFileSync(join(fxState.stateDir, "fail-commit-state"), "1");
    const rState = runCutover(
      fxState,
      ["feature/rc04-ui-impeccable-playwright", fxState.pinnedSha],
      { CONFIRM_PRODUCTION_CUTOVER: "pdh_healthcheck" },
    );
    expect(rState.status).not.toBe(0);
    expect(rState.stderr).toContain("Application-only rollback verified against restored legacy runtime");
    expect(readFileSync(fxState.unitFile, "utf8")).toBe(fxState.origUnitContent);
    expect(existsSync(join(fxState.deployRoot, "releases", "production", "current"))).toBe(false);

    // 2. Checksum-write failure on 'committed' preserves prior valid state+checksum for rollback
    const fxSum = setupIsolatedFixture();
    writeFileSync(join(fxSum.stateDir, "fail-commit-checksum"), "1");
    const rSum = runCutover(
      fxSum,
      ["feature/rc04-ui-impeccable-playwright", fxSum.pinnedSha],
      { CONFIRM_PRODUCTION_CUTOVER: "pdh_healthcheck" },
    );
    expect(rSum.status).not.toBe(0);
    expect(rSum.stderr).toContain("Application-only rollback verified against restored legacy runtime");
    expect(readFileSync(fxSum.unitFile, "utf8")).toBe(fxSum.origUnitContent);
    for (const [name, content] of Object.entries(fxSum.origDropins)) {
      expect(readFileSync(join(fxSum.dropinDir, name), "utf8")).toBe(content);
    }

    // 3. Evidence-write failure (evidence path blocked by regular file) triggers automatic rollback
    const fxEv = setupIsolatedFixture();
    writeFileSync(join(fxEv.deployRoot, "shared", "production", "evidence"), "blocking-file\n");
    const rEv = runCutover(
      fxEv,
      ["feature/rc04-ui-impeccable-playwright", fxEv.pinnedSha],
      { CONFIRM_PRODUCTION_CUTOVER: "pdh_healthcheck" },
    );
    expect(rEv.status).not.toBe(0);
    expect(rEv.stderr).toContain("Application-only rollback verified against restored legacy runtime");
    expect(readFileSync(fxEv.unitFile, "utf8")).toBe(fxEv.origUnitContent);
    expect(existsSync(join(fxEv.deployRoot, "releases", "production", "current"))).toBe(false);
  }, 240000);
});
