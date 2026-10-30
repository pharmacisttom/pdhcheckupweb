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
import { hash, encrypt } from "../../src/lib/security";
import { retrieve } from "../../src/server/services/chat/knowledge";
const enabled = process.env.RUN_DB_TESTS === "true";
describe.skipIf(!enabled)("Health Chat isolated MySQL", () => {
  const marker = crypto.randomUUID(),
    sessions: string[] = [],
    conversations: string[] = [],
    roots: string[] = [],
    users: string[] = [];
  let owner = "",
    other = "",
    agent = "",
    agentId = "",
    old: Awaited<ReturnType<typeof db.chatConfiguration.findUniqueOrThrow>>;
  async function call(path: string, token: string, data?: unknown) {
    context.token = token;
    const response = await api(
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
    return { status: response.status, body: await response.json() };
  }
  async function session(userId?: string) {
    const token = crypto.randomUUID();
    const row = await db.session.create({
      data: {
        tokenHash: hash(token),
        userId,
        stage: "full",
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    sessions.push(row.id);
    return token;
  }
  async function start() {
    const r = await call("chat/sessions", owner, {
      departmentId: "health_check",
      noticeVersion: marker,
      acknowledged: true,
    });
    expect(r.status).toBe(200);
    if (!conversations.includes(r.body.data.id))
      conversations.push(r.body.data.id);
    return r.body.data.id as string;
  }
  beforeAll(async () => {
    if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
      throw Error("test database required");
    vi.stubEnv("CHAT_ENABLED", "true");
    vi.stubEnv("CHAT_AI_ENABLED", "false");
    old = await db.chatConfiguration.findUniqueOrThrow({
      where: { id: "default" },
    });
    await db.chatConfiguration.update({
      where: { id: "default" },
      data: {
        enabled: true,
        aiEnabled: false,
        noticeVersion: marker,
        noticeText: "Synthetic test notice only. Not an approved real policy.",
        retentionDays: 1,
        policyApprovedAt: new Date(),
        policyApprovedBy: "synthetic",
      },
    });
    owner = await session();
    other = await session();
    const u = await db.user.create({
      data: {
        email: marker + "@chat.invalid",
        name: "Synthetic chat",
        passwordHash: "unusable-test",
        role: "registration",
        mfaSecret: encrypt("synthetic"),
      },
    });
    users.push(u.id);
    agent = await session(u.id);
    const a = await db.chatAgent.create({
      data: { userId: u.id, departmentId: "health_check" },
    });
    agentId = a.id;
  });
  afterAll(async () => {
    await db.chatKnowledgeCitation.deleteMany({
      where: { message: { conversationId: { in: conversations } } },
    });
    await db.chatAIUsage.deleteMany({
      where: { conversationId: { in: conversations } },
    });
    await db.chatFeedback.deleteMany({
      where: { conversationId: { in: conversations } },
    });
    await db.chatAssignment.deleteMany({
      where: { conversationId: { in: conversations } },
    });
    await db.chatMessage.deleteMany({
      where: { conversationId: { in: conversations } },
    });
    await db.chatConversation.deleteMany({
      where: { id: { in: conversations } },
    });
    await db.chatKnowledgeChunk.deleteMany({
      where: { version: { knowledgeId: { in: roots } } },
    });
    await db.chatKnowledgeVersion.deleteMany({
      where: { knowledgeId: { in: roots } },
    });
    await db.chatKnowledge.deleteMany({ where: { id: { in: roots } } });
    await db.chatAgent.deleteMany({ where: { userId: { in: users } } });
    await db.session.deleteMany({ where: { id: { in: sessions } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    if (old) {
      const { id, ...data } = old;
      await db.chatConfiguration.update({ where: { id }, data });
    }
    vi.unstubAllEnvs();
    await db.$disconnect();
  });
  it("requires current privacy acknowledgment", async () =>
    expect(
      (
        await call("chat/sessions", owner, {
          departmentId: "health_check",
          noticeVersion: "old",
          acknowledged: true,
        })
      ).status,
    ).toBeGreaterThanOrEqual(400));
  it("reuses an existing conversation", async () =>
    expect(await start()).toBe(await start()));
  it("does not expose another session conversation", async () => {
    const id = await start();
    expect(
      (await call("chat/messages?conversationId=" + id, other)).status,
    ).toBe(404);
  });
  it("queues personal health instead of external processing and deduplicates", async () => {
    const id = await start(),
      clientId = crypto.randomUUID(),
      data = { conversationId: id, clientId, text: "ผลตรวจของผม" };
    expect((await call("chat/messages", owner, data)).status).toBe(200);
    expect((await call("chat/messages", owner, data)).status).toBe(200);
    expect(
      await db.chatMessage.count({
        where: { conversationId: id, authorType: "user" },
      }),
    ).toBe(1);
    expect(
      (await db.chatConversation.findUniqueOrThrow({ where: { id } })).status,
    ).toBe("queued");
    expect(await db.chatAIUsage.count({ where: { conversationId: id } })).toBe(
      0,
    );
    const message = await db.chatMessage.findFirstOrThrow({
      where: { conversationId: id, authorType: "user" },
    });
    expect(message.bodyEncrypted).not.toContain(data.text);
  });
  it("rejects conflicting duplicate identifiers", async () => {
    const id = await start(),
      m = await db.chatMessage.findFirstOrThrow({
        where: { conversationId: id, authorType: "user" },
      });
    expect(
      (
        await call("chat/messages", owner, {
          conversationId: id,
          clientId: m.clientId,
          text: "ข้อความอื่น",
        })
      ).status,
    ).toBe(409);
  });
  it("staff accepts and private notes remain private", async () => {
    const id = await start();
    expect(
      (
        await call("admin/chat/conversations/" + id + "/assign", agent, {
          agentId,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call("admin/chat/conversations/" + id + "/note", agent, {
          text: "Synthetic internal note",
          clientId: crypto.randomUUID(),
        })
      ).status,
    ).toBe(200);
    const publicResult = await call(
      "chat/messages?conversationId=" + id,
      owner,
    );
    expect(
      publicResult.body.data.messages.some(
        (m: { authorType: string }) => m.authorType === "note",
      ),
    ).toBe(false);
    const staffResult = await call("admin/chat/conversations/" + id, agent);
    expect(
      staffResult.body.data.messages.some(
        (m: { authorType: string }) => m.authorType === "note",
      ),
    ).toBe(true);
    expect(staffResult.body.data.ownerSessionId).toBeUndefined();
  });
  it("transfer removes old department access", async () => {
    const id = await start();
    expect(
      (
        await call("admin/chat/conversations/" + id + "/transfer", agent, {
          departmentId: "general_info",
        })
      ).status,
    ).toBe(200);
    expect((await call("admin/chat/conversations/" + id, agent)).status).toBe(
      403,
    );
  });
  it("retrieval excludes drafts expired and internal content", async () => {
    for (const [status, visibility, expired] of [
      ["draft", "public", false],
      ["published", "internal", false],
      ["published", "public", true],
    ] as const) {
      const root = await db.chatKnowledge.create({
        data: {
          topicKey: crypto.randomUUID(),
          departmentId: "health_check",
          category: "test",
          visibility,
        },
      });
      roots.push(root.id);
      await db.chatKnowledgeVersion.create({
        data: {
          knowledgeId: root.id,
          version: 1,
          question: marker,
          answer: "Synthetic approved text",
          keywords: [marker],
          status,
          authorId: users[0],
          startsAt: new Date(Date.now() - 86400000),
          expiresAt: new Date(Date.now() + (expired ? -1000 : 86400000)),
        },
      });
    }
    expect((await retrieve(marker, "health_check")).matches).toEqual([]);
  });
  it("delayed provider cannot answer after human takeover and sends public evidence only", async () => {
    const conversationId = await start();
    const root = await db.chatKnowledge.create({
      data: {
        topicKey: crypto.randomUUID(),
        departmentId: "health_check",
        category: "test",
      },
    });
    roots.push(root.id);
    const version = await db.chatKnowledgeVersion.create({
      data: {
        knowledgeId: root.id,
        version: 1,
        question: "Synthetic approved public question",
        answer: "Synthetic approved public answer",
        keywords: ["alphaunique", "betaunique"],
        status: "published",
        authorId: users[0],
        startsAt: new Date(Date.now() - 1000),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    await db.chatConfiguration.update({
      where: { id: "default" },
      data: {
        aiEnabled: true,
        monthlyRequestLimit: 10,
        monthlyTokenLimit: 100000,
        monthlyBudgetUsd: 1,
      },
    });
    for (const [k, v] of Object.entries({
      CHAT_AI_ENABLED: "true",
      CHAT_EXTERNAL_PROCESSING_APPROVED: "true",
      CHAT_AI_PROVIDER: "openai",
      CHAT_AI_MODEL: "synthetic-model",
      CHAT_AI_API_KEY: "synthetic-test-key",
      CHAT_AI_MAX_CALL_USD: "0.01",
    }))
      vi.stubEnv(k, v);
    let begin!: () => void, release!: (response: Response) => void;
    const started = new Promise<void>((resolve) => {
      begin = resolve;
    });
    const gate = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const outgoing: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init: RequestInit) => {
        outgoing.push(String(init.body));
        begin();
        return gate;
      }),
    );
    try {
      const text = "alphaunique betaunique raw user wording never transmitted";
      const pending = call("chat/messages", owner, {
        conversationId,
        clientId: crypto.randomUUID(),
        text,
      });
      await Promise.race([
        started,
        new Promise((_, reject) =>
          setTimeout(() => reject(Error("provider not reached")), 5000),
        ),
      ]);
      expect(outgoing[0]).not.toContain("raw user wording");
      expect(outgoing[0]).toContain("Synthetic approved public answer");
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM ChatConversation WHERE id=${conversationId} FOR UPDATE`;
        await tx.chatConversation.update({
          where: { id: conversationId },
          data: {
            status: "active",
            assignedAgentId: agentId,
            aiPending: false,
            generation: { increment: 1 },
          },
        });
      });
      release(
        new Response(
          JSON.stringify({
            output: [
              {
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({ id: version.id }),
                  },
                ],
              },
            ],
            usage: { input_tokens: 40, output_tokens: 10 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
      expect((await pending).status).toBe(200);
      expect(
        await db.chatMessage.count({
          where: { conversationId, authorType: "assistant" },
        }),
      ).toBe(0);
    } finally {
      release(new Response("{}"));
      vi.unstubAllGlobals();
      vi.stubEnv("CHAT_AI_ENABLED", "false");
      await db.chatConfiguration.update({
        where: { id: "default" },
        data: { aiEnabled: false },
      });
    }
  });
  it("global kill switch hides public widget configuration", async () => {
    vi.stubEnv("CHAT_ENABLED", "false");
    expect((await call("chat/config", owner)).body.data.enabled).toBe(false);
    vi.stubEnv("CHAT_ENABLED", "true");
  });
});
