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
    <div role="group" aria-label={label} className="flex rounded-full border border-rule bg-card p-0.5 text-[0.8rem]">
      {[...locales].reverse().map((locale) => {
        const active = locale === current;
        return (
          <Link
            key={locale}
            href={`/${locale}${rest ? `/${rest}` : ""}`}
            hrefLang={locale}
            aria-current={active ? "true" : undefined}
            className={`rounded-full px-3 py-1 font-medium transition-colors ${
              active ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
            }`}
          >
            {names[locale]}
          </Link>
        );
      })}
    </div>
  );
}
