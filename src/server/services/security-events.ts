import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { privateHash } from "@/lib/security";

const BUCKET_MS = 10 * 60 * 1000;
export async function recordSecurityEvent(
  eventType: "login.failure" | "mfa.failure" | "authorization.denied",
  subject: string,
  routeGroup: string,
  at = new Date(),
) {
  const windowStartedAt = new Date(Math.floor(at.getTime() / BUCKET_MS) * BUCKET_MS);
  const subjectHash = privateHash(subject);
  const route = routeGroup.replace(/[^a-zA-Z0-9._/-]/g, "_").slice(0, 80);
  const dedupKey = createHash("sha256")
    .update(`${eventType}|${subjectHash}|${route}|${windowStartedAt.toISOString()}`)
    .digest("hex");
  await db.securityEvent.upsert({
    where: { dedupKey },
    create: { dedupKey, eventType, subjectHash, routeGroup: route, windowStartedAt, lastSeenAt: at },
    update: { lastSeenAt: at, occurrenceCount: { increment: 1 } },
  });
}

export async function pruneSecurityEvents(retainDays = 90) {
  if (!Number.isInteger(retainDays) || retainDays < 30 || retainDays > 365)
    throw new Error("Security event retention must be between 30 and 365 days");
  const events = await db.securityEvent.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - retainDays * 86400000) } },
  });
  // A TOTP counter can only be accepted within the current ±1-step window;
  // seven days preserves ample incident review time without unbounded growth.
  const totpSteps = await db.totpStepUse.deleteMany({
    where: { consumedAt: { lt: new Date(Date.now() - 7 * 86400000) } },
  });
  return { events, totpSteps };
}
