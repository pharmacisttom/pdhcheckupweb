import { describe, expect, it } from "vitest";
import {
  ageOn,
  calculateQuote,
  canTransition,
  csvSafe,
  evaluateRules,
  fingerprint,
  normalizePhone,
  personSchema,
  toBuddhist,
  toGregorian,
  validThaiId,
  validateAnswers,
  visibleQuestion,
  type PricedService,
} from "../../src/lib/domain";
const service = (
  code: string,
  amount = "0.10",
  components: string[] = [],
): PricedService => ({
  id: code,
  code,
  name: code,
  amount,
  components,
  version: 1,
});
const pkg = {
  id: "pkg",
  name: "Test",
  version: 1,
  price: "0.20",
  items: [service("CBC")],
};
describe("Thai identity validation", () => {
  it("validates check digits and rejects repeated and malformed identities", () => {
    const prefix = "110170020345";
    const sum = [...prefix].reduce((a, n, i) => a + Number(n) * (13 - i), 0);
    const id = prefix + ((11 - (sum % 11)) % 10);
    expect(validThaiId(id)).toBe(true);
    expect(validThaiId(id.slice(0, 12) + ((Number(id[12]) + 1) % 10))).toBe(
      false,
    );
    expect(validThaiId("0000000000000")).toBe(false);
    expect(validThaiId("123")).toBe(false);
  });
  it("normalizes domestic and international mobiles", () => {
    expect(normalizePhone("081-234-5678")).toBe("+66812345678");
    expect(normalizePhone("+66 81 234 5678")).toBe("+66812345678");
    expect(() => normalizePhone("021234567")).toThrow();
  });
  it("does not require an identity number for ordinary registration", () => {
    expect(
      personSchema.safeParse({
        firstName: "ทดสอบ",
        lastName: "ระบบ",
        birthdate: "1990-01-01",
        phone: "0812345678",
      }).success,
    ).toBe(true);
  });
});
describe("dates and age", () => {
  it("converts years", () => {
    expect(toGregorian(2569)).toBe(2026);
    expect(toGregorian(2026)).toBe(2026);
    expect(toBuddhist(2026)).toBe(2569);
  });
  it("uses full birthdays", () => {
    expect(ageOn("2000-10-22", new Date("2026-10-21T10:00:00Z"))).toBe(25);
    expect(ageOn("2000-10-21", new Date("2026-10-21T10:00:00Z"))).toBe(26);
  });
  it("rejects invalid and future dates", () => {
    expect(() => ageOn("2025-02-29")).toThrow();
    expect(() => ageOn("2999-01-01")).toThrow();
  });
});
describe("questionnaire decisions", () => {
  const q = {
    id: "detail",
    label: "Detail",
    type: "text" as const,
    required: true,
    showIf: { field: "has", equals: "yes" },
  };
  it("enforces conditional required fields only while visible", () => {
    expect(visibleQuestion(q, { has: "no" })).toBe(false);
    expect(validateAnswers([q], { has: "no" })).toEqual([]);
    expect(validateAnswers([q], { has: "yes" })).toHaveLength(1);
  });
  it("validates numeric bounds and options", () => {
    expect(
      validateAnswers(
        [{ id: "w", label: "Weight", type: "numeric", min: 1, max: 400 }],
        { w: 450 },
      ),
    ).toHaveLength(1);
    expect(
      validateAnswers(
        [{ id: "s", label: "Select", type: "single", options: ["yes"] }],
        { s: "injected" },
      ),
    ).toHaveLength(1);
  });
  it("returns explainable versioned decisions", () => {
    expect(
      evaluateRules(
        [
          {
            id: "r",
            field: "has",
            equals: "yes",
            decision: "needs_clinical_review",
            reason: "Review required",
          },
        ],
        { has: "yes" },
        2,
      )[0],
    ).toMatchObject({
      version: 2,
      ruleId: "r",
      decision: "needs_clinical_review",
    });
  });
});
describe("exact pricing and historical snapshots", () => {
  it("calculates decimals without floating point errors", () => {
    expect(calculateQuote(pkg, [service("GLU")]).total).toBe("0.30");
  });
  it("prevents package and add-on duplicates", () => {
    expect(() => calculateQuote(pkg, [service("CBC")])).toThrow();
    expect(() => calculateQuote(pkg, [service("A"), service("A")])).toThrow();
  });
  it("rejects overlapping panels regardless of ordering", () => {
    expect(() =>
      calculateQuote(pkg, [service("PANEL", "100", ["GLU"]), service("GLU")]),
    ).toThrow();
    expect(() =>
      calculateQuote(pkg, [service("GLU"), service("PANEL", "100", ["GLU"])]),
    ).toThrow();
  });
  it("preserves immutable snapshots and changes fingerprints on version changes", () => {
    const q = calculateQuote(pkg, [service("A")]);
    const saved = JSON.stringify(q);
    const next = calculateQuote({ ...pkg, price: "0.40", version: 2 }, [
      service("A"),
    ]);
    expect(JSON.stringify(q)).toBe(saved);
    expect(fingerprint(q)).not.toBe(fingerprint(next));
  });
  it("uses fixed package price without reconstructing component sums", () => {
    expect(
      calculateQuote(
        { ...pkg, price: "99.00", items: [service("CBC", "500")] },
        [],
      ).total,
    ).toBe("99.00");
  });
});
describe("state and export safety", () => {
  it("rejects reopening completed appointments", () => {
    expect(canTransition("completed", "confirmed")).toBe(false);
    expect(canTransition("confirmed", "checked_in")).toBe(true);
    expect(canTransition("unknown", "completed")).toBe(false);
  });
  it("escapes spreadsheet formula injection and CSV quotes", () => {
    expect(csvSafe('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvSafe(" +SUM(A1)")).toContain("'");
  });
});
