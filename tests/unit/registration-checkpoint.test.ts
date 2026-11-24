import { describe, expect, it } from "vitest";
import {
  checkpointPersonSchema,
  isRegistrationCheckpoint,
} from "../../src/lib/registration-checkpoint";
import { personSchema } from "../../src/lib/domain";

describe("unfinished input versus a completed intake", () => {
  it("retains unfinished identity/contact values without accepting them as a submission", () => {
    const unfinished = {
      firstName: "Synthetic",
      birthdate: "1991-",
      phone: "08",
      email: "unfinished@",
      documentType: "thai_id",
      identifier: "12345",
      heightCm: null,
      weightKg: null,
    };
    expect(checkpointPersonSchema.parse(unfinished)).toMatchObject(unfinished);
    expect(personSchema.safeParse(unfinished).success).toBe(false);
  });
  it("does not accept client-controlled completion metadata or unbounded payloads", () => {
    expect(
      checkpointPersonSchema.parse({
        firstName: "Synthetic",
        _draftCheckpoint: false,
        _draftToken: "forged",
      }),
    ).not.toHaveProperty("_draftCheckpoint");
    expect(
      checkpointPersonSchema.safeParse({ firstName: "x".repeat(101) }).success,
    ).toBe(false);
    expect(
      checkpointPersonSchema.safeParse({ identifier: "x".repeat(51) }).success,
    ).toBe(false);
    expect(isRegistrationCheckpoint({ _draftCheckpoint: true })).toBe(true);
    expect(isRegistrationCheckpoint({ firstName: "Legacy" })).toBe(false);
    expect(isRegistrationCheckpoint(null)).toBe(false);
  });
});
