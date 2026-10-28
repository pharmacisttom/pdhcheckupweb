import { describe, expect, it, vi, afterEach } from "vitest";
import { questionSchema } from "../../src/server/services/questionnaires";
import { personSchema } from "../../src/lib/domain";
import { canReviewTransition } from "../../src/lib/intake";
import { locales, dictionaries, translate } from "../../src/lib/i18n";
import {
  deliverOtp,
  otpTestMode,
} from "../../src/server/services/otp-delivery";
const person = {
  firstName: "Synthetic",
  lastName: "Test",
  birthdate: "1990-01-01",
  phone: "0812345678",
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("versioned health intake and staff review", () => {
  it("retains legacy drafts but rejects missing version 2 health data", () => {
    expect(personSchema.safeParse(person).success).toBe(true);
    expect(
      personSchema.safeParse({ ...person, intakeVersion: 2 }).success,
    ).toBe(false);
    const v2 = {
      ...person,
      intakeVersion: 2,
      sex: "unspecified",
      treatmentRight: "unknown",
      medicalHistory: "Unknown",
      surgeryHistory: "None",
      currentMedication: "None",
      allergies: "Unknown",
      familyNcdStatus: "yes",
      familyNcdEntries: [{ relationship: "mother", disease: "diabetes" }],
    };
    expect(personSchema.safeParse(v2).success).toBe(true);
    expect(
      personSchema.safeParse({
        ...v2,
        familyNcdEntries: [{ relationship: "", disease: "" }],
      }).success,
    ).toBe(false);
  });
  it("cannot manually change a request to scheduled and cannot reopen a closed request", () => {
    expect(canReviewTransition("ready_to_schedule", "scheduled")).toBe(false);
    expect(canReviewTransition("closed", "under_review")).toBe(false);
    expect(canReviewTransition("under_review", "awaiting_information")).toBe(
      true,
    );
  });
  it("accepts partial approved question translations without changing answer codes", () => {
    const parsed = questionSchema.parse({
      id: "test",
      label: "คำถาม",
      type: "single",
      options: ["yes"],
      translations: { en: { label: "Question", options: { yes: "Yes" } } },
    });
    expect(parsed.options).toEqual(["yes"]);
    expect(parsed.translations?.en?.label).toBe("Question");
    expect(
      personSchema.safeParse({
        firstName: "Test",
        lastName: "Test",
        birthdate: "1990-01-01",
        phone: "invalid",
      }).success,
    ).toBe(false);
  });
  it("has matching dictionary keys in all five languages and a safe fallback", () => {
    for (const l of locales)
      expect(Object.keys(dictionaries[l]).sort()).toEqual(
        Object.keys(dictionaries.th).sort(),
      );
    expect(translate("untranslated identifier", "km")).toBe(
      "untranslated identifier",
    );
    expect(translate("ลงทะเบียน", "en")).toBe("Register");
  });
  it("fails explicitly when a real adapter rejects delivery", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OTP_PROVIDER", "http");
    vi.stubEnv("OTP_HTTP_URL", "https://example.test/otp");
    vi.stubEnv("OTP_HTTP_TOKEN", "synthetic-token");
    const send = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", send);
    await expect(deliverOtp("+66812345678", "123456")).rejects.toMatchObject({
      code: "OTP_DELIVERY_FAILED",
    });
    expect(send).toHaveBeenCalledOnce();
  });
  it("never enables test OTP in production or pretends delivery when unconfigured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OTP_PROVIDER", "test");
    expect(otpTestMode()).toBe(false);
    await expect(deliverOtp("+66812345678", "123456")).rejects.toMatchObject({
      code: "PROVIDER_UNCONFIGURED",
    });
    vi.stubEnv("OTP_PROVIDER", "unconfigured");
    await expect(deliverOtp("+66812345678", "123456")).rejects.toMatchObject({
      code: "PROVIDER_UNCONFIGURED",
    });
  });
});
