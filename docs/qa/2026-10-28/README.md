# ผลทดสอบและภาพหน้าจอ — 28 ตุลาคม 2569

ทดสอบใน Windows local workspace นี้ ไม่ใช่ production และไม่ใช่อุปกรณ์จริง

| การตรวจ | ผลที่รันจริง |
| --- | --- |
| npm run typecheck | ผ่าน ไม่มี TypeScript errors |
| npm run build | ผ่าน Next.js optimized production build ในเครื่อง ไม่ deploy |
| npm run lint | 0 errors, 1 warning เดิม: TanStack Table / React Compiler ใน data-table.tsx |
| npm run test:unit | 62 ผ่าน จาก 12 files ไม่มี skip |
| npm run test:db | 46 ผ่าน จาก 9 files ไม่มี skip; ใช้ pdh_healthcheck_test เท่านั้น |
| npm run test:interest:e2e | 16 ผ่าน ไม่มี skip; Chromium browser emulation, localhost:3037 และฐานทดสอบ |

รัน flow จริงซ้ำเฉพาะกรณีหลังปรับข้อความยืนยันนัดครั้งสุดท้ายด้วย: 1 ผ่าน (20 วินาที) เป็น testcase เดิมที่รันซ้ำ ไม่รวมซ้ำเป็น 17 tests

Browser checks: ความกว้าง 360, 390, 430, 768, 820, 1024, 1280 pixels; แนวนอน 768×360, 1024×768, 1180×820, 1280×800; ตรวจไม่มี horizontal overflow, ปุ่มเมนูมือถืออย่างน้อย 44×44, keyboard Tab และการแสดงฟอนต์ห้าภาษา

Flow ผ่านฐานจริง: อ่าน privacy → กรอกข้อมูล → OTP ทดสอบ → สลับภาษาโดย OTP/ข้อมูลยังอยู่ → เพิ่ม/ลบ NCD ญาติแบบโครงสร้าง → ส่งความสนใจโดยไม่มีแพ็กเกจ/quote → เจ้าหน้าที่ตรวจข้อมูลและสิทธิ → เสนอราคา → ผู้ใช้ยอมรับราคาและวันเวลา → Booking จริง/QR → เปิดแบบร่างรูปแบบเก่า → จองออนไลน์ผ่านหน้าจอเดิม → กู้นัดจากอีก browser context ด้วย OTP+เลขนัด+วันเกิด และตรวจว่า session เดิมไม่เห็นนัดที่โอนแล้ว

Integration checks รวม ownership, การส่งซ้ำพร้อมกัน, การสร้างนัดซ้ำ, คิวเต็ม, ราคาเปลี่ยน/หมดอายุ, ปิดรับจองออนไลน์แต่เจ้าหน้าที่นัดได้, สถานะที่ไม่อนุญาต, ข้อมูลเพิ่มเติม, การเข้ารหัส และ permission regression เดิม

รอบก่อนหน้าใช้ Webpack dev พบ manifest JSON อ่านไม่ครบและ browser timeout จึงเปลี่ยน dev/test server เป็น Turbopack และแยก cache ใน .local/next-interest; ผลด้านบนเป็นรอบยืนยันหลังแก้ ไม่มีการเปิด retry เพื่อซ่อน failure

ข้อจำกัด: ไม่ได้รัน Safari/WebKit หรือ browser suite เก่าทั้งชุด; ทดสอบ flow เดิมผ่าน regression scenario ใหม่นี้และ integration suite เดิม ไม่ได้ทดสอบ iPhone/Android/iPad/Android tablet จริง, คีย์บอร์ดของระบบปฏิบัติการจริง, VoiceOver/TalkBack/NVDA หรือ SMS จริง การ resize viewport/keyboard Tab ไม่ใช่ผลทดสอบคีย์บอร์ดและ screen reader บนอุปกรณ์จริง คำแปลสุขภาพ/ความเป็นส่วนตัวยังต้องให้ผู้เชี่ยวชาญตรวจทาน

ภาพทั้งหมดเป็นข้อมูลสังเคราะห์จากฐานทดสอบ ไม่มีข้อมูลผู้ป่วยจริง QR ทดสอบไม่มีผลหลัง cleanup fixtures

## ภาพหน้าจอ (31 PNG)

- [confirmed-booking-390.png](confirmed-booking-390.png)
- [home-1024.png](home-1024.png)
- [home-1280.png](home-1280.png)
- [home-360.png](home-360.png)
- [home-390.png](home-390.png)
- [home-430.png](home-430.png)
- [home-768.png](home-768.png)
- [home-820.png](home-820.png)
- [interest-submitted-390.png](interest-submitted-390.png)
- [landscape-1024x768.png](landscape-1024x768.png)
- [landscape-1180x820.png](landscape-1180x820.png)
- [landscape-1280x800.png](landscape-1280x800.png)
- [landscape-768x360.png](landscape-768x360.png)
- [language-en-390.png](language-en-390.png)
- [language-en-820.png](language-en-820.png)
- [language-km-390.png](language-km-390.png)
- [language-km-820.png](language-km-820.png)
- [language-my-390.png](language-my-390.png)
- [language-my-820.png](language-my-820.png)
- [language-zh-Hans-390.png](language-zh-Hans-390.png)
- [language-zh-Hans-820.png](language-zh-Hans-820.png)
- [online-booking-390.png](online-booking-390.png)
- [recovered-booking-390.png](recovered-booking-390.png)
- [register-1024.png](register-1024.png)
- [register-1280.png](register-1280.png)
- [register-360.png](register-360.png)
- [register-390.png](register-390.png)
- [register-430.png](register-430.png)
- [register-768.png](register-768.png)
- [register-820.png](register-820.png)
- [staff-review-820.png](staff-review-820.png)
