"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { locales, type Locale } from "@/lib/i18n";

const names: Record<Locale, string> = { kk: "Қаз", ru: "Рус" };

/** Меняет язык в адресе, оставаясь на той же странице: /ru/teacher/demo → /kk/teacher/demo. */
export function LangSwitch({ current, label }: { current: Locale; label: string }) {
  const pathname = usePathname() ?? `/${current}`;
  const rest = pathname.split("/").slice(2).join("/");

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
