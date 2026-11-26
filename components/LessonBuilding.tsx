"use client";

import { useEffect, useState } from "react";
import { getCreationDict, getDict, t, type Locale } from "@/lib/i18n";
import { stageIndex, type LessonProgress } from "@/lib/progress";
import { planSchedule, type StageKind } from "@/lib/schedule";
import type { Rooms } from "@/lib/schema";
import { modeFill } from "./modes";

const MODE: Record<StageKind, "with_teacher" | "independent" | "joint"> = {
  opening: "joint", closing: "joint", explain: "with_teacher", check: "with_teacher", review: "independent", practice: "independent",
};

/**
 * Сборка урока на экране учителя. Рисуем настоящее расписание будущего урока (его считает код, lib/schedule.ts):
 * отрезки заливаются, когда соответствующая часть урока правда готова — объяснения, карточки, проверка.
 * По партитуре бежит световая полоса, рядом настоящие этапы с цифрами и факты о том, что делает код.
 * При «уменьшить движение» полосы и заливки нет, этапы и цифры остаются.
 */
export function LessonBuilding({ lang, grades, durationMin, rooms = "one", progress, elapsed, offline, resumed }: {
  lang: Locale;
  grades: number[];
  durationMin: number;
  /** Где сидят классы: в разных кабинетах у будущего урока нет общих этапов. */
  rooms?: Rooms;
  progress: LessonProgress;
  /** Секунды с начала сборки (от сервера: не обнуляются после обновления страницы). */
  elapsed: number;
  offline: boolean;
  resumed: boolean;
}) {
  const d = getCreationDict(lang).building;
  const dict = getDict(lang);
  const [tip, setTip] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTip((n) => (n + 1) % d.tips.length), 7000);
    return () => clearInterval(timer);
  }, [d.tips.length]);

  const schedule = planSchedule(grades.length, durationMin, rooms);
  const at = stageIndex(progress.stage);
  // Какие отрезки уже «готовы»: объяснение у первых explained классов, общее и самостоятельное — когда есть
  // карточки, проверка — после проверки. Порядок готовности объяснений неизвестен, заливаем по порядку классов.
  const ready = (groupIndex: number, stage: StageKind) => {
    if (stage === "explain") return groupIndex < progress.explained;
    if (stage === "opening" || stage === "closing" || stage === "review" || stage === "practice") return at >= stageIndex("check");
    return at >= stageIndex("proof");
  };
  // Над чем ИИ работает прямо сейчас: эти отрезки «дышат», пока не зальются.
  const working = (stage: StageKind) =>
    (progress.stage === "explain" && stage === "explain") ||
    (progress.stage === "content" && stage !== "explain" && stage !== "check") ||
    (progress.stage === "check" && stage === "check");
  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;

  // Четыре строки на экране: объяснения, содержание, проверка, «корректура и сохранение» (два последних этапа сборки).
  const position = at >= stageIndex("done") ? 4 : Math.min(at, 3);
  const stageState = (i: number) => (i < position ? "done" : i === position ? "now" : "next");
  const detail = [
    t(d.explained, { a: progress.explained, b: progress.classes || grades.length }),
    progress.cards !== undefined ? t(d.cardsDone, { cards: progress.cards, extra: progress.extra ?? 0 }) : "",
    progress.check ? (progress.check === "rules" ? d.checkRules : d.checkVerify) : "",
    "",
  ];

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="font-semibold whitespace-nowrap">{d.title}</p>
        <p className="tabular font-mono text-[0.85rem] whitespace-nowrap text-muted">
          {clock} <span className="font-sans">· {d.usual}</span>
        </p>
      </div>

      {/* Партитура будущего урока: классы и минуты */}
      <div aria-hidden className="relative grid gap-2 overflow-hidden rounded-md">
        {grades.map((grade, g) => (
          <div key={g} className="grid grid-cols-[3.2rem_1fr] items-center gap-3">
            <span className="text-[0.8rem] font-semibold whitespace-nowrap">{t(dict.common.gradeShort, { n: grade })}</span>
            <div className="flex h-7 gap-0.5">
              {schedule.segments.filter((s) => s.groupIndex === g).map((s, k) => {
                const done = ready(g, s.stage);
                return (
                  <span
                    key={k}
                    style={{ flexGrow: s.endMin - s.startMin }}
                    className={`relative basis-0 overflow-hidden rounded-[3px] border ${done ? "border-transparent" : "border-dashed border-line-strong"}`}
                  >
                    {done ? (
                      <span className={`build-fill absolute inset-0 ${modeFill[MODE[s.stage]]}`} />
                    ) : (
                      working(s.stage) && <span className="build-breathe absolute inset-0 bg-line" />
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
        <span className="build-scan pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-white/70 to-transparent" />
      </div>

      {/* Настоящие этапы сборки */}
      <ol className="grid gap-2.5 border-t border-line pt-4" aria-live="polite">
        {d.stages.map((label, i) => {
          const state = stageState(i);
          return (
            <li key={label} className={`flex items-start gap-3 text-[0.9rem] ${state === "next" ? "text-faint" : "text-ink"}`}>
              <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center">
                {state === "done" && (
                  <span className="grid size-5 place-items-center rounded-full bg-ink text-white">
                    <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </span>
                )}
                {state === "now" && <span className="size-4 animate-spin rounded-full border-2 border-line-strong border-t-ink" />}
                {state === "next" && <span className="size-4 rounded-full border border-line-strong" />}
              </span>
              <span>
                {label}
                {detail[i] && state !== "next" && <span className="block text-[0.82rem] text-muted">{detail[i]}</span>}
              </span>
            </li>
          );
        })}
      </ol>

      {progress.repairs > 0 && <p className="text-[0.85rem] leading-snug text-muted">{t(d.repairs, { n: progress.repairs })}</p>}
      {(offline || resumed) && (
        <p role="status" className={`rounded-btn px-3 py-2 text-[0.85rem] leading-snug ${offline ? "bg-help-soft" : "bg-surface"}`}>
          {offline ? d.offline : d.resumed}
        </p>
      )}

      <p key={tip} className="fade-in rounded-card bg-mint-soft px-4 py-3 text-[0.88rem] leading-snug">{d.tips[tip]}</p>
    </div>
  );
}
