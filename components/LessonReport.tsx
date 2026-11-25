"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { NEXT_LESSON_KEY, nextLessonDraft } from "@/lib/next-lesson";
import { createPortal } from "react-dom";
import { getReportDict, t, type Locale, getDict } from "@/lib/i18n";
import { lessonReport, reportCsv, type HelpRecord } from "@/lib/lesson-report";
import type { StudentRow } from "@/lib/help-queue";
import type { LessonPlan } from "@/lib/schema";
import { groupTitle } from "@/lib/lesson";

export function LessonReport({
  plan,
  students,
  history,
  lang,
  onClose,
}: {
  plan: LessonPlan;
  students: StudentRow[];
  history: HelpRecord[];
  lang: Locale;
  onClose: () => void;
}) {
  const d = getReportDict(lang);
  const router = useRouter();
  const [draftError, setDraftError] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  const report = lessonReport(plan, students, history);
  function download() {
    const url = URL.createObjectURL(
      new Blob([reportCsv(plan, students, d.headers)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "aulsabaq-report.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return createPortal(
    <dialog
      ref={dialog}
      className="lesson-report fixed inset-0 m-auto max-h-[90dvh] w-[min(95vw,52rem)] overflow-auto rounded-frame border border-line bg-white p-5 backdrop:bg-black/40 sm:p-8"
      onCancel={onClose}
      aria-labelledby="report-title"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="report-title" className="text-2xl font-semibold">
          {d.title}
        </h2>
        <button
          className="btn btn-secondary btn-sm print:hidden"
          onClick={onClose}
        >
          {d.close}
        </button>
      </header>
      <p className="mt-3 text-sm text-muted">{d.note}</p>
      <div className="mt-5 flex flex-wrap gap-2 print:hidden">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            try {
              sessionStorage.setItem(
                NEXT_LESSON_KEY,
                JSON.stringify(nextLessonDraft(plan, students, history)),
              );
              router.push(`/${lang}/teacher/new`);
            } catch {
              setDraftError(true);
            }
          }}
        >
          {d.nextLesson}
        </button>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => window.print()}
        >
          {d.print}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={download}>
          {d.csv}
        </button>
      </div>
      {draftError && (
        <p role="alert" className="mt-3 text-help">
          {d.draftError}
        </p>
      )}
      {report.map((r) => {
        const group = plan.groups.find((g) => g.id === r.groupId)!;
        return (
          <section className="mt-6 border-t border-line pt-5" key={r.groupId}>
            <h3 className="text-lg font-semibold">
              {groupTitle(plan.groups, group, getDict(lang).common)}
            </h3>
            <p className="mt-2">
              {t(d.summary, { p: r.pupils, solved: r.solved, total: r.total })}
            </p>
            {r.hard.length > 0 && (
              <>
                <h4 className="mt-4 font-semibold">{d.hard}</h4>
                <ul className="mt-2 grid gap-2">
                  {r.hard.map((c) => (
                    <li key={c.cardId}>
                      {t(d.hardRow, {
                        n: c.number,
                        wrong: c.wrong,
                        total: c.attempted,
                        rate: Math.round(c.rate * 100),
                      })}
                      <p className="text-sm text-muted">{c.prompt}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {r.requests.length > 0 && (
              <>
                <h4 className="mt-4 font-semibold">{d.help}</h4>
                <ul>
                  {r.requests.map((h) => (
                    <li key={h.studentId + h.cardId}>
                      {t(d.helpRow, {
                        name: h.name,
                        n: group.cards.findIndex((c) => c.id === h.cardId) + 1,
                      })}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="mt-4 rounded-card bg-stage p-3">
              {r.advice
                ? t(d.advice, {
                    task: r.advice.prompt,
                    wrong: r.advice.wrong,
                    total: r.advice.attempted,
                  })
                : r.enoughAnswers
                  ? d.noMistakes
                  : d.noAdvice}
            </p>
          </section>
        );
      })}
    </dialog>,
    document.body,
  );
}
