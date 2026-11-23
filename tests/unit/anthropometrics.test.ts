import { describe, expect, it } from "vitest";
import { ageBand35, calculateBmi } from "../../src/lib/anthropometrics";
import { ageOn, personSchema } from "../../src/lib/domain";

describe("35 year cutoff (display only)", () => {
  it("assigns ages 34, 35 and 36 without gaps", () => {
    expect(ageBand35(34)).toBe("under_35");
    expect(ageBand35(35)).toBe("at_least_35");
    expect(ageBand35(36)).toBe("at_least_35");
  });
  it("uses completed birthdays, not birth year only", () => {
    expect(ageBand35(ageOn("1991-11-24", new Date("2026-11-23T12:00:00Z")))).toBe("under_35");
    expect(ageBand35(ageOn("1991-11-23", new Date("2026-11-23T12:00:00Z")))).toBe("at_least_35");
  });
  it("rejects invalid ages", () => {
    expect(() => ageBand35(-1)).toThrow();
    expect(() => ageBand35(34.5)).toThrow();
  });
});

describe("BMI measured values (not clinical decision)", () => {
  it("uses meters squared without premature rounding", () => {
    expect(calculateBmi(170, 70)).toBeCloseTo(24.221453, 5);
    expect(calculateBmi(160, 64)).toBeCloseTo(25, 8);
  });
  it("rejects missing, zero and invalid measurements", () => {
    expect(() => calculateBmi(0, 60)).toThrow();
    expect(() => calculateBmi(165, 0)).toThrow();
    expect(() => calculateBmi(Number.NaN, 60)).toThrow();
  });
  it("accepts pairs but rejects incomplete and invalid measured values", () => {
    const base = { firstName: "ทดสอบ", lastName: "ผู้ใช้", birthdate: "1991-01-01", phone: "0812345678" };
    expect(personSchema.safeParse({ ...base, heightCm: 170, weightKg: 70 }).success).toBe(true);
    expect(personSchema.safeParse({ ...base, heightCm: 170 }).success).toBe(false);
    expect(personSchema.safeParse({ ...base, heightCm: 170, weightKg: 0 }).success).toBe(false);
    // Legacy registration records without measurements remain readable.
    expect(personSchema.safeParse(base).success).toBe(true);
  });
});
