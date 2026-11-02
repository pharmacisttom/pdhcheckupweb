import { describe, it, expect } from "vitest";
import { baselineKnowledgeData } from "../../scripts/seed-health-chat";
import { relevantEvidence, safeKnowledge, chatSafetyReason } from "../../src/lib/chat-safety";

describe("PDH Baseline Health Chat QA Knowledge", () => {
  it("contains 12 curated Thai baseline health checkup QA items and 33 total multilingual items", () => {
    expect(baselineKnowledgeData.filter((d) => !d.topicKey.includes(":")).length).toBe(12);
    expect(baselineKnowledgeData.length).toBe(33);
  });

  it("ensures all items conform to safety, clinical, and knowledge schema rules", () => {
    for (const item of baselineKnowledgeData) {
      expect(item.topicKey).toMatch(/^[a-zA-Z0-9_:.-]{2,100}$/);
      expect(["health_check", "general_info"]).toContain(item.departmentId);
      expect(item.question.length).toBeGreaterThanOrEqual(3);
      expect(item.question.length).toBeLessThanOrEqual(500);
      expect(item.answer.length).toBeGreaterThanOrEqual(10);
      expect(item.answer.length).toBeLessThanOrEqual(12000);
      expect(item.keywords.length).toBeGreaterThanOrEqual(3);

      // Must not contain prompt injection or leak instructions
      expect(safeKnowledge(item.question + " " + item.answer)).toBe(true);

      // Must not contain clinical drug prescription or dosing changes
      expect(
        /(สั่ง|จ่าย|ปรับขนาด|เพิ่มขนาด|ลดขนาด)ยา|วินิจฉัย|prescrib|dosage/i.test(
          item.answer,
        ),
      ).toBe(false);

      // Must not contain hardcoded unbound currency values
      expect(/\d[\d,.]*\s*(บาท|THB)|฿\s*\d/.test(item.answer)).toBe(false);
    }
  });

  it.each([
    ["ตรวจสุขภาพต้องงดน้ำงดอาหารกี่ชั่วโมงครับ", "prep_fasting"],
    ["ช่วงงดอาหารดื่มน้ำเปล่าได้ไหม", "prep_water"],
    ["ผู้มีโรคประจำตัวต้องเตรียมตัวอย่างไร", "prep_medication"],
    ["ต้องนำเอกสารอะไรมาบ้างในวันตรวจสุขภาพ", "prep_documents"],
    ["ตรวจสุขภาพใช้สิทธิบัตรทองหรือประกันสังคมได้ไหม", "prep_rights"],
    ["ถ้ามีประจำเดือนตรวจสุขภาพได้ไหม", "prep_women"],
    ["อัลตราซาวด์ช่องท้องต้องเตรียมตัวอย่างไร", "prep_ultrasound"],
    ["การเก็บตัวอย่างปัสสาวะและอุจจาระ", "prep_urine_stool"],
    ["ผลตรวจสุขภาพออกกี่วันและรับผลทางไหน", "results_timeline"],
    ["หลังเจาะเลือดเสร็จแล้วต้องปฏิบัติตัวอย่างไร", "post_care"],
    ["โรงพยาบาลปลวกแดงเปิดกี่โมงและมีเวลาทำการอย่างไร", "clinic_hours"],
    ["มีแพ็กเกจตรวจสุขภาพอะไรบ้าง", "package_selection"],
    // English
    ["How many hours do I need to fast before a health checkup?", "prep_fasting:en"],
    ["Can I drink plain water while fasting?", "prep_water:en"],
    ["What documents do I need to bring for the health checkup?", "prep_documents:en"],
    // Simplified Chinese
    ["体检前需要空腹几个小时？", "prep_fasting:zh-Hans"],
    ["空腹期间可以喝白开水吗？", "prep_water:zh-Hans"],
    ["体检当天需要携带哪些证件和材料？", "prep_documents:zh-Hans"],
    // Burmese
    ["ကျန်းမာရေးစစ်ဆေးမှုမပြုမီ အစာနှင့်ရေ မည်မျှကြာ ရှောင်ရမလဲ", "prep_fasting:my"],
    ["စစ်ဆေးမှုပြုလုပ်ရန် မည်သည့်စာရွက်စာတမ်းများ ယူဆောင်လာရမည်နည်း", "prep_documents:my"],
    // Khmer
    ["តើត្រូវតមអាហារ និងទឹកប៉ុន្មានម៉ោងមុនពេលពិនិត្យសុខភាព?", "prep_fasting:km"],
    ["តើត្រូវយកឯកសារអ្វីខ្លះមកជាមួយនៅថ្ងៃពិនិត្យសុខភាព?", "prep_documents:km"],
  ])("retrieves '%s' -> topic %s", (query, expectedTopicKey) => {
    // Convert to evidence items
    const records = baselineKnowledgeData.map((d) => ({
      id: d.topicKey,
      question: d.question,
      answer: d.answer,
      keywords: d.keywords,
    }));

    const result = relevantEvidence(query, records);
    expect(result.matches.length).toBeGreaterThanOrEqual(1);
    expect(result.matches[0].id).toBe(expectedTopicKey);
  });

  it("does not false-trigger personal_health on general questions", () => {
    expect(chatSafetyReason("ผลตรวจสุขภาพออกกี่วัน")).toBeNull();
    expect(chatSafetyReason("ตรวจสุขภาพต้องงดน้ำงดอาหารกี่ชั่วโมง")).toBeNull();
    expect(chatSafetyReason("ศูนย์ตรวจสุขภาพเปิดกี่โมง")).toBeNull();
  });
});
