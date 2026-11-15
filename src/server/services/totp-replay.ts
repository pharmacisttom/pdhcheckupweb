import { db } from "@/lib/db";

export type TotpPurpose = "login" | "privileged-step-up";

/** Persist outside the business transaction so a failed business operation cannot make a proof reusable. */
export async function consumeTotpStep(
  userId: string,
  purpose: TotpPurpose,
  timeStep: number,
): Promise<boolean> {
  try {
    await db.totpStepUse.create({ data: { userId, purpose, timeStep } });
    return true;
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002") return false;
    throw error;
  }
}
