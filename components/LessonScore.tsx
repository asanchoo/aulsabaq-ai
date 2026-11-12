"use client";

import { useState } from "react";
import { cardNumbers, segmentAt } from "@/lib/lesson";
import type { LessonPlan, SegmentMode } from "@/lib/schema";
import { t, type Dict } from "@/lib/i18n";

/**
 * «Партитура» урока: каждый класс — своя дорожка, время идёт слева направо.
 * Ползунок показывает, что делает каждый класс в выбранную минуту.
 * Это не картинка, а настоящий урок из данных (демо-фикстура).
 */

export const modeFill: Record<SegmentMode, string> = {
  with_teacher: "bg-blue",
  independent: "bg-hatch",
  joint: "bg-ink",
};

type Props = {
  plan: LessonPlan;
  dict: Dict;
  /** Показывать текст этапа, только если язык урока совпадает с языком интерфейса. */
  showActivity: boolean;
  initialMinute?: number;
};

export function LessonScore({ plan, dict, showActivity, initialMinute = 12 }: Props) {
  const [minute, setMinute] = useState(initialMinute);
  const duration = plan.durationMin;
  const pct = (m: number) => `${(m / duration) * 100}%`;
  const ticks = Array.from({ length: Math.floor(duration / 5) + 1 }, (_, i) => i * 5);

  return (
    <figure className="select-none">
      <div className="grid grid-cols-[auto_1fr] gap-x-3">
        {/* Подписи классов */}
        <div className="flex flex-col gap-2 pt-7">
          {plan.groups.map((g) => (
            <div key={g.id} className="flex h-10 items-center text-[0.8rem] font-semibold whitespace-nowrap text-ink">
              {t(dict.common.gradeShort, { n: g.grade })}
            </div>
          ))}
        </div>

        {/* Дорожки + курсор + невидимый ползунок поверх */}
        <div className="relative rounded-[4px] has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-4 has-[input:focus-visible]:outline-blue">
          <div className="relative h-7">
            <span
              className="tabular absolute -translate-x-1/2 rounded-[3px] bg-margin px-1.5 py-0.5 text-[0.7rem] font-semibold whitespace-nowrap text-white transition-[left] duration-75"
              style={{ left: pct(minute + 0.5) }}
            >
              {t(dict.score.minuteNow, { n: minute + 1 })}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {plan.groups.map((g) => (
              <div key={g.id} className="relative h-10 overflow-hidden rounded-[4px] bg-paper-deep">
                {plan.timeline
                  .filter((s) => s.groupId === g.id)
                  .map((s) => (
                    <div
                      key={s.startMin}
                      className={`absolute inset-y-0 border-r-2 border-card ${modeFill[s.mode]}`}
                      style={{ left: pct(s.startMin), width: pct(s.endMin - s.startMin) }}
                    />
                  ))}
              </div>
            ))}
          </div>

          <div className="relative mt-2 h-5 text-[0.7rem] text-ink-faint">
            {ticks.map((m) => (
              <span
                key={m}
                className={`tabular absolute -translate-x-1/2 ${m % 15 === 0 || m === duration ? "" : "hidden sm:block"}`}
                style={{ left: pct(m) }}
              >
                {m}
              </span>
            ))}
          </div>

          <div
            aria-hidden
            className="pointer-events-none absolute top-6 bottom-6 w-0.5 -translate-x-1/2 bg-margin transition-[left] duration-75"
            style={{ left: pct(minute + 0.5) }}
          />

          <input
            type="range"
            min={0}
            max={duration - 1}
            step={1}
            value={minute}
            onChange={(e) => setMinute(Number(e.target.value))}
            aria-label={dict.score.scrubLabel}
            aria-valuetext={t(dict.score.minuteNow, { n: minute + 1 })}
            className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
          />
        </div>
      </div>

      {/* Что происходит в эту минуту */}
      <figcaption aria-live="polite" className="mt-5 space-y-2.5 border-t border-dashed border-rule pt-4">
        {plan.groups.map((g) => {
          const seg = segmentAt(plan, g.id, minute);
          if (!seg) return null;
          const nums = cardNumbers(g, seg.cardIds);
          return (
            <div key={g.id} className="flex gap-3 text-sm leading-snug">
              <span className={`mt-1 h-3 w-3 shrink-0 rounded-[2px] ${modeFill[seg.mode]}`} />
              <p className="min-w-0">
                <span className="font-semibold text-ink">
                  {t(dict.common.grade, { n: g.grade })} · {dict.modes[seg.mode]}
                </span>
                {nums.length > 0 && (
                  <span className="text-ink-soft"> · {t(dict.common.cards, { list: nums.join(", ") })}</span>
                )}
                {showActivity && <span className="block text-ink-soft">{seg.activity}</span>}
              </p>
            </div>
          );
        })}
      </figcaption>
    </figure>
  );
}

export function ModeLegend({ dict }: { dict: Dict }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[0.78rem] text-ink-soft">
      {(Object.keys(dict.modes) as SegmentMode[]).map((mode) => (
        <li key={mode} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-[2px] ${modeFill[mode]}`} />
          {dict.modes[mode]}
        </li>
      ))}
    </ul>
  );
}
