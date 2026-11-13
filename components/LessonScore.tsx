"use client";

import { useState } from "react";
import { cardNumbers, segmentAt } from "@/lib/lesson";
import type { LessonPlan, SegmentMode } from "@/lib/schema";
import { t, type Dict } from "@/lib/i18n";
import { modeFill } from "./modes";

/**
 * «Партитура» урока: каждый класс на своей дорожке, время идёт слева направо.
 * Ползунок показывает, что делает каждый класс в выбранную минуту.
 * Это не картинка, а настоящий урок из данных (демо-фикстура).
 */

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
  const ticks = [0, 15, 30, duration].filter((m, i, all) => m <= duration && all.indexOf(m) === i);

  return (
    <figure className="select-none">
      <div className="grid grid-cols-[auto_1fr] gap-x-4">
        <div className="flex flex-col gap-2.5 pt-9">
          {plan.groups.map((g) => (
            <div key={g.id} className="flex h-10 items-center text-[0.85rem] font-semibold whitespace-nowrap">
              {t(dict.common.grade, { n: g.grade })}
            </div>
          ))}
        </div>

        {/* Дорожки, курсор и прозрачный ползунок поверх: его можно тянуть мышкой, пальцем и стрелками */}
        <div className="relative rounded-md has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-4 has-[input:focus-visible]:outline-ink">
          <div className="relative h-9">
            <span
              className="tabular absolute top-0 -translate-x-1/2 rounded-md bg-ink px-2 py-1 font-mono text-[0.72rem] font-medium whitespace-nowrap text-white"
              style={{ left: pct(minute + 0.5) }}
            >
              {t(dict.score.minuteNow, { n: minute + 1 })}
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            {plan.groups.map((g) => (
              <div key={g.id} className="relative h-10 overflow-hidden rounded-md bg-surface">
                {plan.timeline
                  .filter((s) => s.groupId === g.id)
                  .map((s) => (
                    <div
                      key={s.startMin}
                      className={`absolute inset-y-0 shadow-[inset_-2px_0_0_#fff] ${modeFill[s.mode]}`}
                      style={{ left: pct(s.startMin), width: pct(s.endMin - s.startMin) }}
                    />
                  ))}
              </div>
            ))}
          </div>

          <div className="relative mt-2.5 h-5 font-mono text-[0.72rem] text-faint">
            {ticks.map((m, i) => (
              <span
                key={m}
                className={`tabular absolute ${i === 0 ? "" : i === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2"}`}
                style={{ left: pct(m) }}
              >
                {m}
              </span>
            ))}
          </div>

          <div
            aria-hidden
            className="pointer-events-none absolute top-8 bottom-7 w-0.5 -translate-x-1/2 rounded-full bg-ink"
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

      {/* Что происходит в эту минуту: часть интерфейса, а не подпись под картинкой */}
      <div aria-live="polite" className="mt-6 grid gap-3 border-t border-line pt-5">
        {plan.groups.map((g) => {
          const seg = segmentAt(plan, g.id, minute);
          if (!seg) return null;
          const nums = cardNumbers(g, seg.cardIds);
          return (
            <div key={g.id} className="flex gap-3 text-[0.92rem] leading-snug">
              <span className={`mt-1 size-3 shrink-0 rounded-[3px] ${modeFill[seg.mode]}`} />
              <p className="min-w-0">
                <span className="font-semibold">
                  {t(dict.common.grade, { n: g.grade })} · {dict.modes[seg.mode]}
                </span>
                {nums.length > 0 && <span className="text-muted"> · {t(dict.common.cards, { list: nums.join(", ") })}</span>}
                {showActivity && <span className="mt-0.5 block text-muted">{seg.activity}</span>}
              </p>
            </div>
          );
        })}
      </div>
    </figure>
  );
}

export function ModeLegend({ dict }: { dict: Dict }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[0.82rem] text-muted">
      {(Object.keys(dict.modes) as SegmentMode[]).map((mode) => (
        <li key={mode} className="flex items-center gap-1.5">
          <span className={`size-2.5 rounded-[3px] ${modeFill[mode]}`} />
          {dict.modes[mode]}
        </li>
      ))}
    </ul>
  );
}
