import test from "node:test";
import assert from "node:assert/strict";
import {
  assertMigrationState,
  assertTestGrants,
  assertTestIdentity,
  parseRc02TestDatabaseUrl,
} from "./test-db-guard.mjs";

const validUrl =
  "mysql://pdh_test:synthetic-only@127.0.0.1:3306/pdh_healthcheck_rc01_test";

test("accepts only the dedicated RC01 URL", () => {
  assert.equal(
    parseRc02TestDatabaseUrl(validUrl).pathname,
    "/pdh_healthcheck_rc01_test",
  );
});

test("rejects production, shared staging, wrong user and wrong database URLs", () => {
  for (const url of [
    "mysql://pdh_test:synthetic@127.0.0.1/pdh_healthcheck",
    "mysql://pdh_test:synthetic@localhost/pdh_healthcheck_staging",
    "mysql://root:synthetic@127.0.0.1/pdh_healthcheck_rc01_test",
    "mysql://pdh_test:synthetic@127.0.0.1/pdh_healthcheck_test",
  ])
    assert.throws(() => parseRc02TestDatabaseUrl(url), /Refusing tests:/);
});

test("rejects global, production, staging and unrelated database grants", () => {
  for (const grant of [
    "GRANT SELECT ON *.* TO `pdh_test`@`127.0.0.1`",
    "GRANT ALL PRIVILEGES ON `pdh_healthcheck`.* TO `pdh_test`@`127.0.0.1`",
    "GRANT SELECT ON `pdh_healthcheck_staging`.* TO `pdh_test`@`127.0.0.1`",
    "GRANT SELECT ON `another_test`.* TO `pdh_test`@`127.0.0.1`",
  ])
    assert.throws(() => assertTestGrants([{ grant }]), /Refusing tests:/);
});

test("allows only global USAGE and scoped RC01 database grants", () => {
  assert.doesNotThrow(() =>
    assertTestGrants([
      { grant: "GRANT USAGE ON *.* TO `pdh_test`@`127.0.0.1`" },
      {
        grant:
          "GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER ON `pdh_healthcheck_rc01_test`.* TO `pdh_test`@`127.0.0.1`",
      },
    ]),
  );
});

test("rejects wrong MySQL identity and migration count", () => {
  assert.throws(
    () =>
      assertTestIdentity(
        {
          current_user: "root@localhost",
          database_name: "pdh_healthcheck_rc01_test",
        },
        "localhost",
      ),
    /Refusing tests:/,
  );
  assert.throws(
    () =>
      assertMigrationState({
        total_migrations: 14,
        completed_migrations: 13,
        incomplete_migrations: 1,
      }),
    /Refusing tests:/,
  );
});
