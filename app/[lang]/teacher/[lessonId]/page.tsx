import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LessonActions } from "@/components/LessonActions";
import { ModeLegend } from "@/components/LessonScore";
import { LessonTimeline } from "@/components/LessonTimeline";
import { TaskCards } from "@/components/TaskCards";
import { DEMO_LESSON_ID, demoLesson } from "@/lib/demo";
import { getDict, isLocale, t } from "@/lib/i18n";
import { lessonToText } from "@/lib/lesson";

// Пока есть только демо-урок. Уроки из базы появятся в День 4 (Supabase).
export function generateStaticParams() {
  return [{ lessonId: DEMO_LESSON_ID }];
}

/**
 * Каркас страницы отдаётся сразу, а содержимое урока (зависит от lessonId в адресе)
 * подгружается внутри <Suspense>. В День 4 здесь будет запрос к базе — структура уже готова.
 */
export default function LessonPage({ params }: PageProps<"/[lang]/teacher/[lessonId]">) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-20 sm:px-6 sm:pt-10 print:p-0">
      <Suspense fallback={<LessonSkeleton />}>
        <LessonContent params={params} />
      </Suspense>
    </main>
  );
}

function LessonSkeleton() {
  return (
    <div aria-hidden className="animate-pulse">
      <div className="h-5 w-40 rounded bg-paper-deep" />
      <div className="mt-8 h-12 w-72 rounded bg-paper-deep" />
      <div className="mt-4 h-5 w-56 rounded bg-paper-deep" />
      <div className="mt-12 h-[32rem] rounded-sheet bg-paper-deep" />
    </div>
  );
}

async function LessonContent({ params }: { params: PageProps<"/[lang]/teacher/[lessonId]">["params"] }) {
  const { lang, lessonId } = await params;
  if (!isLocale(lang) || lessonId !== DEMO_LESSON_ID) notFound();

  const dict = getDict(lang);
  const plan = demoLesson;
  const grades = plan.groups.map((g) => t(dict.common.grade, { n: g.grade })).join(" · ");

  return (
    <>
      <div className="flex items-center gap-3 text-[0.82rem] print:hidden">
        <Link href={`/${lang}`} className="text-ink-soft hover:text-ink">
          ← {dict.lesson.back}
        </Link>
        <span className="rounded-full bg-margin/10 px-2.5 py-0.5 font-semibold text-margin">{dict.lesson.demoBadge}</span>
      </div>

      <header className="mt-6 flex flex-col gap-5 border-b border-rule pb-8 sm:flex-row sm:items-end sm:justify-between print:mt-0 print:pb-4">
        <div>
          <h1 className="font-serif text-4xl font-medium tracking-tight text-ink sm:text-5xl print:text-2xl">{plan.subject}</h1>
          <p className="tabular mt-3 text-ink-soft">
            {grades} · {t(dict.lesson.duration, { n: plan.durationMin })}
          </p>
        </div>
        <LessonActions
          text={lessonToText(plan, dict)}
          labels={{ print: dict.lesson.print, copy: dict.lesson.copy, copied: dict.lesson.copied }}
        />
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-12 print:hidden">
        <section aria-labelledby="timeline">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div>
              <h2 id="timeline" className="font-serif text-2xl font-medium text-ink">
                {dict.lesson.timelineTitle}
              </h2>
              <p className="mt-1 max-w-lg text-[0.88rem] text-ink-soft">{dict.lesson.timelineHint}</p>
            </div>
            <ModeLegend dict={dict} />
          </div>
          <div className="mt-5 rounded-sheet border border-rule bg-card px-3 pt-4 pb-3 sm:px-5 sm:pt-5">
            <LessonTimeline plan={plan} dict={dict} />
          </div>
        </section>

        <aside aria-labelledby="notes" className="lg:pt-[4.6rem]">
          <div className="relative rounded-sheet bg-notebook py-5 pr-5 pl-9 shadow-[0_0_0_1px_var(--color-rule)] lg:sticky lg:top-6">
            <span aria-hidden className="absolute inset-y-0 left-5 w-px bg-margin/70" />
            <h2 id="notes" className="font-serif text-lg font-medium text-ink">
              {dict.lesson.notesTitle}
            </h2>
            <p className="mt-3 text-[0.92rem] leading-[1.6] text-ink-soft">{plan.teacherNotes}</p>
          </div>
        </aside>
      </div>

      <section aria-labelledby="cards" className="mt-16 print:mt-4">
        <h2 id="cards" className="font-serif text-2xl font-medium text-ink print:hidden">
          {dict.lesson.cardsTitle}
        </h2>
        <div className="mt-6 print:mt-0">
          <TaskCards groups={plan.groups} dict={dict} />
        </div>
      </section>
    </>
  );
}
