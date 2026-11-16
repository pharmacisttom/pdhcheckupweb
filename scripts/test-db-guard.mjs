export const RC02_TEST_DATABASE = "pdh_healthcheck_rc01_test";
export const RC02_TEST_USER = "pdh_test";
export const RC02_MIGRATION_COUNT = 14;

export function parseRc02TestDatabaseUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl ?? "");
  } catch {
    throw new Error("Refusing tests: DATABASE_URL is missing or invalid");
  }
  const hostname = url.hostname.toLowerCase();
  const database = decodeURIComponent(url.pathname.slice(1));
  const username = decodeURIComponent(url.username);
  if (
    url.protocol !== "mysql:" ||
    !["127.0.0.1", "localhost"].includes(hostname) ||
    username !== RC02_TEST_USER ||
    !url.password ||
    database !== RC02_TEST_DATABASE
  )
    throw new Error(
      "Refusing tests: use only pdh_test on localhost and the dedicated RC01 test database",
    );
  return url;
}

export function assertTestGrants(rows) {
  if (!Array.isArray(rows) || rows.length === 0)
    throw new Error("Refusing tests: database grants could not be verified");
  for (const row of rows) {
    const grant = String(Object.values(row ?? {})[0] ?? "").trim();
    const match = /^GRANT\s+(.+?)\s+ON\s+(.+?)\s+TO\s+/i.exec(grant);
    if (!match)
      throw new Error("Refusing tests: unexpected grant or role assignment");
    const privileges = match[1].toUpperCase().replace(/\s+/g, " ").trim();
    const scope = match[2].replaceAll("`", "").replaceAll("'", "").toLowerCase();
    if (scope === "*.*" && privileges === "USAGE") continue;
    if (scope === `${RC02_TEST_DATABASE.toLowerCase()}.*`) continue;
    throw new Error("Refusing tests: privileges exceed the dedicated RC01 test database");
  }
}

export function assertTestIdentity(row, hostname) {
  const currentUser = String(row?.current_user ?? "").toLowerCase();
  const database = String(row?.database_name ?? "").toLowerCase();
  const allowedAccounts = hostname === "localhost"
    ? [`${RC02_TEST_USER}@localhost`, `${RC02_TEST_USER}@127.0.0.1`]
    : [`${RC02_TEST_USER}@127.0.0.1`];
  if (
    !allowedAccounts.includes(currentUser) ||
    database !== RC02_TEST_DATABASE.toLowerCase()
  )
    throw new Error("Refusing tests: connected MySQL identity does not match RC01 test database");
}

export function assertMigrationState(row) {
  const total = Number(row?.total_migrations ?? -1);
  const completed = Number(row?.completed_migrations ?? -1);
  const incomplete = Number(row?.incomplete_migrations ?? -1);
  if (
    total !== RC02_MIGRATION_COUNT ||
    completed !== RC02_MIGRATION_COUNT ||
    incomplete !== 0
  )
    throw new Error("Refusing tests: RC01 test database must have exactly 14 completed migrations");
}

export async function verifyRc02TestDatabase(prisma, rawUrl) {
  const url = parseRc02TestDatabaseUrl(rawUrl);
  try {
    const identityRows = await prisma.$queryRaw`
      SELECT CURRENT_USER() AS current_user, DATABASE() AS database_name
    `;
    assertTestIdentity(identityRows[0], url.hostname.toLowerCase());
    const grantRows = await prisma.$queryRaw`SHOW GRANTS FOR CURRENT_USER()`;
    assertTestGrants(grantRows);
    const migrationRows = await prisma.$queryRaw`
      SELECT
        COUNT(*) AS total_migrations,
        SUM(finished_at IS NOT NULL AND rolled_back_at IS NULL) AS completed_migrations,
        SUM(finished_at IS NULL AND rolled_back_at IS NULL) AS incomplete_migrations
      FROM _prisma_migrations
    `;
    assertMigrationState(migrationRows[0]);
    return { database: RC02_TEST_DATABASE, migrations: RC02_MIGRATION_COUNT };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Refusing tests:"))
      throw error;
    throw new Error("Refusing tests: unable to verify dedicated database credentials and state");
  }
}
