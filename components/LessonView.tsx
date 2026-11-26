import { LessonNav } from "./LessonNav";
import Link from "next/link";
import type { ReactNode } from "react";
import { LessonActions } from "./LessonActions";
import { ModeLegend } from "./LessonScore";
import { LessonTimeline } from "./LessonTimeline";
import { TaskCardVariants } from "./TaskCardVariants";
import { TopicExplanation } from "./TopicExplanation";
import { t, type Dict, type Locale } from "@/lib/i18n";
import { lessonToText, groupTitle } from "@/lib/lesson";
import type { LessonPlan } from "@/lib/schema";

/**
 * Страница урока для учителя: шапка с действиями, ход урока, советы, объяснение темы, карточки.
 * workspace — то, что зависит от сохранённого урока (код для учеников, панель, ведение урока); у демо там своя кнопка.
 */
export function LessonView({
  plan,
  lang,
  dict,
  badge,
  notice,
  workspace,
  joinCode,
}: {
  plan: LessonPlan;
  lang: Locale;
  dict: Dict;
  badge: string;
  notice?: string;
  workspace?: ReactNode;
  /** Код для учеников: последний слайд «Теперь сами» показывает его и QR-код. */
  joinCode?: string;
}) {
  const grades = plan.groups
    .map((g) => groupTitle(plan.groups, g, dict.common))
    .join(" · ");

  return (
    <div data-lesson-view>
      <LessonNav lang={lang} />
      <div className="flex flex-wrap items-center gap-3 text-[0.9rem] print:hidden">
        <Link
          href={`/${lang}/teacher/new`}
          className="link inline-flex min-h-11 items-center text-muted hover:text-ink"
        >
          ← {dict.lesson.backCreate}
        </Link>
        <span className="rounded-full bg-mint px-3 py-1 text-[0.8rem] font-semibold">
          {badge}
        </span>
      </div>

      <header className="mt-4 flex flex-col gap-6 border-b border-line pb-10 lg:flex-row lg:items-end lg:justify-between print:mt-0 print:pb-4">
        <div>
          <h1 className="display text-[2.6rem] sm:text-[3.4rem] print:text-2xl">
            {plan.subject}
          </h1>
          <p className="tabular mt-3 text-[1.02rem] text-muted">
            {grades} · {t(dict.lesson.duration, { n: plan.durationMin })}
          </p>
        </div>
        <LessonActions
          text={lessonToText(plan, dict)}
          labels={{
            print: dict.lesson.print,
            copy: dict.lesson.copy,
            copied: dict.lesson.copied,
          }}
        />
      </header>

      {notice && (
        <p className="mt-6 max-w-3xl text-[0.92rem] leading-snug text-muted print:hidden">
          {notice}
        </p>
      )}
      {workspace}

      <div className="mt-12 grid gap-10 lg:grid-cols-12 lg:gap-8 print:hidden">
        <section aria-labelledby="timeline" className="lg:col-span-8">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div>
              <h2
                id="timeline"
                className="text-[1.6rem] font-semibold tracking-[-0.02em]"
              >
                {dict.lesson.timelineTitle}
              </h2>
              <p className="mt-1 max-w-lg text-[0.9rem] text-muted">
                {plan.rooms === "separate" ? dict.lesson.timelineHintSeparate : dict.lesson.timelineHint}
              </p>
            </div>
            <ModeLegend dict={dict} modes={plan.rooms === "separate" ? ["with_teacher", "independent"] : undefined} />
          </div>
          <div className="mt-6 rounded-frame border border-line bg-white px-3 pt-5 pb-3 sm:px-5">
            <LessonTimeline plan={plan} dict={dict} />
          </div>
        </section>

        <aside
          aria-labelledby="notes"
          className="lg:col-span-4 lg:pt-[4.75rem]"
        >
          <div className="rounded-frame bg-stage p-6 lg:sticky lg:top-24">
            <h2 id="notes" className="text-[1.1rem] font-semibold">
              {dict.lesson.notesTitle}
            </h2>
            <p className="mt-3 text-[0.95rem] leading-[1.65] whitespace-pre-line text-ink/85">
              {plan.teacherNotes}
            </p>
          </div>
        </aside>
      </div>

      <section aria-labelledby="explain" className="mt-20 print:hidden">
        <h2
          id="explain"
          className="text-[1.6rem] font-semibold tracking-[-0.02em]"
        >
          {dict.lesson.explainTitle}
        </h2>
        <p className="mt-1 max-w-2xl text-[0.9rem] text-muted">
          {dict.lesson.explainLead}
        </p>
        <div className="mt-6">
          <TopicExplanation
            groups={plan.groups}
            dict={dict}
            lang={lang}
            joinCode={joinCode}
          />
        </div>
      </section>

      <section aria-labelledby="cards" className="mt-20 print:mt-4">
        <h2
          id="cards"
          className="text-[1.6rem] font-semibold tracking-[-0.02em] print:hidden"
        >
          {dict.lesson.cardsTitle}
        </h2>
        <div className="mt-6 print:mt-0">
          <TaskCardVariants plan={plan} dict={dict} lang={lang} />
        </div>
      </section>
    </div>
  );
}
