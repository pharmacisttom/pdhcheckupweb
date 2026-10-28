import th from "./th.json";
import en from "./en.json";
import zh from "./zh-Hans.json";
import my from "./my.json";
import km from "./km.json";
export const locales = ["th", "en", "zh-Hans", "my", "km"] as const;
export type Locale = (typeof locales)[number];
export const languageNames: Record<Locale, string> = {
  th: "ไทย",
  en: "English",
  "zh-Hans": "简体中文",
  my: "မြန်မာ",
  km: "ខ្មែរ",
};
export const dictionaries: Record<Locale, Record<string, string>> = {
  th,
  en,
  "zh-Hans": zh,
  my,
  km,
};
export function translate(key: string, locale: Locale) {
  return dictionaries[locale][key] ?? dictionaries.th[key] ?? key;
}
