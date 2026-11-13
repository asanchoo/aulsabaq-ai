import Link from "next/link";
import type { Dict, Locale } from "@/lib/i18n";
import { LangSwitch } from "./LangSwitch";
import { LogoMark } from "./Logo";

export function SiteHeader({ lang, dict }: { lang: Locale; dict: Dict }) {
  const links = [
    { href: `/${lang}#how`, label: dict.nav.how },
    { href: `/${lang}#students`, label: dict.nav.students },
    { href: `/${lang}/teacher/demo`, label: dict.nav.demo },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur print:hidden">
      <div className="wrap relative flex h-16 items-center justify-between gap-4 lg:h-[72px]">
        <a
          href="#main"
          className="absolute top-3 left-4 z-40 -translate-y-20 rounded-btn bg-ink px-4 py-2 text-sm font-semibold text-white focus:translate-y-0 sm:left-6 lg:left-8"
        >
          {dict.nav.skip}
        </a>
        <Link href={`/${lang}`} aria-label={dict.nav.home} className="flex min-h-11 items-center gap-2.5">
          <LogoMark />
          <span className="text-[1.2rem] font-semibold tracking-[-0.03em]">AulSabaq</span>
        </Link>

        <nav aria-label={dict.nav.how} className="hidden items-center gap-7 lg:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-[0.92rem] font-medium text-ink/80 transition-colors hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <LangSwitch current={lang} label={dict.nav.langLabel} />
          <Link href={`/${lang}/teacher/new`} className="btn btn-primary btn-sm hidden sm:inline-flex">
            {dict.nav.create}
          </Link>
        </div>
      </div>
    </header>
  );
}
