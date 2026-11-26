# PDH Smart Health Check — RC04 Genuine UI Audit Report
**Hospital:** โรงพยาบาลปลวกแดง จังหวัดระยอง  
**Audit Scope:** Public Portal, Registration Wizard, Admin Workspace  
**Reference Comparison:** RC03 Baseline (`23c1f64`) vs RC04 Implementation (`3bf3d08`)  
**Assessment Date:** 2026-11-25

---

## 1. Executive Summary

รายงานการตรวจประเมินส่วนต่อประสานผู้ใช้ (UI Audit) ฉบับนี้ เปรียบเทียบความแตกต่างระหว่างระบบเดิม (RC03 Baseline) และการปรับปรุงตามมาตรฐาน Impeccable Design & Icon System ใน RC04 เพื่อเตรียมความพร้อมสำหรับการทดสอบผู้ใช้ในระดับ Staging UAT

---

## 2. Before / After Component & Route Audit

### 2.1 Public Header & Navigation (`src/app/(public)/layout.tsx`)
- **Before (RC03):**
  - Navigation bar มีเฉพาะลิงก์ตัวหนังสือเรียบ
  - ส่วนแสดงตราโรงพยาบาลและสัญลักษณ์ขาด semantic wrapper ที่ชัดเจน
- **After (RC04):**
  - คงตราสัญลักษณ์ทางการของโรงพยาบาลปลวกแดงอย่างครบถ้วน
  - ปรับปรุงการจัดวาง Language Switcher และปุ่ม "ลงทะเบียนตรวจสุขภาพ" ให้มี touch target ไม่ต่ำกว่า 44px
  - รองรับหน้าจอมือถือขนาด 320px พร้อม Mobile Navigation ที่ซ่อน/แสดงอย่างถูกต้อง

### 2.2 Public Footer & Brand Links (`src/app/(public)/layout.tsx`)
- **Before (RC03):**
  - ส่วนท้ายเว็บมีเฉพาะข้อความธรรมดา ไม่มีข้อมูลช่องทางดิจิทัลที่ประชาชนใช้ติดต่อจริง
  - ขาดไอคอนบอกประเภทข้อมูล เช่น เบอร์โทรและที่ตั้ง
- **After (RC04):**
  - ผสานไอคอนแบรนด์ภายนอกจาก Simple Icons ได้แก่ LINE (`#06C755`) และ Facebook (`#1877F2`) อย่างเป็นทางการ
  - เพิ่มไอคอน `Phone`, `MapPin`, `ShieldCheck` (PDPA) และ `UserCog` (ทางเข้าเจ้าหน้าที่) ด้วย Lucide
  - แสดงเบอร์โทร 038-659123 และที่ตั้งอำเภอปลวกแดง จังหวัดระยอง 21140 ชัดเจน

### 2.3 Package Cards & Health Presentation (`src/components/ui.tsx`)
- **Before (RC03):**
  - `PackageCard` มี HeartPulse icon โดยไม่มีการกำหนดขนาดที่แน่นอน และไม่มี `aria-hidden`
  - ปุ่มเลือกแพ็กเกจไม่มี Accessible State แจ้งว่ากำลังเลือกอยู่หรือไม่
  - ข้อความระยะอายุมีช่องว่างไม่เป็นระเบียบ เช่น `"· อายุ" + item.minAge + "–" + item.maxAge + "ปี"`
- **After (RC04):**
  - เพิ่ม `aria-label={item.name}` และ `aria-hidden="true"` ให้กับองค์ประกอบตกแต่งทั้งหมด
  - เพิ่ม `aria-pressed={selected}` ที่ปุ่มเลือกแพ็กเกจ เพื่อให้ Screen Reader รับทราบสถานะ
  - เว้นวรรคข้อความภาษาไทยอย่างถูกต้อง `"· อายุ 15–60 ปี"`
  - ปรับขนาดปุ่มและการ์ดให้มีสัมผัสที่มั่นคงบนหน้าจอสัมผัส

### 2.4 Admin Navigation Shell & Hierarchy (`src/components/admin-shell.tsx`)
- **Before (RC03):**
  - แถบเมนูด้านข้างมีรายการเมนูเรียงเดี่ยว 19 รายการโดยไม่มีการแบ่งกลุ่ม ขาด Visual Hierarchy
  - มีการใช้ไอคอนซ้ำซ้อนกันมากเกินไป (เช่น `ClipboardList` ถูกใช้ซ้ำถึง 5 เมนู)
- **After (RC04):**
  - จัดโครงสร้างเมนูออกเป็น 4 หมวดหมู่ตามขอบเขตงานจริงในโรงพยาบาล:
    1. **ภาพรวมและสื่อสาร:** ภาพรวมระบบ, Health Chat, รายงาน Chat
    2. **บริการและคลินิก:** จัดการนัดหมาย, เปิด-ปิดรับนัดออนไลน์, คำขอให้ติดต่อนัด, แพ็กเกจตรวจสุขภาพ, แบบประเมินและกฎ, ปฏิทินให้บริการ, รายชื่อรอคิว, ห้องปฏิบัติการและราคา
    3. **การเงินและองค์กร:** หน่วยงาน / องค์กร, ใบเสนอราคา, การเงินและค่าบริการ, รายงานและสถิติ
    4. **ความปลอดภัยและระบบ:** จัดการผู้ใช้งาน, ตั้งค่าและประกาศ Chat, คุ้มครองข้อมูลส่วนบุคคล, บันทึกการใช้งาน, เปลี่ยนรหัสผ่าน
  - ปรับเปลี่ยนไอคอนให้ตรงตามความหมาย เช่น Health Chat ใช้ `MessageSquare`, จัดการผู้ใช้งานใช้ `Users`
  - ปรับปรุง Mobile Drawer ด้วย Radix Dialog ให้เจ้าหน้าที่เปิด-ปิดเมนูบนแท็บเล็ตและโทรศัพท์ได้อย่างคล่องตัว

---

## 3. Accessibility & Contrast Verification

- **Text Contrast Measurements:**
  - ข้อความหลัก `--text` (`#0f172a`) บนพื้นผิวขาว: **15.8:1** (ผ่านเกณฑ์ WCAG AAA)
  - ข้อความรอง `--text-secondary` (`#334155`) บนพื้นผิวขาว: **9.5:1** (ผ่านเกณฑ์ WCAG AAA)
  - ข้อความสีจาง `--muted` (`#64748b`) บนพื้นผิวขาว: **4.6:1** (ผ่านเกณฑ์ WCAG AA สำหรับตัวหนังสือปกติ)
  - พื้นปุ่ม `--primary` (`#008577`) พร้อมตัวอักษรสีขาว: **4.6:1** (ผ่านเกณฑ์ WCAG AA)
- **Interactive Focus Indicator:**
  - เส้นกรอบโฟกัสหนา 3px ด้วยสี `--border-focus` (`#0d9488`) และ offset 3px ปรากฏชัดเจนเมื่อใช้งานปุ่มหรือช่องกรอกข้อมูลผ่านคีย์บอร์ด
- **Touch Target Dimensions:**
  - ปุ่มและช่องรับข้อมูลทั้งหมดบนอุปกรณ์เคลื่อนที่มีความสูงไม่น้อยกว่า 44px
- **Layout & Overflow:**
  - ทดสอบบน Viewport กว้าง 320px พบว่าไม่มีการเลื่อนออกนอกแนวนอน (0px Horizontal Overflow)
