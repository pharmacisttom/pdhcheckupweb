import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalJson, manifestHash, verifyApprovedManifest } from "../../scripts/promotion-manifest";
import { parseArgs, validateDatabaseTargets } from "../../scripts/promote-config-data";

describe("operator-approved promotion manifest", () => {
  const plan = { formatVersion: 2, sourceFingerprint: "source", targetFingerprint: "target", records: [{ code: "CBC", amount: "100" }] };
  const file = JSON.stringify(plan, null, 2);
  const checksum = createHash("sha256").update(file).digest("hex");
  it("accepts the approved bytes and unchanged plan on a later invocation", () => {
    expect(() => verifyApprovedManifest(file, checksum, structuredClone(plan))).not.toThrow();
  });
  it("rejects file tampering and malformed checksums", () => {
    expect(() => verifyApprovedManifest(file + " ", checksum, plan)).toThrow(/checksum/);
    expect(() => verifyApprovedManifest(file, "123", plan)).toThrow(/checksum/);
  });
  it("rejects source or target edits even when row counts are unchanged", () => {
    for (const change of [{ sourceFingerprint: "edited" }, { targetFingerprint: "edited" }, { records: [{ code: "CBC", amount: "200" }] }]) {
      expect(() => verifyApprovedManifest(file, checksum, { ...plan, ...change })).toThrow(/changed since PREPARE/);
    }
  });
  it("canonicalizes object order without losing array order or dates", () => {
    expect(manifestHash({ b: 2, a: 1 })).toBe(manifestHash({ a: 1, b: 2 }));
    expect(manifestHash([1, 2])).not.toBe(manifestHash([2, 1]));
    expect(canonicalJson({ date: new Date("2026-01-01") })).toContain("2026-01-01T00:00:00.000Z");
  });
  it("forbids explicitly enabling UAT imports", () => {
    expect(() => parseArgs(["--dry-run", "--include-uat-services"])).toThrow(/forbidden/);
  });
  it("rejects non-MySQL protocols even with allowlisted database names", () => {
    expect(() => validateDatabaseTargets("postgres://user@localhost/pdh_healthcheck_staging", "mysql://user@localhost/pdh_healthcheck", false)).toThrow(/MySQL/);
  });
  it("test mode cannot authorize production or sandbox database names", () => {
    expect(() => validateDatabaseTargets("mysql://user@localhost/pdh_promotion_source_test", "mysql://user@localhost/pdh_healthcheck", true)).toThrow(/isolated test/);
    expect(() => validateDatabaseTargets("mysql://user@localhost/pdh_healthcheck_sandbox", "mysql://user@localhost/pdh_promotion_target_test", true)).toThrow(/isolated test/);
  });
});
