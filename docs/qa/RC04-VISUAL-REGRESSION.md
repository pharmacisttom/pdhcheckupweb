# PDH Smart Health Check — RC04 Visual Regression & Viewport Verification
**Hospital:** โรงพยาบาลปลวกแดง จังหวัดระยอง  
**Audit Viewports:** 320px (SE), 390px (iPhone), 768px (iPad Mini), 1024px (iPad Pro), 1440px (Desktop)

---

## 1. Viewport Matrix Results

| Viewport Width | Device Target | Layout Mode | Overflow Status | Touch Targets | Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **320px** | iPhone SE / Compact | Single Column Stacked | **0px (No overflow)** | >= 44x44px | **PASS** |
| **390px** | iPhone 12/13/14 Standard | Single Column Stacked | **0px (No overflow)** | >= 44x44px | **PASS** |
| **768px** | Tablet Portrait | 2-Column Responsive | **0px (No overflow)** | >= 44x44px | **PASS** |
| **1024px** | Tablet Landscape / Laptop | Expanded Grid | **0px (No overflow)** | Standard Pointer | **PASS** |
| **1440px** | Desktop HD | 3-Column Grid + Sidebar | **0px (No overflow)** | Standard Pointer | **PASS** |

---

## 2. Key CSS Breakpoint Safeguards

- `@media (max-width: 380px)`: ลด padding ขอบจอลงเหลือ 14px เพื่อให้เนื้อหาแสดงผลได้ครบถ้วนโดยไม่ต้องเลื่อนข้าง
- `@media (max-width: 800px)`: ซ่อนแถบเมนูด้านข้างของระบบหลังบ้าน และแปลงเป็น Mobile Drawer Overlay พร้อมปุ่มปิดที่ชัดเจน
- `touch-action: manipulation`: ป้องกันการหน่วง 300ms บนอุปกรณ์พกพา
