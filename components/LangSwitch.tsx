"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { locales, type Locale } from "@/lib/i18n";

const names: Record<Locale, string> = { kk: "Қаз", ru: "Рус" };
/** Полное имя для скринридера: «Қаз» и «Рус» он читает по буквам. */
const fullNames: Record<Locale, string> = { kk: "Қазақша", ru: "Русский" };

/** Меняет язык в адресе, оставаясь на той же странице: /ru/teacher/demo → /kk/teacher/demo. */
export function LangSwitch({ current, label }: { current: Locale; label: string }) {
  const pathname = usePathname() ?? `/${current}`;
  return <LangLinks current={current} label={label} rest={pathname.split("/").slice(2).join("/")} />;
}

/**
 * Сами ссылки. Пока адрес страницы неизвестен (страница ученика или урока из базы собирается при запросе),
 * шапка показывает их со ссылками на главную на другом языке.
 */
export function LangLinks({ current, label, rest }: { current: Locale; label: string; rest: string }) {
  return (
    <div role="group" aria-label={label} className="flex rounded-btn border border-line p-0.5 text-[0.82rem]">
      {[...locales].reverse().map((locale) => {
        const active = locale === current;
        return (
          <Link
            key={locale}
            href={`/${locale}${rest ? `/${rest}` : ""}`}
            hrefLang={locale}
            lang={locale}
            aria-current={active ? "true" : undefined}
            aria-label={fullNames[locale]}
            className={`grid min-h-9 min-w-11 place-items-center rounded-[6px] px-2.5 font-semibold transition-colors ${
              active ? "bg-ink text-white" : "text-muted hover:bg-surface hover:text-ink"
            }`}
          >
            {names[locale]}
          </Link>
        );
      })}
    </div>
  );
}
