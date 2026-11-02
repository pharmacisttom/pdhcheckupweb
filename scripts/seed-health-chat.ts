import { PrismaClient } from "@prisma/client";

export const baselineKnowledgeData = [
  {
    topicKey: "prep_fasting",
    departmentId: "health_check",
    category: "preparation",
    clinical: true,
    question: "ตรวจสุขภาพต้องงดน้ำงดอาหารกี่ชั่วโมง",
    answer:
      "สำหรับการตรวจสุขภาพที่ต้องเจาะเลือดตรวจระดับน้ำตาล (Fasting Blood Sugar) และไขมันในเลือด (Lipid Panel) ต้องงดอาหาร เครื่องดื่มทุกชนิด ชา กาแฟ นม และน้ำหวาน อย่างน้อย 8-12 ชั่วโมงก่อนการเจาะเลือด โดยสามารถจิบน้ำเปล่าสะอาดได้เล็กน้อยหากรู้สึกกระหายน้ำมาก (ยกเว้นกรณีมีการตรวจส่องกล้องหรือเอกซเรย์พิเศษที่แพทย์ระบุให้งดน้ำเด็ดขาด)",
    keywords: [
      "งดน้ำ",
      "งดอาหาร",
      "อดอาหาร",
      "กี่ชั่วโมง",
      "จิบน้ำ",
      "เจาะเลือด",
      "ตรวจเลือด",
      "อดข้าว",
    ],
  },
  {
    topicKey: "prep_water",
    departmentId: "health_check",
    category: "preparation",
    clinical: true,
    question: "ช่วงงดน้ำงดอาหารสามารถดื่มน้ำเปล่าได้หรือไม่",
    answer:
      "สามารถจิบน้ำเปล่าบริสุทธิ์ได้เล็กน้อยพอแก้กระหาย แต่ควรงดน้ำหวาน ชา กาแฟ น้ำอัดลม นม หรือเครื่องดื่มเกลือแร่ทุกชนิด เพราะจะมีผลต่อน้ำตาลและไขมันในเลือด และแนะนำให้ดื่มน้ำเปล่า 1-2 แก้วก่อนตรวจปัสสาวะหรืออัลตราซาวด์ช่องท้องส่วนล่าง เพื่อให้เก็บปัสสาวะได้ง่ายขึ้น",
    keywords: [
      "ดื่มน้ำ",
      "กินน้ำ",
      "จิบน้ำ",
      "น้ำเปล่า",
      "ดื่มน้ำเปล่า",
      "งดอาหาร",
      "งดน้ำ",
      "แก้กระหาย",
      "น้ำหวาน",
      "กาแฟ",
      "ชา",
    ],
  },
  {
    topicKey: "prep_medication",
    departmentId: "health_check",
    category: "preparation",
    clinical: true,
    question:
      "ผู้ที่มีโรคประจำตัวและทานยาประจำ ต้องหยุดยาหรือทานยาก่อนมาตรวจสุขภาพหรือไม่",
    answer:
      "สำหรับยารักษาโรคความดันโลหิตสูง ยาหัวใจ สามารถจิบน้ำเปล่าเล็กน้อยเพื่อทานยาตามเวลาปกติได้ ส่วนยารักษาโรคเบาหวาน (ทั้งยากินและยาฉีดอินซูลิน) ควรงดมื้อเช้าในวันตรวจเพื่อป้องกันภาวะน้ำตาลในเลือดต่ำ และนำยามาทานพร้อมมื้ออาหารหลังเจาะเลือดเสร็จ ทั้งนี้ควรนำยาเดิมหรือซองยาที่ทานประจำทั้งหมดมาให้แพทย์ดูด้วยในวันตรวจ",
    keywords: [
      "ยาประจำตัว",
      "โรคประจำตัว",
      "ยาลดความดัน",
      "ยาเบาหวาน",
      "กินยา",
      "ทานยา",
      "หยุดยา",
      "อินซูลิน",
      "เตรียมตัว",
    ],
  },
  {
    topicKey: "prep_documents",
    departmentId: "general_info",
    category: "general",
    clinical: false,
    question: "มาตรวจสุขภาพต้องนำเอกสารและหลักฐานอะไรมาบ้าง",
    answer:
      "สิ่งที่ต้องนำมาในวันตรวจ ได้แก่ 1. บัตรประจำตัวประชาชนตัวจริง (หรือหนังสือเดินทางสำหรับชาวต่างชาติ) 2. บัตรนัดหมายหรือรหัสการจองคิว 3. ประวัติการรักษาเดิมหรือรายชื่อยาที่ทานประจำ (ถ้ามี) 4. แว่นสายตา (สำหรับผู้ที่มีปัญหาการมองเห็น) แนะนำสวมเสื้อผ้าที่หลวมสบาย แขนเสื้อพับขึ้นได้ง่าย เพื่อความสะดวกในการเจาะเลือดและวัดความดันโลหิต",
    keywords: [
      "เอกสาร",
      "บัตรประชาชน",
      "หลักฐาน",
      "นำมา",
      "เตรียมตัว",
      "ใบนัด",
      "หนังสือเดินทาง",
      "แว่นสายตา",
      "ตรวจสุขภาพ",
    ],
  },
  {
    topicKey: "prep_rights",
    departmentId: "general_info",
    category: "rights",
    clinical: false,
    question:
      "การตรวจสุขภาพสามารถใช้สิทธิบัตรทอง ประกันสังคม หรือเบิกจ่ายตรงได้หรือไม่",
    answer:
      "การตรวจสุขภาพตามแพ็กเกจส่งเสริมสุขภาพทั่วไปอาจมีค่าใช้จ่ายส่วนบุคคลตามรายการที่เลือก ทั้งนี้ ผู้มีสิทธิหลักประกันสุขภาพแห่งชาติ (สิทธิบัตรทอง) และสิทธิประกันสังคม มีสิทธิได้รับการตรวจคัดกรองสุขภาพตามช่วงอายุตามที่ สปสช. และสำนักงานประกันสังคมกำหนดโดยไม่มีค่าใช้จ่าย สามารถติดต่อเจ้าหน้าที่เพื่อตรวจสอบสิทธิการตรวจคัดกรองตามชุดสิทธิประโยชน์ก่อนเริ่มตรวจได้",
    keywords: [
      "สิทธิการรักษา",
      "บัตรทอง",
      "30บาท",
      "ประกันสังคม",
      "เบิกจ่าย",
      "เบิกตรง",
      "ค่าใช้จ่าย",
      "สปสช",
      "ฟรี",
      "ตรวจสุขภาพ",
    ],
  },
  {
    topicKey: "prep_women",
    departmentId: "health_check",
    category: "preparation",
    clinical: true,
    question: "สตรีมีประจำเดือนหรือสงสัยว่าตั้งครรภ์ สามารถตรวจสุขภาพได้หรือไม่",
    answer:
      "หากอยู่ในช่วงมีประจำเดือน ควรรอให้ประจำเดือนหมดสนิทอย่างน้อย 7 วันก่อนจึงจะตรวจปัสสาวะและตรวจคัดกรองมะเร็งปากมดลูกได้ เพื่อป้องกันผลลวงจากการปนเปื้อนของเลือด และหากสงสัยหรือทราบว่าตั้งครรภ์ กรุณาแจ้งเจ้าหน้าที่ทันทีก่อนการตรวจ เพื่อหลีกเลี่ยงการเอกซเรย์ปอด (X-ray) และการตรวจที่อาจมีผลกระทบต่อทารกในครรภ์",
    keywords: [
      "ประจำเดือน",
      "เมนส์",
      "ตั้งครรภ์",
      "ท้อง",
      "ผู้หญิง",
      "สตรี",
      "มะเร็งปากมดลูก",
      "เอกซเรย์",
      "x-ray",
      "ตรวจสุขภาพ",
    ],
  },
  {
    topicKey: "prep_ultrasound",
    departmentId: "health_check",
    category: "preparation",
    clinical: true,
    question: "การตรวจอัลตราซาวด์ช่องท้องต้องเตรียมตัวอย่างไร",
    answer:
      "การตรวจอัลตราซาวด์ช่องท้องส่วนบน (Upper Abdomen) ต้องงดอาหารและเครื่องดื่มทุกชนิดอย่างน้อย 6-8 ชั่วโมงก่อนตรวจ เพื่อลดแก๊สในกระเพาะและให้ถุงน้ำดีขยายตัว สำหรับอัลตราซาวด์ช่องท้องส่วนล่าง (Lower Abdomen) แนะนำให้ดื่มน้ำเปล่า 2-3 แก้วและกลั้นปัสสาวะไว้ก่อนเข้าห้องตรวจ เพื่อให้กระเพาะปัสสาวะดันลำไส้ขึ้น ทำให้มองเห็นมดลูก รังไข่ หรือต่อมลูกหมากได้ชัดเจน",
    keywords: [
      "อัลตราซาวด์",
      "ultrasound",
      "ช่องท้อง",
      "กลั้นปัสสาวะ",
      "ถุงน้ำดี",
      "กระเพาะปัสสาวะ",
      "เตรียมตัว",
    ],
  },
  {
    topicKey: "prep_urine_stool",
    departmentId: "health_check",
    category: "preparation",
    clinical: true,
    question: "การเก็บตัวอย่างปัสสาวะและอุจจาระมีข้อปฏิบัติอย่างไร",
    answer:
      "การเก็บปัสสาวะควรเก็บปัสสาวะช่วงกลาง (Mid-stream urine) โดยปล่อยปัสสาวะช่วงแรกทิ้งไปเล็กน้อย แล้วรองปัสสาวะใส่กระปุกประมาณครึ่งกระปุก ปิดฝาให้สนิท สำหรับการตรวจอุจจาระ ควรเก็บตัวอย่างขนาดประมาณหัวแม่มือหรือใช้ไม้ป้ายในปริมาณที่กำหนด ระวังอย่าให้ปนเปื้อนน้ำหรือปัสสาวะ และนำส่งห้องปฏิบัติการภายใน 2 ชั่วโมง",
    keywords: [
      "ปัสสาวะ",
      "อุจจาระ",
      "ตรวจปัสสาวะ",
      "ตรวจอุจจาระ",
      "เก็บปัสสาวะ",
      "เก็บอุจจาระ",
      "เก็บตัวอย่าง",
      "ฉี่",
      "อึ",
      "กระปุก",
      "เตรียมตัว",
    ],
  },
  {
    topicKey: "results_timeline",
    departmentId: "health_check",
    category: "results",
    clinical: false,
    question: "ผลตรวจสุขภาพออกเมื่อไหร่ และรับผลตรวจได้อย่างไร",
    answer:
      "ผลการตรวจทางห้องปฏิบัติการทั่วไป (เลือดและปัสสาวะ) และเอกซเรย์ปอดจะทราบผลภายใน 2-3 ชั่วโมงในวันเดียวกัน สำหรับการตรวจพิเศษบางรายการอาจใช้เวลา 1-3 วันทำการ โดยผู้รับบริการสามารถรอรับสมุดรายงานผลตรวจพร้อมรับคำปรึกษาและฟังคำแนะนำจากแพทย์ได้ในวันตรวจ หรือเลือกรับผลตรวจทางระบบออนไลน์ตามที่โรงพยาบาลเปิดให้บริการ",
    keywords: [
      "ผลตรวจ",
      "กี่วัน",
      "รับผล",
      "ผลเลือด",
      "ผลแล็บ",
      "สมุดผลตรวจ",
      "เมื่อไหร่",
      "ออนไลน์",
      "ขั้นตอน",
    ],
  },
  {
    topicKey: "post_care",
    departmentId: "health_check",
    category: "aftercare",
    clinical: true,
    question: "หลังเจาะเลือดและตรวจสุขภาพเสร็จแล้ว ควรปฏิบัติตัวอย่างไร",
    answer:
      "หลังเจาะเลือดควรกดสำลีบริเวณรอยเจาะให้แน่นประมาณ 5-10 นาที โดยไม่คลึงหรือนวดรอยเจาะ เพื่อป้องกันรอยฟกช้ำและเลือดออกใต้ผิวหนัง และงดยกของหนักด้วยแขนข้างที่เจาะเลือดอย่างน้อย 2-4 ชั่วโมง หลังจากเจาะเลือดเสร็จเรียบร้อยแล้วสามารถรับประทานอาหารว่างและน้ำดื่มได้ทันทีก่อนรอพบแพทย์ฟังผล",
    keywords: [
      "หลังเจาะเลือด",
      "ปฏิบัติตัว",
      "รอยช้ำ",
      "กินอาหาร",
      "ทานข้าว",
      "ข้อควรระวัง",
      "ของหนัก",
      "ตรวจเสร็จ",
    ],
  },
  {
    topicKey: "clinic_hours",
    departmentId: "general_info",
    category: "general",
    clinical: false,
    question: "ศูนย์ตรวจสุขภาพโรงพยาบาลปลวกแดงเปิดให้บริการวันและเวลาใด",
    answer:
      "ศูนย์ตรวจสุขภาพ โรงพยาบาลปลวกแดง เปิดให้บริการวันจันทร์ - ศุกร์ (เว้นวันหยุดราชการและวันหยุดนักขัตฤกษ์) เวลา 07.30 - 15.30 น. โดยแนะนำให้ผู้รับบริการที่ต้องงดน้ำงดอาหารมาถึงโรงพยาบาลก่อนเวลา 09.00 น. เพื่อให้สามารถเจาะเลือดตรวจได้ตามรอบเวลาและได้รับประทานอาหารเช้าโดยไม่รอนาน",
    keywords: [
      "เวลาทำการ",
      "เปิดกี่โมง",
      "เปิดวันไหน",
      "สถานที่",
      "ที่ตั้ง",
      "โรงพยาบาลปลวกแดง",
      "ติดต่อ",
      "รอบตรวจ",
    ],
  },
  {
    topicKey: "package_selection",
    departmentId: "health_check",
    category: "packages",
    clinical: false,
    question: "มีแพ็กเกจตรวจสุขภาพอะไรบ้าง และควรเลือกตรวจแพ็กเกจไหน",
    answer:
      "โรงพยาบาลปลวกแดงมีแพ็กเกจตรวจสุขภาพหลากหลายตามช่วงอายุและปัจจัยเสี่ยง เช่น แพ็กเกจตรวจสุขภาพพื้นฐาน (เหมาะสำหรับผู้เริ่มต้นหรือวัยทำงาน) และแพ็กเกจตรวจสุขภาพพลัส (ครอบคลุมการทำงานของตับ ไต ไขมัน น้ำตาล เอกซเรย์ และคลื่นไฟฟ้าหัวใจ) ท่านสามารถดูรายละเอียดและจองคิวออนไลน์ได้ที่เมนูแพ็กเกจบนเว็บไซต์ หรือปรึกษาเจ้าหน้าที่เพื่อรับคำแนะนำที่เหมาะสม",
    keywords: [
      "แพ็กเกจ",
      "ตรวจสุขภาพ",
      "โปรแกรม",
      "เลือกแพ็กเกจ",
      "ตรวจอะไรบ้าง",
      "รายการตรวจ",
      "ราคา",
    ],
  },
  // --- English (en) ---
  {
    topicKey: "prep_fasting:en",
    departmentId: "health_check",
    category: "preparation",
    clinical: true,
    question: "How many hours do I need to fast before a health checkup?",
    answer:
      "For a general health checkup requiring fasting blood sugar and lipid panel tests, you must fast (no food, no milk, coffee, tea, or sweetened drinks) for at least 8-12 hours before blood collection. You may sip small amounts of plain water if thirsty.",
    keywords: [
      "fast",
      "fasting",
      "hours",
      "water",
      "blood test",
      "food",
      "drink",
      "checkup",
    ],
  },
  {
    topicKey: "prep_water:en",
    departmentId: "health_check",
    category: "preparation",
    clinical: true,
    question: "Can I drink plain water while fasting?",
    answer:
      "You may sip small amounts of plain water to quench thirst. However, avoid soft drinks, tea, coffee, milk, or juices as they affect blood glucose and lipid results. Drinking 1-2 glasses of plain water before a urinalysis or pelvic ultrasound is recommended to help fill the bladder.",
    keywords: [
      "water",
      "drink water",
      "plain water",
      "thirsty",
      "fasting",
      "coffee",
      "tea",
    ],
  },
  {
    topicKey: "prep_medication:en",
    departmentId: "health_check",
    category: "preparation",
    clinical: true,
    question: "Can I take my regular medication before the health checkup?",
    answer:
      "High blood pressure and heart medications can usually be taken with a small sip of water. Diabetes medications (both pills and insulin) should be skipped on the morning of the test to avoid low blood sugar, and taken after blood collection with breakfast. Please bring all your current medications with you.",
    keywords: [
      "medication",
      "medicine",
      "chronic",
      "hypertension",
      "diabetes",
      "blood pressure",
      "pills",
    ],
  },
  {
    topicKey: "prep_documents:en",
    departmentId: "general_info",
    category: "general",
    clinical: false,
    question: "What documents do I need to bring for the health checkup?",
    answer:
      "Please bring: 1. Original ID card (or Passport for foreign nationals), 2. Appointment confirmation slip or booking reference, 3. Previous medical records or current medication list (if any), 4. Eyeglasses (if you have vision correction). Wear comfortable clothing with loose sleeves.",
    keywords: [
      "documents",
      "passport",
      "id card",
      "appointment",
      "bring",
      "identification",
      "checkup",
    ],
  },
  {
    topicKey: "prep_rights:en",
    departmentId: "general_info",
    category: "rights",
    clinical: false,
    question: "Can I use Universal Health Coverage, Social Security, or Civil Servant benefits for checkups?",
    answer:
      "General health checkup packages may incur out-of-pocket expenses depending on the chosen tests. Thai citizens under the Universal Coverage Scheme (Gold Card) and insured workers under the Social Security Scheme are eligible for age-based annual health screenings provided by NHSO and SSO at no cost. Contact our staff to verify your entitlement before starting.",
    keywords: [
      "coverage",
      "social security",
      "gold card",
      "benefits",
      "insurance",
      "free",
      "rights",
    ],
  },
  {
    topicKey: "results_timeline:en",
    departmentId: "health_check",
    category: "results",
    clinical: false,
    question: "When will my health checkup results be ready?",
    answer:
      "Routine laboratory blood/urine tests and chest X-rays are typically ready within 2-3 hours on the same day. You will receive a complete health report booklet along with a doctor's consultation and explanation on the day of the checkup.",
    keywords: [
      "results",
      "how long",
      "timeline",
      "report",
      "lab results",
      "ready",
      "doctor",
    ],
  },
  {
    topicKey: "post_care:en",
    departmentId: "health_check",
    category: "aftercare",
    clinical: true,
    question: "What should I do after blood collection and health checkup?",
    answer:
      "After blood drawing, press firmly on the cotton pad over the puncture site for 5-10 minutes without rubbing, to prevent bruising. Avoid heavy lifting with that arm for at least 2-4 hours. You can have snacks and drinks immediately after blood drawing before meeting the doctor for results.",
    keywords: [
      "after",
      "blood draw",
      "bruising",
      "care",
      "lifting",
      "eating",
      "post checkup",
    ],
  },
  {
    topicKey: "clinic_hours:en",
    departmentId: "general_info",
    category: "general",
    clinical: false,
    question: "What are the operating hours of Pluak Daeng Hospital Health Checkup Center?",
    answer:
      "Pluak Daeng Hospital Health Checkup Center is open Monday to Friday, 07:30 - 15:30 (closed on public holidays). Patients who need fasting blood tests are advised to arrive before 09:00 for smooth processing.",
    keywords: [
      "hours",
      "open",
      "time",
      "location",
      "operating hours",
      "pluak daeng",
      "hospital",
    ],
  },
  {
    topicKey: "package_selection:en",
    departmentId: "health_check",
    category: "packages",
    clinical: false,
    question: "What health checkup packages are available and which one should I choose?",
    answer:
      "Pluak Daeng Hospital offers comprehensive packages tailored to different age groups and lifestyles, including Basic Health Checkup (ideal for young adults) and Plus Health Checkup (comprehensive liver, kidney, glucose, lipid, and ECG tests). You can view details and book online via the Packages menu.",
    keywords: [
      "packages",
      "checkup",
      "programs",
      "choose",
      "selection",
      "available",
      "price",
    ],
  },
  // --- Simplified Chinese (zh-Hans) ---
  {
    topicKey: "prep_fasting:zh-Hans",
    departmentId: "health_check",
    category: "preparation",
    clinical: true,
    question: "体检前需要空腹几个小时？",
    answer:
      "常规体检中涉及空腹血糖和血脂检查时，在抽血前必须空腹（禁食任何食物、牛奶、茶、咖啡及含糖饮料）至少8至12小时。如有口渴可少量饮用白开水（特殊内窥镜或特殊影像检查除外）。",
    keywords: [
      "空腹",
      "禁食",
      "几个小时",
      "喝水",
      "抽血",
      "验血",
      "体检",
      "检查",
    ],
  },
  {
    topicKey: "prep_water:zh-Hans",
    departmentId: "health_check",
    category: "preparation",
    clinical: true,
    question: "空腹期间可以喝白开水吗？",
    answer:
      "空腹期间可以少量慢饮纯净白开水解渴，但请勿饮用含糖饮料、茶、咖啡、牛奶或果汁，以免影响血糖和血脂结果。建议在做尿检或下腹部超声前饮用1-2杯白开水并适当憋尿。",
    keywords: [
      "喝水",
      "饮水",
      "白开水",
      "解渴",
      "空腹",
      "咖啡",
      "茶",
      "饮料",
    ],
  },
  {
    topicKey: "prep_documents:zh-Hans",
    departmentId: "general_info",
    category: "general",
    clinical: false,
    question: "体检当天需要携带哪些证件和材料？",
    answer:
      "体检当天请携带：1. 护照原件或身份证，2. 预约凭证或预约号，3. 既往病历或正在服用的药物清单（如有），4. 近视眼镜（如有视力矫正需求）。建议穿着袖口宽松舒适的衣物以便采血和测血压。",
    keywords: [
      "证件",
      "护照",
      "材料",
      "携带",
      "预约",
      "身份证",
      "体检",
      "准备",
    ],
  },
  {
    topicKey: "results_timeline:zh-Hans",
    departmentId: "health_check",
    category: "results",
    clinical: false,
    question: "体检结果多长时间出来？如何获取？",
    answer:
      "常规血液、尿液化验及胸部X光检查通常在当天2至3小时内即可出结果。受检者可在当天领取体检报告册并由医生为您详细解读报告和提供健康指导。",
    keywords: [
      "体检结果",
      "多长时间",
      "多久",
      "获取",
      "报告",
      "看医生",
      "当天",
      "结果",
    ],
  },
  {
    topicKey: "clinic_hours:zh-Hans",
    departmentId: "general_info",
    category: "general",
    clinical: false,
    question: "布罗克登医院体检中心营业时间是什么时候？",
    answer:
      "布罗克登医院（Pluak Daeng Hospital）体检中心开放时间为周一至周五 07:30 - 15:30（法定节假日休息）。需要空腹抽血的受检者建议在早上09:00前到达医院。",
    keywords: [
      "营业时间",
      "开放时间",
      "几点",
      "地址",
      "布罗克登",
      "医院",
      "体检",
      "时间",
    ],
  },
  {
    topicKey: "package_selection:zh-Hans",
    departmentId: "health_check",
    category: "packages",
    clinical: false,
    question: "有哪些体检套餐？我应该如何选择？",
    answer:
      "医院提供针对不同年龄层和健康需求的多种体检套餐，包括基础健康体检和增强型全面体检（覆盖肝肾功能、血脂、血糖、心电图及胸片等）。您可以通过网站套餐菜单在线了解详情并预约。",
    keywords: [
      "体检套餐",
      "套餐",
      "选择",
      "哪些项目",
      "预约",
      "价格",
      "体检",
    ],
  },
  // --- Burmese (my) ---
  {
    topicKey: "prep_fasting:my",
    departmentId: "health_check",
    category: "preparation",
    clinical: true,
    question: "ကျန်းမာရေးစစ်ဆေးမှုမပြုမီ အစာနှင့်ရေ မည်မျှကြာ ရှောင်ရမလဲ။",
    answer:
      "အစာမစားမီ သွေးတွင်းသကြားဓာတ်နှင့် အဆီစစ်ဆေးရန်အတွက် အနည်းဆုံး ၈ မှ ၁၂ နာရီအတွင်း အစာ၊ နို့၊ ကော်ဖီ၊ လက်ဖက်ရည်နှင့် အချိုရည်များကို ရှောင်ကြဉ်ရပါမည်။ ရေဆာပါက ရေအနည်းငယ် သောက်နိုင်ပါသည်။",
    keywords: [
      "အစာရှောင်",
      "ရေရှောင်",
      "သွေးစစ်",
      "နာရီ",
      "ကျန်းမာရေး",
      "စစ်ဆေး",
      "အစာ",
    ],
  },
  {
    topicKey: "prep_documents:my",
    departmentId: "general_info",
    category: "general",
    clinical: false,
    question: "စစ်ဆေးမှုပြုလုပ်ရန် မည်သည့်စာရွက်စာတမ်းများ ယူဆောင်လာရမည်နည်း။",
    answer:
      "နိုင်ငံကူးလက်မှတ် (သို့မဟုတ်) မှတ်ပုံတင်၊ ရက်ချိန်းကတ်ပြား၊ ယခင်ဆေးမှတ်တမ်းများနှင့် သောက်သုံးနေသော ဆေးဝါးများကို ယူဆောင်လာပါ။ သွေးဖောက်ရလွယ်ကူစေရန် သက်တောင့်သက်သာရှိသော အဝတ်အစားများကို ဝတ်ဆင်ပါ။",
    keywords: [
      "စာရွက်စာတမ်း",
      "မှတ်ပုံတင်",
      "နိုင်ငံကူးလက်မှတ်",
      "ရက်ချိန်း",
      "ဆေးမှတ်တမ်း",
      "ယူဆောင်ရန်",
    ],
  },
  {
    topicKey: "clinic_hours:my",
    departmentId: "general_info",
    category: "general",
    clinical: false,
    question: "ဆေးရုံ၏ ကျန်းမာရေးစစ်ဆေးရေးဌာန ဖွင့်လှစ်ချိန် မည်သည့်အချိန်ဖြစ်သနည်း။",
    answer:
      "ပလူအက်ဒင်ဆေးရုံ ကျန်းမာရေးစစ်ဆေးရေးဌာနကို တနင်္လာနေ့မှ သောကြာနေ့အထိ နံနက် ၀၇:၃၀ မှ ညနေ ၁၅:၃၀ အထိ ဖွင့်လှစ်ပါသည်။ အစာရှောင်သွေးစစ်သူများသည် နံနက် ၀၉:၀၀ မတိုင်မီ ရောက်ရှိရန် အကြံပြုအပ်ပါသည်။",
    keywords: [
      "ဖွင့်ချိန်",
      "အချိန်",
      "ပလူအက်ဒင်",
      "ဆေးရုံ",
      "ရုံးဖွင့်ရက်",
      "နာရီ",
    ],
  },
  // --- Khmer (km) ---
  {
    topicKey: "prep_fasting:km",
    departmentId: "health_check",
    category: "preparation",
    clinical: true,
    question: "តើត្រូវតមអាហារ និងទឹកប៉ុន្មានម៉ោងមុនពេលពិនិត្យសុខភាព?",
    answer:
      "សម្រាប់ការពិនិត្យឈាមរកជាតិស្ករ និងជាតិខ្លាញ់ អ្នកត្រូវតមអាហារ ទឹកដោះគោ តែ កាហ្វេ និងភេសជ្ជៈផ្អែមយ៉ាងហោចណាស់ ៨ ទៅ ១២ ម៉ោងមុនពេលបូមឈាម។ អ្នកអាចពិសាទឹកស្អាតបន្តិចបន្តួចបានប្រសិនបើស្រេកទឹកខ្លាំង។",
    keywords: [
      "តមអាហារ",
      "តមទឹក",
      "បូមឈាម",
      "ពិនិត្យសុខភាព",
      "ម៉ោង",
      "ទឹកស្អាត",
    ],
  },
  {
    topicKey: "prep_documents:km",
    departmentId: "general_info",
    category: "general",
    clinical: false,
    question: "តើត្រូវយកឯកសារអ្វីខ្លះមកជាមួយនៅថ្ងៃពិនិត្យសុខភាព?",
    answer:
      "សូមយកមកជាមួយនូវ៖ ១. អត្តសញ្ញាណប័ណ្ណ ឬលិខិតឆ្លងដែនច្បាប់ដើម ២. ប័ណ្ណណាត់ជួប ៣. ប្រវត្តិព្យាបាល ឬបញ្ជីថ្នាំដែលកំពុងប្រើប្រាស់។ ស្លៀកពាក់សម្លៀកបំពាក់រលុងៗងាយស្រួលបូមឈាម និងវាស់សម្ពាធឈាម។",
    keywords: [
      "ឯកសារ",
      "លិខិតឆ្លងដែន",
      "អត្តសញ្ញាណប័ណ្ណ",
      "ប័ណ្ណណាត់",
      "ពិនិត្យសុខភាព",
      "យកមក",
    ],
  },
  {
    topicKey: "clinic_hours:km",
    departmentId: "general_info",
    category: "general",
    clinical: false,
    question: "តើមជ្ឈមណ្ឌលពិនិត្យសុខភាពមន្ទីរពេទ្យផ្លូកដែងបើកម៉ោងប៉ុន្មាន?",
    answer:
      "មជ្ឈមណ្ឌលពិនិត្យសុខភាព មន្ទីរពេទ្យផ្លូកដែង បើកបម្រើសេវាពីថ្ងៃច័ន្ទ ដល់ ថ្ងៃសុក្រ វេលាម៉ោង ០៧:៣០ ដល់ ១៥:៣០ (ឈប់សម្រាកថ្ងៃបុណ្យជាតិ)។ អ្នកដែលត្រូវតមអាហារបូមឈាម គួរមកដល់មុនម៉ោង ០៩:០០ ព្រឹក។",
    keywords: [
      "ម៉ោងបើក",
      "ពេលវេលា",
      "មន្ទីរពេទ្យ",
      "ផ្លូកដែង",
      "ពិនិត្យសុខភាព",
      "ម៉ោង",
    ],
  },
];

export async function seedHealthChat(db: PrismaClient, authorUserId?: string) {
  // 1. Ensure Departments exist
  const deptList = [
    { id: "health_check", name: "ศูนย์ตรวจสุขภาพ (Health Check)" },
    { id: "general_info", name: "ข้อมูลทั่วไปและสิทธิการรักษา (General Information)" },
  ];
  for (const d of deptList) {
    await db.chatDepartment.upsert({
      where: { id: d.id },
      create: { id: d.id, name: d.name, active: true },
      update: { name: d.name, active: true },
    });
  }

  // 2. Ensure ChatConfiguration exists and is enabled
  const adminId =
    authorUserId ??
    (await db.user.findFirst({ where: { role: "superadmin" } }))?.id ??
    "system-seed";

  await db.chatConfiguration.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      enabled: true,
      aiEnabled: false,
      handoffEnabled: true,
      noticeVersion: "v1-2026",
      noticeText:
        "ระบบใช้ FAQ และอาจใช้ AI ช่วยค้นข้อมูล คำตอบอาจผิดพลาด ไม่ใช่คำแนะนำทางการแพทย์เฉพาะบุคคล กรุณาไม่ส่งเลขบัตรประชาชน ผลตรวจ หรือข้อมูลสุขภาพที่ไม่จำเป็น",
      retentionDays: 90,
      policyApprovedAt: new Date(),
      policyApprovedBy: adminId,
      monthlyTokenLimit: 200000,
      monthlyRequestLimit: 5000,
      monthlyBudgetUsd: "20.0000",
      slaMinutes: 30,
    },
    update: {
      enabled: true,
      noticeVersion: "v1-2026",
      noticeText:
        "ระบบใช้ FAQ และอาจใช้ AI ช่วยค้นข้อมูล คำตอบอาจผิดพลาด ไม่ใช่คำแนะนำทางการแพทย์เฉพาะบุคคล กรุณาไม่ส่งเลขบัตรประชาชน ผลตรวจ หรือข้อมูลสุขภาพที่ไม่จำเป็น",
      retentionDays: 90,
      policyApprovedAt: new Date(),
      policyApprovedBy: adminId,
    },
  });

  // 3. Seed Knowledge Items
  const now = new Date();
  const startsAt = new Date(now.getTime() - 86400000); // yesterday
  const expiresAt = new Date(now.getTime() + 365 * 86400000); // 1 year from now

  let insertedCount = 0;
  for (const item of baselineKnowledgeData) {
    const knowledge = await db.chatKnowledge.upsert({
      where: {
        departmentId_topicKey: {
          departmentId: item.departmentId,
          topicKey: item.topicKey,
        },
      },
      create: {
        departmentId: item.departmentId,
        topicKey: item.topicKey,
        category: item.category,
        clinical: item.clinical,
        visibility: "public",
      },
      update: {
        category: item.category,
        clinical: item.clinical,
        visibility: "public",
      },
    });

    const existingVersion = await db.chatKnowledgeVersion.findFirst({
      where: {
        knowledgeId: knowledge.id,
        version: 1,
      },
    });

    const chunks = item.answer.match(/[\s\S]{1,500}/g) ?? [item.answer];

    if (!existingVersion) {
      const version = await db.chatKnowledgeVersion.create({
        data: {
          knowledgeId: knowledge.id,
          version: 1,
          question: item.question,
          answer: item.answer,
          keywords: item.keywords,
          status: "published",
          authorId: adminId,
          reviewerId: adminId,
          publisherId: adminId,
          reviewedAt: now,
          publishedAt: now,
          startsAt,
          expiresAt,
        },
      });

      await db.chatKnowledgeChunk.createMany({
        data: chunks.map((text, position) => ({
          versionId: version.id,
          position,
          text,
        })),
      });
      insertedCount++;
    } else {
      await db.chatKnowledgeVersion.update({
        where: { id: existingVersion.id },
        data: {
          question: item.question,
          answer: item.answer,
          keywords: item.keywords,
          status: "published",
          startsAt,
          expiresAt,
        },
      });

      await db.chatKnowledgeChunk.deleteMany({
        where: { versionId: existingVersion.id },
      });
      await db.chatKnowledgeChunk.createMany({
        data: chunks.map((text, position) => ({
          versionId: existingVersion.id,
          position,
          text,
        })),
      });
    }
  }

  return {
    departments: deptList.length,
    knowledgeItems: baselineKnowledgeData.length,
    insertedCount,
  };
}

async function run() {
  const db = new PrismaClient();
  try {
    console.log("Seeding PDH Smart Health Chat baseline knowledge...");
    const result = await seedHealthChat(db);
    console.log(
      `Health chat seed complete: ${result.knowledgeItems} baseline knowledge items ready, ${result.departments} departments enabled.`,
    );
  } catch (err) {
    console.error("Health chat seed error:", err);
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("scripts/seed-health-chat.ts")) {
  run();
}
