"use client";
import { useLanguage } from "@/components/language-provider";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ShieldCheck } from "lucide-react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
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
import { PRIVACY_VERSION } from "@/lib/intake";
import {
  additionalHistoryCodes,
  intakeReuseValue,
  type IntakeReusePlan,
} from "@/lib/intake-reuse";
import { HealthHistoryPicker } from "./health-history-picker";
import {
  healthHistoryOptions,
  validHealthSelection,
  validChoices,
  type HealthHistoryField,
  type HealthSelection,
  summarizeHealthSelection,
  type HealthSelections,
} from "@/lib/health-history";
type FormPerson = {
  healthSelections?: HealthSelections;
  intakeVersion?: 2;
  surgeryHistory: string;
  familyNcdEntries: { relationship: string; disease: string; note?: string }[];
  firstName: string;
  lastName: string;
  birthdate: string;
  sex: string;
  treatmentRight: string;
  treatmentRightDetails: string;
  medicalHistory: string;
  currentMedication: string;
  allergies: string;
  familyNcdStatus: string;
  familyNcdDetails: string;
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
type Slot = {
  day?: string;
  id: string;
  startsAt: string;
  endsAt: string;
  available: number;
};
const steps = [
  "ข้อมูลส่วนตัว",
  "ประเมินสุขภาพ",
  "เลือกแพ็กเกจ",
  "รายการเพิ่มเติม",
  "วันนัดหมาย",
  "ตรวจสอบและยืนยัน",
];
export function RegistrationWizard() {
  const { t, locale } = useLanguage();

  const router = useRouter();
  const [privacyRead, setPrivacyRead] = useState(false);
  const [staffAdvice, setStaffAdvice] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [policy, setPolicy] = useState({ onlineEnabled: true, message: "" });
  const [contactReference, setContactReference] = useState("");
  const [reviewNotice, setReviewNotice] = useState("");
  const [otpIsRequired, setOtpIsRequired] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verificationId, setVerificationId] = useState("");
  const [otp, setOtp] = useState("");
  const [testCode, setTestCode] = useState("");
  const [questionnaire, setQuestionnaire] = useState<{
    version: number;
    questions: Question[];
    intakeReuse?: IntakeReusePlan;
  } | null>(null);
  const [legacySeparateAnswers, setLegacySeparateAnswers] = useState<string[]>(
    [],
  );
  const [extraSelections, setExtraSelections] = useState<
    Record<string, HealthSelection>
  >({});
  const [questionErrors, setQuestionErrors] = useState<Record<string, string>>(
    {},
  );
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
    setValue,
    control,
    reset,
    trigger,
    formState: { errors },
  } = useForm<FormPerson>({
    defaultValues: {
      intakeVersion: 2,
      documentType: "none",
      contactChannel: "sms",
      email: "",
      identifier: "",
      assistance: "",
    },
  });
  const {
    fields: familyFields,
    append: appendFamily,
    remove: removeFamily,
  } = useFieldArray({ control, name: "familyNcdEntries" });
  const hasFamilyError = !!errors.familyNcdStatus;
  useEffect(() => {
    if (hasFamilyError) void trigger("familyNcdStatus");
  }, [familyFields.length, hasFamilyError, trigger]);
  function detailPicker(
    name: HealthHistoryField,
    label: string,
    maxLength: number,
    required = false,
  ) {
    return (
      <Controller
        name={name}
        control={control}
        rules={{
          validate: (value) => {
            if (
              name === "familyNcdDetails" &&
              getValues("familyNcdStatus") !== "yes"
            )
              return true;
            const selection = getValues(`healthSelections.${name}`);
            return (
              (selection
                ? validHealthSelection(name, selection)
                : !required || !!value?.trim()) ||
              t("กรุณาเลือกข้อมูลให้ครบและตรวจรายการที่เพิ่มเอง")
            );
          },
        }}
        render={({ field, fieldState }) => (
          <HealthHistoryPicker
            id={name}
            label={t(label)}
            required={required}
            maxLength={maxLength}
            value={field.value ?? ""}
            selection={healthSelections?.[name]}
            inputRef={field.ref}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            onChange={(value, selection) => {
              setValue(`healthSelections.${name}`, selection, {
                shouldDirty: true,
              });
              field.onChange(value);
            }}
          />
        )}
      />
    );
  }
  const healthSelections = useWatch({ control, name: "healthSelections" });
  function detailSummary(name: HealthHistoryField) {
    const selected = healthSelections?.[name];
    return selected
      ? summarizeHealthSelection(name, selected, t)
      : getValues(name);
  }
  const birthdate = useWatch({ control, name: "birthdate" });
  const familyNcdStatus = useWatch({ control, name: "familyNcdStatus" });
  const currentPerson = useWatch({ control });
  const reusedIds = Object.entries(questionnaire?.intakeReuse ?? {})
    .filter(
      ([id, source]) =>
        !legacySeparateAnswers.includes(id) &&
        intakeReuseValue(source, currentPerson as FormPerson) !== undefined,
    )
    .map(([id]) => id);
  const birth = birthdate ? new Date(birthdate + "T00:00:00") : null;
  const today = new Date();
  const age =
    birth && Number.isFinite(birth.getTime()) && birth <= today
      ? today.getFullYear() -
        birth.getFullYear() -
        (today.getMonth() < birth.getMonth() ||
        (today.getMonth() === birth.getMonth() &&
          today.getDate() < birth.getDate())
          ? 1
          : 0)
      : null;
  const documentType = useWatch({ control, name: "documentType" });
  const contactMode = staffAdvice || !!reviewNotice || !policy.onlineEnabled;
  const selected = packages.find((p) => p.id === packageId);
  const slotDay = (s: Slot) =>
    s.day ??
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(s.startsAt));
  const days = [...new Set(slots.map(slotDay))];
  useEffect(() => {
    idempotency.current = crypto.randomUUID();
    request<{ verified: boolean; otpRequired: boolean }>("auth/guest", {})
      .then(async (s) => {
        setVerified(s.verified);
        setOtpIsRequired(s.otpRequired);
        const [p, q, svc, times, draft, bookingMode] = await Promise.all([
          request<PublicPackage[]>("packages"),
          request<{
            version: number;
            questions: Question[];
            intakeReuse?: IntakeReusePlan;
          }>("questionnaire"),
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
          setLegacySeparateAnswers(
            Object.entries(q.intakeReuse ?? {})
              .filter(
                ([id, source]) =>
                  draft.answers[id] !== undefined &&
                  JSON.stringify(draft.answers[id]) !==
                    JSON.stringify(intakeReuseValue(source, draft.person)),
              )
              .map(([id]) => id),
          );
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
      setError(e instanceof Error ? e.message : t("เกิดข้อผิดพลาด"));
    } finally {
      setBusy(false);
    }
  }
  async function requestOtp() {
    const phone = getValues("phone")
      .replace(/[\s()-]/g, "")
      .replace(/^\+66/, "0");
    if (!/^0[689]\d{8}$/.test(phone))
      throw new Error(t("กรุณาระบุเบอร์มือถือไทยที่ถูกต้อง"));
    const r = await request<{ verificationId: string; testCode?: string }>(
      "otp/request",
      { phone: getValues("phone") },
    );
    setVerificationId(r.verificationId);
    setTestCode(r.testCode ?? "");
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
        if (otpIsRequired && !verified) {
          if (verificationId && otp) {
            await request("otp/verify", { verificationId, code: otp });
            setVerified(true);
            setTestCode("");
          } else {
            await requestOtp();
            return;
          }
        }
        setStep(1);
      }
      if (step === 1) {
        setQuestionErrors({});
        for (const q of questionnaire?.questions ?? []) {
          if (
            reusedIds.includes(q.id) ||
            q.type !== "text" ||
            (q.showIf && answers[q.showIf.field] !== q.showIf.equals)
          )
            continue;
          const selection = extraSelections["question-" + q.id];
          if (
            selection &&
            !validChoices(
              selection,
              (q.options ?? []).map((o) => ({ code: o, label: o })),
              1000,
            )
          ) {
            setQuestionErrors({
              [q.id]: t("กรุณาเลือกข้อมูลให้ครบและตรวจรายการที่เพิ่มเอง"),
            });
            document.getElementById("q-" + q.id)?.focus();
            throw new Error(
              t(q.label) +
                ": " +
                t("กรุณาเลือกข้อมูลให้ครบและตรวจรายการที่เพิ่มเอง"),
            );
          }
        }

        const r = await request<{
          id: string;
          decisions: {
            decision: string;
            reason: string;
            translations?: Record<string, string>;
          }[];
        }>("registrations", {
          id: registrationId || undefined,
          person: {
            ...getValues(),
            locale,
            healthSelections: {
              ...getValues("healthSelections"),
              familyNcdDetails:
                getValues("familyNcdStatus") === "yes"
                  ? getValues("healthSelections.familyNcdDetails")
                  : undefined,
            },
            familyNcdEntries:
              getValues("familyNcdStatus") === "yes"
                ? getValues("familyNcdEntries")
                : [],
            familyNcdDetails:
              getValues("familyNcdStatus") === "yes"
                ? getValues("familyNcdDetails")
                : "",
          },
          answers,
          reuseIntakeAnswers: reusedIds,
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
        setReviewNotice(
          warnings
            .map((w) => w.translations?.[locale] ?? t(w.reason))
            .join(" • "),
        );
        setStep(2);
      }
      if (step === 2) {
        if (contactMode || !selected) {
          setStaffAdvice(true);
          setQuote(null);
          setAcknowledged(false);
          setStep(5);
          return;
        }
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
        setStep(mode.onlineEnabled && !contactMode ? 4 : 5);
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
        if (!slotId) throw new Error(t("กรุณาเลือกวันและเวลา"));
        const h = await request<{ id: string; expiresAt: string }>("holds", {
          slotId,
        });
        setHold(h);
        setAcknowledged(false);
        setStep(5);
      }
      if (step === 5) {
        if (!acknowledged) throw new Error(t("กรุณารับทราบข้อมูลก่อนยืนยัน"));
        const mode = await request<typeof policy>("booking-policy");
        if (mode.onlineEnabled !== policy.onlineEnabled && !contactMode) {
          setPolicy(mode);
          setHold(null);
          setAcknowledged(false);
          setStep(3);
          throw new Error(
            t("รูปแบบการรับนัดเปลี่ยนแปลง กรุณาตรวจสอบและดำเนินการต่ออีกครั้ง"),
          );
        }
        if (!mode.onlineEnabled || contactMode) {
          const result = await request<{ reference: string }>(
            "contact-requests",
            {
              registrationId,
              quoteId: quote?.id,
              interestedPackageId: selected?.id,
              privacyAcknowledged: true,
              noticeVersion: PRIVACY_VERSION,
            },
          );
          setContactReference(result.reference);
          return;
        }
        if (!quote || !hold) throw new Error(t("กรุณาเลือกราคาและวันนัดใหม่"));
        await request("bookings", {
          registrationId,
          holdId: hold.id,
          quoteId: quote.id,
          fingerprint: quote.fingerprint,
          idempotencyKey: idempotency.current,
          privacyAcknowledged: true,
          noticeVersion: PRIVACY_VERSION,
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
          title={t("ส่งข้อมูลให้เจ้าหน้าที่แล้ว")}
          description={t("เจ้าหน้าที่จะติดต่อกลับเพื่อนัดรับบริการ")}
        />
        <section className="card">
          <h2>{contactReference}</h2>
          <p>
            {t(
              "ส่งข้อมูลให้เจ้าหน้าที่แล้ว ยังไม่ใช่การยืนยันวันนัดหมาย เจ้าหน้าที่จะตรวจสอบข้อมูลและติดต่อกลับตามเบอร์ที่ระบุ",
            )}
          </p>
          <a className="button" href="/bookings">
            {t("ตรวจสอบรายการของฉัน")}
          </a>
        </section>
      </div>
    );
  if (!ready)
    return (
      <div className="registration-container">
        <PageHeader
          title={t("ลงทะเบียนตรวจสุขภาพ")}
          description={t("เตรียมข้อมูลเพื่อการดูแลที่เหมาะสม")}
        />
        {error ? <ErrorState message={error} /> : <Loading />}
      </div>
    );
  if (!privacyRead)
    return (
      <div className="registration-container">
        <PageHeader
          title={t("ข้อมูลความเป็นส่วนตัว")}
          description={t("อ่านก่อนกรอกข้อมูลส่วนตัวและสุขภาพ")}
        />
        <section className="card">
          <h2>{t("วัตถุประสงค์และการใช้ข้อมูล")}</h2>
          <p>
            {t(
              "โรงพยาบาลปลวกแดงเก็บข้อมูลส่วนตัว ข้อมูลติดต่อ สิทธิการรักษา ประวัติสุขภาพและแบบประเมิน เพื่อให้เจ้าหน้าที่ตรวจข้อมูล แนะนำบริการ และติดต่อนัดหมาย โดยจำกัดการเข้าถึงตามหน้าที่และจัดเก็บเข้ารหัส",
            )}
          </p>
          <p>
            {t(
              "การส่งความสนใจยังไม่ใช่การยืนยันนัด ราคา หรือสิทธิการเบิกจ่าย คุณสามารถติดต่อโรงพยาบาลเพื่อขอเข้าถึง แก้ไข หรือดำเนินการเกี่ยวกับข้อมูลตามประกาศความเป็นส่วนตัว",
            )}
          </p>
          <a href="/privacy" target="_blank" rel="noreferrer">
            {t("อ่านประกาศความเป็นส่วนตัวฉบับเต็ม")}
          </a>
          <p>
            {t("เวอร์ชัน")}
            {PRIVACY_VERSION}
          </p>
          <button
            type="button"
            className="button"
            onClick={() => setPrivacyRead(true)}
          >
            {t("รับทราบและเริ่มกรอกข้อมูล")}
          </button>
        </section>
      </div>
    );
  return (
    <div className="registration-container">
      <PageHeader
        eyebrow="HEALTH CHECK REGISTRATION"
        title={t("ลงทะเบียนตรวจสุขภาพ")}
        description={t(
          "กรอกข้อมูลให้ครบถ้วน เพื่อเตรียมพร้อมก่อนเข้ารับบริการ",
        )}
      />
      <div className="stepper" aria-label={t("ขั้นตอนลงทะเบียน")}>
        {steps.map((label, i) => (
          <button
            key={label}
            type="button"
            className={i === step ? "current" : i < step ? "done" : ""}
            disabled={i > step || busy || (contactMode && i === 4)}
            onClick={() => setStep(i)}
            aria-current={i === step ? "step" : undefined}
          >
            <span>{i < step ? <Check size={13} /> : i + 1}</span>
            {i === 4 && contactMode ? t("เจ้าหน้าที่นัดให้") : t(label)}
          </button>
        ))}
      </div>
      <div className="wizard-grid">
        <section className="card">
          <h2 ref={heading} tabIndex={-1}>
            {step + 1}. {t(steps[step])}
          </h2>
          {error && <ErrorState message={error} />}
          {Object.keys(errors).length > 0 && (
            <div className="alert" role="alert">
              {t(
                "กรุณาตรวจสอบช่องข้อมูลที่จำเป็นให้ครบถ้วน และไม่เว้นว่างเฉพาะช่องว่าง",
              )}
            </div>
          )}
          {!policy.onlineEnabled && (
            <div className="alert" role="status">
              {policy.message}
              <p>
                {t(
                  "ส่งข้อมูลให้เจ้าหน้าที่ติดต่อกลับได้ โดยไม่ต้องเลือกวันและเวลา",
                )}
              </p>
            </div>
          )}
          {reviewNotice && (
            <div className="alert">
              {t("ข้อมูลที่ต้องให้เจ้าหน้าที่ประเมิน:")}
              {reviewNotice}
            </div>
          )}
          <form
            method="post"
            onSubmit={(event) => handleSubmit(() => next())(event)}
          >
            {step === 0 && (
              <>
                <p>
                  {t(
                    "ข้อมูลของคุณจะถูกใช้เพื่อเตรียมบริการและการติดต่อเรื่องนัดหมาย",
                  )}
                </p>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="firstName">{t("ชื่อ *")}</label>
                    <input
                      id="firstName"
                      autoComplete="given-name"
                      {...register("firstName", {
                        required: t("กรุณาระบุชื่อ"),
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
                    <label htmlFor="lastName">{t("นามสกุล *")}</label>
                    <input
                      id="lastName"
                      autoComplete="family-name"
                      {...register("lastName", {
                        required: t("กรุณาระบุนามสกุล"),
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
                    <label htmlFor="birthdate">{t("วันเกิด (ค.ศ.) *")}</label>
                    <input
                      id="birthdate"
                      type="date"
                      max={new Date().toISOString().slice(0, 10)}
                      {...register("birthdate", {
                        required: t("กรุณาระบุวันเกิด"),
                      })}
                    />
                    {age !== null && (
                      <p role="status">
                        {t("อายุ")}
                        {age}
                        {t("ปี")}
                      </p>
                    )}
                    <small>
                      {t("กรอกปีคริสต์ศักราช เช่น พ.ศ. 2533 = ค.ศ. 1990")}
                    </small>
                  </div>
                  <div className="field">
                    <label htmlFor="sex">{t("เพศ *")}</label>
                    <select
                      id="sex"
                      {...register("sex", { required: t("กรุณาระบุเพศ") })}
                      required
                    >
                      <option value="">{t("เลือกเพศ")}</option>
                      <option value="male">{t("ชาย")}</option>
                      <option value="female">{t("หญิง")}</option>
                      <option value="other">{t("อื่น ๆ")}</option>
                      <option value="unspecified">{t("ไม่ประสงค์ระบุ")}</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="treatmentRight">
                      {t("สิทธิการรักษา *")}
                    </label>
                    <select
                      id="treatmentRight"
                      {...register("treatmentRight", {
                        required: t("กรุณาระบุสิทธิการรักษา"),
                      })}
                      required
                    >
                      <option value="">{t("เลือกสิทธิการรักษา")}</option>
                      <option value="universal">
                        {t("บัตรทอง / หลักประกันสุขภาพถ้วนหน้า")}
                      </option>
                      <option value="social_security">
                        {t("ประกันสังคม")}
                      </option>
                      <option value="civil_servant">
                        {t("สวัสดิการข้าราชการ / รัฐวิสาหกิจ")}
                      </option>
                      <option value="private_insurance">
                        {t("ประกันสุขภาพเอกชน")}
                      </option>
                      <option value="self_pay">{t("ชำระเงินเอง")}</option>
                      <option value="other">{t("อื่น ๆ")}</option>
                      <option value="unknown">{t("ไม่ทราบสิทธิ")}</option>
                    </select>
                    <small>
                      {t("เจ้าหน้าที่จะตรวจสอบสิทธิและค่าใช้จ่ายก่อนรับบริการ")}
                    </small>
                  </div>
                  {detailPicker(
                    "treatmentRightDetails",
                    "โรงพยาบาลตามสิทธิ / บริษัทประกัน / รายละเอียดเพิ่มเติม",
                    500,
                  )}
                  <div className="field">
                    <label htmlFor="phone">{t("โทรศัพท์มือถือ *")}</label>
                    <input
                      id="phone"
                      type="tel"
                      autoComplete="tel"
                      {...register("phone", { required: true })}
                      onChange={(e) => {
                        register("phone").onChange(e);
                        setVerified(false);
                        setVerificationId("");
                        setOtp("");
                        setTestCode("");
                      }}
                    />
                  </div>
                  {otpIsRequired && (
                    <div className="full">
                      {verified && (
                        <p role="status">{t("ยืนยันเบอร์โทรแล้ว ✓")}</p>
                      )}
                      {verificationId && !verified && (
                        <div className="toolbar" style={{ marginTop: 12 }}>
                          <label className="field">
                            {t("รหัส OTP")}
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
                            {t("ยืนยันรหัส")}
                          </button>
                        </div>
                      )}
                      {testCode && (
                        <div className="alert">
                          {t("โหมดทดสอบ:")}
                          {testCode}
                          {t("— ไม่มีการส่ง SMS จริง")}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="field">
                    <label htmlFor="email">{t("อีเมล (ไม่บังคับ)")}</label>
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      {...register("email")}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="documentType">{t("เอกสารระบุตัวตน")}</label>
                    <select id="documentType" {...register("documentType")}>
                      <option value="none">
                        {t("ยังไม่ระบุ / แสดงในวันรับบริการ")}
                      </option>
                      <option value="thai_id">
                        {t("บัตรประจำตัวประชาชน")}
                      </option>
                      <option value="passport">{t("หนังสือเดินทาง")}</option>
                    </select>
                  </div>
                  {documentType !== "none" && (
                    <div className="field full">
                      <label htmlFor="identifier">{t("เลขเอกสาร")}</label>
                      <input
                        id="identifier"
                        {...register("identifier")}
                        maxLength={50}
                      />
                    </div>
                  )}
                  <div className="full">
                    {detailPicker(
                      "assistance",
                      "ความช่วยเหลือหรือสิ่งอำนวยความสะดวกที่ต้องการ",
                      500,
                    )}
                  </div>
                </div>
              </>
            )}
            {step === 1 && (
              <div className="stack">
                <p>
                  {t("แบบประเมินฉบับที่")}
                  {questionnaire?.version}
                  {t("• คำตอบใช้ประกอบการดูแล ไม่ใช่การวินิจฉัยโรค")}
                </p>
                <p className="alert">
                  {t(
                    "กรอกประวัติครั้งเดียว ระบบใช้ข้อมูลร่วมกับแบบประเมินโดยไม่ต้องกรอกซ้ำ",
                  )}
                </p>
                <fieldset className="stack">
                  <legend>{t("ประวัติสุขภาพและครอบครัว")}</legend>
                  <p>
                    {t(
                      "ระบุประวัติที่ทราบ หากไม่มีให้ระบุ “ไม่มี” หากไม่ทราบให้ระบุ “ไม่ทราบ”",
                    )}
                  </p>
                  {(
                    [
                      [
                        "medicalHistory",
                        t(
                          additionalHistoryCodes(questionnaire?.questions ?? [])
                            .length
                            ? "ประวัติการเจ็บป่วยอื่น / รายละเอียดเพิ่มเติม"
                            : "โรคประจำตัว / ประวัติการเจ็บป่วย",
                        ),
                        2000,
                      ],
                      [
                        "currentMedication",
                        t("ยาหรืออาหารเสริมที่ใช้อยู่"),
                        2000,
                      ],
                      [
                        "allergies",
                        t("ประวัติแพ้ยา / อาหาร / สารอื่น ๆ"),
                        1000,
                      ],
                    ] as const
                  ).map(([name, label, maxLength]) => (
                    <Controller
                      key={name}
                      name={name}
                      control={control}
                      rules={{
                        validate: (value) => {
                          const selection = getValues(
                            `healthSelections.${name}`,
                          );
                          return (
                            (selection
                              ? validHealthSelection(name, selection)
                              : !!value?.trim()) ||
                            t("กรุณาเลือกข้อมูลให้ครบและตรวจรายการที่เพิ่มเอง")
                          );
                        },
                      }}
                      render={({ field, fieldState }) => (
                        <HealthHistoryPicker
                          id={name}
                          inputRef={field.ref}
                          onBlur={field.onBlur}
                          label={t(label)}
                          value={field.value ?? ""}
                          selection={healthSelections?.[name]}
                          options={
                            name === "medicalHistory"
                              ? healthHistoryOptions.medicalHistory.filter(
                                  (o) =>
                                    (o.code !== "past_surgery" &&
                                      !additionalHistoryCodes(
                                        questionnaire?.questions ?? [],
                                      ).includes(o.code)) ||
                                    healthSelections?.medicalHistory?.codes.includes(
                                      o.code,
                                    ),
                                )
                              : undefined
                          }
                          maxLength={maxLength}
                          error={fieldState.error?.message}
                          onChange={(value, selection) => {
                            setValue(`healthSelections.${name}`, selection, {
                              shouldDirty: true,
                            });
                            field.onChange(value);
                          }}
                        />
                      )}
                    />
                  ))}
                  {detailPicker(
                    "surgeryHistory",
                    "ประวัติการผ่าตัด",
                    2000,
                    true,
                  )}
                  <div className="field">
                    <label htmlFor="familyNcdStatus">
                      {t("ญาติสายตรงมีประวัติโรค NCD หรือไม่ *")}
                    </label>
                    <small>
                      {t(
                        "เช่น พ่อ แม่ พี่น้องร่วมบิดามารดา หรือลูก ที่มีโรคเบาหวาน ความดันโลหิตสูง โรคหัวใจ หรือโรคหลอดเลือดสมอง",
                      )}
                    </small>
                    <select
                      id="familyNcdStatus"
                      required
                      {...register("familyNcdStatus", {
                        required: t("กรุณาระบุประวัติครอบครัว"),
                        validate: (value) =>
                          value !== "yes" ||
                          !!getValues("familyNcdEntries")?.length ||
                          t("กรุณาระบุความสัมพันธ์และโรคโดยไม่ระบุชื่อญาติ"),
                      })}
                    >
                      <option value="">{t("เลือกคำตอบ")}</option>
                      <option value="yes">{t("มี")}</option>
                      <option value="no">{t("ไม่มีประวัติที่ทราบ")}</option>
                      <option value="unknown">{t("ไม่ทราบ")}</option>
                    </select>
                  </div>
                  {familyNcdStatus === "yes" && (
                    <fieldset>
                      <legend>
                        {t(
                          "ญาติสายตรง: ระบุความสัมพันธ์และโรค ไม่ต้องระบุชื่อ",
                        )}
                      </legend>
                      {familyFields.map((family, i) => (
                        <div className="form-grid" key={family.id}>
                          <label className="field">
                            {t("ความสัมพันธ์")}
                            <select
                              required
                              {...register(
                                `familyNcdEntries.${i}.relationship`,
                              )}
                            >
                              <option value="">{t("เลือกคำตอบ")}</option>
                              <option value="mother">{t("มารดา")}</option>
                              <option value="father">{t("บิดา")}</option>
                              <option value="sibling">{t("พี่น้อง")}</option>
                              <option value="child">{t("บุตร")}</option>
                            </select>
                          </label>
                          <label className="field">
                            {t("โรค")}
                            <select
                              required
                              {...register(`familyNcdEntries.${i}.disease`)}
                            >
                              <option value="">{t("เลือกคำตอบ")}</option>
                              <option value="diabetes">{t("เบาหวาน")}</option>
                              <option value="hypertension">
                                {t("ความดันโลหิตสูง")}
                              </option>
                              <option value="heart_disease">
                                {t("โรคหัวใจ")}
                              </option>
                              <option value="stroke">
                                {t("โรคหลอดเลือดสมอง")}
                              </option>
                              <option value="cancer">{t("มะเร็ง")}</option>
                              <option value="other">{t("อื่น ๆ")}</option>
                            </select>
                          </label>
                          <Controller
                            name={`familyNcdEntries.${i}.note`}
                            control={control}
                            rules={{
                              validate: () => {
                                if (getValues("familyNcdStatus") !== "yes")
                                  return true;
                                const meta =
                                  extraSelections["family-note-" + family.id];
                                return (
                                  !meta ||
                                  validChoices(meta, [], 500) ||
                                  t(
                                    "กรุณาเลือกข้อมูลให้ครบและตรวจรายการที่เพิ่มเอง",
                                  )
                                );
                              },
                            }}
                            render={({ field, fieldState }) => (
                              <HealthHistoryPicker
                                id={"family-note-" + family.id}
                                label={t(
                                  "รายละเอียดโรคของญาติ (ไม่ต้องระบุชื่อ)",
                                )}
                                required={false}
                                options={[]}
                                maxLength={500}
                                value={field.value ?? ""}
                                selection={
                                  extraSelections["family-note-" + family.id]
                                }
                                inputRef={field.ref}
                                onBlur={field.onBlur}
                                error={fieldState.error?.message}
                                onChange={(value, selection) => {
                                  setExtraSelections((prev) => ({
                                    ...prev,
                                    ["family-note-" + family.id]: selection,
                                  }));
                                  field.onChange(value);
                                }}
                              />
                            )}
                          />
                          <button
                            type="button"
                            className="button secondary"
                            onClick={() => {
                              removeFamily(i);
                              setExtraSelections((prev) => {
                                const next = { ...prev };
                                delete next["family-note-" + family.id];
                                return next;
                              });
                            }}
                          >
                            {t("ลบรายการญาติ")}
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() =>
                          appendFamily({
                            relationship: "",
                            disease: "",
                            note: "",
                          })
                        }
                      >
                        {t("เพิ่มประวัติญาติสายตรง")}
                      </button>
                    </fieldset>
                  )}
                  {familyNcdStatus === "yes" && (
                    <details open={!!getValues("familyNcdDetails")}>
                      <summary>
                        {t(
                          "ข้อมูลเพิ่มเติมเกี่ยวกับประวัติครอบครัว (ไม่บังคับ)",
                        )}
                      </summary>
                      {detailPicker(
                        "familyNcdDetails",
                        "ข้อมูลเพิ่มเติมเกี่ยวกับประวัติครอบครัว (ไม่บังคับ)",
                        2000,
                      )}
                    </details>
                  )}
                </fieldset>
                {questionnaire?.questions
                  .filter(
                    (q) =>
                      !reusedIds.includes(q.id) &&
                      (!q.showIf ||
                        answers[q.showIf.field] === q.showIf.equals),
                  )
                  .map((q) => (
                    <div className="field" key={q.id}>
                      {q.type !== "text" && (
                        <label htmlFor={"q-" + q.id}>
                          {q.translations?.[locale]?.label ?? t(q.label)}
                          {q.required ? " *" : ""}
                        </label>
                      )}
                      {q.type === "single" ? (
                        <select
                          id={"q-" + q.id}
                          required={q.required}
                          value={String(answers[q.id] ?? "")}
                          onChange={(e) => updateAnswer(q.id, e.target.value)}
                        >
                          <option value="">{t("เลือกคำตอบ")}</option>
                          {q.options?.map((o) => (
                            <option key={o} value={o}>
                              {q.translations?.[locale]?.options?.[o] ?? t(o)}
                            </option>
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
                              {q.translations?.[locale]?.options?.[o] ?? t(o)}
                            </label>
                          ))}
                        </div>
                      ) : q.type === "text" ? (
                        <HealthHistoryPicker
                          id={"q-" + q.id}
                          label={q.translations?.[locale]?.label ?? t(q.label)}
                          required={!!q.required}
                          options={(q.options ?? []).map((o) => ({
                            code: o,
                            label: o,
                          }))}
                          optionText={(code) =>
                            q.translations?.[locale]?.options?.[code] ?? t(code)
                          }
                          maxLength={1000}
                          value={String(answers[q.id] ?? "")}
                          selection={extraSelections["question-" + q.id]}
                          error={questionErrors[q.id]}
                          onChange={(value, selection) => {
                            setExtraSelections((prev) => ({
                              ...prev,
                              ["question-" + q.id]: selection,
                            }));
                            setQuestionErrors((prev) => {
                              const next = { ...prev };
                              delete next[q.id];
                              return next;
                            });
                            updateAnswer(q.id, value);
                          }}
                        />
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
            {step === 2 && (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={staffAdvice || !!reviewNotice}
                  disabled={!!reviewNotice}
                  onChange={(e) => {
                    setStaffAdvice(e.target.checked);
                    setQuote(null);
                  }}
                />
                {t("ให้เจ้าหน้าที่แนะนำแพ็กเกจและรายการตรวจ")}
              </label>
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
                        setStaffAdvice(false);
                        setPackageId(p.id);
                        setAddons([]);
                        setQuote(null);
                      }}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState>{t("ยังไม่มีแพ็กเกจเปิดให้จอง")}</EmptyState>
              ))}
            {step === 3 && (
              <>
                <p>
                  {t(
                    "เลือกเฉพาะรายการที่คุณต้องการ ระบบจะป้องกันการคิดค่าตรวจซ้ำกับแพ็กเกจ",
                  )}
                </p>
                <input
                  aria-label={t("ค้นหารายการตรวจ")}
                  placeholder={t("ค้นหาชื่อไทย อังกฤษ หรือรหัสบริการ…")}
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
                              ? t(" · รวมในแพ็กเกจแล้ว")
                              : s.requiresReview
                                ? t(" · ต้องประเมินโดยแพทย์")
                                : ""}
                          </small>
                        </span>
                        <strong>
                          {s.price ? money(s.price) : t("ยังไม่มีราคา")}
                        </strong>
                      </label>
                    );
                  })}
              </>
            )}
            {step === 4 && (
              <>
                <p>
                  {t(
                    "ระบบสำรองเวลาให้ 5 นาที หลังเลือกและดำเนินการต่อ รับจองล่วงหน้าอย่างน้อย 24 ชั่วโมง",
                  )}
                </p>
                {days.length ? (
                  <>
                    <div className="field">
                      <label htmlFor="appointment-day">{t("วันนัดหมาย")}</label>
                      <select
                        id="appointment-day"
                        value={day}
                        onChange={(e) => {
                          setDay(e.target.value);
                          setSlotId("");
                        }}
                      >
                        <option value="">{t("เลือกวันนัดหมาย")}</option>
                        {days.map((d) => (
                          <option value={d} key={d}>
                            {new Intl.DateTimeFormat(locale, {
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
                        .filter((s) => slotDay(s) === day)
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
                              {new Date(s.startsAt).toLocaleTimeString(locale, {
                                timeZone: "Asia/Bangkok",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </b>
                            <small>
                              {s.available
                                ? t("ว่าง ") + s.available + t(" ที่")
                                : t("เต็ม / ปิดรับจอง")}
                            </small>
                          </button>
                        ))}
                    </div>
                  </>
                ) : (
                  <EmptyState>{t("ยังไม่มีช่วงเวลาที่เปิดรับจอง")}</EmptyState>
                )}
              </>
            )}
            {step === 5 && (
              <>
                <p>
                  {contactMode
                    ? t("ตรวจสอบข้อมูลก่อนส่งความสนใจ ยังไม่ใช่การยืนยันนัด")
                    : t("ตรวจสอบข้อมูลและค่าใช้จ่ายก่อนยืนยันนัดหมาย")}
                </p>
                <dl className="review-list">
                  <div>
                    <dt>{t("ผู้รับบริการ")}</dt>
                    <dd>
                      {getValues("firstName").slice(0, 1)}***{" "}
                      {getValues("lastName").slice(0, 1)}***
                    </dd>
                  </div>
                  <div>
                    <dt>{t("เบอร์โทรศัพท์")}</dt>
                    <dd>***-***-{getValues("phone").slice(-4)}</dd>
                  </div>
                  <div>
                    <dt>{t("อายุ / เพศ")}</dt>
                    <dd>
                      {age ?? "—"}
                      {t("ปี /")}{" "}
                      {{
                        male: t("ชาย"),
                        female: t("หญิง"),
                        other: t("อื่น ๆ"),
                        unspecified: t("ไม่ประสงค์ระบุ"),
                      }[getValues("sex")] ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("สิทธิการรักษา")}</dt>
                    <dd>
                      {{
                        universal: t("บัตรทอง"),
                        social_security: t("ประกันสังคม"),
                        civil_servant: t("สวัสดิการข้าราชการ / รัฐวิสาหกิจ"),
                        private_insurance: t("ประกันสุขภาพเอกชน"),
                        self_pay: t("ชำระเงินเอง"),
                        other: t("อื่น ๆ"),
                        unknown: t("ไม่ทราบสิทธิ"),
                      }[getValues("treatmentRight")] ?? "—"}{" "}
                      {detailSummary("treatmentRightDetails")}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("ประวัติการเจ็บป่วย")}</dt>
                    <dd>
                      {healthSelections?.medicalHistory
                        ? summarizeHealthSelection(
                            "medicalHistory",
                            healthSelections.medicalHistory,
                            t,
                          )
                        : getValues("medicalHistory")}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("ประวัติการผ่าตัด (ระบุ ไม่มี / ไม่ทราบ ได้)")}</dt>
                    <dd>{detailSummary("surgeryHistory") || "—"}</dd>
                  </div>
                  <div>
                    <dt>{t("ยาที่ใช้ / ประวัติแพ้")}</dt>
                    <dd>
                      {healthSelections?.currentMedication
                        ? summarizeHealthSelection(
                            "currentMedication",
                            healthSelections.currentMedication,
                            t,
                          )
                        : getValues("currentMedication")}{" "}
                      /{" "}
                      {healthSelections?.allergies
                        ? summarizeHealthSelection(
                            "allergies",
                            healthSelections.allergies,
                            t,
                          )
                        : getValues("allergies")}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("ประวัติ NCD ในญาติสายตรง")}</dt>
                    <dd>
                      {getValues("familyNcdStatus") === "yes"
                        ? detailSummary("familyNcdDetails")
                        : getValues("familyNcdStatus") === "no"
                          ? t("ไม่มีประวัติที่ทราบ")
                          : t("ไม่ทราบ")}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("แพ็กเกจ")}</dt>
                    <dd>{selected?.name ?? t("ให้เจ้าหน้าที่แนะนำ")}</dd>
                  </div>
                  {getValues("familyNcdStatus") === "yes" &&
                    getValues("familyNcdEntries")?.map((f, i) => (
                      <div key={i}>
                        <dt>{t("ประวัติ NCD ในญาติสายตรง")}</dt>
                        <dd>
                          {t(
                            (
                              {
                                mother: "มารดา",
                                father: "บิดา",
                                sibling: "พี่น้อง",
                                child: "บุตร",
                              } as Record<string, string>
                            )[f.relationship] ?? f.relationship,
                          )}
                          :{" "}
                          {t(
                            (
                              {
                                diabetes: "เบาหวาน",
                                hypertension: "ความดันโลหิตสูง",
                                heart_disease: "โรคหัวใจ",
                                stroke: "โรคหลอดเลือดสมอง",
                                cancer: "มะเร็ง",
                                other: "อื่น ๆ",
                              } as Record<string, string>
                            )[f.disease] ?? f.disease,
                          )}
                        </dd>
                      </div>
                    ))}
                  <div>
                    <dt>{t("วันและเวลา")}</dt>
                    <dd>
                      {contactMode
                        ? t("เจ้าหน้าที่จะติดต่อเพื่อนัดวันและเวลา")
                        : slots.find((s) => s.id === slotId)
                          ? dateTime(
                              slots.find((s) => s.id === slotId)!.startsAt,
                              locale,
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
                  <span>{t("รวมประมาณการ")}</span>
                  <span>
                    {quote
                      ? money(quote.total)
                      : t("รอเจ้าหน้าที่สรุปค่าใช้จ่าย")}
                  </span>
                </div>
                {!contactMode && (
                  <div className="alert">
                    {t("เวลาสำรองถึง")}
                    {hold ? dateTime(hold.expiresAt, locale) : "—"}{" "}
                    {t(
                      "หากราคาหรือความจุเปลี่ยน ระบบจะให้ตรวจสอบใหม่ก่อนยืนยัน",
                    )}
                  </div>
                )}
                <h3>{t("เตรียมตัวก่อนรับบริการ")}</h3>
                <p>{selected?.preparation}</p>
                {policy.onlineEnabled && (
                  <p>
                    {t(
                      "ยกเลิกด้วยตนเองล่วงหน้าอย่างน้อย 24 ชั่วโมง กรณีใกล้ถึงเวลานัดให้ติดต่อเจ้าหน้าที่",
                    )}
                  </p>
                )}
                {contactMode && (
                  <p>
                    {t(
                      "การส่งข้อมูลนี้ให้เจ้าหน้าที่เข้าถึงข้อมูลลงทะเบียน แบบประเมิน และรายการที่สนใจ เพื่อติดต่อกลับและประเมินก่อนนัด ยังไม่ยืนยันวันเวลา ราคา หรือสิทธิ์เข้ารับบริการ",
                    )}
                  </p>
                )}
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                  />
                  <span>
                    {t("ฉันตรวจสอบข้อมูล ราคา และรับทราบ")}{" "}
                    <a
                      href="/privacy"
                      target="_blank"
                      rel="noreferrer"
                      style={{ textDecoration: "underline" }}
                    >
                      {t("ข้อมูลความเป็นส่วนตัว")}
                    </a>{" "}
                    {t("แล้ว")}
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
                    setStep((s) => (s === 5 && contactMode ? 2 : s - 1));
                    setError("");
                  }}
                >
                  <ArrowLeft size={16} />
                  {t("ย้อนกลับ")}
                </button>
              ) : (
                <span />
              )}
              <button className="button" type="submit" disabled={busy}>
                {busy
                  ? t("กำลังดำเนินการ…")
                  : step === 5
                    ? !contactMode
                      ? t("ยืนยันการนัดหมาย")
                      : t("ส่งข้อมูลให้เจ้าหน้าที่ติดต่อกลับ")
                    : t("ดำเนินการต่อ")}
                <ArrowRight size={16} />
              </button>
            </div>
          </form>
        </section>
        <aside className="card summary-card">
          <div className="icon-box">
            <ShieldCheck />
          </div>
          <h3 style={{ marginTop: 15 }}>{t("สรุปการลงทะเบียน")}</h3>
          <div className="summary-line">
            <span>{t("แพ็กเกจ")}</span>
            <strong>{selected?.name ?? t("ยังไม่ได้เลือก")}</strong>
          </div>
          <div className="summary-line">
            <span>{t("รายการเพิ่มเติม")}</span>
            <span>
              {addons.length}
              {t("รายการ")}
            </span>
          </div>
          {quote && (
            <div className="summary-line summary-total">
              <span>{t("ประมาณการ")}</span>
              <span>{money(quote.total)}</span>
            </div>
          )}
          <div className="divider" />
          <p style={{ fontSize: 11 }}>
            {t(
              "ราคาจากระบบโรงพยาบาล จะตรวจสอบอีกครั้งก่อนยืนยันนัดหมาย ข้อมูลส่วนตัวเก็บในระบบผ่านการเข้ารหัส",
            )}
          </p>
          <small className="muted">
            {t(
              "ข้อมูลแบบร่างถูกเก็บหลังบันทึกแบบประเมิน โดยไม่เก็บข้อมูลสุขภาพใน localStorage",
            )}
          </small>
        </aside>
      </div>
    </div>
  );
}
