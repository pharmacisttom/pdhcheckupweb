import { spawn } from "node:child_process";
import { join } from "node:path";
import { AppError } from "./core";
const resolve = (name: string) => join(process.cwd(), "node_modules", name);
const worker = String.raw`let b=Buffer.alloc(0);process.stdin.on('data',c=>{b=Buffer.concat([b,c]);if(b.length>1048576)process.exit(2)});process.stdin.on('end',async()=>{try{let text='';if(process.argv[1]==='pdf'){const{PDFParse}=require(process.argv[2]);const p=new PDFParse({data:new Uint8Array(b),isEvalSupported:false,useSystemFonts:false});const info=await p.getInfo();if(info.total>40)throw Error('pages');const r=await p.getText();text=r.text;await p.destroy();}else{const yauzl=require(process.argv[3]);await new Promise((ok,fail)=>yauzl.fromBuffer(b,{lazyEntries:true,validateEntrySizes:true},(e,z)=>{if(e)return fail(e);let size=0,n=0,word=false;z.on('entry',v=>{size+=v.uncompressedSize;n++;if(size>5242880||n>200||v.generalPurposeBitFlag&1||v.fileName.includes('..')||v.fileName.startsWith('/')){z.close();return fail(Error('zip'));}if(v.fileName==='word/document.xml')word=true;z.readEntry();});z.on('end',()=>word?ok():fail(Error('type')));z.on('error',fail);z.readEntry();}));const m=require(process.argv[2]);text=(await m.extractRawText({buffer:b},{externalFileAccess:false})).value;}if(text.length>12000)throw Error('text');process.stdout.write(text);}catch{process.exitCode=2}});`;
export async function extractKnowledge(file: File) {
  const data = Buffer.from(await file.arrayBuffer());
  if (!data.length || data.length > 1048576)
    throw new AppError(413, "เอกสารต้องไม่เกิน 1 MB");
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "txt") {
    if (!["text/plain", "application/octet-stream", ""].includes(file.type))
      throw new AppError(422, "ชนิดไฟล์ไม่ถูกต้อง");
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(data);
    } catch {
      throw new AppError(422, "TXT ต้องเป็น UTF-8");
    }
    if (text.includes("\0") || text.length > 12000)
      throw new AppError(422, "กรุณาแบ่งเอกสารให้ไม่เกิน 12000 ตัวอักษร");
    return text;
  }
  if (ext !== "pdf" && ext !== "docx")
    throw new AppError(422, "รองรับ PDF DOCX TXT เท่านั้น");
  if (
    ext === "pdf" &&
    (!data.subarray(0, 5).equals(Buffer.from("%PDF-")) ||
      !["application/pdf", "application/octet-stream", ""].includes(file.type))
  )
    throw new AppError(422, "PDF ไม่ถูกต้อง");
  if (
    ext === "docx" &&
    (!data.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4])) ||
      ![
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/octet-stream",
        "",
      ].includes(file.type))
  )
    throw new AppError(422, "DOCX ไม่ถูกต้อง");
  return new Promise<string>((ok, fail) => {
    const child = spawn(
      process.execPath,
      [
        "--max-old-space-size=96",
        "-e",
        worker,
        ext,
        ext === "pdf" ? resolve("pdf-parse") : resolve("mammoth"),
        resolve("yauzl"),
      ],
      {
        stdio: ["pipe", "pipe", "ignore"],
        windowsHide: true,
        env: {
          NODE_ENV: process.env.NODE_ENV,
          PATH: process.env.PATH,
          SYSTEMROOT: process.env.SYSTEMROOT,
        },
      },
    );
    let output = Buffer.alloc(0),
      settled = false;
    const timer = setTimeout(() => finish(false), 5000);
    function finish(success: boolean) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      if (success && output.length) ok(output.toString("utf8"));
      else
        fail(new AppError(422, "อ่านเอกสารไม่ได้ หรือเกินขีดจำกัดเวลา/ขนาด"));
    }
    child.stdout.on("data", (c) => {
      output = Buffer.concat([output, c]);
      if (output.length > 60000) finish(false);
    });
    child.on("error", () => finish(false));
    child.stdin.on("error", () => finish(false));
    child.on("close", (code) => finish(code === 0));
    child.stdin.end(data);
  });
}
