"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { forgetStudent, useLastStudent } from "@/lib/local";
import type { Dict, Locale } from "@/lib/i18n";
import { LangLinks, LangSwitch } from "./LangSwitch";
import { LogoMark } from "./Logo";

/** Choose chrome from the current route, including client navigation and direct student links. */
export function StudentHeader({
  children,
  lang,
  dict,
}: {
  children: ReactNode;
  lang: Locale;
  dict: Dict;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const last = useLastStudent();
  const route = pathname.split("/")[2];
  if (route !== "join" && route !== "student") return children;
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg print:hidden">
      <div className="wrap flex h-16 items-center justify-between gap-3">
        <Link
          href={`/${lang}`}
          aria-label={dict.nav.home}
          className="flex min-h-11 items-center gap-2"
        >
          <LogoMark />
          <span className="font-semibold">AulSabaq</span>
        </Link>
        <div className="flex items-center gap-2">
          <Suspense
            fallback={
              <LangLinks
                current={lang}
                label={dict.nav.langLabel}
                rest="join"
              />
            }
          >
            <LangSwitch current={lang} label={dict.nav.langLabel} />
          </Suspense>
          {(route === "student" || last) && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                forgetStudent();
                router.push(`/${lang}/join`);
              }}
            >
              {dict.student.leave}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
