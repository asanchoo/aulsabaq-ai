"use client";

import { t, type Dict } from "@/lib/i18n";
import { cardNumbers, segmentAt, groupTitle } from "@/lib/lesson";
import type { LessonPlan } from "@/lib/schema";
import { enableSound } from "@/lib/lesson-signal";
import {
  saveRun as save,
  changeRun as change,
  shiftRun,
  finishRun,
} from "@/lib/run-controls";
import { useLessonClock, formatClock as clock } from "./useLessonClock";
import { modeBlock } from "./modes";
export { startRun, saveRun } from "@/lib/run-controls";
export { useRunning, useRunMinute } from "./useLessonClock";

/**
 * Ведение урока: таймер и подсказка, что сейчас делает каждый класс и что будет дальше.
 * В малокомплектном классе учитель переключается между классами каждые 5–12 минут;
 * держать расписание в голове трудно, а здесь оно идёт само.
 * Состояние в localStorage: обновили страницу посреди урока, таймер продолжил с того же места.
 */

export function LessonRunner({
  lessonId,
  plan,
  dict,
}: {
  lessonId: string;
  plan: LessonPlan;
  dict: Dict;
}) {
  const d = dict.run;
  const { state, elapsed, minute, ended, sound, slot, next, fresh } =
    useLessonClock(lessonId, plan);
  if (!state) return null;
  const shift = (ms: number) => shiftRun(lessonId, ms);

  const nextText = next
    ? next.allJoint
      ? d.nextJoint
      : next.rows
          .filter((r) => r.segment?.mode === "with_teacher")
          .map(
            (r) =>
              `${groupTitle(plan.groups, r.group, dict.common)}: ${dict.modes.with_teacher.toLowerCase()}`,
          )
          .join(", ") || dict.modes.independent
    : null;

  return (
    <>
      {/* Место под панелью, чтобы она не закрывала конец страницы. */}
      <div aria-hidden className="h-[22rem] print:hidden" />
      <section
        aria-label={d.title}
        className={`fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto border-t border-line bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.08)] transition-colors print:hidden ${fresh ? "bg-mint-soft" : ""}`}
      >
        <div className="wrap grid gap-4 py-4 lg:grid-cols-[13rem_1fr_auto] lg:items-start">
          <div className="flex items-baseline gap-3 lg:block">
            <p className="text-[0.8rem] font-semibold text-muted">
              {state.pausedAt ? d.paused : d.title}
            </p>
            <p
              className="tabular font-mono text-[2.6rem] leading-none font-semibold tracking-[-0.03em]"
              aria-live="off"
            >
              {clock(elapsed)}
            </p>
            <p className="tabular text-[0.85rem] text-muted">
              {t(dict.score.minuteNow, {
                n: Math.min(minute + 1, plan.durationMin),
              })}{" "}
              · {t(dict.lesson.duration, { n: plan.durationMin })}
            </p>
          </div>

          <div aria-live="polite" className="grid gap-2">
            {ended || !slot ? (
              <p className="font-semibold">{d.ended}</p>
            ) : (
              <>
                <ul
                  className={`grid gap-2 ${plan.groups.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}
                >
                  {plan.groups.map((g) => {
                    const seg = segmentAt(plan, g.id, minute);
                    if (!seg) return null;
                    const cards = cardNumbers(g, seg.cardIds);
                    const left = seg.endMin * 60_000 - elapsed;
                    return (
                      <li
                        key={g.id}
                        className={`rounded-card p-3 ${modeBlock[seg.mode]}`}
                      >
                        <p className="flex items-baseline justify-between gap-2 text-[0.85rem] font-semibold">
                          <span>
                            {groupTitle(plan.groups, g, dict.common)} ·{" "}
                            {dict.modes[seg.mode]}
                          </span>
                          <span className="tabular font-mono font-normal opacity-80">
                            {clock(left)}
                          </span>
                        </p>
                        <p className="mt-1 line-clamp-3 text-[0.9rem] leading-snug">
                          {seg.activity}
                        </p>
                        {cards.length > 0 && (
                          <p className="mt-1 text-[0.8rem] font-semibold">
                            {t(d.cards, { list: cards.join(", ") })}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {next && nextText && (
                  <p className="tabular text-[0.9rem] text-muted">
                    {t(d.next, {
                      t: clock(next.startMin * 60_000 - elapsed),
                      what: nextText,
                    })}
                  </p>
                )}
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-2 lg:w-[15rem] lg:justify-end">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              aria-pressed={sound}
              onClick={() => enableSound(!sound)}
            >
              {sound ? d.soundOn : d.soundOff}
            </button>
            {state.pausedAt ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() =>
                  change(lessonId, (s, n) => ({
                    startedAt: s.startedAt + (n - (s.pausedAt ?? n)),
                    pausedAt: null,
                  }))
                }
              >
                {d.resume}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() =>
                  change(lessonId, (s, n) => ({ ...s, pausedAt: n }))
                }
              >
                {d.pause}
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              aria-label={d.earlier}
              title={d.earlier}
              onClick={() => shift(60_000)}
            >
              −1
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              aria-label={d.later}
              title={d.later}
              onClick={() => shift(-60_000)}
            >
              +1
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                if (window.confirm(d.restartConfirm))
                  save(lessonId, { startedAt: Date.now(), pausedAt: null });
              }}
            >
              {d.restart}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                if (window.confirm(d.stopConfirm)) {
                  finishRun(lessonId);
                }
              }}
            >
              {d.stop}
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
