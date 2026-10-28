"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { languageNames, locales, translate, type Locale } from "@/lib/i18n";
const LanguageContext = createContext<{
  locale: Locale;
  setLocale: (l: Locale) => void;
  ready: boolean;
}>({ locale: "th", setLocale: () => {}, ready: false });
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>("th");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("pdh-language");
    } catch {}
    if (locales.includes(saved as Locale)) setLocale(saved as Locale);
    setReady(true);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    return () => {
      document.documentElement.lang = "th";
    };
  }, [locale]);
  function choose(l: Locale) {
    setLocale(l);
    try {
      localStorage.setItem("pdh-language", l);
    } catch {}
  }
  return (
    <LanguageContext.Provider value={{ locale, setLocale: choose, ready }}>
      {children}
    </LanguageContext.Provider>
  );
}
export function useLanguage() {
  const context = useContext(LanguageContext);
  return { ...context, t: (key: string) => translate(key, context.locale) };
}
export function LanguageSwitcher() {
  const { locale, setLocale, t, ready } = useLanguage();
  return (
    <label className="language-switcher">
      <span className="sr-only">{t("ภาษา")}</span>
      <select
        disabled={!ready}
        aria-label={t("ภาษา")}
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
      >
        {locales.map((l) => (
          <option key={l} value={l} lang={l}>
            {languageNames[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
