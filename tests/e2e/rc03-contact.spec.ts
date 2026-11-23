import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { syntheticStaff } from "./staff-fixture";
import { encrypt, hash } from "../../src/lib/security";
import { verifyRc02TestDatabase } from "../../scripts/test-db-guard.mjs";
const db = new PrismaClient(),
  marker = crypto.randomUUID();
const reference = "RC03-UI-" + marker.slice(0, 16);
let verifiedDatabase = false,
  registrationId = "",
  contactId = "",
  ownerId = "";
let staff: Awaited<ReturnType<typeof syntheticStaff>> | undefined;
test.beforeAll(async () => {
  await verifyRc02TestDatabase(db, process.env.DATABASE_URL ?? "");
  verifiedDatabase = true;
  staff = await syntheticStaff();
  ownerId = (
    await db.session.create({
      data: {
        tokenHash: hash(marker),
        expiresAt: new Date(Date.now() + 3600000),
      },
    })
  ).id;
  registrationId = (
    await db.registration.create({
      data: {
        ownerSessionId: ownerId,
        draftEncrypted: encrypt({
          firstName: "Synthetic",
          phone: "+66812345678",
        }),
        expiresAt: new Date(Date.now() + 3600000),
      },
    })
  ).id;
  contactId = (
    await db.contactRequest.create({
      data: {
        registrationId,
        sessionId: ownerId,
        reference,
        status: "submitted",
        payloadEncrypted: encrypt({
          person: {
            firstName: "PrivateSynthetic",
            lastName: marker,
            phone: "+66812345678",
            heightCm: 170,
            weightKg: 70,
          },
          answers: { snoring_history: "unknown" },
          questionnaireVersion: 1,
        }),
      },
    })
  ).id;
});
test.afterAll(async () => {
  if (verifiedDatabase) {
    if (contactId)
      await db.contactRequest.deleteMany({ where: { id: contactId } });
    if (registrationId)
      await db.registration.deleteMany({ where: { id: registrationId } });
    if (ownerId) await db.session.deleteMany({ where: { id: ownerId } });
    await staff?.cleanup();
  }
  await db.$disconnect();
});
test("contact list keeps PHI out, opens audited modal and restores keyboard focus", async ({
  page,
  context,
}) => {
  const token = crypto.randomUUID();
  await db.session.create({
    data: {
      userId: staff!.id,
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  await context.addCookies([
    {
      name: "pdh_session",
      value: token,
      url: "http://localhost:3037",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto("/admin/contact-requests");
  await page.getByLabel("ค้นหาเลขอ้างอิง", { exact: true }).fill(reference);
  const listResponse = page.waitForResponse(
    (r) =>
      r.url().includes("admin/contact-requests?") &&
      r.url().includes("search="),
  );
  await page.getByRole("button", { name: "ค้นหา", exact: true }).click();
  const payload = await (await listResponse).json();
  expect(JSON.stringify(payload)).not.toMatch(
    /PrivateSynthetic|66812345678|snoring_history/,
  );
  const trigger = page.getByRole("button", {
    name: "เปิดรายละเอียด " + reference,
    exact: true,
  });
  await expect(trigger).toBeVisible();
  await expect(
    page.getByText("PrivateSynthetic", { exact: false }),
  ).toHaveCount(0);
  await trigger.focus();
  await page.keyboard.press("Enter");
  const modal = page.getByRole("dialog");
  await expect(modal).toContainText("PrivateSynthetic");
  await expect(modal).toContainText("snoring_history");
  await page.keyboard.press("Tab");
  expect(
    await modal.evaluate((el) => el.contains(document.activeElement)),
  ).toBe(true);
  await page.screenshot({
    path: "docs/qa/2026-11-23/rc03-contact-desktop.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  await expect(modal).toBeVisible();
  await page.screenshot({
    path: "docs/qa/2026-11-23/rc03-contact-mobile.png",
    fullPage: true,
  });
  await modal
    .getByRole("button", { name: "ปิดรายละเอียด", exact: true })
    .click();
  expect(
    await db.audit.count({
      where: {
        resourceId: contactId,
        actorId: staff!.id,
        action: "contact_request.detail_viewed",
      },
    }),
  ).toBe(2);
});
