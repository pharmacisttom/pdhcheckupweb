"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ShieldCheck } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { useRouter } from "next/navigation";
import {
  request,
  money,
  dateTime,
  type PublicPackage,
  type PublicService,
} from "@/lib/client";
import { EmptyState, ErrorState, Loading, PackageCard, PageHeader } from "./ui";
import type { Question } from "@/lib/domain";
import { AppointmentCalendar } from "./calendar";
type FormPerson = {
  firstName: string;
  lastName: string;
  birthdate: string;
  phone: string;
  email: string;
  documentType: "none" | "thai_id" | "passport";
  identifier: string;
  assistance: string;
  contactChannel: "sms" | "email";
};
type Answers = Record<string, string | number | boolean | string[]>;
type Quote = {
  id: string;
  fingerprint: string;
  expiresAt: string;
  total: string;
  lines: { id: string; name: string; amount: string }[];
};
type Slot = { id: string; startsAt: string; endsAt: string; available: number };
const steps = [
  "ข้อมูลส่วนตัว",
  "ประเมินสุขภาพ",
  "เลือกแพ็กเกจ",
  "รายการเพิ่มเติม",
  "วันนัดหมาย",
  "ตรวจสอบและยืนยัน",
];
export function RegistrationWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [policy, setPolicy] = useState({ onlineEnabled: true, message: "" });
  const [contactReference, setContactReference] = useState("");
  const [reviewNotice, setReviewNotice] = useState("");
  const [verified, setVerified] = useState(false);
  const [verificationId, setVerificationId] = useState("");
  const [otp, setOtp] = useState("");
  const [testCode, setTestCode] = useState("");
  const [questionnaire, setQuestionnaire] = useState<{
    version: number;
    questions: Question[];
  } | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [packages, setPackages] = useState<PublicPackage[]>([]);
  const [services, setServices] = useState<PublicService[]>([]);
  const [packageId, setPackageId] = useState("");
  const [addons, setAddons] = useState<string[]>([]);
  const [registrationId, setRegistrationId] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [day, setDay] = useState("");
  const [slotId, setSlotId] = useState("");
  const [hold, setHold] = useState<{ id: string; expiresAt: string } | null>(
    null,
  );
  const [acknowledged, setAcknowledged] = useState(false);
  const [search, setSearch] = useState("");
  const idempotency = useRef("");
  const heading = useRef<HTMLHeadingElement>(null);
  const {
    register,
    handleSubmit,
    getValues,
    control,
    reset,
    formState: { errors },
  } = useForm<FormPerson>({
    defaultValues: {
      documentType: "none",
      contactChannel: "sms",
      email: "",
      identifier: "",
      assistance: "",
    },
  });
  const documentType = useWatch({ control, name: "documentType" });
  const selected = packages.find((p) => p.id === packageId);
  const days = [...new Set(slots.map((s) => s.startsAt.slice(0, 10)))];
  useEffect(() => {
    idempotency.current = crypto.randomUUID();
    request<{ verified: boolean }>("auth/guest", {})
      .then(async (s) => {
        setVerified(s.verified);
        const [p, q, svc, times, draft, bookingMode] = await Promise.all([
          request<PublicPackage[]>("packages"),
          request<{ version: number; questions: Question[] }>("questionnaire"),
          request<PublicService[]>("services"),
          request<Slot[]>("slots"),
          request<{
            id: string;
            person: FormPerson;
            answers: Answers;
            questionnaireVersion: number;
          } | null>("registrations/draft"),
          request<{ onlineEnabled: boolean; message: string }>(
            "booking-policy",
          ),
        ]);
        setPackages(p);
        setQuestionnaire(q);
        setServices(svc);
        setSlots(times);
        setPolicy(bookingMode);
        const preselected = new URLSearchParams(window.location.search).get(
          "package",
        );
        if (preselected) setPackageId(preselected);
        if (draft) {
          reset(draft.person);
          setAnswers(draft.answers);
          setRegistrationId(draft.id);
        }
        setReady(true);
      })
      .catch((e) => setError(e.message));
  }, [reset]);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setBusy(false);
    }
  }
  async function requestOtp() {
    await run(async () => {
      const r = await request<{ verificationId: string; testCode?: string }>(
        "otp/request",
        { phone: getValues("phone") },
      );
      setVerificationId(r.verificationId);
      setTestCode(r.testCode ?? "");
    });
  }
  async function verifyOtp() {
    await run(async () => {
      await request("otp/verify", { verificationId, code: otp });
      setVerified(true);
      setTestCode("");
    });
  }
  async function next() {
    await run(async () => {
      if (step === 0) {
        if (!verified)
          throw new Error("กรุณายืนยันเบอร์โทรด้วย OTP ก่อนดำเนินการต่อ");
        setStep(1);
      }
      if (step === 1) {
        const r = await request<{
          id: string;
          decisions: { decision: string; reason: string }[];
        }>("registrations", {
          id: registrationId || undefined,
          person: getValues(),
          answers,
          questionnaireVersion: questionnaire?.version,
        });
        setRegistrationId(r.id);
        const warnings = r.decisions.filter((d) =>
          [
            "needs_clinical_review",
            "not_eligible_for_specific_service",
            "safety_warning",
          ].includes(d.decision),
        );
        if (warnings.length && policy.onlineEnabled)
          throw new Error(
            warnings.map((w) => w.reason).join(" • ") +
              " กรุณาติดต่อเจ้าหน้าที่ก่อนจอง",
          );
        setReviewNotice(warnings.map((w) => w.reason).join(" • "));
        setStep(2);
      }
      if (step === 2) {
        if (!selected) throw new Error("กรุณาเลือกแพ็กเกจ");
        setStep(3);
      }
      if (step === 3) {
        const q = await request<Quote>("quotes", {
          packageId,
          addonIds: addons,
        });
        setQuote(q);
        const mode = await request<typeof policy>("booking-policy");
        setPolicy(mode);
        setAcknowledged(false);
        setStep(mode.onlineEnabled ? 4 : 5);
      }
      if (step === 4) {
        const mode = await request<typeof policy>("booking-policy");
        setPolicy(mode);
        if (!mode.onlineEnabled) {
          setHold(null);
          setAcknowledged(false);
          setStep(5);
          return;
        }
        if (!slotId) throw new Error("กรุณาเลือกวันและเวลา");
        const h = await request<{ id: string; expiresAt: string }>("holds", {
          slotId,
        });
        setHold(h);
        setAcknowledged(false);
        setStep(5);
      }
      if (step === 5) {
        if (!acknowledged) throw new Error("กรุณารับทราบข้อมูลก่อนยืนยัน");
        const mode = await request<typeof policy>("booking-policy");
        if (mode.onlineEnabled !== policy.onlineEnabled) {
          setPolicy(mode);
          setHold(null);
          setAcknowledged(false);
          setStep(3);
          throw new Error(
            "รูปแบบการรับนัดเปลี่ยนแปลง กรุณาตรวจสอบและดำเนินการต่ออีกครั้ง",
          );
        }
        if (!mode.onlineEnabled) {
          if (!quote) throw new Error("กรุณาตรวจสอบราคาใหม่");
          const result = await request<{ reference: string }>(
            "contact-requests",
            { registrationId, quoteId: quote.id, privacyAcknowledged: true },
          );
          setContactReference(result.reference);
          return;
        }
        if (!quote || !hold) throw new Error("กรุณาเลือกราคาและวันนัดใหม่");
        await request("bookings", {
          registrationId,
          holdId: hold.id,
          quoteId: quote.id,
          fingerprint: quote.fingerprint,
          idempotencyKey: idempotency.current,
          privacyAcknowledged: true,
        });
        router.push("/bookings?confirmed=1");
      }
    });
  }
  const updateAnswer = (id: string, v: Answers[string]) =>
    setAnswers((a) => ({ ...a, [id]: v }));
  if (contactReference)
    return (
      <div className="registration-container">
        <PageHeader
          title="ส่งข้อมูลให้เจ้าหน้าที่แล้ว"
          description="เจ้าหน้าที่จะติดต่อกลับเพื่อนัดรับบริการ"
        />
        <section className="card">
          <h2>{contactReference}</h2>
          <p>
            รายการนี้เป็นคำขอให้ติดต่อกลับ ยังไม่ใช่การยืนยันวันนัดหมาย
            กรุณารอเจ้าหน้าที่ติดต่อทางเบอร์ที่ยืนยันไว้
          </p>
          <a className="button" href="/bookings">
            ตรวจสอบรายการของฉัน
          </a>
        </section>
      </div>
    );
  if (!ready)
    return (
      <div className="registration-container">
        <PageHeader
          title="ลงทะเบียนตรวจสุขภาพ"
          description="เตรียมข้อมูลเพื่อการดูแลที่เหมาะสม"
        />
        {error ? <ErrorState message={error} /> : <Loading />}
      </div>
    );
  return (
    <div className="registration-container">
      <PageHeader
        eyebrow="HEALTH CHECK REGISTRATION"
        title="ลงทะเบียนตรวจสุขภาพ"
        description="กรอกข้อมูลให้ครบถ้วน เพื่อเตรียมพร้อมก่อนเข้ารับบริการ"
      />
      <div className="stepper" aria-label="ขั้นตอนลงทะเบียน">
        {steps.map((label, i) => (
          <button
            key={label}
            type="button"
            className={i === step ? "current" : i < step ? "done" : ""}
            disabled={i > step || busy || (!policy.onlineEnabled && i === 4)}
            onClick={() => setStep(i)}
            aria-current={i === step ? "step" : undefined}
          >
            <span>{i < step ? <Check size={13} /> : i + 1}</span>
            {i === 4 && !policy.onlineEnabled ? "เจ้าหน้าที่นัดให้" : label}
          </button>
        ))}
      </div>
      <div className="wizard-grid">
        <section className="card">
          <h2 ref={heading} tabIndex={-1}>
            {step + 1}. {steps[step]}
          </h2>
          {error && <ErrorState message={error} />}
          {!policy.onlineEnabled && (
            <div className="alert" role="status">
              {policy.message}
              <p>
                ส่งข้อมูลให้เจ้าหน้าที่ติดต่อกลับได้ โดยไม่ต้องเลือกวันและเวลา
              </p>
            </div>
          )}
          {reviewNotice && !policy.onlineEnabled && (
            <div className="alert">
              ข้อมูลที่ต้องให้เจ้าหน้าที่ประเมิน: {reviewNotice}
            </div>
          )}
          <form
            method="post"
            onSubmit={(event) => handleSubmit(() => next())(event)}
          >
            {step === 0 && (
              <>
                <p>
                  ข้อมูลของคุณจะถูกใช้เพื่อเตรียมบริการและการติดต่อเรื่องนัดหมาย
                </p>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="firstName">ชื่อ *</label>
                    <input
                      id="firstName"
                      autoComplete="given-name"
                      {...register("firstName", {
                        required: "กรุณาระบุชื่อ",
                        maxLength: 100,
                      })}
                    />
                    {errors.firstName && (
                      <span className="field-error">
                        {errors.firstName.message}
                      </span>
                    )}
                  </div>
                  <div className="field">
                    <label htmlFor="lastName">นามสกุล *</label>
                    <input
                      id="lastName"
                      autoComplete="family-name"
                      {...register("lastName", {
                        required: "กรุณาระบุนามสกุล",
                        maxLength: 100,
                      })}
                    />
                    {errors.lastName && (
                      <span className="field-error">
                        {errors.lastName.message}
                      </span>
                    )}
                  </div>
                  <div className="field">
                    <label htmlFor="birthdate">วันเกิด (ค.ศ.) *</label>
                    <input
                      id="birthdate"
                      type="date"
                      max={new Date().toISOString().slice(0, 10)}
                      {...register("birthdate", {
                        required: "กรุณาระบุวันเกิด",
                      })}
                    />
                    <small>กรอกปีคริสต์ศักราช เช่น พ.ศ. 2533 = ค.ศ. 1990</small>
                  </div>
                  <div className="field">
                    <label htmlFor="phone">โทรศัพท์มือถือ *</label>
                    <input
                      id="phone"
                      type="tel"
                      autoComplete="tel"
                      {...register("phone", { required: true })}
                      onChange={(e) => {
                        register("phone").onChange(e);
                        setVerified(false);
                      }}
                    />
                  </div>
                  <div className="full">
                    <button
                      className="button secondary small"
                      type="button"
                      disabled={busy || verified}
                      onClick={requestOtp}
                    >
                      {verified ? "ยืนยันเบอร์โทรแล้ว ✓" : "ขอรหัส OTP"}
                    </button>
                    {verificationId && !verified && (
                      <div className="toolbar" style={{ marginTop: 12 }}>
                        <label className="field">
                          รหัส OTP
                          <input
                            inputMode="numeric"
                            maxLength={6}
                            value={otp}
                            onChange={(e) => setOtp(e.target.value)}
                          />
                        </label>
                        <button
                          type="button"
                          className="button small"
                          onClick={verifyOtp}
                          disabled={busy}
                        >
                          ยืนยันรหัส
                        </button>
                      </div>
                    )}
                    {testCode && (
                      <div className="alert">
                        โหมดทดสอบ: {testCode} — ไม่มีการส่ง SMS จริง
                      </div>
                    )}
                  </div>
                  <div className="field">
                    <label htmlFor="email">อีเมล (ไม่บังคับ)</label>
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      {...register("email")}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="documentType">เอกสารระบุตัวตน</label>
                    <select id="documentType" {...register("documentType")}>
                      <option value="none">
                        ยังไม่ระบุ / แสดงในวันรับบริการ
                      </option>
                      <option value="thai_id">บัตรประจำตัวประชาชน</option>
                      <option value="passport">หนังสือเดินทาง</option>
                    </select>
                  </div>
                  {documentType !== "none" && (
                    <div className="field full">
                      <label htmlFor="identifier">เลขเอกสาร</label>
                      <input
                        id="identifier"
                        {...register("identifier")}
                        maxLength={50}
                      />
                    </div>
                  )}
                  <div className="field full">
                    <label htmlFor="assistance">
                      ความช่วยเหลือหรือสิ่งอำนวยความสะดวกที่ต้องการ
                    </label>
                    <textarea
                      id="assistance"
                      {...register("assistance")}
                      maxLength={500}
                    />
                  </div>
                </div>
              </>
            )}
            {step === 1 && (
              <div className="stack">
                <p>
                  แบบประเมินฉบับที่ {questionnaire?.version} •
                  คำตอบใช้ประกอบการดูแล ไม่ใช่การวินิจฉัยโรค
                </p>
                {questionnaire?.questions
                  .filter(
                    (q) =>
                      !q.showIf || answers[q.showIf.field] === q.showIf.equals,
                  )
                  .map((q) => (
                    <div className="field" key={q.id}>
                      <label htmlFor={"q-" + q.id}>
                        {q.label}
                        {q.required ? " *" : ""}
                      </label>
                      {q.type === "single" ? (
                        <select
                          id={"q-" + q.id}
                          required={q.required}
                          value={String(answers[q.id] ?? "")}
                          onChange={(e) => updateAnswer(q.id, e.target.value)}
                        >
                          <option value="">เลือกคำตอบ</option>
                          {q.options?.map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      ) : q.type === "multiple" ? (
                        <div id={"q-" + q.id}>
                          {q.options?.map((o) => (
                            <label className="check-label" key={o}>
                              <input
                                type="checkbox"
                                checked={
                                  Array.isArray(answers[q.id]) &&
                                  (answers[q.id] as string[]).includes(o)
                                }
                                onChange={(e) => {
                                  const prev = Array.isArray(answers[q.id])
                                    ? (answers[q.id] as string[])
                                    : [];
                                  updateAnswer(
                                    q.id,
                                    e.target.checked
                                      ? [...prev, o]
                                      : prev.filter((v) => v !== o),
                                  );
                                }}
                              />
                              {o}
                            </label>
                          ))}
                        </div>
                      ) : (
                        <input
                          id={"q-" + q.id}
                          type={q.type === "numeric" ? "number" : "text"}
                          min={q.min}
                          max={q.max}
                          step="any"
                          required={q.required}
                          value={String(answers[q.id] ?? "")}
                          onChange={(e) =>
                            updateAnswer(
                              q.id,
                              q.type === "numeric" && e.target.value !== ""
                                ? Number(e.target.value)
                                : e.target.value,
                            )
                          }
                        />
                      )}
                    </div>
                  ))}
              </div>
            )}
            {step === 2 &&
              (packages.length ? (
                <div className="wizard-packages">
                  {packages.map((p) => (
                    <PackageCard
                      key={p.id}
                      item={p}
                      selected={p.id === packageId}
                      onSelect={() => {
                        setPackageId(p.id);
                        setAddons([]);
                        setQuote(null);
                      }}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState>ยังไม่มีแพ็กเกจเปิดให้จอง</EmptyState>
              ))}
            {step === 3 && (
              <>
                <p>
                  เลือกเฉพาะรายการที่คุณต้องการ
                  ระบบจะป้องกันการคิดค่าตรวจซ้ำกับแพ็กเกจ
                </p>
                <input
                  aria-label="ค้นหารายการตรวจ"
                  placeholder="ค้นหาชื่อไทย อังกฤษ หรือรหัสบริการ…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {services
                  .filter((s) =>
                    (s.nameTh + s.nameEn + s.code)
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((s) => {
                    const included = selected?.items.some((i) => i.id === s.id);
                    return (
                      <label className="service-row" key={s.id}>
                        <input
                          type="checkbox"
                          checked={included || addons.includes(s.id)}
                          disabled={included || !s.price || s.requiresReview}
                          onChange={(e) => {
                            setAddons((prev) =>
                              e.target.checked
                                ? [...prev, s.id]
                                : prev.filter((id) => id !== s.id),
                            );
                            setQuote(null);
                          }}
                        />
                        <span>
                          <b>{s.nameTh}</b>
                          <small>
                            {s.code} · {s.category}
                            {included
                              ? " · รวมในแพ็กเกจแล้ว"
                              : s.requiresReview
                                ? " · ต้องประเมินโดยแพทย์"
                                : ""}
                          </small>
                        </span>
                        <strong>
                          {s.price ? money(s.price) : "ยังไม่มีราคา"}
                        </strong>
                      </label>
                    );
                  })}
              </>
            )}
            {step === 4 && (
              <>
                <p>
                  ระบบสำรองเวลาให้ 5 นาที หลังเลือกและดำเนินการต่อ
                  รับจองล่วงหน้าอย่างน้อย 24 ชั่วโมง
                </p>
                {days.length ? (
                  <>
                    <div className="field">
                      <label htmlFor="appointment-day">วันนัดหมาย</label>
                      <select
                        id="appointment-day"
                        value={day}
                        onChange={(e) => {
                          setDay(e.target.value);
                          setSlotId("");
                        }}
                      >
                        <option value="">เลือกวันนัดหมาย</option>
                        {days.map((d) => (
                          <option value={d} key={d}>
                            {new Intl.DateTimeFormat("th-TH", {
                              dateStyle: "long",
                              timeZone: "Asia/Bangkok",
                            }).format(new Date(d + "T00:00:00+07:00"))}
                          </option>
                        ))}
                      </select>
                    </div>
                    <AppointmentCalendar
                      value={day}
                      availableDays={days}
                      onChange={(value) => {
                        setDay(value);
                        setSlotId("");
                      }}
                    />
                    <div className="slot-grid">
                      {slots
                        .filter((s) => s.startsAt.slice(0, 10) === day)
                        .map((s) => (
                          <button
                            type="button"
                            key={s.id}
                            disabled={!s.available}
                            className={
                              "slot " + (slotId === s.id ? "selected" : "")
                            }
                            onClick={() => setSlotId(s.id)}
                          >
                            <b>
                              {new Date(s.startsAt).toLocaleTimeString(
                                "th-TH",
                                {
                                  timeZone: "Asia/Bangkok",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )}
                            </b>
                            <small>
                              {s.available
                                ? "ว่าง " + s.available + " ที่"
                                : "เต็ม / ปิดรับจอง"}
                            </small>
                          </button>
                        ))}
                    </div>
                  </>
                ) : (
                  <EmptyState>ยังไม่มีช่วงเวลาที่เปิดรับจอง</EmptyState>
                )}
              </>
            )}
            {step === 5 && (
              <>
                <p>ตรวจสอบข้อมูลและค่าใช้จ่ายก่อนยืนยันนัดหมาย</p>
                <dl className="review-list">
                  <div>
                    <dt>ผู้รับบริการ</dt>
                    <dd>
                      {getValues("firstName").slice(0, 1)}***{" "}
                      {getValues("lastName").slice(0, 1)}***
                    </dd>
                  </div>
                  <div>
                    <dt>เบอร์โทรศัพท์</dt>
                    <dd>***-***-{getValues("phone").slice(-4)}</dd>
                  </div>
                  <div>
                    <dt>แพ็กเกจ</dt>
                    <dd>{selected?.name}</dd>
                  </div>
                  <div>
                    <dt>วันและเวลา</dt>
                    <dd>
                      {!policy.onlineEnabled
                        ? "เจ้าหน้าที่จะติดต่อเพื่อนัดวันและเวลา"
                        : slots.find((s) => s.id === slotId)
                          ? dateTime(
                              slots.find((s) => s.id === slotId)!.startsAt,
                            )
                          : "—"}
                    </dd>
                  </div>
                </dl>
                <div className="divider" />
                {quote?.lines.map((l) => (
                  <div className="summary-line" key={l.id}>
                    <span>{l.name}</span>
                    <strong>{money(l.amount)}</strong>
                  </div>
                ))}
                <div className="summary-line summary-total">
                  <span>รวมประมาณการ</span>
                  <span>{money(quote?.total ?? 0)}</span>
                </div>
                {policy.onlineEnabled && (
                  <div className="alert">
                    เวลาสำรองถึง {hold ? dateTime(hold.expiresAt) : "—"}{" "}
                    หากราคาหรือความจุเปลี่ยน ระบบจะให้ตรวจสอบใหม่ก่อนยืนยัน
                  </div>
                )}
                <h3>เตรียมตัวก่อนรับบริการ</h3>
                <p>{selected?.preparation}</p>
                {policy.onlineEnabled && (
                  <p>
                    ยกเลิกด้วยตนเองล่วงหน้าอย่างน้อย 24 ชั่วโมง
                    กรณีใกล้ถึงเวลานัดให้ติดต่อเจ้าหน้าที่
                  </p>
                )}
                {!policy.onlineEnabled && (
                  <p>
                    การส่งข้อมูลนี้ให้เจ้าหน้าที่เข้าถึงข้อมูลลงทะเบียน
                    แบบประเมิน และรายการที่สนใจ เพื่อติดต่อกลับและประเมินก่อนนัด
                    ยังไม่ยืนยันวันเวลา ราคา หรือสิทธิ์เข้ารับบริการ
                  </p>
                )}
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                  />
                  <span>
                    ฉันตรวจสอบข้อมูล ราคา และรับทราบ{" "}
                    <a
                      href="/privacy"
                      target="_blank"
                      rel="noreferrer"
                      style={{ textDecoration: "underline" }}
                    >
                      ข้อมูลความเป็นส่วนตัว
                    </a>{" "}
                    แล้ว
                  </span>
                </label>
              </>
            )}
            <div className="form-actions">
              {step > 0 ? (
                <button
                  className="button secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setStep((s) =>
                      s === 5 && !policy.onlineEnabled ? 3 : s - 1,
                    );
                    setError("");
                  }}
                >
                  <ArrowLeft size={16} />
                  ย้อนกลับ
                </button>
              ) : (
                <span />
              )}
              <button className="button" type="submit" disabled={busy}>
                {busy
                  ? "กำลังดำเนินการ…"
                  : step === 5
                    ? policy.onlineEnabled
                      ? "ยืนยันการนัดหมาย"
                      : "ส่งข้อมูลให้เจ้าหน้าที่ติดต่อกลับ"
                    : "ดำเนินการต่อ"}
                <ArrowRight size={16} />
              </button>
            </div>
          </form>
        </section>
        <aside className="card summary-card">
          <div className="icon-box">
            <ShieldCheck />
          </div>
          <h3 style={{ marginTop: 15 }}>สรุปการลงทะเบียน</h3>
          <div className="summary-line">
            <span>แพ็กเกจ</span>
            <strong>{selected?.name ?? "ยังไม่ได้เลือก"}</strong>
          </div>
          <div className="summary-line">
            <span>รายการเพิ่มเติม</span>
            <span>{addons.length} รายการ</span>
          </div>
          {quote && (
            <div className="summary-line summary-total">
              <span>ประมาณการ</span>
              <span>{money(quote.total)}</span>
            </div>
          )}
          <div className="divider" />
          <p style={{ fontSize: 11 }}>
            ราคาจากระบบโรงพยาบาล จะตรวจสอบอีกครั้งก่อนยืนยันนัดหมาย
            ข้อมูลส่วนตัวเก็บในระบบผ่านการเข้ารหัส
          </p>
          <small className="muted">
            ข้อมูลแบบร่างถูกเก็บหลังบันทึกแบบประเมิน โดยไม่เก็บข้อมูลสุขภาพใน
            localStorage
          </small>
        </aside>
      </div>
    </div>
  );
}
