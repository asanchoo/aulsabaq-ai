import Link from "next/link";
import type { Dict, Locale } from "@/lib/i18n";
import { LangSwitch } from "./LangSwitch";

export function SiteHeader({ lang, dict }: { lang: Locale; dict: Dict }) {
  return (
    <header className="border-b border-rule print:hidden">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href={`/${lang}`} className="group flex items-baseline gap-1.5" aria-label="AulSabaq AI">
          <span className="font-serif text-[1.35rem] font-semibold tracking-tight text-ink">AulSabaq</span>
          <span className="rounded-[3px] bg-ink px-1 py-px text-[0.62rem] font-semibold tracking-[0.08em] text-paper">
            AI
          </span>
        </Link>
        <nav className="flex items-center gap-2 sm:gap-5">
          <Link
            href={`/${lang}/teacher/demo`}
            className="hidden text-sm font-medium text-ink-soft transition-colors hover:text-ink sm:block"
          >
            {dict.nav.demo}
          </Link>
          <LangSwitch current={lang} label={dict.nav.langLabel} />
        </nav>
      </div>
    </header>
  );
}
