import { intakeReusePlan, intakeReuseValue } from "@/lib/intake-reuse";
import {
  otpRequired,
  assertContactSession,
} from "./services/contact-verification";
import { dictionaries, locales, translate } from "@/lib/i18n";
import { deliverOtp, otpTestMode } from "./services/otp-delivery";
import { recoverInterest } from "./services/recover-interest";
import {
  reviewInput,
  updateReview,
  proposeQuote,
  acceptProposal,
  submitAdditionalInformation,
} from "./services/interest-review";
import { confirmReviewedBooking } from "./services/appointments";
import {
  activateAccount,
  activationInput,
  beginMfa,
  confirmMfa,
  finishFirstPassword,
  firstPasswordInput,
  onboardingIdentity,
  onboardingNext,
} from "./services/enrollment";
import {
  createStaff,
  createStaffInput,
  editStaff,
  editStaffInput,
  listStaff,
  staffAction,
  staffActionInput,
} from "./services/staff-users";
import { staffLanding } from "@/lib/staff-roles";
import { availableSlots } from "./services/availability";
import { boundedRequest } from "@/lib/request-limits";
import { changePassword, changePasswordSchema } from "./services/passwords";
import {
  bookingPolicy,
  setBookingPolicy,
  submitContactRequest,
} from "./services/booking-policy";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import bcrypt from "bcryptjs";
import { validOperatorTotp } from "@/lib/mfa";
import { randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import {
  AppError,
  audit,
  createSession,
  decrypt,
  encrypt,
  equalHash,
  guard,
  hash,
  privateHash,
  rateLimit,
  sameOrigin,
  session,
  identitySession,
} from "@/lib/security";
import {
  assessmentSchema,
  bangkokDate,
  csvSafe,
  evaluateRules,
  personSchema,
  validateAnswers,
  type Question,
  type RiskRule,
  activeStatuses,
} from "@/lib/domain";
import { createQuote } from "./services/pricing";
import {
  confirmBooking,
  createHold,
  transitionBooking,
  rescheduleBooking,
} from "./services/appointments";
import { approveImport, stageImport } from "./services/imports";
import {
  questionnaireSchema,
  draftQuestionnaire,
  approveQuestionnaire,
} from "./services/questionnaires";

const str = z.string().min(1).max(100);
async function body<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  if (Number(req.headers.get("content-length") ?? 0) > 100000)
    throw new AppError(413, "คำขอมีขนาดใหญ่เกินไป");
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new AppError(400, "รูปแบบ JSON ไม่ถูกต้อง");
  }
  return schema.parse(raw);
}
export async function api(req: Request, path: string[]) {
  const resource = path.join("/");
  const method = req.method;
  const url = new URL(req.url);
  const correlationId = crypto.randomUUID();
  try {
    if (!["GET", "HEAD"].includes(method)) {
      await sameOrigin(req);
      req = await boundedRequest(
        req,
        resource === "admin/imports" ? 2200000 : 100000,
      );
    }
    const identity = await identitySession(false);
    const restricted = identity?.userId && identity.stage !== "full";
    if (
      restricted &&
      ![
        "auth/login",
        "auth/logout",
        "auth/onboarding",
        "auth/onboarding/password",
        "auth/mfa/setup",
        "auth/mfa/confirm",
      ].includes(resource)
    )
      throw new AppError(
        403,
        "กรุณาตั้งค่าบัญชีและ MFA ให้เสร็จก่อน",
        "ENROLLMENT_REQUIRED",
      );
    if (
      !otpRequired() &&
      ["otp/request", "otp/verify", "contact-requests/recover"].includes(
        resource,
      )
    )
      throw new AppError(
        503,
        "ปิดการส่ง OTP กรุณาติดต่อเจ้าหน้าที่เพื่อยืนยันตัวตน",
        "OTP_DISABLED",
      );
    let data: unknown;
    if (method === "GET" && resource === "health") {
      if (!process.env.DATABASE_URL)
        return NextResponse.json(
          { status: "unconfigured", database: false },
          { status: 503 },
        );
      await db.$queryRaw`SELECT 1`;
      data = {
        status: "ok",
        database: true,
        notifications: !otpRequired()
          ? "disabled"
          : otpTestMode()
            ? "development_test"
            : process.env.OTP_PROVIDER === "http" &&
                process.env.OTP_HTTP_URL &&
                process.env.OTP_HTTP_TOKEN
              ? "configured"
              : "unconfigured",
      };
    } else if (method === "POST" && resource === "auth/activate") {
      if (identity?.userId)
        throw new AppError(409, "กรุณาออกจากระบบก่อนเปิดใช้งานบัญชี");
      data = await activateAccount(await body(req, activationInput));
    } else if (method === "GET" && resource === "auth/onboarding") {
      const s = await onboardingIdentity();
      data = { next: onboardingNext(s.user), expiresAt: s.expiresAt };
    } else if (method === "POST" && resource === "auth/onboarding/password") {
      data = await finishFirstPassword(await body(req, firstPasswordInput));
    } else if (method === "POST" && resource === "auth/mfa/setup") {
      data = await beginMfa();
    } else if (method === "POST" && resource === "auth/mfa/confirm") {
      const input = await body(
        req,
        z.object({ code: z.string().regex(/^\d{6}$/) }),
      );
      data = await confirmMfa(input.code);
    } else if (method === "GET" && resource === "admin/users") {
      const page = z.coerce
        .number()
        .int()
        .min(1)
        .max(10000)
        .parse(url.searchParams.get("page") ?? 1);
      data = await listStaff(url.searchParams.get("q") ?? "", page);
    } else if (method === "POST" && resource === "admin/users") {
      data = await createStaff(await body(req, createStaffInput));
    } else if (method === "POST" && resource === "admin/users/update") {
      data = await editStaff(await body(req, editStaffInput));
    } else if (method === "POST" && resource === "admin/users/action") {
      data = await staffAction(await body(req, staffActionInput));
    } else if (method === "POST" && resource === "auth/guest") {
      await rateLimit("guest:global", 1000, 60);
      const old = await session(false);
      data = old
        ? {
            authenticated: true,
            verified: !!old.verifiedPhone,
            otpRequired: otpRequired(),
          }
        : {
            authenticated: !!(await createSession()),
            verified: false,
            otpRequired: otpRequired(),
          };
    } else if (method === "GET" && resource === "auth/me") {
      const s = await session();
      data = {
        verified: !!s?.verifiedPhone,
        otpRequired: otpRequired(),
        user: s?.user ? { name: s.user.name, role: s.user.role } : null,
      };
    } else if (method === "POST" && resource === "auth/login") {
      const input = await body(
        req,
        z.object({
          email: z.email().max(191),
          password: z.string().min(1).max(128),
          mfa: z.string().max(10).optional(),
        }),
      );
      await rateLimit("login:global", 500, 900);
      await rateLimit(
        "login:" + privateHash(input.email.toLowerCase()),
        5,
        900,
      );
      const user = await db.user.findUnique({
        where: { email: input.email.toLowerCase() },
      });
      const ok = await bcrypt.compare(
        input.password,
        user?.passwordHash ??
          "$2b$12$C6UzMDM.H6dfI/f/IKcEe.5gB28V9G0FM8p8h8Y3w5tQ7sV2Mtq9K",
      );
      if (!user?.active || !ok)
        throw new AppError(401, "ข้อมูลเข้าสู่ระบบไม่ถูกต้อง");
      if (user.activationRequired)
        throw new AppError(
          403,
          "กรุณาเปิดใช้งานบัญชีจากคำเชิญของผู้ดูแล",
          "ACTIVATION_REQUIRED",
        );
      if (
        user.mfaSecret &&
        !validOperatorTotp(decrypt<string>(user.mfaSecret), input.mfa ?? "")
      )
        throw new AppError(401, "รหัส MFA ไม่ถูกต้อง");
      const old = await identitySession(false);
      const stage = user.mustChangePassword
        ? "password"
        : !user.mfaSecret
          ? "mfa"
          : "full";
      await db.$transaction(async (tx) => {
        // Serialize login with password changes so an in-flight old-password
        // login cannot create a new session after all sessions are revoked.
        await tx.$queryRaw`SELECT id FROM User WHERE id = ${user.id} FOR UPDATE`;
        const fresh = await tx.user.findUnique({ where: { id: user.id } });
        if (
          !fresh?.active ||
          fresh.passwordHash !== user.passwordHash ||
          fresh.mfaSecret !== user.mfaSecret ||
          fresh.activationRequired ||
          fresh.mustChangePassword !== user.mustChangePassword
        )
          throw new AppError(
            401,
            "ข้อมูลบัญชีเปลี่ยนแปลง กรุณาเข้าสู่ระบบใหม่",
          );
        if (old) await tx.session.deleteMany({ where: { id: old.id } });
        await createSession(user.id, tx, stage);
        await audit(
          tx,
          user.id,
          stage === "full" ? "auth.login" : "auth.onboarding_login",
          user.id,
          { stage },
        );
      });
      data = {
        role: stage === "full" ? user.role : undefined,
        next: stage === "full" ? staffLanding(user.role) : onboardingNext(user),
        enrollmentRequired: stage !== "full",
      };
    } else if (method === "POST" && resource === "auth/change-password") {
      const s = (await session())!;
      if (!s.user) throw new AppError(401, "กรุณาเข้าสู่ระบบเจ้าหน้าที่");
      await rateLimit("password-change:" + s.user.id, 5, 900);
      data = await changePassword(s.id, await body(req, changePasswordSchema));
      (await cookies()).delete("pdh_session");
    } else if (method === "POST" && resource === "auth/logout") {
      const s = await identitySession(false);
      if (s) await db.session.delete({ where: { id: s.id } });
      (await cookies()).delete("pdh_session");
      data = { ok: true };
    } else if (method === "POST" && resource === "otp/request") {
      const s = (await session())!;
      const { phone } = await body(
        req,
        z.object({ phone: personSchema.shape.phone }),
      );
      await rateLimit("otp:global", 100, 600);
      await rateLimit("otp-session:" + s.id, 3, 600);
      await rateLimit("otp-phone:" + privateHash(phone), 3, 600);
      const test = otpTestMode();
      const code = String(randomInt(100000, 1000000));
      await deliverOtp(phone, code);
      const v = await db.verification.create({
        data: {
          sessionId: s.id,
          phoneHash: privateHash(phone),
          phoneEncrypted: encrypt(phone),
          codeHash: privateHash(code),
          expiresAt: new Date(Date.now() + 5 * 60000),
        },
      });
      data = {
        verificationId: v.id,
        expiresIn: 300,
        ...(test
          ? {
              testCode: code,
              warning: "รหัสทดสอบสำหรับสภาพแวดล้อมพัฒนาเท่านั้น",
            }
          : {}),
      };
    } else if (method === "POST" && resource === "otp/verify") {
      const s = (await session())!;
      const input = await body(
        req,
        z.object({ verificationId: str, code: z.string().regex(/^\d{6}$/) }),
      );
      await rateLimit("verify:" + s.id, 15, 600);
      const success = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM Verification WHERE id = ${input.verificationId} FOR UPDATE`;
        const v = await tx.verification.findFirst({
          where: { id: input.verificationId, sessionId: s.id },
        });
        if (!v || v.consumedAt || v.attempts >= 5 || v.expiresAt < new Date())
          return false;
        await tx.verification.update({
          where: { id: v.id },
          data: { attempts: { increment: 1 } },
        });
        if (!equalHash(v.codeHash, privateHash(input.code))) return false;
        await tx.verification.update({
          where: { id: v.id },
          data: { consumedAt: new Date() },
        });
        await tx.session.update({
          where: { id: s.id },
          data: { verifiedPhone: v.phoneEncrypted },
        });
        return true;
      });
      if (!success)
        throw new AppError(422, "รหัสไม่ถูกต้อง หมดอายุ หรือเกินจำนวนครั้ง");
      data = { verified: true };
    } else if (method === "GET" && resource === "booking-policy") {
      const policy = await bookingPolicy();
      data = {
        onlineEnabled: policy.onlineEnabled,
        message: policy.message,
        otpRequired: otpRequired(),
      };
    } else if (method === "POST" && resource === "contact-requests") {
      const s = (await session())!;
      await rateLimit("contact-requests:" + s.id, 10, 600);
      data = await submitContactRequest(
        s.id,
        await body(
          req,
          z.object({
            registrationId: str,
            quoteId: str.optional(),
            interestedPackageId: str.optional(),
            privacyAcknowledged: z.literal(true),
            noticeVersion: z.string().max(30).optional(),
          }),
        ),
      );
    } else if (method === "POST" && resource === "contact-requests/slots") {
      const s = (await session())!;
      const input = await body(req, z.object({ id: str }));
      const r = await db.contactRequest.findFirst({
        where: { id: input.id, sessionId: s.id, status: "ready_to_schedule" },
      });
      if (!r) throw new AppError(404, "ไม่พบรายการ");
      assertContactSession(s);
      data = await availableSlots(new Date(), true);
    } else if (
      method === "POST" &&
      resource === "contact-requests/information"
    ) {
      const s = (await session())!;
      const input = await body(
        req,
        z.object({ id: str, text: z.string().trim().min(1).max(4000) }),
      );
      data = await submitAdditionalInformation(s.id, input.id, input.text);
    } else if (method === "POST" && resource === "contact-requests/recover") {
      const s = (await session())!;
      await rateLimit("recover:" + s.id, 5, 900);
      const input = await body(
        req,
        z.object({
          reference: z.string().min(1).max(40),
          birthdate: z.iso.date(),
        }),
      );
      data = await recoverInterest(s.id, input.reference, input.birthdate);
    } else if (method === "POST" && resource === "contact-requests/accept") {
      const s = (await session())!;
      const input = await body(
        req,
        z.object({ id: str, fingerprint: z.string().length(64), slotId: str }),
      );
      data = await acceptProposal(
        s.id,
        input.id,
        input.fingerprint,
        input.slotId,
      );
    } else if (method === "GET" && resource === "contact-requests") {
      const s = (await session())!;
      const rows = await db.contactRequest.findMany({
        where: { sessionId: s.id },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      data = await Promise.all(
        rows.map(async (r) => ({
          id: r.id,
          reference: r.reference,
          status: r.status,
          createdAt: r.createdAt,
          bookingId: r.bookingId,
          acceptedAt: r.acceptedAt,
          informationRequest: r.reviewEncrypted
            ? decrypt<{ informationRequest?: string }>(r.reviewEncrypted)
                .informationRequest
            : "",
          proposal: r.quoteId
            ? await db.quote.findFirst({
                where: { id: r.quoteId, sessionId: s.id },
                select: {
                  fingerprint: true,
                  snapshot: true,
                  total: true,
                  expiresAt: true,
                },
              })
            : null,
        })),
      );
    } else if (method === "GET" && resource === "packages") {
      const now = new Date();
      const packages = await db.package.findMany({
        where: {
          status: "published",
          approvedBy: { not: null },
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
        include: {
          items: {
            include: {
              service: {
                select: {
                  id: true,
                  code: true,
                  nameTh: true,
                  preparation: true,
                  requiresReview: true,
                },
              },
            },
            orderBy: { position: "asc" },
          },
        },
        take: 100,
      });
      data = packages.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        audience: p.audience,
        price: p.fixedPrice.toFixed(2),
        minAge: p.minAge,
        maxAge: p.maxAge,
        preparation: p.preparation,
        version: p.version,
        items: p.items.map((i) => ({ ...i.service, mode: i.mode })),
      }));
    } else if (method === "GET" && resource === "services") {
      const search = (url.searchParams.get("q") ?? "").slice(0, 100);
      const now = new Date();
      const services = await db.service.findMany({
        where: {
          active: true,
          OR: [
            { nameTh: { contains: search } },
            { nameEn: { contains: search } },
            { code: { contains: search } },
          ],
        },
        include: {
          prices: {
            where: {
              effectiveFrom: { lte: now },
              OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
            },
            orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
            take: 1,
          },
        },
        take: 200,
        orderBy: { code: "asc" },
      });
      data = services.map((s) => ({
        id: s.id,
        code: s.code,
        nameTh: s.nameTh,
        nameEn: s.nameEn,
        category: s.category,
        price: s.prices[0]?.amount.toFixed(2) ?? null,
        requiresReview: s.requiresReview,
        preparation: s.preparation,
        componentCodes: s.componentCodes,
      }));
    } else if (method === "GET" && resource === "questionnaire") {
      const q = await db.questionnaire.findFirst({
        where: { status: "published", approvedBy: { not: null } },
        orderBy: { version: "desc" },
      });
      if (!q) throw new AppError(503, "แบบประเมินยังไม่ได้รับอนุมัติ");
      data = {
        version: q.version,
        questions: q.questions,
        intakeReuse: intakeReusePlan(
          q.questions as Question[],
          q.rules as RiskRule[],
        ),
      };
    } else if (method === "POST" && resource === "registrations") {
      const s = (await session())!;
      assertContactSession(s);
      await rateLimit("registrations:" + s.id, 30, 600);
      const input = await body(
        req,
        z.object({
          id: str.optional(),
          person: personSchema,
          answers: assessmentSchema,
          reuseIntakeAnswers: z.array(z.string().max(80)).max(20).optional(),
          questionnaireVersion: z.number().int(),
        }),
      );
      assertContactSession(s, input.person.phone);
      const q = await db.questionnaire.findFirst({
        where: {
          version: input.questionnaireVersion,
          status: "published",
          approvedBy: { not: null },
        },
      });
      if (!q) throw new AppError(422, "แบบประเมินไม่ถูกต้อง");
      const reuse = intakeReusePlan(
        q.questions as Question[],
        q.rules as RiskRule[],
      );
      for (const id of input.reuseIntakeAnswers ?? []) {
        const source = reuse[id];
        const value = source
          ? intakeReuseValue(source, input.person)
          : undefined;
        if (value === undefined)
          throw new AppError(
            422,
            "แบบประเมินเปลี่ยนแปลง กรุณาโหลดแบบฟอร์มใหม่",
          );
        input.answers[id] = value;
      }
      const errors = validateAnswers(q.questions as Question[], input.answers);
      if (errors.length) throw new AppError(422, errors.join("; "));
      const decisions = evaluateRules(
        q.rules as RiskRule[],
        input.answers,
        q.version,
      );
      const record = {
        draftEncrypted: encrypt(input.person),
        assessmentEncrypted: encrypt(input.answers),
        questionnaireVersion: q.version,
        expiresAt: new Date(Date.now() + 24 * 3600000),
      };
      data = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM Session WHERE id = ${s.id} FOR UPDATE`;
        if (input.id) {
          const existing = await tx.registration.findFirst({
            where: { id: input.id, ownerSessionId: s.id, booking: null },
          });
          if (!existing) throw new AppError(404, "ไม่พบแบบร่าง");
          if (
            await tx.contactRequest.findUnique({
              where: { registrationId: input.id },
            })
          )
            throw new AppError(
              409,
              "ส่งข้อมูลแล้ว กรุณาติดต่อเจ้าหน้าที่เพื่อแก้ไข",
            );
        }
        const r = input.id
          ? await tx.registration.update({
              where: { id: input.id },
              data: record,
            })
          : await tx.registration.create({
              data: { ...record, ownerSessionId: s.id },
            });
        await audit(tx, s.id, "registration.saved", r.id);
        return { id: r.id, decisions };
      });
    } else if (method === "GET" && resource === "registrations/draft") {
      const s = (await session())!;
      const submitted = await db.contactRequest.findMany({
        where: { sessionId: s.id },
        select: { registrationId: true },
      });
      const r = await db.registration.findFirst({
        where: {
          ownerSessionId: s.id,
          id: { notIn: submitted.map((r) => r.registrationId) },
          booking: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { updatedAt: "desc" },
      });
      data = r
        ? {
            id: r.id,
            person: decrypt(r.draftEncrypted),
            answers: r.assessmentEncrypted
              ? decrypt(r.assessmentEncrypted)
              : {},
            questionnaireVersion: r.questionnaireVersion,
          }
        : null;
    } else if (method === "POST" && resource === "quotes") {
      const s = (await session())!;
      assertContactSession(s);
      await rateLimit("quotes:" + s.id, 30, 600);
      const input = await body(
        req,
        z.object({ packageId: str, addonIds: z.array(str).max(50) }),
      );
      data = await createQuote(s.id, input.packageId, input.addonIds);
    } else if (method === "GET" && resource === "slots") {
      const from = new Date(url.searchParams.get("from") ?? Date.now());
      if (!Number.isFinite(from.getTime()))
        throw new AppError(422, "วันที่ไม่ถูกต้อง");
      data = await availableSlots(from);
    } else if (method === "POST" && resource === "holds") {
      const s = (await session())!;
      assertContactSession(s);
      await rateLimit("holds:" + s.id, 10, 600);
      await rateLimit(
        "holds-contact:" +
          (s.verifiedPhone
            ? privateHash(decrypt<string>(s.verifiedPhone))
            : s.id),
        10,
        600,
      );
      const input = await body(req, z.object({ slotId: str }));
      const h = await createHold(s.id, input.slotId);
      data = { id: h.id, expiresAt: h.expiresAt };
    } else if (method === "POST" && resource === "bookings") {
      const s = (await session())!;
      const input = await body(
        req,
        z.object({
          registrationId: str,
          holdId: str,
          quoteId: str,
          fingerprint: z.string().length(64),
          idempotencyKey: z.string().uuid(),
          privacyAcknowledged: z.literal(true),
          noticeVersion: z.string().max(30).optional(),
        }),
      );
      data = await confirmBooking(s.id, input);
    } else if (method === "GET" && resource === "bookings") {
      const s = (await session())!;
      const list = await db.booking.findMany({
        where: { sessionId: s.id },
        include: { slot: true, quote: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      data = list.map((b) => ({
        id: b.id,
        reference: b.reference,
        status: b.status,
        startsAt: b.slot.startsAt,
        total: b.quote.total.toFixed(2),
        snapshot: b.quote.snapshot,
        checkInToken: decrypt<string>(b.checkInTokenEncrypted),
      }));
    } else if (
      method === "POST" &&
      /^bookings\/[^/]+\/cancel$/.test(resource)
    ) {
      const s = (await session())!;
      const input = await body(
        req,
        z.object({ reason: z.string().min(1).max(500) }),
      );
      data = await transitionBooking(
        path[1],
        "cancelled",
        s.id,
        input.reason,
        s.id,
      );
    } else if (
      method === "POST" &&
      /^bookings\/[^/]+\/reschedule$/.test(resource)
    ) {
      const s = (await session())!;
      const input = await body(
        req,
        z.object({ slotId: str, idempotencyKey: z.uuid() }),
      );
      data = await rescheduleBooking(
        s.id,
        path[1],
        input.slotId,
        input.idempotencyKey,
      );
    } else if (method === "POST" && resource === "waitlist") {
      const s = (await session())!;
      assertContactSession(s);
      await rateLimit("waitlist:" + s.id, 10, 600);
      const input = await body(req, z.object({ day: z.iso.date() }));
      if (new Date(input.day + "T00:00:00+07:00").getTime() < Date.now())
        throw new AppError(422, "วันที่ต้องไม่อยู่ในอดีต");
      const w = await db.waitlist.upsert({
        where: { sessionId_dayId: { sessionId: s.id, dayId: input.day } },
        create: { sessionId: s.id, dayId: input.day },
        update: { status: "waiting" },
      });
      data = { id: w.id, status: w.status };
    } else if (resource.startsWith("admin/")) {
      data = await adminApi(req, path.slice(1));
    } else if (method === "POST" && resource === "privacy/requests") {
      const s = (await session())!;
      assertContactSession(s);
      await rateLimit("privacy-requests:" + s.id, 5, 3600);
      const input = await body(
        req,
        z.object({
          type: z.enum([
            "access",
            "correction",
            "deletion",
            "restriction",
            "objection",
          ]),
        }),
      );
      const r = await db.privacyRequest.create({
        data: { sessionId: s.id, type: input.type },
      });
      data = { id: r.id, status: r.status };
    } else throw new AppError(404, "ไม่พบ API", "NOT_FOUND");
    return NextResponse.json(
      { data, correlationId },
      {
        headers: { "Cache-Control": "no-store", "X-Request-ID": correlationId },
      },
    );
  } catch (error) {
    const status =
      (error as { code?: string })?.code === "P2002"
        ? 409
        : error instanceof AppError
          ? error.status
          : error instanceof ZodError
            ? 422
            : 503;
    const message =
      (error as { code?: string })?.code === "P2002"
        ? "ข้อมูลนี้มีอยู่ในระบบแล้ว"
        : error instanceof AppError
          ? error.message
          : error instanceof ZodError
            ? error.issues
                .map((i) => i.path.join(".") + ": " + i.message)
                .join("; ")
            : "บริการยังไม่พร้อมใช้งาน กรุณาตรวจสอบการตั้งค่าระบบ";
    return NextResponse.json(
      {
        error: {
          code:
            (error as { code?: string })?.code === "P2002"
              ? "CONFLICT"
              : error instanceof AppError
                ? error.code
                : error instanceof ZodError
                  ? "VALIDATION_ERROR"
                  : "SERVICE_UNAVAILABLE",
          message,
          messages: Object.fromEntries(
            locales.map((locale) => {
              const code =
                (error as { code?: string })?.code === "P2002"
                  ? "CONFLICT"
                  : error instanceof AppError
                    ? error.code
                    : error instanceof ZodError
                      ? "VALIDATION_ERROR"
                      : "SERVICE_UNAVAILABLE";
              return [
                locale,
                locale === "th" || dictionaries[locale][message]
                  ? translate(message, locale)
                  : translate(
                      "error." +
                        (dictionaries[locale]["error." + code]
                          ? code
                          : "REQUEST_FAILED"),
                      locale,
                    ),
              ];
            }),
          ),
        },
        correlationId,
      },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}

async function adminApi(req: Request, path: string[]): Promise<unknown> {
  if (path.join("/") === "booking-policy") {
    const s = await guard("calendar:write");
    if (req.method === "GET") return bookingPolicy();
    if (req.method === "POST")
      return setBookingPolicy(
        s.user!.id,
        await body(
          req,
          z.object({
            onlineEnabled: z.boolean(),
            message: z.string().trim().min(1).max(1000),
          }),
        ),
      );
  }
  if (path.join("/") === "contact-requests/assignees" && req.method === "GET") {
    await guard("bookings:read");
    return db.user.findMany({
      where: {
        active: true,
        role: { in: ["superadmin", "manager", "registration"] },
      },
      select: { id: true, name: true },
      take: 200,
      orderBy: { name: "asc" },
    });
  }
  if (path.join("/") === "contact-requests" && req.method === "GET") {
    const s = await guard("bookings:read");
    const rows = await db.contactRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    await db.$transaction((tx) =>
      audit(tx, s.user!.id, "contact_requests.viewed", "contact-requests"),
    );
    return Promise.all(
      rows.map(async (r) => {
        const details = decrypt<{ questionnaireVersion: number }>(
          r.payloadEncrypted,
        );
        const questionnaire =
          typeof details.questionnaireVersion === "number"
            ? await db.questionnaire.findUnique({
                where: { version: details.questionnaireVersion },
              })
            : null;
        return {
          id: r.id,
          reference: r.reference,
          status: r.status,
          createdAt: r.createdAt,
          bookingId: r.bookingId,
          assignedTo: r.assignedTo,
          entitlementStatus: r.entitlementStatus,
          quoteId: r.quoteId,
          proposal: r.quoteId
            ? await db.quote.findUnique({
                where: { id: r.quoteId },
                select: { snapshot: true, total: true, expiresAt: true },
              })
            : null,
          acceptedAt: r.acceptedAt,
          details,
          questions: questionnaire?.questions ?? [],
          review: r.reviewEncrypted ? decrypt(r.reviewEncrypted) : {},
          note: r.noteEncrypted ? decrypt<string>(r.noteEncrypted) : "",
        };
      }),
    );
  }
  if (path.join("/") === "contact-requests/status" && req.method === "POST") {
    const s = await guard("bookings:write");
    return updateReview(s.user!.id, await body(req, reviewInput));
  }
  if (path.join("/") === "contact-requests/quote" && req.method === "POST") {
    const s = await guard("bookings:write");
    const input = await body(
      req,
      z.object({ id: str, packageId: str, addonIds: z.array(str).max(50) }),
    );
    return proposeQuote(s.user!.id, input.id, input.packageId, input.addonIds);
  }
  if (path.join("/") === "contact-requests/schedule" && req.method === "POST") {
    const s = await guard("bookings:write");
    const input = await body(req, z.object({ id: str }));
    return confirmReviewedBooking(s.user!.id, input.id);
  }
  const resource = path.join("/");
  const method = req.method;
  const url = new URL(req.url);
  if (resource === "questionnaires" && method === "GET") {
    await guard("questionnaire:write");
    return db.questionnaire.findMany({
      orderBy: { version: "desc" },
      take: 50,
    });
  }
  if (resource === "questionnaires" && method === "POST") {
    const s = await guard("questionnaire:write");
    return draftQuestionnaire(await body(req, questionnaireSchema), s.user!.id);
  }
  if (resource === "questionnaires/approve" && method === "POST") {
    const s = await guard("questionnaire:write");
    const { id } = await body(req, z.object({ id: str }));
    return approveQuestionnaire(id, s.user!.id);
  }
  if (resource === "waitlist" && method === "GET") {
    await guard("bookings:read");
    return db.waitlist.findMany({
      select: { id: true, dayId: true, status: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
  }
  if (resource === "calendar" && method === "GET") {
    await guard("calendar:write");
    return db.dayCapacity.findMany({
      where: { id: { gte: bangkokDate(new Date()) } },
      include: { slots: { orderBy: { startsAt: "asc" } } },
      orderBy: { id: "asc" },
      take: 60,
    });
  }
  if (resource === "calendar" && method === "POST") {
    const s = await guard("calendar:write");
    const input = await body(
      req,
      z.object({
        day: z.iso.date(),
        blackout: z.boolean(),
        capacity: z.number().int().min(0).max(2000),
      }),
    );
    return db.$transaction(async (tx) => {
      await tx.dayCapacity.upsert({
        where: { id: input.day },
        create: {
          id: input.day,
          capacity: input.capacity,
          blackout: input.blackout,
        },
        update: {},
      });
      await tx.$queryRaw`SELECT id FROM DayCapacity WHERE id = ${input.day} FOR UPDATE`;
      const booked = await tx.booking.count({
        where: { slot: { dayId: input.day }, status: { in: activeStatuses } },
      });
      const held = await tx.hold.count({
        where: {
          slot: { dayId: input.day },
          consumed: false,
          expiresAt: { gt: new Date() },
        },
      });
      if (input.capacity < booked + held)
        throw new AppError(409, "ลดความจุต่ำกว่าจำนวนจองและสำรองไม่ได้");
      if (input.blackout && booked)
        throw new AppError(
          409,
          "มีนัดหมายอยู่ ต้องจัดการนัดเดิมก่อนปิดวันให้บริการ",
        );
      await tx.dayCapacity.update({
        where: { id: input.day },
        data: { capacity: input.capacity, blackout: input.blackout },
      });
      await audit(tx, s.user!.id, "calendar.configured", input.day);
      return {
        day: input.day,
        capacity: input.capacity,
        blackout: input.blackout,
      };
    });
  }
  if (method === "GET" && resource === "dashboard") {
    await guard("dashboard:read");
    const fromText = url.searchParams.get("from") ?? bangkokDate(new Date());
    const toText = url.searchParams.get("to") ?? fromText;
    z.iso.date().parse(fromText);
    z.iso.date().parse(toText);
    const from = new Date(fromText + "T00:00:00+07:00");
    const to = new Date(
      new Date(toText + "T00:00:00+07:00").getTime() + 86400000,
    );
    if (to <= from || to.getTime() - from.getTime() > 366 * 86400000)
      throw new AppError(422, "ช่วงวันที่ต้องไม่เกิน 366 วัน");
    const bookings = await db.booking.findMany({
      where: { slot: { startsAt: { gte: from, lt: to } } },
      include: { slot: true, quote: true },
      orderBy: { slot: { startsAt: "asc" } },
      take: 10000,
    });
    const counts = bookings.reduce<Record<string, number>>((acc, b) => {
      acc[b.status] = (acc[b.status] ?? 0) + 1;
      return acc;
    }, {});
    const { default: Decimal } = await import("decimal.js");
    return {
      from: fromText,
      to: toText,
      total: bookings.length,
      checkedIn: bookings.filter((b) => b.checkedInAt).length,
      completed: counts.completed ?? 0,
      cancelled: counts.cancelled ?? 0,
      noShow: counts.no_show ?? 0,
      estimated: bookings
        .filter((b) => b.status !== "cancelled")
        .reduce((s, b) => s.plus(b.quote.total.toString()), new Decimal(0))
        .toFixed(2),
      statuses: Object.entries(counts).map(([name, value]) => ({
        name,
        value,
      })),
      trend: Object.entries(
        bookings.reduce<Record<string, number>>((acc, b) => {
          const d = bangkokDate(b.slot.startsAt);
          acc[d] = (acc[d] ?? 0) + 1;
          return acc;
        }, {}),
      ).map(([date, count]) => ({ date, count })),
      bookings: bookings.slice(0, 100).map((b) => ({
        id: b.id,
        reference: b.reference,
        startsAt: b.slot.startsAt,
        status: b.status,
        total: b.quote.total.toFixed(2),
        packageName: (b.quote.snapshot as { lines: { name: string }[] })
          .lines[0]?.name,
      })),
    };
  }
  if (resource === "bookings" && method === "GET") {
    await guard("bookings:read");
    return db.booking.findMany({
      select: {
        id: true,
        reference: true,
        status: true,
        slot: { select: { startsAt: true } },
        checkedInAt: true,
      },
      take: 100,
      orderBy: { createdAt: "desc" },
    });
  }
  if (resource === "bookings/status" && method === "POST") {
    const s = await guard("bookings:write");
    const input = await body(
      req,
      z.object({
        id: str,
        status: z.enum([
          "checked_in",
          "in_service",
          "completed",
          "cancelled",
          "no_show",
        ]),
        reason: z.string().max(500).optional(),
      }),
    );
    return transitionBooking(input.id, input.status, s.user!.id, input.reason);
  }
  if (resource === "checkin" && method === "POST") {
    const s = await guard("checkin:write");
    const { token } = await body(
      req,
      z.object({ token: z.string().length(64) }),
    );
    const b = await db.booking.findUnique({
      where: { checkInTokenHash: hash(token) },
    });
    if (!b) throw new AppError(404, "QR ไม่ถูกต้อง");
    return transitionBooking(b.id, "checked_in", s.user!.id);
  }
  if (resource === "packages" && method === "GET") {
    await guard("packages:write");
    return db.package.findMany({
      include: {
        items: {
          include: { service: { select: { code: true, nameTh: true } } },
        },
      },
      take: 100,
      orderBy: { createdAt: "desc" },
    });
  }
  if (resource === "packages" && method === "POST") {
    const s = await guard("packages:write");
    const input = await body(
      req,
      z
        .object({
          sourceId: str.optional(),
          key: z.string().min(1).max(80),
          name: z.string().min(1).max(255),
          description: z.string().max(3000),
          audience: z.string().max(255),
          fixedPrice: z.string().regex(/^\d{1,9}(\.\d{1,2})?$/),
          minAge: z.number().int().min(0).max(130),
          maxAge: z.number().int().min(0).max(130),
          preparation: z.string().max(3000),
          effectiveFrom: z.iso.date(),
          serviceIds: z
            .array(str)
            .min(1, "กรุณาเลือกรายการตรวจอย่างน้อย 1 รายการก่อนบันทึกแพ็กเกจ")
            .max(100, "เลือกได้ไม่เกิน 100 รายการตรวจ"),
        })
        .refine(
          (v) =>
            v.maxAge >= v.minAge &&
            new Set(v.serviceIds).size === v.serviceIds.length,
        ),
    );
    return db.$transaction(async (tx) => {
      const available = await tx.service.count({
        where: { id: { in: input.serviceIds }, active: true },
      });
      if (available !== input.serviceIds.length)
        throw new AppError(
          422,
          "รายการตรวจที่เลือกบางรายการไม่มีอยู่หรือปิดใช้งานแล้ว กรุณาโหลดรายการตรวจใหม่และเลือกอีกครั้ง",
        );
      const latest = await tx.package.findFirst({
        where: { key: input.key },
        orderBy: { version: "desc" },
      });
      const p = await tx.package.create({
        data: {
          key: input.key,
          name: input.name,
          description: input.description,
          audience: input.audience,
          fixedPrice: input.fixedPrice,
          minAge: input.minAge,
          maxAge: input.maxAge,
          preparation: input.preparation,
          effectiveFrom: new Date(input.effectiveFrom + "T00:00:00+07:00"),
          version: (latest?.version ?? 0) + 1,
          items: {
            create: input.serviceIds.map((serviceId, position) => ({
              serviceId,
              position,
            })),
          },
        },
      });
      await audit(tx, s.user!.id, "package.drafted", p.id);
      return { id: p.id, status: p.status };
    });
  }
  if (resource === "packages/status" && method === "POST") {
    const input = await body(
      req,
      z.object({ id: str, status: z.enum(["published", "archived"]) }),
    );
    const s = await guard(
      input.status === "published" ? "packages:approve" : "packages:write",
    );
    return db.$transaction(async (tx) => {
      const p = await tx.package.findUniqueOrThrow({ where: { id: input.id } });
      if (input.status === "published" && p.status !== "draft")
        throw new AppError(409, "อนุมัติได้เฉพาะฉบับร่าง");
      await tx.package.update({
        where: { id: p.id },
        data: {
          status: input.status,
          ...(input.status === "published" ? { approvedBy: s.user!.id } : {}),
        },
      });
      await audit(tx, s.user!.id, "package." + input.status, p.id);
      return { id: p.id, status: input.status };
    });
  }
  if (resource === "slots" && method === "POST") {
    const s = await guard("calendar:write");
    const input = await body(
      req,
      z.object({
        day: z.iso.date(),
        time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        capacity: z.number().int().min(1).max(500),
        dailyCapacity: z.number().int().min(1).max(2000),
      }),
    );
    return db.$transaction(async (tx) => {
      const day = await tx.dayCapacity.upsert({
        where: { id: input.day },
        create: { id: input.day, capacity: input.dailyCapacity },
        update: {},
      });
      if (day.capacity !== input.dailyCapacity)
        throw new AppError(409, "ความจุรายวันเดิมไม่ตรง กรุณาตรวจสอบ");
      const startsAt = new Date(input.day + "T" + input.time + ":00+07:00");
      const slot = await tx.slot.create({
        data: {
          dayId: input.day,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 3600000),
          capacity: input.capacity,
        },
      });
      await audit(tx, s.user!.id, "slot.created", slot.id);
      return { id: slot.id };
    });
  }
  if (resource === "imports" && method === "GET") {
    await guard("catalog:write").catch(() => guard("imports:approve"));
    const batches = await db.importBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return Promise.all(
      batches.map(async (b) => ({
        ...b,
        comparisons: await Promise.all(
          (
            b.rows as {
              service_code: string;
              standard_price: string;
              service_name_th: string;
            }[]
          ).map(async (r) => {
            const s = await db.service.findUnique({
              where: { code: r.service_code },
              include: { prices: { orderBy: { version: "desc" }, take: 1 } },
            });
            return {
              code: r.service_code,
              name: r.service_name_th,
              previous: s?.prices[0]?.amount.toFixed(2) ?? null,
              imported: r.standard_price,
              mismatch: !!s && s.nameTh !== r.service_name_th,
            };
          }),
        ),
      })),
    );
  }
  if (resource === "imports" && method === "POST") {
    const s = await guard("imports:write");
    await rateLimit("imports:" + s.user!.id, 10, 600);
    if (Number(req.headers.get("content-length")) > 2200000)
      throw new AppError(413, "ไฟล์ใหญ่เกินกำหนด");
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError(422, "กรุณาเลือกไฟล์");
    const mapping = z
      .record(z.string(), z.string())
      .parse(JSON.parse(String(form.get("mapping") ?? "{}")));
    return stageImport(file, s.user!.id, mapping);
  }
  if (resource === "imports/approve" && method === "POST") {
    const s = await guard("imports:approve");
    const input = await body(req, z.object({ id: str }));
    return approveImport(input.id, s.user!.id);
  }
  if (resource === "organizations" && method === "GET") {
    await guard("organizations:write");
    return db.organization.findMany({
      select: { id: true, name: true, status: true, createdAt: true },
      take: 100,
    });
  }
  if (resource === "organizations" && method === "POST") {
    const s = await guard("organizations:write");
    const input = await body(
      req,
      z.object({
        name: z.string().min(1).max(255),
        contact: z.string().min(1).max(1000),
      }),
    );
    return db.$transaction(async (tx) => {
      const o = await tx.organization.create({
        data: { name: input.name, contactEncrypted: encrypt(input.contact) },
      });
      await audit(tx, s.user!.id, "organization.created", o.id);
      return { id: o.id, name: o.name, status: o.status };
    });
  }
  if (resource === "quotations" && method === "GET") {
    await guard("finance:read");
    const invoices = await db.invoice.findMany({
      take: 100,
      orderBy: { createdAt: "desc" },
    });
    return invoices.map((i) => ({
      id: i.id,
      bookingId: i.bookingId,
      estimated: i.estimatedAmount.toFixed(2),
      approved: i.approvedAmount?.toFixed(2),
      billed: i.actualBilledAmount?.toFixed(2),
      paid: i.paidAmount?.toFixed(2),
      status: i.status,
    }));
  }
  if (resource === "audit" && method === "GET") {
    await guard("audit:read");
    return db.audit.findMany({ take: 100, orderBy: { createdAt: "desc" } });
  }
  if (resource === "privacy" && method === "GET") {
    await guard("privacy:read");
    return db.privacyRequest.findMany({
      select: { id: true, type: true, status: true, createdAt: true },
      take: 100,
      orderBy: { createdAt: "desc" },
    });
  }
  if (resource === "reports" && method === "GET") {
    await guard("reports:read");
    return db.booking.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: { createdAt: { gte: new Date(Date.now() - 30 * 86400000) } },
    });
  }
  if (resource === "reports/export" && method === "POST") {
    const s = await guard("reports:read");
    const records = await db.booking.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: { createdAt: { gte: new Date(Date.now() - 30 * 86400000) } },
    });
    await db.$transaction((tx) =>
      audit(tx, s.user!.id, "report.exported", "status-summary-30d"),
    );
    return {
      csv: [
        "status,count",
        ...records.map((r) => csvSafe(r.status) + "," + r._count._all),
      ].join("\r\n"),
      filename: "pdh-status-summary-30d.csv",
    };
  }
  throw new AppError(404, "ไม่พบ API");
}
