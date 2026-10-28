"use client";
import { useLanguage } from "./language-provider";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
export function AppointmentCalendar({
  value,
  onChange,
  availableDays,
}: {
  value: string;
  onChange: (value: string) => void;
  availableDays: string[];
}) {
  const { locale } = useLanguage();
  const key = (date: Date) =>
    [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
  return (
    <DayPicker
      mode="single"
      weekStartsOn={1}
      selected={value ? new Date(value + "T12:00:00") : undefined}
      onSelect={(d) => {
        if (d) onChange(key(d));
      }}
      disabled={(d) => !availableDays.includes(key(d))}
      defaultMonth={
        availableDays[0] ? new Date(availableDays[0] + "T12:00:00") : new Date()
      }
      labels={{
        labelDayButton: (d) =>
          new Intl.DateTimeFormat(locale, { dateStyle: "full" }).format(d),
      }}
      formatters={{
        formatCaption: (d) =>
          new Intl.DateTimeFormat(locale, {
            month: "long",
            year: "numeric",
          }).format(d),
        formatWeekdayName: (d) =>
          new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d),
      }}
      styles={{ root: { margin: "16px auto", fontSize: "13px" } }}
    />
  );
}
