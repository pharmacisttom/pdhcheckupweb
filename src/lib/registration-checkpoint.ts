import { z } from "zod";
import { personSchema, assessmentSchema } from "./domain";

// Checkpoints may contain unfinished input. They are never valid submissions.
const unfinishedShape = Object.fromEntries(
  Object.entries(personSchema.shape).map(([key, schema]) => [
    key,
    schema.or(z.literal("")).optional(),
  ]),
);
export const checkpointPersonSchema = z.object(unfinishedShape).extend({
  phone: z.string().max(30).optional(),
  email: z.string().max(254).optional(),
  birthdate: z.string().max(10).optional(),
  heightCm: z.number().finite().min(0).max(300).nullable().optional(),
  weightKg: z.number().finite().min(0).max(500).nullable().optional(),
  group: z
    .object({
      organizationId: z.string().max(100).optional(),
      primaryContact: z.string().max(200).optional(),
      contactPhone: z.string().max(30).optional(),
      participantReference: z.string().max(100).optional(),
    })
    .optional(),
  familyNcdEntries: z
    .array(
      z.object({
        relationship: z.enum(["", "mother", "father", "sibling", "child"]),
        disease: z.enum([
          "",
          "diabetes",
          "hypertension",
          "heart_disease",
          "stroke",
          "cancer",
          "other",
        ]),
        note: z.string().max(500).optional(),
      }),
    )
    .max(30)
    .optional(),
});
export const checkpointInput = z.object({
  id: z.string().min(1).max(100).optional(),
  requestId: z.uuid(),
  draftToken: z.uuid().nullable().optional(),
  person: checkpointPersonSchema,
  answers: assessmentSchema,
  questionnaireVersion: z.number().int().positive(),
  step: z.number().int().min(0).max(1),
  privacyAcknowledged: z.literal(true),
  noticeVersion: z.string().max(40),
});
export function isRegistrationCheckpoint(person: unknown): boolean {
  return (
    !!person &&
    typeof person === "object" &&
    (person as Record<string, unknown>)._draftCheckpoint === true
  );
}
