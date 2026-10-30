import { beforeEach, afterEach, it, expect, vi } from "vitest";
const smtp = vi.hoisted(() => ({
  create: vi.fn(),
  send: vi.fn(),
  close: vi.fn(),
}));
vi.mock("nodemailer", () => ({ default: { createTransport: smtp.create } }));
import {
  sendStaffEmail,
  staffEmailTemplate,
  staffTokenLink,
} from "../../src/server/services/staff-email";
import { recoveryHash } from "../../src/server/services/mfa-recovery";
const message = {
  to: "staff@example.invalid",
  name: "Synthetic staff",
  kind: "invitation" as const,
  key: "invitation-test",
  link: "https://app.example.invalid/invite#synthetic-token",
};
beforeEach(() => {
  vi.stubEnv("EMAIL_PROVIDER", "disabled");
  vi.stubEnv("EMAIL_FROM", "noreply@example.invalid");
  vi.stubEnv("EMAIL_SENDER_VERIFIED", "true");
  vi.stubEnv("APP_URL", "https://staging.example.invalid");
  smtp.create.mockReturnValue({ sendMail: smtp.send, close: smtp.close });
  smtp.send.mockResolvedValue({
    accepted: ["staff@example.invalid"],
    rejected: [],
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("disabled provider never sends or claims success", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  expect(await sendStaffEmail(message)).toBe("disabled");
  expect(fetcher).not.toHaveBeenCalled();
  expect(smtp.create).not.toHaveBeenCalled();
});
it("rejects unverified sender, header injection and unknown provider", async () => {
  vi.stubEnv("EMAIL_PROVIDER", "smtp");
  vi.stubEnv("EMAIL_SENDER_VERIFIED", "false");
  expect(await sendStaffEmail(message)).toBe("failed");
  vi.stubEnv("EMAIL_SENDER_VERIFIED", "true");
  expect(
    await sendStaffEmail({
      ...message,
      to: "test@example.invalid\r\nBcc: other@example.invalid",
    }),
  ).toBe("failed");
  vi.stubEnv("EMAIL_PROVIDER", "unknown");
  expect(await sendStaffEmail(message)).toBe("failed");
  expect(smtp.create).not.toHaveBeenCalled();
});
it("SMTP requires TLS, verifies certificates and disables payload logs", async () => {
  vi.stubEnv("EMAIL_PROVIDER", "smtp");
  vi.stubEnv("SMTP_HOST", "smtp.example.invalid");
  vi.stubEnv("SMTP_PORT", "587");
  vi.stubEnv("SMTP_USER", "test-only");
  vi.stubEnv("SMTP_PASSWORD", "test-only");
  expect(await sendStaffEmail(message)).toBe("sent");
  expect(smtp.create).toHaveBeenCalledWith(
    expect.objectContaining({
      requireTLS: true,
      logger: false,
      debug: false,
      tls: { rejectUnauthorized: true },
      disableFileAccess: true,
      disableUrlAccess: true,
    }),
  );
  smtp.send.mockRejectedValue(new Error("sensitive provider message"));
  expect(await sendStaffEmail(message)).toBe("failed");
  expect(smtp.close).toHaveBeenCalledTimes(2);
});
it("Resend uses fixed HTTPS endpoint, idempotency and fails on rejection", async () => {
  vi.stubEnv("EMAIL_PROVIDER", "resend");
  vi.stubEnv("RESEND_API_KEY", "synthetic-key");
  const fetcher = vi.fn().mockResolvedValue({ ok: false });
  vi.stubGlobal("fetch", fetcher);
  expect(await sendStaffEmail(message)).toBe("failed");
  expect(fetcher).toHaveBeenCalledWith(
    "https://api.resend.com/emails",
    expect.objectContaining({
      redirect: "error",
      headers: expect.objectContaining({
        "Idempotency-Key": "invitation-test",
      }),
    }),
  );
  fetcher.mockResolvedValue({ ok: true });
  expect(await sendStaffEmail(message)).toBe("sent");
});
it("all seven templates are plaintext and never contain passwords or TOTP material", () => {
  for (const kind of [
    "invitation",
    "resend",
    "expired",
    "activated",
    "password_reset",
    "password_changed",
    "suspended",
  ] as const) {
    const template = staffEmailTemplate({ ...message, kind });
    expect(template.subject.length).toBeGreaterThan(0);
    expect(template).not.toHaveProperty("html");
  }
});
it("links keep tokens in fragments and recovery hashes normalize codes", () => {
  const url = new URL(staffTokenLink("/invite", "ab".repeat(32)));
  expect(url.pathname).toBe("/invite");
  expect(url.search).toBe("");
  expect(url.hash).toBe("#" + "ab".repeat(32));
  expect(recoveryHash("A".repeat(32))).toBe(
    recoveryHash(Array(4).fill("aaaaaaaa").join("-")),
  );
  expect(recoveryHash("123456")).toBeNull();
});
