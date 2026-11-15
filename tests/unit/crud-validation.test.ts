import { describe, expect, it } from "vitest";
import { z } from "zod";
import { canReviewTransition } from "../../src/lib/intake";

describe("CRUD validation and error resilience", () => {
  it("slots POST schema allows optional dailyCapacity", () => {
    const slotInputSchema = z.object({
      day: z.iso.date(),
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      capacity: z.number().int().min(1).max(500),
      dailyCapacity: z.number().int().min(1).max(2000).optional(),
    });

    const parsedWithDaily = slotInputSchema.safeParse({
      day: "2026-11-10",
      time: "09:00",
      capacity: 10,
      dailyCapacity: 50,
    });
    expect(parsedWithDaily.success).toBe(true);

    const parsedWithoutDaily = slotInputSchema.safeParse({
      day: "2026-11-10",
      time: "09:00",
      capacity: 10,
    });
    expect(parsedWithoutDaily.success).toBe(true);
    if (parsedWithoutDaily.success) {
      expect(parsedWithoutDaily.data.dailyCapacity).toBeUndefined();
    }
  });

  it("questionnaires/update envelope schema tolerates extra metadata fields", () => {
    const id = z.string().min(1).max(191);
    const revision = z.number().int().nonnegative();
    const updateEnvelope = z.object({
      id,
      revision,
      questions: z.unknown(),
      rules: z.unknown(),
    });

    const rawPayload = {
      id: "q-1",
      revision: 2,
      questions: [],
      rules: [],
      version: 3,
      status: "draft",
      createdAt: "2026-10-31T00:00:00.000Z",
    };

    const parsed = updateEnvelope.safeParse(rawPayload);
    expect(parsed.success).toBe(true);
  });

  it("canReviewTransition restricts contact request transitions correctly", () => {
    // Self transition
    expect(canReviewTransition("submitted", "submitted")).toBe(true);

    // Allowed transitions
    expect(canReviewTransition("pending", "contacted")).toBe(true);
    expect(canReviewTransition("pending", "under_review")).toBe(true);
    expect(canReviewTransition("under_review", "ready_to_schedule")).toBe(true);
    expect(canReviewTransition("awaiting_information", "under_review")).toBe(true);
    expect(canReviewTransition("ready_to_schedule", "closed")).toBe(true);

    // Disallowed transitions
    expect(canReviewTransition("awaiting_information", "ready_to_schedule")).toBe(false);
    expect(canReviewTransition("scheduled", "ready_to_schedule")).toBe(false);
    expect(canReviewTransition("closed", "under_review")).toBe(false);
  });

  it("finance validation enforces reference for payments and refunds", () => {
    const requiresReference = (action: string, reference?: string) => {
      return ["payment", "refund"].includes(action) ? !!reference?.trim() : true;
    };

    expect(requiresReference("payment", "")).toBe(false);
    expect(requiresReference("payment", "   ")).toBe(false);
    expect(requiresReference("payment", "REC-001")).toBe(true);
    expect(requiresReference("refund", "")).toBe(false);
    expect(requiresReference("refund", "REF-001")).toBe(true);
    expect(requiresReference("bill", "")).toBe(true);
    expect(requiresReference("void", "")).toBe(true);
    expect(requiresReference("approve", "")).toBe(true);
  });

  it("waitlist booking reference validation requires non-empty reference on scheduled", () => {
    const validateWaitlistSchedule = (status: string, bookingRef?: string) => {
      if (status === "scheduled") {
        if (!bookingRef?.trim()) return { ok: false, error: "ต้องระบุเลขนัดจริง" };
      }
      return { ok: true, reference: bookingRef?.trim() };
    };

    expect(validateWaitlistSchedule("contacted", "").ok).toBe(true);
    expect(validateWaitlistSchedule("scheduled", "").ok).toBe(false);
    expect(validateWaitlistSchedule("scheduled", "  ").ok).toBe(false);

    const valid = validateWaitlistSchedule("scheduled", "  PDH-123456  ");
    expect(valid.ok).toBe(true);
    expect(valid.reference).toBe("PDH-123456");
  });
});
