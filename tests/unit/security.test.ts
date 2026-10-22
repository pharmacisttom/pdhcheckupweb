import { describe, expect, it } from "vitest";
import {
  permitted,
  decrypt,
  encrypt,
  privateHash,
} from "../../src/lib/security";
describe("default deny role boundaries", () => {
  it("keeps coordinators out of clinical and pricing data", () => {
    expect(permitted("coordinator", "clinical:read")).toBe(false);
    expect(permitted("coordinator", "imports:approve")).toBe(false);
    expect(permitted("coordinator", "organization:own")).toBe(true);
  });
  it("separates staging from financial approval", () => {
    expect(permitted("laboratory", "imports:write")).toBe(true);
    expect(permitted("laboratory", "imports:approve")).toBe(false);
    expect(permitted("finance", "imports:approve")).toBe(true);
    expect(permitted("auditor", "bookings:write")).toBe(false);
    expect(permitted("unknown", "dashboard:read")).toBe(false);
  });
});
describe("sensitive field encryption", () => {
  it("round trips and detects tampering", () => {
    process.env.DATA_ENCRYPTION_KEY = "a".repeat(64);
    const value = encrypt({ secret: "sensitive" });
    expect(value).not.toContain("sensitive");
    expect(decrypt(value)).toEqual({ secret: "sensitive" });
    const parts = value.split(".");
    parts[1] = Buffer.alloc(16).toString("base64url");
    expect(() => decrypt(parts.join("."))).toThrow();
  });
  it("refuses missing encryption and hashing secrets", () => {
    delete process.env.DATA_ENCRYPTION_KEY;
    expect(() => encrypt("x")).toThrow();
    delete process.env.OTP_PEPPER;
    expect(() => privateHash("x")).toThrow();
  });
});
