import { describe, expect, it } from "vitest";
import { personSchema } from "../../src/lib/domain";
const person = {
  firstName: "ทดสอบ",
  lastName: "ระบบ",
  birthdate: "1990-01-01",
  phone: "0812345678",
};
describe("health intake validation", () => {
  it("preserves health data in the encrypted person payload", () => {
    const health = {
      sex: "female",
      treatmentRight: "social_security",
      medicalHistory: "ความดันสูง",
      currentMedication: "ยาประจำ",
      allergies: "ไม่มี",
      familyNcdStatus: "yes",
      familyNcdDetails: "แม่เป็นเบาหวาน",
    };
    expect(personSchema.parse({ ...person, ...health })).toMatchObject(health);
  });
  it("rejects invalid choices, oversized history and missing family detail", () => {
    for (const invalid of [
      { sex: "invalid" },
      { treatmentRight: "invalid" },
      { medicalHistory: "x".repeat(2001) },
      { familyNcdStatus: "yes", familyNcdDetails: " " },
    ]) {
      expect(personSchema.safeParse({ ...person, ...invalid }).success).toBe(
        false,
      );
    }
  });
  it("accepts existing drafts and unknown family history", () => {
    expect(personSchema.safeParse(person).success).toBe(true);
    expect(
      personSchema.safeParse({ ...person, familyNcdStatus: "unknown" }).success,
    ).toBe(true);
  });
});
