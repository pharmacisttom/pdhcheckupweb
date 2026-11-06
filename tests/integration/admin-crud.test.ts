import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
const context = vi.hoisted(() => ({ token: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: () => (context.token ? { value: context.token } : undefined),
  }),
}));
import { db } from "../../src/lib/db";
import { api } from "../../src/server/api";
import { hash, encrypt, decrypt, rateLimit } from "../../src/lib/security";
const enabled = process.env.RUN_DB_TESTS === "true";
describe.skipIf(!enabled)("complete admin CRUD isolated MySQL", () => {
  const marker = crypto.randomUUID(),
    users: string[] = [],
    sessions: string[] = [],
    orgs: string[] = [],
    services: string[] = [],
    pkgs: string[] = [],
    invoices: string[] = [],
    requests: string[] = [],
    batches: string[] = [],
    questionnaires: string[] = [],
    bookings: string[] = [],
    quotes: string[] = [],
    registrations: string[] = [],
    waits: string[] = [];
  const chats: string[] = [],
    departments: string[] = [];
  const tokens: Record<string, string> = {};
  let slotId = "",
    dayId = "",
    ownerId = "",
    orgId = "",
    serviceId = "",
    packageId = "",
    invoiceId = "",
    privacyId = "",
    waitId = "",
    qId = "";
  async function call(path: string, role = "superadmin", data?: unknown) {
    context.token = tokens[role] ?? role;
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
    return { status: r.status, body: await r.json() };
  }
  async function upload(file: File, mapping = "{}", role = "laboratory") {
    context.token = tokens[role];
    const f = new FormData();
    f.set("file", file);
    f.set("mapping", mapping);
    const r = await api(
      new Request("http://localhost:3036/api/v1/admin/imports", {
        method: "POST",
        headers: { Origin: "http://localhost:3036" },
        body: f,
      }),
      ["admin", "imports"],
    );
    const body = await r.json();
    if (body.data?.id) batches.push(body.data.id);
    return { status: r.status, body };
  }
  const orgInput = (revision: number) => ({
    name: marker,
    contact: "Synthetic contact",
    status: "active",
    revision,
    reason: "Synthetic change",
  });
  const svcInput = (revision: number) => ({
    nameTh: "Synthetic revised service",
    nameEn: "Revised",
    category: "test",
    unit: "ครั้ง",
    active: true,
    requiresReview: false,
    preparation: "Synthetic preparation",
    revision,
    reason: "Synthetic change",
  });
  const financial = async (
    action: string,
    amount: string,
    extra: Record<string, unknown> = {},
  ) => {
    const current = await db.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    return call("admin/manage/finance/" + invoiceId, "finance", {
      action,
      amount,
      revision: current.revision,
      reason: "Synthetic financial reason",
      reference: "Synthetic evidence",
      idempotencyKey: crypto.randomUUID(),
      ...extra,
    });
  };
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      url.pathname !== "/pdh_healthcheck_test"
    )
      throw Error("Isolated test DB required");
    for (const role of [
      "superadmin",
      "manager",
      "clinician",
      "finance",
      "laboratory",
      "registration",
      "dpo",
      "auditor",
    ]) {
      const u = await db.user.create({
        data: {
          email: role + marker + "@crud.invalid",
          name: "Synthetic " + role,
          role,
          passwordHash: "unusable",
          mfaSecret: encrypt("synthetic"),
        },
      });
      users.push(u.id);
      const token = crypto.randomUUID();
      tokens[role] = token;
      const s = await db.session.create({
        data: {
          userId: u.id,
          tokenHash: hash(token),
          stage: "full",
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      sessions.push(s.id);
    }
    const owner = await db.session.create({
      data: {
        tokenHash: hash(crypto.randomUUID()),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    ownerId = owner.id;
    sessions.push(owner.id);
    dayId =
      "2096-" +
      String(Math.floor(Math.random() * 10) + 1).padStart(2, "0") +
      "-" +
      String(Math.floor(Math.random() * 20) + 1).padStart(2, "0");
    await db.dayCapacity.create({ data: { id: dayId, capacity: 10 } });
    slotId = (
      await db.slot.create({
        data: {
          dayId,
          startsAt: new Date(dayId + "T09:00:00+07:00"),
          endsAt: new Date(dayId + "T10:00:00+07:00"),
          capacity: 3,
        },
      })
    ).id;
    orgId = (
      await db.organization.create({
        data: { name: marker, contactEncrypted: encrypt("Synthetic contact") },
      })
    ).id;
    orgs.push(orgId);
    serviceId = (
      await db.service.create({
        data: {
          code: "C-" + marker,
          nameTh: "Synthetic service",
          nameEn: "Test",
          category: "test",
          componentCodes: [],
        },
      })
    ).id;
    services.push(serviceId);
    packageId = (
      await db.package.create({
        data: {
          key: "C-" + marker,
          version: 1,
          name: "Synthetic package",
          description: "Synthetic",
          audience: "Synthetic",
          preparation: "Synthetic",
          fixedPrice: "100",
          effectiveFrom: new Date(),
          items: { create: { serviceId, position: 0 } },
        },
      })
    ).id;
    pkgs.push(packageId);
    invoiceId = (
      await db.invoice.create({
        data: { bookingId: "synthetic-" + marker, estimatedAmount: "100" },
      })
    ).id;
    invoices.push(invoiceId);
    privacyId = (
      await db.privacyRequest.create({
        data: { sessionId: ownerId, type: "access" },
      })
    ).id;
    requests.push(privacyId);
    waitId = (await db.waitlist.create({ data: { sessionId: ownerId, dayId } }))
      .id;
    waits.push(waitId);
    const latest = await db.questionnaire.aggregate({
      _max: { version: true },
    });
    const q = await db.questionnaire.create({
      data: {
        version: (latest._max.version ?? 0) + 1,
        questions: [
          { id: "synthetic", label: "Synthetic question", type: "text" },
        ],
        rules: [],
      },
    });
    qId = q.id;
    questionnaires.push(qId);
  });
  afterAll(async () => {
    await db.chatMessage.deleteMany({
      where: { conversationId: { in: chats } },
    });
    await db.chatConversation.deleteMany({ where: { id: { in: chats } } });
    await db.chatDepartment.deleteMany({ where: { id: { in: departments } } });
    await db.financeEntry.deleteMany({
      where: { invoiceId: { in: invoices } },
    });
    await db.invoice.deleteMany({ where: { id: { in: invoices } } });
    await db.privacyCaseEvent.deleteMany({
      where: { requestId: { in: requests } },
    });
    await db.privacyRequest.deleteMany({ where: { id: { in: requests } } });
    await db.waitlist.deleteMany({ where: { id: { in: waits } } });
    const changes = await db.bookingChange.findMany({
      where: { bookingId: { in: bookings } },
      select: { id: true },
    });
    await db.notification.deleteMany({
      where: { dedupKey: { in: changes.map((c) => c.id) } },
    });
    await db.bookingChange.deleteMany({
      where: { bookingId: { in: bookings } },
    });
    await db.booking.deleteMany({ where: { id: { in: bookings } } });
    await db.quote.deleteMany({ where: { id: { in: quotes } } });
    await db.registration.deleteMany({ where: { id: { in: registrations } } });
    await db.packageItem.deleteMany({ where: { packageId: { in: pkgs } } });
    await db.package.deleteMany({ where: { id: { in: pkgs } } });
    await db.price.deleteMany({ where: { serviceId: { in: services } } });
    await db.service.deleteMany({ where: { id: { in: services } } });
    await db.importBatch.deleteMany({ where: { id: { in: batches } } });
    await db.organization.deleteMany({ where: { id: { in: orgs } } });
    await db.questionnaire.deleteMany({
      where: { id: { in: questionnaires } },
    });
    await db.hold.deleteMany({ where: { slot: { dayId } } });
    await db.slot.deleteMany({ where: { dayId } });
    await db.dayCapacity.deleteMany({ where: { id: dayId } });
    await db.session.deleteMany({ where: { id: { in: sessions } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  });
  it("clinician can read packages but cannot create them", async () => {
    expect((await call("admin/packages", "clinician")).status).toBe(200);
    expect(
      (await call("admin/manage/packages", "clinician")).body.data.capabilities[
        "packages:write"
      ],
    ).toBe(false);
    expect((await call("admin/packages", "clinician", {})).status).toBe(403);
  });
  it("organization details are permission controlled and encrypted", async () => {
    expect(
      (await call("admin/manage/organizations/" + orgId, "registration"))
        .status,
    ).toBe(403);
    const r = await call("admin/manage/organizations/" + orgId, "manager");
    expect(r.status).toBe(200);
    expect(r.body.data.contact).toBe("Synthetic contact");
    expect(r.body.data.contactEncrypted).toBeUndefined();
    expect(
      (
        await call(
          "admin/manage/organizations/" + orgId,
          "manager",
          orgInput(0),
        )
      ).status,
    ).toBe(200);
    expect(
      (await db.organization.findUniqueOrThrow({ where: { id: orgId } }))
        .contactEncrypted,
    ).not.toContain("Synthetic contact");
  });
  it("stale organization update does not overwrite", async () =>
    expect(
      (
        await call(
          "admin/manage/organizations/" + orgId,
          "manager",
          orgInput(0),
        )
      ).status,
    ).toBe(409));
  it("search and pagination query all organization rows", async () => {
    for (let n = 0; n < 28; n++)
      orgs.push(
        (
          await db.organization.create({
            data: { name: marker + " " + n, contactEncrypted: encrypt("test") },
          })
        ).id,
      );
    const r = await call(
      "admin/manage/organizations?page=2&q=" + marker,
      "manager",
    );
    expect(r.status).toBe(200);
    expect(r.body.data.total).toBe(29);
    expect(r.body.data.rows).toHaveLength(4);
    expect(JSON.stringify(r.body)).not.toContain("contactEncrypted");
  });
  it("updates service metadata without fabricating a price", async () => {
    expect(
      (
        await call(
          "admin/manage/services/" + serviceId,
          "laboratory",
          svcInput(0),
        )
      ).status,
    ).toBe(200);
    const r = await call("admin/manage/services/" + serviceId, "laboratory");
    expect(r.body.data.nameEn).toBe("Revised");
    expect(r.body.data.prices).toHaveLength(0);
    expect(
      (await call("admin/manage/services/" + serviceId, "finance", svcInput(1)))
        .status,
    ).toBe(403);
  });
  it("cannot change stable service code through metadata update", async () =>
    expect(
      (
        await call("admin/manage/services/" + serviceId, "laboratory", {
          ...svcInput(1),
          code: "different",
        })
      ).status,
    ).toBe(422));
  it("approver can publish and linked service cannot be disabled", async () => {
    expect(
      (
        await call("admin/packages/status", "clinician", {
          id: packageId,
          status: "published",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call("admin/manage/services/" + serviceId, "laboratory", {
          ...svcInput(1),
          active: false,
        })
      ).status,
    ).toBe(409);
  });
  it("slot cannot close or reserve over live holds", async () => {
    await db.hold.create({
      data: {
        sessionId: ownerId,
        slotId,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    expect(
      (
        await call("admin/manage/slots/" + slotId, "manager", {
          capacity: 1,
          reservedCapacity: 1,
          closed: false,
          revision: 0,
          reason: "Synthetic change",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call("admin/manage/slots/" + slotId, "manager", {
          capacity: 3,
          reservedCapacity: 0,
          closed: true,
          revision: 0,
          reason: "Synthetic close",
        })
      ).status,
    ).toBe(409);
  });
  it("slot update preserves time and detects stale writes", async () => {
    expect(
      (
        await call("admin/manage/slots/" + slotId, "manager", {
          capacity: 4,
          reservedCapacity: 1,
          closed: false,
          revision: 0,
          reason: "Synthetic capacity",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call("admin/manage/slots/" + slotId, "manager", {
          capacity: 5,
          reservedCapacity: 0,
          closed: false,
          revision: 0,
          reason: "Stale capacity",
        })
      ).status,
    ).toBe(409);
    expect(
      (await db.slot.findUniqueOrThrow({ where: { id: slotId } })).dayId,
    ).toBe(dayId);
  });
  it("finance rejects billing before approval and unauthorized writes", async () => {
    expect((await financial("bill", "100")).status).toBe(409);
    expect(
      (await call("admin/manage/finance/" + invoiceId, "registration", {}))
        .status,
    ).toBe(403);
  });
  it("finance approval and bill maintain revisions", async () => {
    expect((await financial("approve", "100")).status).toBe(200);
    expect((await financial("bill", "101")).status).toBe(409);
    expect((await financial("bill", "100")).status).toBe(200);
  });
  it("payment retries return one ledger entry", async () => {
    const revision = (
        await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } })
      ).revision,
      idempotencyKey = crypto.randomUUID();
    const input = {
      action: "payment",
      amount: "40",
      reference: "Synthetic evidence",
      reason: "Synthetic payment",
      revision,
      idempotencyKey,
    };
    expect(
      (await call("admin/manage/finance/" + invoiceId, "finance", input))
        .status,
    ).toBe(200);
    const retry = await call(
      "admin/manage/finance/" + invoiceId,
      "finance",
      input,
    );
    expect(retry.body.data.duplicate).toBe(true);
    expect(await db.financeEntry.count({ where: { idempotencyKey } })).toBe(1);
    expect(
      (
        await call("admin/manage/finance/" + invoiceId, "finance", {
          ...input,
          amount: "41",
        })
      ).status,
    ).toBe(409);
  });
  it("concurrent payments cannot double-spend the outstanding amount", async () => {
    const revision = (
      await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } })
    ).revision;
    const responses = await Promise.all(
      [1, 2].map(() =>
        call("admin/manage/finance/" + invoiceId, "finance", {
          action: "payment",
          amount: "60",
          reference: "Synthetic concurrent",
          reason: "Synthetic payment",
          revision,
          idempotencyKey: crypto.randomUUID(),
        }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      (
        await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } })
      ).paidAmount!.toFixed(2),
    ).toBe("100.00");
  });
  it("finance blocks overpayment and voiding money still received", async () => {
    expect((await financial("payment", "0.01")).status).toBe(409);
    expect((await financial("void", "0")).status).toBe(409);
    expect((await financial("refund", "101")).status).toBe(409);
  });
  it("refund and void are ledger events with encrypted evidence", async () => {
    expect((await financial("refund", "100")).status).toBe(200);
    expect((await financial("void", "0")).status).toBe(200);
    expect((await financial("approve", "100")).status).toBe(409);
    const e = await db.financeEntry.findFirstOrThrow({
      where: { invoiceId },
      orderBy: { createdAt: "desc" },
    });
    expect(e.reasonEncrypted).not.toContain("Synthetic financial reason");
    expect(decrypt(e.reasonEncrypted)).toBe("Synthetic financial reason");
    const detail = await call("admin/manage/finance/" + invoiceId, "finance");
    expect(detail.body.data.entries.length).toBeGreaterThan(3);
    expect(detail.body.data.entries[0].reasonEncrypted).toBeUndefined();
  });
  it("PDPA requires explicit identity evidence before processing", async () => {
    const body = {
      action: "update",
      status: "under_review",
      assigneeId: null,
      reason: "Synthetic review",
      revision: 0,
    };
    expect(
      (await call("admin/manage/privacy/" + privacyId, "dpo", body)).status,
    ).toBe(200);
    expect(
      (
        await call("admin/manage/privacy/" + privacyId, "dpo", {
          ...body,
          revision: 1,
          status: "processing",
        })
      ).status,
    ).toBe(409);
    expect(
      (await call("admin/manage/privacy/" + privacyId, "manager", body)).status,
    ).toBe(403);
    expect(
      (
        await call("admin/manage/privacy/" + privacyId, "dpo", {
          ...body,
          revision: 1,
          action: "verify_identity",
          confirmed: false,
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await call("admin/manage/privacy/" + privacyId, "dpo", {
          ...body,
          revision: 1,
          action: "verify_identity",
          confirmed: true,
        })
      ).status,
    ).toBe(200);
  });
  it("PDPA lifecycle is audited and does not erase owner automatically", async () => {
    const body = {
      action: "update",
      assigneeId: null,
      reason: "Synthetic recorded outcome",
      revision: 2,
      status: "processing",
    };
    expect(
      (await call("admin/manage/privacy/" + privacyId, "dpo", body)).status,
    ).toBe(200);
    expect(
      (
        await call("admin/manage/privacy/" + privacyId, "dpo", {
          ...body,
          revision: 3,
          status: "completed",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call("admin/manage/privacy/" + privacyId, "dpo", {
          ...body,
          revision: 4,
          status: "under_review",
        })
      ).status,
    ).toBe(409);
    expect(
      await db.session.findUnique({ where: { id: ownerId } }),
    ).not.toBeNull();
    const e = await db.privacyCaseEvent.findFirstOrThrow({
      where: { requestId: privacyId },
    });
    expect(e.noteEncrypted).not.toContain("Synthetic");
    expect(
      (await call("admin/manage/privacy/" + privacyId, "dpo")).body.data
        .sessionId,
    ).toBeUndefined();
  });
  it("waitlist cannot claim appointment without matching actual booking", async () => {
    const input = {
      status: "contacted",
      assigneeId: null,
      reason: "Synthetic contact",
      revision: 0,
    };
    expect(
      (await call("admin/manage/waitlist/" + waitId, "registration", input))
        .status,
    ).toBe(200);
    expect(
      (
        await call("admin/manage/waitlist/" + waitId, "registration", {
          ...input,
          status: "scheduled",
          revision: 1,
          bookingReference: "not-real",
        })
      ).status,
    ).toBe(404);
    const reg = await db.registration.create({
      data: {
        ownerSessionId: ownerId,
        draftEncrypted: encrypt({
          firstName: "Synthetic",
          lastName: "Owner",
          phone: "test contact",
          medicalHistory: "NEVER_RETURN_HEALTH",
        }),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    registrations.push(reg.id);
    const q = await db.quote.create({
      data: {
        sessionId: ownerId,
        packageId,
        snapshot: {},
        fingerprint: "a".repeat(64),
        total: "100",
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    quotes.push(q.id);
    const b = await db.booking.create({
      data: {
        reference: "TEST-" + marker.slice(0, 25),
        registrationId: reg.id,
        sessionId: ownerId,
        slotId,
        quoteId: q.id,
        idempotencyKey: marker,
        requestHash: "b".repeat(64),
        checkInTokenHash: hash(marker),
        checkInTokenEncrypted: encrypt("synthetic"),
      },
    });
    bookings.push(b.id);
    expect(
      (
        await call("admin/manage/waitlist/" + waitId, "registration", {
          ...input,
          status: "scheduled",
          revision: 1,
          bookingReference: b.reference,
        })
      ).status,
    ).toBe(200);
    const detail = await call(
      "admin/manage/waitlist/" + waitId,
      "registration",
    );
    expect(detail.body.data.bookingReference).toBe(b.reference);
    expect(JSON.stringify(detail.body)).not.toContain("NEVER_RETURN_HEALTH");
    expect(detail.body.data.sessionId).toBeUndefined();
  });
  it("updates draft questionnaire and archives without changing published rules", async () => {
    expect(
      (
        await call("admin/questionnaires/update", "clinician", {
          id: qId,
          revision: 0,
          questions: [
            { id: "synthetic", label: "Synthetic question", type: "text" },
          ],
          rules: [],
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call("admin/questionnaires/update", "clinician", {
          id: qId,
          revision: 0,
          questions: [
            { id: "synthetic", label: "Synthetic question", type: "text" },
          ],
          rules: [],
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call("admin/questionnaires/archive", "clinician", {
          id: qId,
          revision: 1,
          reason: "Synthetic obsolete draft",
        })
      ).status,
    ).toBe(200);
  });
  it("CSV keeps leading zeros and malformed input returns422", async () => {
    const header =
      "service_code,service_name_th,service_name_en,category,standard_price,unit,effective_from,effective_to,status";
    const r = await upload(
      new File(
        [
          header +
            "\n00123,Synthetic,Test,test,100.00,ครั้ง,2026-10-30,,active",
        ],
        "synthetic.csv",
      ),
    );
    expect(r.status).toBe(200);
    expect(r.body.data.rows[0].service_code).toBe("00123");
    expect((await upload(new File(["not xlsx"], "bad.xlsx"))).status).toBe(422);
    expect(
      (await upload(new File([header], "synthetic.csv"), "{bad")).status,
    ).toBe(422);
  });
  it("cancels only unpublished batches with correct permission", async () => {
    const batch = batches[0];
    expect(
      (
        await call("admin/imports/cancel", "registration", {
          id: batch,
          reason: "Synthetic cancellation",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call("admin/imports/cancel", "laboratory", {
          id: batch,
          reason: "Synthetic cancellation",
        })
      ).status,
    ).toBe(200);
    expect(
      (await db.importBatch.findUniqueOrThrow({ where: { id: batch } })).status,
    ).toBe("cancelled");
  });
  it("privacy chat redaction is case scoped and idempotent", async () => {
    const caseRow = await db.privacyRequest.create({
      data: {
        sessionId: ownerId,
        type: "deletion",
        status: "processing",
        identityVerifiedAt: new Date(),
        identityVerifiedBy: users[0],
      },
    });
    requests.push(caseRow.id);
    const own = await db.chatConversation.create({
      data: {
        ownerSessionId: ownerId,
        departmentId: "health_check",
        noticeVersion: "synthetic",
        expiresAt: new Date(Date.now() + 3600000),
        lastSequence: 1,
      },
    });
    chats.push(own.id);
    const other = await db.chatConversation.create({
      data: {
        ownerSessionId: sessions[0],
        departmentId: "health_check",
        noticeVersion: "synthetic",
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    chats.push(other.id);
    await db.chatMessage.create({
      data: {
        conversationId: own.id,
        sequence: 1,
        clientId: crypto.randomUUID(),
        authorType: "user",
        bodyEncrypted: encrypt("Synthetic private chat"),
      },
    });
    const body = {
      revision: 0,
      reason: "Synthetic approved deletion evidence",
      confirmed: true,
    };
    expect(
      (
        await call(
          "admin/manage/privacy/" + caseRow.id + "/chats/" + other.id,
          "dpo",
          body,
        )
      ).status,
    ).toBe(404);
    expect(
      (await call("admin/chat/conversations/" + own.id + "/redact", "dpo", {}))
        .status,
    ).toBe(409);
    const list = await call(
      "admin/manage/privacy/" + caseRow.id + "/chats",
      "dpo",
    );
    expect(list.body.data.map((c: { id: string }) => c.id)).toContain(own.id);
    expect(JSON.stringify(list.body)).not.toContain("Synthetic private chat");
    expect(
      (
        await call(
          "admin/manage/privacy/" + caseRow.id + "/chats/" + own.id,
          "dpo",
          body,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          "admin/manage/privacy/" + caseRow.id + "/chats/" + own.id,
          "dpo",
          body,
        )
      ).body.data.duplicate,
    ).toBe(true);
    expect(
      decrypt(
        (
          await db.chatMessage.findFirstOrThrow({
            where: { conversationId: own.id },
          })
        ).bodyEncrypted,
      ),
    ).not.toBe("Synthetic private chat");
    expect(
      (await db.chatConversation.findUniqueOrThrow({ where: { id: other.id } }))
        .deletedAt,
    ).toBeNull();
  });
  it("department cannot close while a conversation remains open", async () => {
    const dep = "crud_" + marker.replace(/[^a-f]/g, "").slice(0, 10);
    departments.push(dep);
    expect(
      (
        await call("admin/chat/departments", "superadmin", {
          id: dep,
          name: "Synthetic dept",
          active: true,
        })
      ).status,
    ).toBe(200);
    const c = await db.chatConversation.create({
      data: {
        ownerSessionId: ownerId,
        departmentId: dep,
        noticeVersion: "synthetic",
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    chats.push(c.id);
    expect(
      (
        await call("admin/chat/departments", "superadmin", {
          id: dep,
          name: "Synthetic dept",
          active: false,
        })
      ).status,
    ).toBe(409);
    await db.chatConversation.update({
      where: { id: c.id },
      data: { status: "closed" },
    });
    expect(
      (
        await call("admin/chat/departments", "superadmin", {
          id: dep,
          name: "Synthetic dept",
          active: false,
        })
      ).status,
    ).toBe(200);
  });
  it("atomic first-use rate limiter handles concurrent requests", async () => {
    const key = "synthetic-crud:" + marker;
    try {
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () => rateLimit(key, 3, 60)),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
      for (const r of results)
        if (r.status === "rejected") expect(r.reason.status).toBe(429);
      expect(
        (await db.rateLimit.findUniqueOrThrow({ where: { key } })).count,
      ).toBe(8);
    } finally {
      await db.rateLimit.deleteMany({ where: { key } });
    }
  });
  it("staff reschedule uses capacity transaction and records patient agreement", async () => {
    const bookingId = bookings[0],
      target = await db.slot.create({
        data: {
          dayId,
          startsAt: new Date(dayId + "T11:00:00+07:00"),
          endsAt: new Date(dayId + "T12:00:00+07:00"),
          capacity: 1,
        },
      });
    const body = {
      slotId: target.id,
      idempotencyKey: crypto.randomUUID(),
      reason: "Synthetic patient agreement",
      patientAgreed: true,
    };
    expect(
      (
        await call(
          "admin/bookings/" + bookingId + "/reschedule",
          "clinician",
          body,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          "admin/bookings/" + bookingId + "/reschedule",
          "registration",
          { ...body, patientAgreed: false },
        )
      ).status,
    ).toBe(422);
    const h = await db.hold.create({
      data: {
        slotId: target.id,
        sessionId: ownerId,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    expect(
      (
        await call(
          "admin/bookings/" + bookingId + "/reschedule",
          "registration",
          body,
        )
      ).status,
    ).toBe(409);
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).slotId,
    ).toBe(slotId);
    await db.hold.update({
      where: { id: h.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(
      (
        await call(
          "admin/bookings/" + bookingId + "/reschedule",
          "registration",
          body,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          "admin/bookings/" + bookingId + "/reschedule",
          "registration",
          body,
        )
      ).status,
    ).toBe(200);
    expect(await db.bookingChange.count({ where: { bookingId } })).toBe(1);
    const a = await db.audit.findFirstOrThrow({
      where: { resourceId: bookingId, action: "booking.rescheduled" },
      orderBy: { createdAt: "desc" },
    });
    expect(a.actorId).toBe(users[5]);
    expect(JSON.stringify(a.metadata)).not.toContain(body.reason);
  });
});
