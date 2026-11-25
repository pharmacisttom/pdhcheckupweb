# PDH Smart Health Check — RC04 Icon Mapping Catalog
**Hospital:** โรงพยาบาลปลวกแดง จังหวัดระยอง  
**Module:** `src/components/icons.tsx`  
**Icon Libraries:** `lucide-react` (v1.61.0) & `@icons-pack/react-simple-icons` (v12.4.0)
**Review Standard:** Healthcare Accessibility & Design Integrity

---

## 1. Icon Architecture & Standard Rules

- **Zero Functional Emojis:** ไม่อนุญาตให้ใช้อิโมจิแทนไอคอนคำสั่ง นำทาง หรือสื่อสารสถานะทางการแพทย์
- **Standardized Sizing Tokens:**
  - `xs`: 14px (ตาราง แบดจ์ ข้อมูลเสริม)
  - `sm`: 16px (ปุ่มขนาดเล็ก รายการเช็คลิสต์)
  - `md`: 20px (Default สำหรับปุ่มและเมนูส่วนใหญ่)
  - `lg`: 24px (หัวข้อการ์ด จุดเน้น)
  - `xl`: 32px (ส่วนสรุป หัวข้อโมดูล)
  - `xxl`: 40px (Hero section, Featured status)
- **Consistent Stroke Width:** `1.85` สำหรับ Lucide icons ทั้งหมด
- **Accessibility:**
  - ทุกไอคอนที่เป็นภาพประกอบหรือใช้คู่กับข้อความจะมี `aria-hidden="true"` โดยค่าเริ่มต้น
  - สำหรับ icon-only button (ปุ่มที่มีเฉพาะไอคอน) ต้องระบุ `aria-label` หรือ `title` กำกับเสมอ
  - Tree-shakeable static imports เพื่อป้องกันการโหลดทั้งชุด bundle

---

## 2. Centralized Icon Mapping Catalog

| Domain / Concept | Lucide Component | Semantic Purpose | Standard Size |
| :--- | :--- | :--- | :--- |
| **Dashboard** | `LayoutDashboard` | ภาพรวมระบบและสถิติหลัก | 17px–20px |
| **Patients** | `Users` | รายชื่อผู้รับบริการและข้อมูลประชากร | 17px–20px |
| **Registration** | `ClipboardList` | แบบฟอร์มลงทะเบียนและคำขอรับบริการ | 17px–20px |
| **Questionnaire** | `ClipboardCheck` | แบบประเมินสุขภาพและกฎคัดกรอง | 17px–20px |
| **Appointments** | `CalendarDays` | จัดการนัดหมายและตารางเวลา | 17px–20px |
| **Organizations** | `Building2` | หน่วยงานคู่สัญญาและองค์กร | 17px–20px |
| **Clinical Lab** | `FlaskConical` | บริการทางห้องปฏิบัติการและราคา | 17px–20px |
| **Medical / BMI** | `Activity` / `HeartPulse` | ค่าดัชนีมวลกาย สุขภาพ และแพ็กเกจ | 20px–24px |
| **Settings** | `Settings` | การตั้งค่าระบบ | 17px–20px |
| **Security / MFA / PDPA** | `ShieldCheck` | ความปลอดภัย สิทธิ์ และความยินยอม | 17px–20px |
| **Audit Logs** | `ScrollText` / `Activity` | บันทึกประวัติการใช้งานระบบ | 17px–20px |
| **Quotation / Billing** | `FileText` / `Coins` | เอกสารการเงินและใบเสนอราคา | 17px–20px |
| **Chat / Messaging** | `MessageSquare` | PDH Health Chat และให้คำปรึกษา | 17px–20px |
| **Edit** | `Pencil` | แก้ไขข้อมูล | 16px |
| **Delete / Remove** | `Trash2` | ลบหรือยกเลิกรายการ | 16px |
| **Search** | `Search` | ค้นหาข้อมูล | 16px–18px |
| **Filter** | `Filter` | กรองข้อมูลตามเงื่อนไข | 16px–18px |
| **Save** | `Save` | บันทึกข้อมูล | 16px–18px |
| **Back / Forward** | `ArrowLeft` / `ArrowRight` | นำทางขั้นตอนการทำงาน | 16px–18px |
| **Success Status** | `CheckCircle2` / `CircleCheck` / `Check` | ดำเนินการสำเร็จหรือยืนยันแล้ว | 16px–20px |
| **Alert / Warning** | `AlertTriangle` / `TriangleAlert` | ข้อควรระวังและการเตือน | 16px–20px |
| **Error Status** | `AlertCircle` / `XCircle` | พบข้อผิดพลาดหรือยกเลิก | 16px–20px |
| **Navigation Toggle** | `Menu` / `X` | เปิด-ปิดเมนูบนอุปกรณ์พกพา | 20px–24px |

---

## 3. Third-Party Brand Icons (`@icons-pack/react-simple-icons`)

| Platform | Component | Verified Color | Purpose |
| :--- | :--- | :--- | :--- |
| **LINE** | `BrandIconLine` (`SiLine`) | `#06C755` | ช่องทางติดต่อ LINE Official ของโรงพยาบาล |
| **Facebook** | `BrandIconFacebook` (`SiFacebook`) | `#1877F2` | เพจประชาสัมพันธ์โรงพยาบาลปลวกแดง |
| **Google** | `BrandIconGoogle` (`SiGoogle`) | `#4285F4` | การยืนยันตัวตนหรือแผนที่ Google Maps |

> [!IMPORTANT]
> **Preservation of Official Hospital Branding:**  
> ไม่มีการใช้ไอคอนแบรนด์ภายนอกมาดัดแปลงเป็นโลโก้ของโรงพยาบาล ตราโรงพยาบาลปลวกแดงยังคงใช้ไฟล์ภาพทางการของโรงพยาบาล (`/images/hospital-logo.png`) เสมอ
