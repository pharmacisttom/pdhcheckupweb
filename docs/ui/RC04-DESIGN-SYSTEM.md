# PDH Smart Health Check — RC04 Design System
**Hospital:** โรงพยาบาลปลวกแดง จังหวัดระยอง  
**Branch:** `feature/rc04-ui-impeccable-playwright`  
**Standard:** Professional Healthcare Impeccable Design System

---

## 1. Design Principles & Vision

1. **Clinical Clarity & High Contrast:**  
   ข้อมูลทางการแพทย์ต้องมีความชัดเจนสูงสุด มีคอนทราสต์ที่ผ่านเกณฑ์ WCAG AAA/AA เพื่อให้บุคลากรทางการแพทย์และประชาชนทุกช่วงวัยสามารถอ่านค่าสถานะและข้อมูลได้อย่างถูกต้องแม่นยำ

2. **Calm Healthcare Aesthetic:**  
   ลดความตึงเครียดของผู้รับบริการด้วยโทนสี Deep Navy (`#0f2e4a`) ผสานกับ Hospital Teal (`#008577`), Light Teal Surface (`#f0fdfa`) และ Crisp Slate Neutral (`#f8fafc`) โดยหลีกเลี่ยงสีฉูดฉาด การใช้ gradients ที่รกตา หรือการซ้อนการ์ดหลายชั้น (nested cards)

3. **Accessibility First (A11y):**  
   - การนำทางผ่านคีย์บอร์ด (Focus visible ring 3px offset)
   - มาตรฐาน Touch Target ขั้นต่ำ 44x44px บนอุปกรณ์พกพา
   - รองรับหน้าจอแคบสุด 320px โดยไม่มีการเลื่อนแนวนอน (Zero Horizontal Overflow)

---

## 2. Design Tokens (`src/app/globals.css`)

```css
:root {
  /* Brand & Hospital Primary */
  --primary: #008577;            /* Hospital Teal */
  --primary-dark: #00695c;       /* Deep Teal */
  --primary-light: #e0f2f1;      /* Soft Mint Tint */
  --primary-subtle: #f0fdfa;     /* Background Accent */

  /* Navigation & Chrome */
  --sidebar: #0f2e4a;            /* Professional Deep Navy */
  --sidebar-hover: #163d61;      /* Navy Soft Highlight */
  --sidebar-active: #008577;     /* Active Item Hospital Teal */
  --accent: #0d9488;             /* Interactive Teal */

  /* Surfaces & Backgrounds */
  --bg: #f8fafc;                 /* Crisp Slate Neutral 50 */
  --surface: #ffffff;            /* Pure White Card */
  --surface-raised: #ffffff;

  /* Typography & Text */
  --text: #0f172a;               /* High-contrast Slate 900 */
  --text-secondary: #334155;     /* Slate 700 */
  --muted: #64748b;              /* Slate 500 */
  --border: #e2e8f0;             /* Border Slate 200 */
  --border-focus: #0d9488;

  /* Status Colors */
  --danger: #b91c1c;             /* Clinical Alert Red */
  --danger-light: #fef2f2;
  --warning: #b45309;            /* Action Warning Amber */
  --warning-light: #fffbeb;
  --success: #15803d;            /* Verified Success Green */
  --success-light: #f0fdf4;

  /* Standard Radii */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius: 16px;
  --radius-lg: 20px;

  /* Standard Shadows */
  --shadow-xs: 0 1px 2px rgba(15, 23, 42, 0.05);
  --shadow-sm: 0 1px 3px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.04);
  --shadow-md: 0 4px 6px -1px rgba(15, 23, 42, 0.08), 0 2px 4px -2px rgba(15, 23, 42, 0.04);
  --shadow-lg: 0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.03);
}
```

---

## 3. Typography Hierarchy

- **Font Family:** `"Sarabun", "Noto Sans Thai", Tahoma, Arial, sans-serif`
- **Headings:**
  - `h1`: 30px (Desktop), 26px (Tablet), 22px (Mobile) — Letter spacing -0.5px
  - `h2`: 24px (Desktop), 20px (Mobile)
  - `h3`: 17px (Desktop), 16px (Mobile)
- **Body:** 14px / Line height 1.7
- **Caption / Metadata:** 11px–12px / Muted slate

---

## 4. Key UI Components Modernized

1. **Public App Shell (`src/app/(public)/layout.tsx`):**
   - Header พร้อม Brand logo คมชัด
   - Footer แสดงช่องทางการติดต่อทางการแพทย์ พร้อม Official Brand Icons (LINE, Facebook) และข้อมูลที่ตั้งโรงพยาบาลปลวกแดง
2. **Admin Sidebar & Shell (`src/components/admin-shell.tsx`):**
   - จัดหมวดหมู่เมนูอย่างเป็นระบบ 4 กลุ่ม:
     1. ภาพรวมและสื่อสาร (Dashboard, Chat, Chat Reports)
     2. บริการและคลินิก (Appointments, Booking Control, Contact Requests, Packages, Questionnaires, Calendar, Waitlist, Lab & Pricing)
     3. การเงินและองค์กร (Organizations, Quotations, Billing, Reports)
     4. ความปลอดภัยและระบบ (Users, Chat Settings, Privacy, Audit, Password)
   - Active state indicator ชัดเจน
   - ปรับปรุงการเปิด/ปิดเมนูมือถือด้วย Radix Dialog
3. **Public Health Package Card (`src/components/ui.tsx`):**
   - ใช้ Lucide HeartPulse, Check, ArrowRight พร้อม Accessible ARIA attributes
   - ปรับแต่ง Badge สถานะ และการแสดงราคาที่เด่นชัด
