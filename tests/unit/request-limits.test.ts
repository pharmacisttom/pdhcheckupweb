import { describe, expect, it } from "vitest";
import { boundedRequest } from "../../src/lib/request-limits";
const streamed = (parts: string[], length?: string) =>
  new Request("http://localhost:3036/api/v1/test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(length ? { "Content-Length": length } : {}),
    },
    body: new ReadableStream({
      start(controller) {
        parts.forEach((p) => controller.enqueue(new TextEncoder().encode(p)));
        controller.close();
      },
    }),
    duplex: "half",
  } as RequestInit);
describe("pentest: measured request limits", () => {
  it("rejects oversized chunked bodies without a Content-Length", async () => {
    await expect(
      boundedRequest(streamed(["a".repeat(60), "b".repeat(60)]), 100),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("rejects underreported Content-Length and byte-sized unicode overflow", async () => {
    await expect(
      boundedRequest(streamed(["x".repeat(101)], "1"), 100),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      boundedRequest(streamed(["ก".repeat(34)]), 100),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("rejects a declared excess before reading the stream", async () => {
    await expect(
      boundedRequest(streamed(["ok"], "101"), 100),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("preserves headers and bounded JSON content for parsing", async () => {
    const req = await boundedRequest(streamed(['{"ok":', "true}"]), 100);
    expect(await req.json()).toEqual({ ok: true });
    expect(req.headers.get("content-length")).toBe("11");
  });
});
