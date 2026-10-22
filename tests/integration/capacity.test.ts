import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createHold } from "../../src/server/services/appointments";
import { encrypt } from '../../src/lib/security';
const enabled = process.env.RUN_DB_TESTS === "true";
const db = new PrismaClient();
describe.skipIf(!enabled)("real MySQL InnoDB capacity contention", () => {
  let slotId: string;
  let dayId: string;
  const sessionIds: string[] = [];
  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes("pdh_healthcheck_test"))
      throw new Error(
        "Integration tests require isolated pdh_healthcheck_test database",
      );
    const date = new Date(Date.now() + 90 * 86400000);
    dayId = date.toISOString().slice(0, 10);
    await db.dayCapacity.create({ data: { id: dayId, capacity: 1 } });
    const slot = await db.slot.create({
      data: {
        dayId,
        startsAt: date,
        endsAt: new Date(date.getTime() + 3600000),
        capacity: 1,
      },
    });
    slotId = slot.id;
    for (let i = 0; i < 20; i++)
      sessionIds.push(
        (
          await db.session.create({
            data: {
              verifiedPhone: encrypt('+66810000000'),
              tokenHash:
                crypto.randomUUID().replaceAll("-", "") +
                crypto.randomUUID().replaceAll("-", ""),
              expiresAt: new Date(Date.now() + 3600000),
            },
          })
        ).id,
      );
  });
  afterAll(async () => {
    if (slotId) {
      await db.hold.deleteMany({ where: { slotId } });
      await db.slot.delete({ where: { id: slotId } });
      await db.dayCapacity.delete({ where: { id: dayId } });
    }
    if (sessionIds.length)
      await db.session.deleteMany({ where: { id: { in: sessionIds } } });
    await db.$disconnect();
  });
  it("allows exactly one allocation among 20 requests for the final place", async () => {
    const results = await Promise.allSettled(
      sessionIds.map((id) => createHold(id, slotId)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      await db.hold.count({
        where: { slotId, expiresAt: { gt: new Date() }, consumed: false },
      }),
    ).toBe(1);
  }, 30000);
});
