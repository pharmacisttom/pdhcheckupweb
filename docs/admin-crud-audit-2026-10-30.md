# ตรวจความครบของ CRUD หลังบ้าน — 2026-10-30

ตรวจ source บน branch feature/pdh-health-chat commit f63ca09 เทียบ UI, API, services และ RBAC ไม่ใช่ผลทดสอบ production หรือ browser ทุกเมนู ไม่ได้แก้ข้อมูลจริง ไม่ได้เปลี่ยน implementation และไม่ได้รัน tests ใหม่สำหรับรายงานนี้ งาน mobile เดิมใน working tree คงไว้

## ผลสำคัญ

1. **สูง — ผู้อนุมัติแพ็กเกจเปิดรายการไม่ได้ตามสิทธิ์ปกติ**: clinician มี packages:approve แต่ GET admin/packages ต้อง packages:write ซึ่ง clinician ไม่มี การกด API อนุมัติด้วย ID อาจผ่าน แต่หน้าโหลดรายการไม่ได้ ตรวจ src/lib/security.ts:154 และ src/server/api.ts:1260 แนวแก้: permission อ่านแยกและให้ผู้อนุมัติอ่านฉบับร่างได้ โดยไม่เพิ่มสิทธิ์เขียนโดยไม่จำเป็น ทดสอบ manager/clinician/registration แยกกัน
2. **สูง — การเงิน/ใบเสนอราคาเป็นหน้าดูข้อมูลเดียวกัน**: ทั้งสองเมนูชี้ admin/quotations และ API อ่าน Invoice ไม่มี API อนุมัติยอด เรียกเก็บ รับชำระ ยกเลิก/ปรับปรุงยอด รวมถึงไม่มี finance:write การสร้าง quote สำหรับคำขอผ่าน review เป็นคนละ flow ไม่ใช่หน้าเอกสารองค์กรที่สมบูรณ์ ตรวจ src/components/admin-workspace.tsx:37 และ src/server/api.ts:1466 ต้องกำหนดสถานะ/หลักฐาน/สิทธิ์และรายการปรับปรุงแบบมี audit ก่อนเพิ่มการเขียนยอด ห้ามใส่ปุ่มแก้ยอดโดยตรงแล้วถือว่าจบ
3. **สูง — องค์กรสร้างแล้วแก้ข้อมูลไม่ได้**: GET คืนชื่อ สถานะ วันที่ ไม่มีรายละเอียดผู้ประสานงานสำหรับผู้มีสิทธิ์; มี POST create แต่ไม่มี detail/update/status endpoint และ UI ไม่มี action ต้องเพิ่มแก้ชื่อ/ผู้ประสานงานที่เข้ารหัส และปิดใช้งาน พร้อมตรวจความเชื่อมโยงก่อนเปลี่ยนสถานะ
4. **กลาง — รายการตรวจ/ราคาไม่มีหน้าจัดการ master โดยตรง**: มีนำเข้า/เปรียบเทียบ/อนุมัติแบบคนละคน แต่ไม่มีแก้ metadata/ดูประวัติราคาเต็ม/ยกเลิกชุด staged ใน UI/API ชื่อไทยหรือหมวดเดิมไม่ตรงจะถูกปฏิเสธ ส่วนชื่ออังกฤษและหน่วยของรายการเดิมในไฟล์ไม่ถูกอัปเดต (upsert update เฉพาะ active) ต้องแยกแก้ master กับออก price version อย่าแก้ทับราคาเก่าที่ถูกอ้างอิง ตรวจ src/server/services/imports.ts:128
5. **กลาง — ช่วงเวลาให้บริการสร้างได้แต่แก้ไม่ได้**: admin/slots มี create ส่วน admin/calendar ปรับความจุ/ปิดวันได้ ไม่มี update/disable slot ต้องใช้ lock/transaction และคำนวณ Booking/Hold/องค์กรก่อนลดความจุหรือปิด slot ห้ามลบ slot ที่มีนัด
6. **กลาง — คิวรอดูได้อย่างเดียว**: GET admin/waitlist + ตาราง ไม่มีรับเรื่อง/ติดต่อ/ปิดคำขอ/ยกเลิก/จัดสรรผ่าน UI/API หน้าจอแจ้งอยู่แล้วว่ายังไม่มีการจัดสรร/แจ้งเตือนอัตโนมัติ ต้องสร้างนัดผ่าน service ตรวจความจุเดิม ไม่เปลี่ยน status เป็นนัดแล้วลอย ๆ
7. **กลาง — แพ็กเกจแก้โดยสร้างรุ่นได้ แต่ไม่มีปุ่มเติมค่าจากรายการเดิม**: ผู้ใช้ต้องพิมพ์ key/รายละเอียด/รายการตรวจใหม่เอง ไม่มีแก้ฉบับร่างในที่เดิม มี publish/archive จึงไม่ใช่ไม่มี Update ทั้งหมด ควรเพิ่ม clone-to-version/prefill และ preview รายการตรวจ ห้ามเขียนทับรุ่นที่มี Booking อ้างอิง
8. **กลาง — คำขอ PDPA ดูได้แต่ทำ workflow ไม่ได้**: admin/privacy มี GET เท่านั้น ไม่มีรายละเอียดตามสิทธิ์/การตรวจตัวตน/ผู้รับผิดชอบ/สถานะ/เหตุผล/ปิดเรื่อง ข้อจำกัดนี้ไม่ใช่สิทธิ์ลบข้อมูลคนไข้ได้ทันที ต้องออกแบบอนุมัติและ retention ตามนโยบายจริง
9. **กลาง — แบบประเมินยังเป็น JSON editor**: สร้าง/อ่าน/คัดลอกเป็นรุ่น/อนุมัติได้ ไม่มีแก้ draft ในที่เดิมหรือถอนฉบับแบบ UI ต้องประเมินผลต่อ draft/quote เก่าก่อนเพิ่ม lifecycle และใช้ผู้ทบทวนทางคลินิก ไม่สร้างกฎใหม่เอง
10. **กลาง — หน่วยงาน Chat มี API แต่ไม่มีฟอร์มจัดการ**: POST admin/chat/departments รองรับ upsert/active แต่ settings UI มีเฉพาะสมาชิกหน่วยงานและรายการหน่วยงาน ทำให้เพิ่ม/เปลี่ยนชื่อ/ปิดหน่วยงานผ่าน UI ไม่ได้ ต้องเช็กคิวและการโอนก่อนปิด
11. **กลาง — Chat privacy redaction มี API แต่ไม่มี action ในหน้าผู้รับผิดชอบ PDPA**: API :id/redact ใช้ chat:privacy แต่ DPO ไม่มี inbox read ต้องมี workflow ค้น/ตรวจสอบคำร้องที่จำกัดข้อมูล ไม่เปิด inbox ทั้งหมดเพียงเพื่อให้ลบได้
12. **แยกต่างหาก — HTTP503 หน้า lab-pricing บน production ยังไม่ทราบต้นเหตุ**: เป็น incident ที่ผู้ใช้รายงาน ไม่ได้พิสูจน์ว่าแก้ CRUD แล้วจะหาย ต้องทราบ endpoint/method/response และเทียบ release/schema/config จริงก่อน ไม่ได้ตรวจ VPS ใน audit นี้

## ตารางความสามารถปัจจุบัน

| เมนู | เพิ่ม | อ่าน | แก้ไข/ดำเนินการ | ลบ/ปิด | สถานะช่องว่าง |
|---|---|---|---|---|---|
| เจ้าหน้าที่ | เชิญ/สร้าง | รายการ/ประวัติ | บัญชี/role/metadata/invite/MFA ตามสิทธิ์ | ปิดบัญชี/เพิกถอน | มี lifecycle ใช้แทนลบจริง; ไม่ได้ทดสอบซ้ำรอบนี้ |
| เปิดปิดจองออนไลน์ | singleton | มี | เปิด/ปิด/ข้อความ | ปิดบริการ | ไม่ต้องมี create/delete รายแถว |
| คำขอติดต่อนัด | ผู้ใช้ส่ง | เจ้าหน้าที่อ่านตามสิทธิ์ | มอบหมาย/ทบทวน/สิทธิ/ขอข้อมูล/เสนอราคา/นัด | ปิดเรื่อง | ไม่ควรแก้ทับ intake ที่ยืนยันแล้ว |
| นัดหมาย | ผ่าน booking service | มีรายการ | check-in/no-show/สถานะ/ยกเลิก | ยกเลิก ไม่ลบ | หน้า staff ไม่มีแก้ข้อมูล/เลื่อนนัดครบ; public มี flow เลื่อน/ยกเลิกแยก |
| แพ็กเกจ | draft version | มีแต่ RBAC approver มีปัญหา | รุ่นใหม่/อนุมัติ | archive | ขาด prefill/details/edit draft |
| แบบประเมิน | draft version | มี | copy JSON/อนุมัติ | ไม่พบ action ถอนใน UI/API | UI ยังเป็น JSON |
| ปฏิทิน | วันและ slot | มี | วันมี update, slot ไม่มี | blackout ระดับวัน | ขาด slot lifecycle |
| คิวรอ | ผู้ใช้ลงชื่อ | มี | ไม่มี staff action | ไม่มี staff action | อ่านอย่างเดียว |
| รายการตรวจ/ราคา | import | ชุดนำเข้า/เปรียบเทียบ | อนุมัติ/นำเข้ารุ่นใหม่ | active จากไฟล์ | ขาด master editor และ cancel batch |
| องค์กร | มี | รายการสรุป | ไม่มี | ไม่มี | ขาด CRUD หลัก |
| ใบเสนอราคา/การเงิน | Invoice จาก Booking | มี | ไม่มี financial action ในเมนูนี้ | ไม่มี | ยังเป็น read-only |
| รายงาน | ไม่ใช้ create | สรุป30วัน | export/พิมพ์ | ไม่ใช้ delete | ขาดช่วงวันที่/ตัวกรอง ไม่ใช่ CRUD bug |
| PDPA | ผู้ใช้สร้างคำร้อง | รายการสรุป | ไม่มี staff workflow | ไม่มี | ขาดดำเนินคำร้อง |
| Audit | ระบบสร้าง | มี | ไม่ควรแก้ | ไม่ควรลบจากหน้า | read-only เป็นพฤติกรรมที่ถูกต้อง |
| Chat inbox | ผู้ใช้เริ่ม | จำกัดหน่วยงาน | รับ/ตอบ/มอบหมาย/โอน/เปิดใหม่/notes | ปิดเรื่อง/redact API | มี lifecycle; redact UI ยังขาด |
| Chat knowledge | draft/import | มี versions | รุ่นใหม่/review/publish | archive | ไม่แก้ทับ published |
| Chat settings | สมาชิกผ่าน upsert | มี | notice/policy/สมาชิก/kill | ปิดสมาชิก/บริการ | department CRUD API ยังไม่มี UI |

## ข้อจำกัดร่วม

- UI หลายหน้าวาดปุ่มโดยไม่ได้รับ capability ตาม role จึงเห็นปุ่มที่ API ปฏิเสธได้; การซ่อนปุ่มไม่ทดแทน server guard
- ตารางจำนวนมากจำกัด take30/50/100/200 และค้นหาเฉพาะข้อมูลที่โหลด ไม่ใช่ค้นหาฐานข้อมูลทั้งหมด ต้องเพิ่ม pagination/search ฝั่ง server ก่อนใช้งานข้อมูลมาก
- การไม่มี DELETE HTTP ไม่ใช่หลักฐานว่าระบบผิด แอปใช้ POST actions อยู่แล้ว ปัญหาคือ lifecycle/action ที่ขาดจริง
- ผู้อนุมัติราคาต้องคนละบัญชีกับผู้นำเข้า เป็นข้อบังคับที่มีจริง ไม่ควรเปิดให้ superadmin ข้ามแบบเงียบ ๆ
- รายงานนี้ไม่ยืนยันว่า VPS รัน commit f63ca09 และไม่ใช้ผล unit/integration เก่าเป็นหลักฐานว่า CRUD ที่ยังขาดผ่านแล้ว

## ลำดับแก้ที่เสนอจากผลตรวจ

1. วิเคราะห์503แยก incident และแก้ role อ่านแพ็กเกจสำหรับ approver
2. องค์กร detail/update/disable + master รายการตรวจ/ประวัติราคา + clone แพ็กเกจ
3. Slot lifecycle + staff waitlist actions ผ่าน capacity service เดิม
4. Finance และ PDPA ต้องกำหนดสถานะ/หลักฐาน/สิทธิ์ที่ชัดเจนก่อนเพิ่ม mutations
5. Department Chat UI + privacy request redaction workflow; pagination/capabilities ทุกเมนู

การตรวจรับแต่ละกลุ่ม: ทดสอบสิทธิ์อนุญาต/ปฏิเสธทุก action, ownership/ข้ามหน่วยงาน, duplicate/concurrency, ความจุ/ราคา/ประวัติเดิม และ audit บนฐานข้อมูลทดสอบเท่านั้น จากนั้น browser ตาม role และ staging ก่อน production

## Implementation follow-up — 2026-10-31

The findings above are the original read-only snapshot. CRUD fixes, new role-aware UI/API, additive history/revision migration, rate-limiter concurrency fix and actual tests are documented in ADMIN_CRUD_HANDOFF_2026-10-31.md. Production503 remains unverified; organization quotation documents/payment gateway/automatic broad PDPA erasure are not claimed.
