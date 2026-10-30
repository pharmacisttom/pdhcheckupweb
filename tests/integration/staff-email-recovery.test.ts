import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
const context = vi.hoisted(() => ({
  token: "",
  jobs: [] as Promise<void>[],
  worker: false,
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (work: () => Promise<void>) => {
    context.jobs.push(Promise.resolve().then(work));
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => {
    if (context.worker) throw Error("No request context");
    return new Headers();
  },
  cookies: async () => ({
    get: () => (context.token ? { value: context.token } : undefined),
    set: (_: string, v: string) => {
      context.token = v;
    },
    delete: () => {
      context.token = "";
    },
  }),
}));
import bcrypt from "bcryptjs";
import { db } from "../../src/lib/db";
import { api } from "../../src/server/api";
import { hash, encrypt } from "../../src/lib/security";
import { operatorTotp } from "../../src/lib/mfa";
import {
  replaceRecoveryCodes,
  recoveryHash,
} from "../../src/server/services/mfa-recovery";
import { expireInvitations } from "../../src/server/services/staff-users";
const enabled = process.env.RUN_DB_TESTS === "true";
describe.skipIf(!enabled)(
  "staff email invitations and recovery on isolated MySQL",
  () => {
    const ids: string[] = [],
      password = "Synthetic-" + crypto.randomUUID(),
      newPassword = "Changed-" + crypto.randomUUID(),
      secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    let passwordHash: string;
    let manager: { id: string; email: string; token: string };
    const fetcher = vi.fn();
    async function makeUser(role = "registration", mfa = true, stage = "full") {
      const user = await db.user.create({
        data: {
          email: crypto.randomUUID() + "@email-test.invalid",
          name: "Synthetic staff",
          passwordHash,
          role,
          mfaSecret: mfa ? encrypt(secret) : null,
        },
      });
      ids.push(user.id);
      const token = crypto.randomUUID();
      await db.session.create({
        data: {
          userId: user.id,
          tokenHash: hash(token),
          stage,
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      return { ...user, token };
    }
    async function call(path: string, cookie = "", data?: unknown) {
      context.token = cookie;
      const r = await api(
        new Request("http://localhost:3036/api/v1/" + path, {
          method: data === undefined ? "GET" : "POST",
          headers: {
            Origin: "http://localhost:3036",
            "Content-Type": "application/json",
          },
          ...(data === undefined ? {} : { body: JSON.stringify(data) }),
        }),
        path.split("?")[0].split("/"),
      );
      await Promise.all(context.jobs.splice(0));
      return { status: r.status, body: await r.json() };
    }
    const proof = () => ({ password, mfa: operatorTotp(secret).generate() });
    async function invite(extra: Record<string, unknown> = {}) {
      const r = await call("admin/users/invitations", manager.token, {
        email: crypto.randomUUID() + "@invited-email.invalid",
        name: "Synthetic invited staff",
        role: "registration",
        department: "TEST-DEPT",
        position: "Synthetic position",
        verification: proof(),
        ...extra,
      });
      expect(r.status).toBe(200);
      ids.push(r.body.data.user.id);
      return r.body.data;
    }
    function provider() {
      vi.stubEnv("EMAIL_PROVIDER", "resend");
      vi.stubEnv("EMAIL_FROM", "noreply@example.invalid");
      vi.stubEnv("EMAIL_SENDER_VERIFIED", "true");
      vi.stubEnv("RESEND_API_KEY", "synthetic-test-key");
      fetcher.mockReset().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", fetcher);
    }
    function resetToken() {
      const messages = fetcher.mock.calls.map(
        (c) => JSON.parse(c[1].body).text as string,
      );
      return messages.join("\n").match(/reset-password#([a-f0-9]{64})/)![1];
    }
    beforeAll(async () => {
      const u = new URL(process.env.DATABASE_URL!);
      if (
        !["localhost", "127.0.0.1"].includes(u.hostname) ||
        u.pathname !== "/pdh_healthcheck_test"
      )
        throw Error("Test database only");
      vi.stubEnv("APP_URL", "http://localhost:3036");
      vi.stubEnv("EMAIL_PROVIDER", "disabled");
      passwordHash = await bcrypt.hash(password, 12);
      manager = await makeUser("manager");
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
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      await db.$disconnect();
    });
    it("creates invitation metadata without sending when disabled, rejects duplicate email and unauthorized invitation", async () => {
      const r = await invite({ invitationNote: "Synthetic welcome" });
      expect(r.deliveryStatus).toBe("disabled");
      const row = await db.userInvitation.findUniqueOrThrow({
        where: { id: r.invitation.id },
      });
      expect(row.tokenHash).toBe(
        hash(new URL(r.invitation.activationUrl).hash.slice(1)),
      );
      expect(row.noteEncrypted).not.toContain("Synthetic welcome");
      expect(row.deliveryStatus).toBe("disabled");
      expect(
        (
          await call("admin/users/invitations", manager.token, {
            email: r.user.email,
            name: "Duplicate",
            role: "registration",
            verification: proof(),
          })
        ).status,
      ).toBe(409);
      const staff = await makeUser();
      expect(
        (
          await call("admin/users/invitations", staff.token, {
            email: "deny@example.invalid",
            name: "Denied",
            role: "registration",
            verification: proof(),
          })
        ).status,
      ).toBe(403);
      const filtered = await call(
        "admin/users?department=TEST-DEPT&role=registration&status=pending",
        manager.token,
      );
      expect(filtered.status).toBe(200);
      expect(
        filtered.body.data.users.some(
          (u: { id: string }) => u.id === r.user.id,
        ),
      ).toBe(true);
    });
    it("revokes invitations, rotates tokens on resend and returns secret-free history", async () => {
      const r = await invite();
      const raw = new URL(r.invitation.activationUrl).hash.slice(1);
      expect(
        (await call("invitations/verify", "", { token: raw })).status,
      ).toBe(200);
      const resend = await call("admin/users/action", manager.token, {
        id: r.user.id,
        action: "invite",
        reason: "Synthetic resend request",
        verification: proof(),
      });
      expect(resend.status).toBe(200);
      expect(
        (await call("invitations/verify", "", { token: raw })).status,
      ).toBe(422);
      const fresh = new URL(
        resend.body.data.invitation.activationUrl,
      ).hash.slice(1);
      expect(
        (
          await call("admin/users/action", manager.token, {
            id: r.user.id,
            action: "revoke-invitation",
            reason: "Synthetic cancel request",
            verification: proof(),
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await call("auth/activate", "", {
            token: fresh,
            newPassword,
            confirmPassword: newPassword,
          })
        ).status,
      ).toBe(422);
      const history = await call(
        "admin/users/invitations?userId=" + r.user.id,
        manager.token,
      );
      expect(history.status).toBe(200);
      expect(
        history.body.data.every(
          (v: { status: string }) => v.status === "revoked",
        ),
      ).toBe(true);
      expect(JSON.stringify(history.body)).not.toContain(raw);
      expect(JSON.stringify(history.body)).not.toContain("tokenHash");
    });
    it("marks delivery failure without pretending to send and expiration worker is idempotent", async () => {
      provider();
      fetcher.mockResolvedValue({ ok: false });
      const r = await invite();
      expect(r.deliveryStatus).toBe("failed");
      await db.userInvitation.update({
        where: { id: r.invitation.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect(
        (
          await call("invitations/verify", "", {
            token: new URL(r.invitation.activationUrl).hash.slice(1),
          })
        ).status,
      ).toBe(422);
      context.worker = true;
      await expireInvitations();
      const before = fetcher.mock.calls.length;
      await expireInvitations();
      expect(fetcher.mock.calls.length).toBe(before);
      context.worker = false;
      expect(
        (
          await db.userInvitation.findUniqueOrThrow({
            where: { id: r.invitation.id },
          })
        ).status,
      ).toBe("expired");
      vi.stubEnv("EMAIL_PROVIDER", "disabled");
    });
    it("generically acknowledges reset requests and resets once without removing MFA or recovery codes", async () => {
      provider();
      const u = await makeUser();
      const codes = await db.$transaction((tx) =>
        replaceRecoveryCodes(tx, u.id),
      );
      const known = await call("auth/forgot-password", "", { email: u.email });
      const unknown = await call("auth/forgot-password", "", {
        email: crypto.randomUUID() + "@missing.invalid",
      });
      expect(known.status).toBe(200);
      expect(known.body.data).toEqual(unknown.body.data);
      const raw = resetToken();
      const row = await db.staffPasswordReset.findUniqueOrThrow({
        where: { tokenHash: hash(raw) },
      });
      expect(
        row.expiresAt.getTime() - row.createdAt.getTime(),
      ).toBeLessThanOrEqual(30 * 60000 + 1000);
      const result = await call("auth/reset-password", "", {
        token: raw,
        newPassword,
        confirmPassword: newPassword,
      });
      expect(result.status).toBe(200);
      expect(await db.session.count({ where: { userId: u.id } })).toBe(0);
      const current = await db.user.findUniqueOrThrow({ where: { id: u.id } });
      expect(current.mfaSecret).toBe(u.mfaSecret);
      expect(await db.mfaRecoveryCode.count({ where: { userId: u.id } })).toBe(
        10,
      );
      expect(
        (
          await call("auth/reset-password", "", {
            token: raw,
            newPassword,
            confirmPassword: newPassword,
          })
        ).status,
      ).toBe(422);
      expect(
        (
          await call("auth/login", "", {
            email: u.email,
            password: newPassword,
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await call("auth/login", "", {
            email: u.email,
            password: newPassword,
            mfa: codes[0],
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await call("auth/login", "", {
            email: u.email,
            password: newPassword,
            mfa: codes[0],
          })
        ).status,
      ).toBe(401);
      vi.stubEnv("EMAIL_PROVIDER", "disabled");
    });
    it("rejects expired reset, weak password and concurrent replay", async () => {
      provider();
      const u = await makeUser();
      await call("auth/forgot-password", "", { email: u.email });
      let raw = resetToken();
      expect(
        (
          await call("auth/reset-password", "", {
            token: raw,
            newPassword: "short",
            confirmPassword: "short",
          })
        ).status,
      ).toBe(422);
      await db.staffPasswordReset.update({
        where: { tokenHash: hash(raw) },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect(
        (
          await call("auth/reset-password", "", {
            token: raw,
            newPassword,
            confirmPassword: newPassword,
          })
        ).status,
      ).toBe(422);
      fetcher.mockClear();
      await call("auth/forgot-password", "", { email: u.email });
      raw = resetToken();
      const outcomes = await Promise.all(
        [1, 2].map(() =>
          call("auth/reset-password", "", {
            token: raw,
            newPassword,
            confirmPassword: newPassword,
          }),
        ),
      );
      expect(outcomes.filter((r) => r.status === 200)).toHaveLength(1);
      expect(
        outcomes.filter((r) => [409, 422].includes(r.status)),
      ).toHaveLength(1);
      vi.stubEnv("EMAIL_PROVIDER", "disabled");
    });
    it("hashes recovery codes, consumes each at most once even concurrently, and rejects another account", async () => {
      const u = await makeUser(),
        other = await makeUser();
      const codes = await db.$transaction((tx) =>
        replaceRecoveryCodes(tx, u.id),
      );
      const stored = await db.mfaRecoveryCode.findMany({
        where: { userId: u.id },
      });
      expect(stored).toHaveLength(10);
      expect(JSON.stringify(stored)).not.toContain(codes[0]);
      expect(stored.some((c) => c.codeHash === recoveryHash(codes[0]))).toBe(
        true,
      );
      expect(
        (
          await call("auth/login", "", {
            email: other.email,
            password,
            mfa: codes[0],
          })
        ).status,
      ).toBe(401);
      const results = await Promise.all(
        [1, 2].map(() =>
          call("auth/login", "", { email: u.email, password, mfa: codes[0] }),
        ),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => [401, 409].includes(r.status))).toHaveLength(
        1,
      );
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: u.id } })).mfaSecret,
      ).toBe(u.mfaSecret);
    });
    it("rotates recovery codes only with current password and TOTP, and audits without secrets", async () => {
      const u = await makeUser();
      const old = await db.$transaction((tx) => replaceRecoveryCodes(tx, u.id));
      expect(
        (
          await call("auth/mfa/recovery-codes", u.token, {
            password,
            mfa: "000000",
          })
        ).status,
      ).toBe(403);
      const response = await call("auth/mfa/recovery-codes", u.token, {
        password,
        mfa: operatorTotp(secret).generate(),
      });
      expect(response.status).toBe(200);
      expect(response.body.data.recoveryCodes).toHaveLength(10);
      expect(
        (
          await call("auth/login", "", {
            email: u.email,
            password,
            mfa: old[0],
          })
        ).status,
      ).toBe(401);
      const audit = await db.audit.findMany({ where: { resourceId: u.id } });
      expect(
        audit.some((a) => a.action === "auth.mfa_recovery_codes_rotated"),
      ).toBe(true);
      expect(JSON.stringify(audit)).not.toContain(
        response.body.data.recoveryCodes[0],
      );
      expect(JSON.stringify(audit)).not.toContain(secret);
    });
    it("invalidates password-reset links after an administrator changes identity and resets MFA separately", async () => {
      provider();
      const u = await makeUser();
      await call("auth/forgot-password", "", { email: u.email });
      const raw = resetToken();
      expect(
        (
          await call("admin/users/update", manager.token, {
            id: u.id,
            email: crypto.randomUUID() + "@changed.invalid",
            name: "Synthetic renamed",
            role: "registration",
            active: true,
            verification: proof(),
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await call("auth/reset-password", "", {
            token: raw,
            newPassword,
            confirmPassword: newPassword,
          })
        ).status,
      ).toBe(422);
      await db.$transaction((tx) => replaceRecoveryCodes(tx, u.id));
      expect(
        (
          await call("admin/users/action", manager.token, {
            id: u.id,
            action: "reset-mfa",
            reason: "Synthetic in-person identity verification",
            verification: proof(),
          })
        ).status,
      ).toBe(200);
      const current = await db.user.findUniqueOrThrow({ where: { id: u.id } });
      expect(current.mfaSecret).toBeNull();
      expect(current.mustChangePassword).toBe(true);
      expect(await db.mfaRecoveryCode.count({ where: { userId: u.id } })).toBe(
        0,
      );
      expect(await db.session.count({ where: { userId: u.id } })).toBe(0);
      vi.stubEnv("EMAIL_PROVIDER", "disabled");
    });
    it("keeps ambiguous legacy consumed invitations distinct from accepted invitations", async () => {
      const r = await invite();
      await db.userInvitation.update({
        where: { id: r.invitation.id },
        data: { status: "pending", consumedAt: new Date() },
      });
      const history = await call(
        "admin/users/invitations?userId=" + r.user.id,
        manager.token,
      );
      expect(history.status).toBe(200);
      expect(history.body.data[0].status).toBe("legacy_consumed");
      expect(history.body.data[0].acceptedAt).toBeNull();
      expect(
        (
          await call("invitations/verify", "", {
            token: new URL(r.invitation.activationUrl).hash.slice(1),
          })
        ).status,
      ).toBe(422);
    });
  },
);
