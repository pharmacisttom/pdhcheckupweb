# PDH Smart Health Check — RC04 Visual Regression & Viewport Verification
**Hospital:** โรงพยาบาลปลวกแดง จังหวัดระยอง  
**Audit Viewports:** 320px (SE), 390px (iPhone), 768px (iPad Mini), 1024px (iPad Pro), 1440px (Desktop)  
**Comparison:** RC03 Baseline ([`docs/qa/2026-11-23/`](2026-11-23/)) vs RC04 Verified Screenshots ([`docs/qa/2026-11-26/`](2026-11-26/))

---

## 1. Viewport Matrix Results (Public + Authenticated Admin)

| Viewport Width | Device Target | Public Portal | Admin Dashboard & Drawer | Contact Requests Table & Modal | Touch Targets | Result |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **320px** | iPhone SE / Compact | 0px overflow (`rc04-public-320.png`) | 0px overflow + Drawer (`rc04-admin-dashboard-320.png`) | 0px overflow | >= 44x44px | **PASS** |
| **390px** | iPhone 12/13/14 | 0px overflow (`rc04-public-390.png`) | 0px overflow + Drawer (`rc04-admin-drawer-390.png`) | Modal + Swal (`rc04-admin-contact-modal-390.png`, `rc04-admin-swal-stacking-390.png`) | >= 44x44px | **PASS** |
| **768px** | Tablet Portrait | 0px overflow (`rc04-public-768.png`) | 0px overflow + Drawer (`rc04-admin-dashboard-768.png`) | 0px overflow | >= 44x44px | **PASS** |
| **1024px** | Tablet Landscape / Laptop | 0px overflow (`rc04-public-1024.png`) | Sidebar + Grid (`rc04-admin-dashboard-1024.png`) | 0px overflow | Standard Pointer | **PASS** |
| **1440px** | Desktop HD | 0px overflow (`rc04-public-1440.png`) | 4-Category Sidebar (`rc04-admin-dashboard-1440.png`) | Modal + Swal (`rc04-admin-contact-modal-1440.png`, `rc04-admin-swal-stacking-1440.png`) | Standard Pointer | **PASS** |

---

## 2. Before / After Screenshot & Defect Fixes Evidence

- **RC03 Baseline Reference:** `docs/qa/2026-11-23/rc03-register-320.png`, `rc03-register-390.png`, `rc03-register-1440.png`
- **RC04 Captured Evidence (`docs/qa/2026-11-26/`):**
  - Public Portal: `rc04-public-320.png`, `rc04-public-390.png`, `rc04-public-768.png`, `rc04-public-1024.png`, `rc04-public-1440.png`
  - Multilingual Public: `rc04-public-lang-en-390.png`, `rc04-public-lang-my-390.png` (พร้อมตรวจสอบ `th`, `zh-Hans`, `km` ใน Playwright)
  - Authenticated Admin: `rc04-admin-dashboard-320.png`, `rc04-admin-dashboard-768.png`, `rc04-admin-dashboard-1024.png`, `rc04-admin-dashboard-1440.png`, `rc04-admin-drawer-390.png`
  - Modals & SweetAlert2 Stacking: `rc04-admin-contact-modal-390.png`, `rc04-admin-contact-modal-1440.png`, `rc04-admin-swal-stacking-390.png`, `rc04-admin-swal-stacking-1440.png`
- **UI/A11y Issues Caught and Resolved During RC04 Verification:**
  1. `src/components/admin-shell.tsx`: เพิ่ม `aria-current="page"` ให้ลิงก์แถบเมนูด้านข้าง, เพิ่ม `aria-hidden="true"` ให้ไอคอนประกอบ, และเพิ่ม `drawerTriggerRef` + `onCloseAutoFocus` เพื่อคืนโฟกัสกลับปุ่มเปิดเมนูที่ผู้ใช้กดจริงเมื่อปิด Mobile Drawer ด้วยปุ่ม `Escape`
  2. `src/components/managed-records.tsx`: เพิ่มการป้องกัน `onInteractOutside`, `onPointerDownOutside`, และ `onEscapeKeyDown` เมื่อมี `.swal2-container` เปิดอยู่ เพื่อไม่ให้การกด "ยกเลิก" บน SweetAlert2 ปิด Radix Dialog ของแบบฟอร์มแก้ไขโดยไม่ตั้งใจ

---

## 3. Contrast Ratio, State & Multilingual Verification

| Element / Token Pair | Foreground | Background | Measured Ratio | WCAG Target |
| :--- | :--- | :--- | :---: | :--- |
| Primary Heading / Body (`--text` on white) | `#0f172a` | `#ffffff` | **17.85:1** | AAA (>= 7:1) |
| Secondary Text (`--text-secondary` on white) | `#334155` | `#ffffff` | **10.35:1** | AAA (>= 7:1) |
| Muted Text / Labels (`--muted` on white) | `#64748b` | `#ffffff` | **4.76:1** | AA (>= 4.5:1) |
| Primary CTA Button (white on `--primary`) | `#ffffff` | `#008577` | **4.54:1** | AA (>= 4.5:1) |
| Primary Hover Button (white on `--primary-dark`) | `#ffffff` | `#00695c` | **6.61:1** | AA+ (>= 4.5:1) |
| Active Admin Sidebar Item | `#ffffff` | `#087f78` | **4.86:1** | AA (>= 4.5:1) |
| Sidebar Category Header (`.nav-label`) | `#94b5be` | `#0f2e4a` | **6.37:1** | AA+ (>= 4.5:1) |

- **Loading / Empty / Error States:** ทดสอบผ่าน Playwright ทั้งหน้า Public Package List และ Admin Dashboard / Contact Requests แล้ว แสดงผลสถานะ `.loading[role="status"]`, `.empty`, และ `.alert.error[role="alert"]` ได้ครบถ้วน
- **Thai & Multilingual Rendering:** สลับภาษา `th`, `en`, `zh-Hans`, `my`, `km` และตรวจสอบ `<html lang="...">` พร้อม Zero Horizontal Overflow บน 390px ผ่านทุกภาษา (หมายเหตุ: ข้อความส่วนท้าย `"ช่องทางติดต่อ:"` และ `"อ.ปลวกแดง จ.ระยอง 21140"` ยังคงแสดงผลเป็นภาษาไทยเป็น fallback เมื่อเลือกภาษาอื่นเนื่องจากยังไม่มีคีย์แปลในพจนานุกรม ไม่กระทบการใช้งานหรือโครงสร้างหน้าจอ)
