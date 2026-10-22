import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
import bcrypt from "bcryptjs";
import { db } from "../../src/lib/db";
import {
  changePassword,
  changePasswordSchema,
} from "../../src/server/services/passwords";

describe.skipIf(process.env.RUN_DB_TESTS !== "true")(
  "password changes in real MySQL",
  () => {
    const users: string[] = [];
    afterAll(async () => {
      await db.session.deleteMany({ where: { userId: { in: users } } });
      await db.audit.deleteMany({ where: { actorId: { in: users } } });
      await db.user.deleteMany({ where: { id: { in: users } } });
      await db.$disconnect();
    });
    it("checks the old password, stores a hash, revokes only the owner sessions and audits without secrets", async () => {
      if (!process.env.DATABASE_URL?.includes("pdh_healthcheck_test"))
        throw Error("Isolated test database required");
      const original = "Original-" + crypto.randomUUID();
      const replacement = "Replacement-" + crypto.randomUUID();
      const user = await db.user.create({
        data: {
          email: crypto.randomUUID() + "@password.test",
          name: "Password test",
          role: "registration",
          passwordHash: await bcrypt.hash(original, 12),
        },
      });
      users.push(user.id);
      const other = await db.user.create({
        data: {
          email: crypto.randomUUID() + "@password.test",
          name: "Other",
          role: "registration",
          passwordHash: user.passwordHash,
        },
      });
      users.push(other.id);
      const makeSession = (userId: string) =>
        db.session.create({
          data: {
            userId,
            tokenHash:
              crypto.randomUUID().replaceAll("-", "") +
              crypto.randomUUID().replaceAll("-", ""),
            expiresAt: new Date(Date.now() + 3600000),
          },
        });
      const current = await makeSession(user.id);
      await makeSession(user.id);
      const unaffected = await makeSession(other.id);
      const input = {
        currentPassword: original,
        newPassword: replacement,
        confirmPassword: replacement,
      };
      await expect(
        changePassword(current.id, {
          ...input,
          currentPassword: "wrong-password",
        }),
      ).rejects.toMatchObject({ status: 422 });
      expect(await db.session.count({ where: { userId: user.id } })).toBe(2);
      expect(await db.audit.count({ where: { actorId: user.id } })).toBe(0);
      await changePassword(current.id, input);
      const saved = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(await bcrypt.compare(replacement, saved.passwordHash)).toBe(true);
      expect(await bcrypt.compare(original, saved.passwordHash)).toBe(false);
      expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
      expect(
        await db.session.findUnique({ where: { id: unaffected.id } }),
      ).not.toBeNull();
      const audit = await db.audit.findFirstOrThrow({
        where: { actorId: user.id, action: "auth.password_changed" },
      });
      expect(JSON.stringify(audit)).not.toContain(replacement);
      await expect(changePassword(current.id, input)).rejects.toMatchObject({
        status: 401,
      });
    });
  },
);

describe("password input validation", () => {
  it("rejects short, unchanged, mismatched and bcrypt-truncated passwords", () => {
    const original = "Original-password-123";
    const parse = (newPassword: string, confirmPassword = newPassword) =>
      changePasswordSchema.safeParse({
        currentPassword: original,
        newPassword,
        confirmPassword,
      }).success;
    expect(parse("short")).toBe(false);
    expect(parse(original)).toBe(false);
    expect(parse("New-password-12345", "different")).toBe(false);
    expect(parse("ก".repeat(25))).toBe(false);
    expect(parse("New-password-12345")).toBe(true);
  });
});
