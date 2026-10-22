import { AppError } from "./security";

// Content-Length is only an early rejection hint: chunked/HTTP2 bodies still
// have to be measured before JSON or multipart parsing allocates their contents.
export async function boundedRequest(
  req: Request,
  maxBytes: number,
): Promise<Request> {
  const declared = req.headers.get("content-length");
  if (declared !== null && !/^\d+$/.test(declared))
    throw new AppError(400, "Content-Length ไม่ถูกต้อง");
  if (declared !== null && Number(declared) > maxBytes)
    throw new AppError(413, "คำขอมีขนาดใหญ่เกินไป");
  if (!req.body) return req;
  const reader = req.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        void reader.cancel().catch(() => {});
        throw new AppError(413, "คำขอมีขนาดใหญ่เกินไป");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  const headers = new Headers(req.headers);
  headers.delete("transfer-encoding");
  headers.set("content-length", String(size));
  return new Request(req.url, {
    method: req.method,
    headers,
    body: Buffer.concat(chunks),
  });
}
