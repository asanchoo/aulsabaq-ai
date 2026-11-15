"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { getCreationDict, getDict, type Locale } from "@/lib/i18n";
import { parseLessonPlan } from "@/lib/validate";
import { LessonView } from "./LessonView";

// Урок до подключения базы живёт в sessionStorage текущей вкладки (День 4 заменит это на Supabase).
const subscribe = () => () => {};
function snapshot() {
  try {
    return sessionStorage.getItem("aulsabaq-preview") ?? "";
  } catch {
    return "";
  }
}
const serverSnapshot = () => "";

export function LessonPreview({ lang }: { lang: Locale }) {
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const d = getCreationDict(lang);
  const dict = getDict(lang);
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    value = null;
  }
  const result = parseLessonPlan(value?.plan);

  if (!result.ok) {
    return (
      <div className="grid max-w-[34rem] gap-6 py-16 lg:py-24">
        <h1 className="display text-[2.2rem] sm:text-[2.8rem]">{d.empty}</h1>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href={`/${lang}/teacher/new`} className="btn btn-primary">
            {d.newLesson}
          </Link>
          <Link href={`/${lang}/teacher/demo`} className="btn btn-secondary">
            {dict.hero.ctaDemo}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 flex gap-3 rounded-card border border-line bg-surface p-4 text-[0.92rem] leading-snug print:hidden">
        <svg aria-hidden viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 7.5v.5" />
        </svg>
        <div className="grid gap-1.5">
          <p>{value.demo ? d.demoNotice : d.local}</p>
          {!value.demo && <p className="font-semibold">{d.review}</p>}
        </div>
      </div>
      <LessonView plan={result.plan} lang={lang} dict={dict} badge={value.demo ? dict.lesson.demoBadge : d.preview} />
    </>
  );
}
