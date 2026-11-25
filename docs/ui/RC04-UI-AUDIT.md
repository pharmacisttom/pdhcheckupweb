# PDH Smart Health Check — RC04 Icon Mapping Catalog
**Hospital:** โรงพยาบาลปลวกแดง จังหวัดระยอง  
**Module:** `src/components/icons.tsx`  
**Icon Libraries:** `lucide-react` (v1.61.0) & `@icons-pack/react-simple-icons` (v12.4.0)

---

## 1. Icon Architecture & Standard Rules

- **Zero Functional Emojis:** ไม่อนุญาตให้ใช้อิโมจิแทนไอคอนคำสั่งหรือการนำทาง
- **Standardized Sizing Tokens:**
  - `xs`: 14px
  - `sm`: 16px
  - `md`: 20px (Default)
  - `lg`: 24px
  - `xl`: 32px
  - `xxl`: 40px
- **Consistent Stroke Width:** `1.85` สำหรับ Lucide icons ทั้งหมด
- **Accessibility:** ทุกไอคอนจะมี `aria-hidden="true"` โดยค่าเริ่มต้น หรือมี `aria-label`/`title` กำกับชัดเจนเมื่อทำหน้าที่เป็นปุ่มกดเดี่ยว

---

## 2. Centralized Mapping Catalog

| Domain / Concept | Lucide Component | Semantic Purpose |
| :--- | :--- | :--- |
| **Dashboard** | `LayoutDashboard` | ภาพรวมระบบและสถิติหลัก |
| **Patients** | `Users` | รายชื่อผู้รับบริการและข้อมูลประชากร |
| **Registration** | `ClipboardList` | แบบฟอร์มลงทะเบียนและคำขอรับบริการ |
| **Questionnaire** | `ClipboardCheck` | แบบประเมินสุขภาพและกฎคัดกรอง |
| **Appointments** | `CalendarDays` | จัดการนัดหมายและตารางเวลา |
| **Organizations** | `Building2` | หน่วยงานคู่สัญญาและองค์กร |
| **Clinical Lab** | `FlaskConical` | บริการทางห้องปฏิบัติการและราคา |
| **Medical / BMI** | `Activity` / `HeartPulse` | ค่าดัชนีมวลกายและสุขภาพ |
| **Settings** | `Settings` | การตั้งค่าระบบ |
| **Security / MFA** | `ShieldCheck` | ความปลอดภัย สิทธิ์ และ PDPA |
| **Audit Logs** | `ScrollText` / `Activity` | บันทึกประวัติการใช้งานระบบ |
| **Quotation / Bill** | `FileText` / `Coins` | เอกสารการเงินและใบเสนอราคา |
| **Chat / Messaging** | `MessageSquare` | PDH Health Chat และให้คำปรึกษา |
| **Edit** | `Pencil` | แก้ไขข้อมูล |
| **Delete** | `Trash2` | ลบหรือยกเลิกรายการ |
| **Search** | `Search` | ค้นหาข้อมูล |
| **Filter** | `Filter` | กรองข้อมูลตามเงื่อนไข |
| **Save** | `Save` | บันทึกข้อมูล |
| **Back / Forward** | `ArrowLeft` / `ArrowRight` | นำทางขั้นตอนการทำงาน |
| **Success Status** | `CheckCircle2` / `CircleCheck` | ดำเนินการสำเร็จหรือยืนยันแล้ว |
| **Alert / Warning** | `AlertTriangle` / `TriangleAlert` | ข้อควรระวังและการเตือน |
| **Error Status** | `AlertCircle` / `XCircle` | พบข้อผิดพลาดหรือยกเลิก |

---

## 3. Third-Party Brand Icons (`@icons-pack/react-simple-icons`)

| Platform | Component | Verified Color | Purpose |
| :--- | :--- | :--- | :--- |
| **LINE** | `BrandIconLine` (`SiLine`) | `#06C755` | ช่องทางติดต่อ LINE Official ของโรงพยาบาล |
| **Facebook** | `BrandIconFacebook` (`SiFacebook`) | `#1877F2` | เพจประชาสัมพันธ์โรงพยาบาลปลวกแดง |
| **Google** | `BrandIconGoogle` (`SiGoogle`) | `#4285F4` | การยืนยันตัวตนหรือแผนที่ Google Maps |

> [!NOTE]  
> ไม่มีการใช้ไอคอนแบรนด์ภายนอกมาดัดแปลงเป็นโลโก้ของโรงพยาบาล ตราโรงพยาบาลปลวกแดงยังคงใช้ไฟล์ภาพทางการของโรงพยาบาล (`/images/hospital-logo.png`) เสมอ
