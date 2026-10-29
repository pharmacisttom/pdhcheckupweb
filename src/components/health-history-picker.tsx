"use client";
import { useLanguage } from "./language-provider";
import {
  healthHistoryOptions,
  selectionFromLegacy,
  summarizeChoices,
  type HealthHistoryField,
  type HealthSelection,
} from "@/lib/health-history";
export function HealthHistoryPicker({
  id,
  label,
  value,
  selection,
  onChange,
  error,
  maxLength,
  inputRef,
  onBlur,
  required = true,
  options: suppliedOptions,
  placeholder: suppliedPlaceholder,
  optionText,
}: {
  id: string;
  label: string;
  value: string;
  selection?: HealthSelection;
  onChange: (value: string, selection: HealthSelection) => void;
  error?: string;
  maxLength: number;
  inputRef?: (element: HTMLSelectElement | null) => void;
  onBlur?: () => void;
  required?: boolean;
  options?: { code: string; label: string }[];
  placeholder?: string;
  optionText?: (code: string) => string;
}) {
  const { t } = useLanguage();
  const current = selection ?? selectionFromLegacy(value);
  const options =
    suppliedOptions ?? healthHistoryOptions[id as HealthHistoryField] ?? [];
  function change(next: HealthSelection) {
    onChange(summarizeChoices(next, options), next);
  }
  const placeholders: Partial<Record<HealthHistoryField, string>> = {
    medicalHistory: "ระบุโรค ประวัติการเจ็บป่วย หรือการผ่าตัดเพิ่มเติม",
    currentMedication: "ระบุชื่อยา อาหารเสริม หรือรายละเอียด",
    allergies: "ระบุสิ่งที่แพ้ หรืออาการที่เคยเกิดขึ้น",
  };
  return (
    <div className="field health-history-picker" data-field={id}>
      <label htmlFor={id}>
        {label}
        {required ? " *" : ""}
      </label>
      <select
        id={id}
        ref={inputRef}
        onBlur={onBlur}
        value={current?.status ?? ""}
        required={required}
        aria-invalid={!!error}
        aria-describedby={id + "-hint" + (error ? " " + id + "-error" : "")}
        onChange={(e) =>
          change({
            status: e.target.value as HealthSelection["status"],
            codes: [],
            custom: [],
          })
        }
      >
        <option value="" disabled>
          {t("เลือกคำตอบ")}
        </option>
        <option value="none">{t("ไม่มี")}</option>
        <option value="unknown">{t("ไม่ทราบ")}</option>
        <option value="specified">{t("มี — เลือกรายการหรือเพิ่มเอง")}</option>
      </select>
      <small id={id + "-hint"}>
        {t("เลือกได้หลายรายการ และเพิ่มรายละเอียดที่ต้องการแจ้งได้")}
      </small>
      {current?.status === "specified" && (
        <fieldset className="health-history-options">
          <legend>{t("เลือกรายการที่ต้องการแจ้ง")}</legend>
          <div className="health-choice-grid">
            {options.map((option) => (
              <label className="check-label" key={option.code}>
                <input
                  type="checkbox"
                  checked={current.codes.includes(option.code)}
                  onChange={(e) =>
                    change({
                      ...current,
                      codes: e.target.checked
                        ? [...current.codes, option.code]
                        : current.codes.filter((c) => c !== option.code),
                    })
                  }
                />
                {optionText ? optionText(option.code) : t(option.label)}
              </label>
            ))}
          </div>
          {current.custom.map((text, i) => (
            <div className="health-custom-row" key={i}>
              <label className="field" htmlFor={id + "-custom-" + i}>
                {t("รายการที่เพิ่มเอง")} {i + 1}
                <textarea
                  rows={2}
                  id={id + "-custom-" + i}
                  value={text}
                  maxLength={maxLength}
                  placeholder={t(
                    suppliedPlaceholder ??
                      placeholders[id as HealthHistoryField] ??
                      "ระบุรายละเอียดเพิ่มเติม",
                  )}
                  onChange={(e) =>
                    change({
                      ...current,
                      custom: current.custom.map((v, index) =>
                        index === i ? e.target.value : v,
                      ),
                    })
                  }
                />
              </label>
              <button
                type="button"
                className="button secondary"
                aria-label={t("ลบรายการ") + " " + (i + 1) + " " + label}
                onClick={() =>
                  change({
                    ...current,
                    custom: current.custom.filter((_, index) => index !== i),
                  })
                }
              >
                {t("ลบรายการ")}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="button secondary"
            disabled={current.custom.length >= 20}
            aria-label={t("เพิ่มรายการ") + " " + label}
            onClick={() => {
              const index = current.custom.length;
              change({ ...current, custom: [...current.custom, ""] });
              requestAnimationFrame(() =>
                document.getElementById(id + "-custom-" + index)?.focus(),
              );
            }}
          >
            {t("เพิ่มรายการ")}
          </button>
          <small>
            {t("จำนวนตัวอักษร")} {summarizeChoices(current, options).length}/
            {maxLength}
          </small>
        </fieldset>
      )}
      {error && (
        <span id={id + "-error"} className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
