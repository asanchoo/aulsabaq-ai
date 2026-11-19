"use client";

import Link from "next/link";
import { formatDay, getDict, t, type Locale } from "@/lib/i18n";
import { forgetLesson, useSavedLessons } from "@/lib/local";

/** Уроки, созданные на этом устройстве: учитель вернётся к вчерашнему уроку без регистрации. */
export function RecentLessons({ lang }: { lang: Locale }) {
  const dict = getDict(lang);
  const lessons = useSavedLessons().slice(0, 6);
  if (lessons.length === 0) return null;

  return (
    <section aria-labelledby="recent" className="mb-12">
      <h2 id="recent" className="text-[1.1rem] font-semibold">{dict.teacher.recentTitle}</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {lessons.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-3 rounded-card border border-line p-3">
            <Link href={`/${lang}/teacher/${l.id}`} className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{l.subject}</span>
              <span className="tabular block text-[0.85rem] text-muted">
                {l.grades.map((n) => t(dict.common.gradeShort, { n })).join(", ")} · {formatDay(l.createdAt, lang)}
                {l.demo ? ` · ${dict.lesson.demoBadge}` : ""}
              </span>
            </Link>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(t(dict.teacher.forgetConfirm, { subject: l.subject }))) forgetLesson(l.id);
              }}
              className="grid size-10 shrink-0 place-items-center rounded-btn text-muted hover:bg-surface hover:text-ink"
              aria-label={`${dict.teacher.forget}: ${l.subject}`}
              title={dict.teacher.forget}
            >
              <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
