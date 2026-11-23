import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
let old: Awaited<ReturnType<typeof db.chatConfiguration.findUniqueOrThrow>>;
test.beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
    throw Error("test database required");
  old = await db.chatConfiguration.findUniqueOrThrow({
    where: { id: "default" },
  });
  await db.chatConfiguration.update({
    where: { id: "default" },
    data: {
      enabled: true,
      aiEnabled: false,
      noticeVersion: "synthetic-browser",
      noticeText: "ข้อความทดสอบสำหรับ browser เท่านั้น ไม่ใช่นโยบายจริง",
      retentionDays: 1,
      policyApprovedAt: new Date(),
      policyApprovedBy: "synthetic",
    },
  });
});
test.afterAll(async () => {
  if (old) {
    const { id, ...data } = old;
    await db.chatConfiguration.update({ where: { id }, data });
  }
  await db.$disconnect();
});
for (const width of [360, 390, 430, 768, 820, 1024, 1280])
  test("chat consent layout " + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const trigger = page.getByRole("button", { name: "เปิด PDH Health Chat" });
    await expect(trigger).toBeVisible();
    const box = await trigger.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await trigger.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "เริ่มสนทนา", exact: true }),
    ).toBeDisabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const panel = await page.getByRole("dialog").boundingBox();
    expect(panel!.x).toBeGreaterThanOrEqual(0);
    expect(panel!.x + panel!.width).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: "docs/qa/2026-10-30/chat-consent-" + width + ".png",
    });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });

test("public handoff to staff and internal note isolation", async ({
  page,
  browser,
}) => {
  const { hash, encrypt } = await import("../../src/lib/security");
  const token = crypto.randomUUID();
  const user = await db.user.create({
    data: {
      email: token + "@chat-browser.invalid",
      name: "Synthetic chat browser",
      passwordHash: "unusable",
      role: "registration",
      mfaSecret: encrypt("synthetic"),
    },
  });
  const agent = await db.chatAgent.create({
    data: { userId: user.id, departmentId: "health_check" },
  });
  await db.session.create({
    data: {
      userId: user.id,
      tokenHash: hash(token),
      stage: "full",
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  const staff = await browser.newContext();
  let id = "";
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "เปิด PDH Health Chat" }).click();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "เริ่มสนทนา", exact: true }).click();
    await expect(page.locator("#chat-message")).toBeVisible();
    await page
      .locator("#chat-message")
      .fill("Synthetic browser general question");
    await page.getByRole("button", { name: "ส่ง", exact: true }).click();
    await expect(page.getByText(/รอเจ้าหน้าที่ · ลำดับคิว/)).toBeVisible();
    const current = await (
      await page.request.get("/api/v1/chat/current")
    ).json();
    id = current.data.id;
    await staff.addCookies([
      {
        name: "pdh_session",
        value: token,
        url: "http://localhost:3037",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const inbox = await staff.newPage();
    await inbox.goto("/admin/chat");
    await inbox
      .getByRole("button")
      .filter({ hasText: id.slice(-8) })
      .click();
    await inbox
      .getByRole("button", { name: "รับบทสนทนา", exact: true })
      .click();
    await inbox
      .getByLabel("ข้อความ", { exact: true })
      .fill("Synthetic staff reply");
    await inbox
      .getByRole("button", { name: "ส่งข้อความ", exact: true })
      .click();
    await expect(
      page.getByText("Synthetic staff reply", { exact: true }),
    ).toBeVisible();
    await inbox.getByRole("checkbox").check();
    await inbox
      .getByLabel("ข้อความ", { exact: true })
      .fill("Synthetic confidential internal note");
    await inbox
      .getByRole("button", { name: "บันทึกภายใน", exact: true })
      .click();
    await expect(
      inbox.getByText("Synthetic confidential internal note", { exact: true }),
    ).toBeVisible();
    const publicMessages = await (
      await page.request.get("/api/v1/chat/messages?conversationId=" + id)
    ).json();
    expect(JSON.stringify(publicMessages)).not.toContain(
      "Synthetic confidential internal note",
    );
    await inbox.goto("/admin/chat/knowledge");
    await inbox
      .getByLabel("รหัสหน่วยงาน เช่น health_check", { exact: true })
      .fill("health_check");
    await inbox
      .getByLabel("รหัสหัวข้อคงที่", { exact: true })
      .fill("browser-" + token);
    await inbox.getByLabel("หมวดหมู่", { exact: true }).fill("test");
    await inbox
      .getByLabel("คำถาม", { exact: true })
      .fill("Synthetic browser FAQ " + token);
    await inbox
      .getByLabel("คำค้น คั่นด้วยเครื่องหมาย ,", { exact: true })
      .fill("synthetic, browser");
    await inbox
      .getByLabel("คำตอบ", { exact: true })
      .fill("Synthetic approved draft text");
    await inbox
      .getByLabel("เริ่มเผยแพร่", { exact: true })
      .fill(new Date(Date.now() - 86400000).toISOString().slice(0, 16));
    await inbox
      .getByLabel("หมดอายุ", { exact: true })
      .fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
    await inbox
      .getByRole("button", { name: "บันทึกแบบร่าง", exact: true })
      .click();
    await expect(inbox.getByRole("status")).toHaveText("บันทึกเรียบร้อย");
    await inbox
      .locator("article")
      .filter({ hasText: token })
      .getByRole("button", { name: "แก้ไขโดยสร้างรุ่นใหม่" })
      .click();
    await expect(inbox.getByLabel("คำตอบ", { exact: true })).toHaveValue(
      "Synthetic approved draft text",
    );
    await inbox
      .getByLabel("คำตอบ", { exact: true })
      .fill("Synthetic revised draft text");
    await inbox
      .getByRole("button", { name: "บันทึกแบบร่าง", exact: true })
      .click();
    await expect(
      inbox.locator("article").filter({ hasText: token }),
    ).toHaveCount(2);
    await inbox.goto("/admin/chat");
    await inbox
      .getByRole("button")
      .filter({ hasText: id.slice(-8) })
      .click();
    await inbox.screenshot({
      path: "docs/qa/2026-10-30/chat-staff-inbox-1280.png",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "docs/qa/2026-10-30/chat-active-390.png" });
  } finally {
    await staff.close();
    if (id) {
      await db.chatKnowledgeCitation.deleteMany({
        where: { message: { conversationId: id } },
      });
      await db.chatAIUsage.deleteMany({ where: { conversationId: id } });
      await db.chatFeedback.deleteMany({ where: { conversationId: id } });
      await db.chatAssignment.deleteMany({ where: { conversationId: id } });
      await db.chatMessage.deleteMany({ where: { conversationId: id } });
      await db.chatConversation.delete({ where: { id } });
    }
    const roots = await db.chatKnowledge.findMany({
      where: { topicKey: "browser-" + token },
      select: { id: true },
    });
    const rootIds = roots.map((r) => r.id);
    await db.chatKnowledgeChunk.deleteMany({
      where: { version: { knowledgeId: { in: rootIds } } },
    });
    await db.chatKnowledgeVersion.deleteMany({
      where: { knowledgeId: { in: rootIds } },
    });
    await db.chatKnowledge.deleteMany({ where: { id: { in: rootIds } } });
    await db.chatAgent.delete({ where: { id: agent.id } });
    await db.session.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  }
});
