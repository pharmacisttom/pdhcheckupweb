import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
const context = vi.hoisted(() => ({ token: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: () => (context.token ? { value: context.token } : undefined),
    set: (_: string, value: string) => {
      context.token = value;
    },
    delete: () => {
      context.token = "";
    },
  }),
}));
import bcrypt from "bcryptjs";
import { db } from "../../src/lib/db";
import { api } from "../../src/server/api";
import { encrypt, hash } from "../../src/lib/security";
import { operatorTotp } from "../../src/lib/mfa";
import { activateAccount } from "../../src/server/services/enrollment";
const enabled = process.env.RUN_DB_TESTS === "true";
describe.skipIf(!enabled)(
  "staff administration and restricted MFA lifecycle on MySQL",
  () => {
    const password = "Synthetic-only-" + crypto.randomUUID();
    const replacement = "Replacement-only-" + crypto.randomUUID();
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    const ids: string[] = [];
    let passwordHash: string;
    let manager: { id: string; token: string; email: string };
    let superadmin: { id: string; token: string; email: string };
    const proof = () => ({ password, mfa: operatorTotp(secret).generate() });
    async function user(role = "registration", enrolled = true) {
      const row = await db.user.create({
        data: {
          email: crypto.randomUUID() + "@staff-test.invalid",
          name: "Synthetic staff",
          role,
          passwordHash,
          mfaSecret: enrolled ? encrypt(secret) : null,
        },
      });
      ids.push(row.id);
      const raw = crypto.randomUUID();
      await db.session.create({
        data: {
          userId: row.id,
          tokenHash: hash(raw),
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      return { id: row.id, token: raw, email: row.email };
    }
    async function call(resource: string, cookie = "", data?: unknown) {
      context.token = cookie;
      const response = await api(
        new Request("http://localhost:3036/api/v1/" + resource, {
          method: data === undefined ? "GET" : "POST",
          headers: {
            Origin: "https://localhost:3036",
            "Content-Type": "application/json",
          },
          body: data === undefined ? undefined : JSON.stringify(data),
        }),
        resource.split("/"),
      );
      return {
        status: response.status,
        body: await response.json(),
        token: context.token,
        headers: response.headers,
      };
    }
    async function invite() {
      const result = await call("admin/users", manager.token, {
        email: crypto.randomUUID() + "@invite-test.invalid",
        name: "Invited staff",
        role: "registration",
        verification: proof(),
      });
      expect(result.status).toBe(200);
      ids.push(result.body.data.user.id);
      return {
        id: result.body.data.user.id as string,
        raw: new URL(result.body.data.invitation.activationUrl).hash.slice(1),
        email: result.body.data.user.email as string,
      };
    }
    beforeAll(async () => {
      const url = new URL(process.env.DATABASE_URL!);
      if (
        !["127.0.0.1", "localhost"].includes(url.hostname) ||
        url.pathname !== "/pdh_healthcheck_test"
      )
        throw new Error("Isolated test database required");
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("APP_URL", "https://localhost:3036");
      passwordHash = await bcrypt.hash(password, 12);
      manager = await user("manager");
      superadmin = await user("superadmin");
    });
    afterAll(async () => {
      await db.mfaRecoveryCode.deleteMany({ where: { userId: { in: ids } } });
      await db.staffPasswordReset.deleteMany({
        where: { userId: { in: ids } },
      });
      await db.userInvitation.deleteMany({ where: { userId: { in: ids } } });
      await db.session.deleteMany({ where: { userId: { in: ids } } });
      await db.audit.deleteMany({
        where: { OR: [{ actorId: { in: ids } }, { resourceId: { in: ids } }] },
      });
      await db.rateLimit.deleteMany({
        where: { OR: ids.map((id) => ({ key: { contains: id } })) },
      });
      await db.user.deleteMany({ where: { id: { in: ids } } });
      vi.unstubAllEnvs();
      await db.$disconnect();
    });
    it("restricts user management and Superadmin edits to authorized actors", async () => {
      const staff = await user();
      expect((await call("admin/users", staff.token)).status).toBe(403);
      const create = {
        email: crypto.randomUUID() + "@blocked.invalid",
        name: "Blocked",
        role: "superadmin",
        verification: proof(),
      };
      expect((await call("admin/users", manager.token, create)).status).toBe(
        403,
      );
      expect(
        (
          await call("admin/users/update", manager.token, {
            id: superadmin.id,
            email: superadmin.email,
            name: "Blocked",
            role: "registration",
            active: true,
            verification: proof(),
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await call("admin/users/action", manager.token, {
            id: superadmin.id,
            action: "revoke-sessions",
            reason: "Synthetic test action",
            verification: proof(),
          })
        ).status,
      ).toBe(403);
      const permitted = await call("admin/users", superadmin.token, {
        ...create,
        email: crypto.randomUUID() + "@superadmin-test.invalid",
      });
      expect(permitted.status).toBe(200);
      ids.push(permitted.body.data.user.id);
    });
    it("consumes a hashed invitation once, keeps MFA pending and rotates the restricted token on confirmation", async () => {
      const pending = await invite();
      const stored = await db.userInvitation.findFirstOrThrow({
        where: { userId: pending.id },
      });
      expect(stored.tokenHash).toBe(hash(pending.raw));
      const activated = await call("auth/activate", "", {
        token: pending.raw,
        newPassword: replacement,
        confirmPassword: replacement,
      });
      expect(activated.status).toBe(200);
      expect(activated.body.data.next).toBe("/auth/mfa/setup");
      const restricted = activated.token;
      for (const resource of [
        "admin/users",
        "admin/dashboard",
        "auth/me",
        "packages",
      ])
        expect((await call(resource, restricted)).status).toBe(403);
      expect((await call("auth/guest", restricted, {})).status).toBe(403);
      const setup = await call("auth/mfa/setup", restricted, {});
      expect(setup.status).toBe(200);
      expect(setup.headers.get("cache-control")).toBe("no-store");
      expect(setup.body.data.qrDataUrl).toMatch(/^data:image\/png;base64,/);
      const key = setup.body.data.manualKey;
      expect(
        (await call("auth/mfa/setup", restricted, {})).body.data.manualKey,
      ).toBe(key);
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: pending.id } }))
          .mfaSecret,
      ).toBeNull();
      const code = operatorTotp(key).generate();
      expect(
        (
          await call("auth/mfa/confirm", restricted, {
            code: code === "000000" ? "111111" : "000000",
          })
        ).status,
      ).toBe(422);
      const confirmed = await call("auth/mfa/confirm", restricted, { code });
      expect(confirmed.status).toBe(200);
      expect(confirmed.token).not.toBe(restricted);
      expect((await call("auth/me", confirmed.token)).status).toBe(200);
      expect((await call("auth/me", restricted)).status).toBe(401);
      expect(
        (
          await call("auth/activate", "", {
            token: pending.raw,
            newPassword: replacement,
            confirmPassword: replacement,
          })
        ).status,
      ).toBe(422);
      const list = await call("admin/users", manager.token);
      expect(list.status).toBe(200);
      expect(JSON.stringify(list.body)).not.toMatch(
        /passwordHash|mfaSecret|pendingMfaSecret|tokenHash|manualKey|activationUrl/,
      );
      const audit = await db.audit.findMany({
        where: { resourceId: pending.id },
      });
      expect(audit.some((a) => a.action === "auth.mfa_enrolled")).toBe(true);
      expect(JSON.stringify(audit)).not.toContain(key);
    });
    it("requires temporary-password replacement before MFA and revokes old onboarding tokens", async () => {
      const email = crypto.randomUUID() + "@temporary-test.invalid";
      const created = await call("admin/users", manager.token, {
        email,
        name: "Temporary staff",
        role: "laboratory",
        temporaryPassword: password,
        verification: proof(),
      });
      expect(created.status).toBe(200);
      ids.push(created.body.data.user.id);
      const login = await call("auth/login", "", { email, password });
      expect(login.body.data.next).toBe("/auth/password");
      expect((await call("auth/mfa/setup", login.token, {})).status).toBe(403);
      expect(
        (
          await call("auth/onboarding/password", login.token, {
            currentPassword: "wrong",
            newPassword: replacement,
            confirmPassword: replacement,
          })
        ).status,
      ).toBe(422);
      const changed = await call("auth/onboarding/password", login.token, {
        currentPassword: password,
        newPassword: replacement,
        confirmPassword: replacement,
      });
      expect(changed.status).toBe(200);
      expect(changed.token).not.toBe(login.token);
      expect((await call("auth/onboarding", login.token)).status).toBe(401);
      const setup = await call("auth/mfa/setup", changed.token, {});
      const confirmed = await call("auth/mfa/confirm", changed.token, {
        code: operatorTotp(setup.body.data.manualKey).generate(),
      });
      expect(confirmed.status).toBe(200);
      expect(confirmed.body.data.next).toBe("/admin/lab-pricing");
    });
    it("requires step-up proof, revokes sessions on MFA reset and prevents self lockout", async () => {
      const target = await user();
      const action = {
        id: target.id,
        action: "reset-mfa",
        reason: "Identity verified by hospital operator",
        verification: proof(),
      };
      expect(
        (
          await call("admin/users/action", manager.token, {
            ...action,
            verification: { ...proof(), password: "wrong" },
          })
        ).status,
      ).toBe(403);
      expect(
        (await call("admin/users/action", manager.token, action)).status,
      ).toBe(200);
      const reset = await db.user.findUniqueOrThrow({
        where: { id: target.id },
      });
      expect(reset.mfaSecret).toBeNull();
      expect(reset.mustChangePassword).toBe(true);
      expect((await call("auth/me", target.token)).status).toBe(401);
      const next = await call("auth/login", "", {
        email: target.email,
        password,
      });
      expect(next.body.data.next).toBe("/auth/password");
      expect(
        (
          await call("admin/users/action", manager.token, {
            ...action,
            id: manager.id,
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await call("admin/users/update", superadmin.token, {
            id: superadmin.id,
            email: superadmin.email,
            name: "Cannot lock self",
            role: "manager",
            active: false,
            verification: proof(),
          })
        ).status,
      ).toBe(409);
    });
    it("invalidates reissued invitations and rejects expiry and concurrent reuse", async () => {
      const pending = await invite();
      const reissued = await call("admin/users/action", manager.token, {
        id: pending.id,
        action: "invite",
        reason: "Previous invitation was misplaced",
        verification: proof(),
      });
      expect(reissued.status).toBe(200);
      const raw = new URL(
        reissued.body.data.invitation.activationUrl,
      ).hash.slice(1);
      expect(
        (
          await call("auth/activate", "", {
            token: pending.raw,
            newPassword: replacement,
            confirmPassword: replacement,
          })
        ).status,
      ).toBe(422);
      const outcomes = await Promise.allSettled(
        [1, 2].map(() =>
          activateAccount({
            token: raw,
            newPassword: replacement,
            confirmPassword: replacement,
          }),
        ),
      );
      expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      const expired = await invite();
      await db.userInvitation.updateMany({
        where: { userId: expired.id },
        data: { expiresAt: new Date(0) },
      });
      expect(
        (
          await call("auth/activate", "", {
            token: expired.raw,
            newPassword: replacement,
            confirmPassword: replacement,
          })
        ).status,
      ).toBe(422);
    });
    it("revokes sessions explicitly and preserves a required password change across edits", async () => {
      const target = await user();
      const revoke = await call("admin/users/action", manager.token, {
        id: target.id,
        action: "revoke-sessions",
        reason: "Scheduled access review",
        verification: proof(),
      });
      expect(revoke.status).toBe(200);
      expect((await call("auth/me", target.token)).status).toBe(401);
      const update = {
        id: target.id,
        email: target.email,
        name: "Updated staff",
        role: "finance",
        active: true,
        forcePasswordChange: true,
        verification: proof(),
      };
      expect(
        (await call("admin/users/update", manager.token, update)).status,
      ).toBe(200);
      expect(
        (await call("auth/login", "", { email: target.email, password }))
          .status,
      ).toBe(401);
      const login = await call("auth/login", "", {
        email: target.email,
        password,
        mfa: operatorTotp(secret).generate(),
      });
      expect(login.body.data.next).toBe("/auth/password");
      expect((await call("auth/mfa/setup", login.token, {})).status).toBe(403);
      const changed = await call("auth/onboarding/password", login.token, {
        currentPassword: password,
        newPassword: replacement,
        confirmPassword: replacement,
      });
      expect(changed.status).toBe(200);
      expect((await call("auth/me", changed.token)).status).toBe(200);
    });
    it("independent pending sessions cannot overwrite confirmed MFA and logout removes pending secrets", async () => {
      const target = await user("registration", false);
      const first = await call("auth/login", "", {
        email: target.email,
        password,
      });
      const second = await call("auth/login", "", {
        email: target.email,
        password,
      });
      const one = await call("auth/mfa/setup", first.token, {});
      const two = await call("auth/mfa/setup", second.token, {});
      expect(one.body.data.manualKey).not.toBe(two.body.data.manualKey);
      const confirmed = await call("auth/mfa/confirm", first.token, {
        code: operatorTotp(one.body.data.manualKey).generate(),
      });
      expect(confirmed.status).toBe(200);
      expect(
        (
          await call("auth/mfa/confirm", second.token, {
            code: operatorTotp(two.body.data.manualKey).generate(),
          })
        ).status,
      ).toBe(401);
      const remaining = await db.session.findMany({
        where: { userId: target.id },
      });
      expect(remaining).toHaveLength(1);
      expect(remaining[0].pendingMfaSecret).toBeNull();
      const pending = await user("registration", false);
      const login = await call("auth/login", "", {
        email: pending.email,
        password,
      });
      await call("auth/mfa/setup", login.token, {});
      expect((await call("auth/logout", login.token, {})).status).toBe(200);
      expect(
        await db.session.findUnique({
          where: { tokenHash: hash(login.token) },
        }),
      ).toBeNull();
    });
    it("invalidates old invitations when the invited identity or role changes", async () => {
      const pending = await invite();
      const updatedEmail = crypto.randomUUID() + "@changed-invite.invalid";
      expect(
        (
          await call("admin/users/update", manager.token, {
            id: pending.id,
            email: updatedEmail,
            name: "Changed pending identity",
            role: "finance",
            active: true,
            verification: proof(),
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await call("auth/activate", "", {
            token: pending.raw,
            newPassword: replacement,
            confirmPassword: replacement,
          })
        ).status,
      ).toBe(422);
    });
    it("deactivation revokes enrollment and session expiry never grants setup access", async () => {
      const target = await user("registration", false);
      const login = await call("auth/login", "", {
        email: target.email,
        password,
      });
      expect((await call("auth/mfa/setup", login.token, {})).status).toBe(200);
      const edit = await call("admin/users/update", manager.token, {
        id: target.id,
        email: target.email,
        name: "Deactivated",
        role: "registration",
        active: false,
        verification: proof(),
      });
      expect(edit.status).toBe(200);
      expect(
        (await call("auth/mfa/confirm", login.token, { code: "123456" }))
          .status,
      ).toBe(401);
      expect(
        (await call("auth/login", "", { email: target.email, password }))
          .status,
      ).toBe(401);
      const other = await user("registration", false);
      const pending = await call("auth/login", "", {
        email: other.email,
        password,
      });
      await db.session.updateMany({
        where: { userId: other.id },
        data: { expiresAt: new Date(0) },
      });
      expect((await call("auth/mfa/setup", pending.token, {})).status).toBe(
        401,
      );
    });
  },
);
