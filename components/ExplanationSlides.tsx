"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { getDict, t, type Locale } from "@/lib/i18n";
import type { Explanation, WorkedExample } from "@/lib/schema";
import { Visual } from "./Visual";
import { isMathOnly } from "@/lib/lesson";

type Props = { explanation: Explanation; grade: string; topic: string; lang: Locale };

/**
 * Объяснение темы как слайды для показа классу (проектор, телевизор, ноутбук).
 * Слайды не хранятся отдельно: их собирает этот компонент из полей explanation,
 * поэтому модель отвечает только за содержание, а вид у всех уроков одинаковый.
 * Порядок: зачем тема → правило → наглядные схемы → шаги → три разобранных примера →
 * «Попробуй сам» → ошибки → вопросы. Пример открывается по шагу на каждое нажатие «Дальше»
 * (ученики сначала думают сами), схема и ответ — последним шагом; в «Попробуй сам» так же открываются ответы.
 * Нативный <dialog> сам держит фокус внутри, закрывается по Esc и возвращает фокус на кнопку.
 */
type Slide = { kicker: string; frames: number; render: (shown: number) => ReactNode };

export function ExplanationSlides({ explanation: e, grade, topic, lang }: Props) {
  const dict = getDict(lang);
  const l = dict.lesson;
  const labels = l.slides;
  const dialog = useRef<HTMLDialogElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  // Номер слайда и сколько шагов на нём уже открыто. Одно состояние и обновление через функцию:
  // так быстрые нажатия стрелок не теряются, каждое считается от предыдущего.
  const [{ slide, shown }, setPos] = useState({ slide: 0, shown: 0 });

  const exampleKicker = (x: WorkedExample, n: number) => `${t(l.explain.examples, { n })}${x.level ? `: ${l.explain.levels[x.level]}` : ""}`;
  const exampleSlide = (x: WorkedExample, kicker: string): Slide => ({
    kicker,
    frames: x.steps.length + 1,
    render: (n) => (
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0">
          <p className={`tabular leading-tight font-medium ${isMathOnly(x.problem) ? "font-mono text-[clamp(1.8rem,4.6vw,3.6rem)]" : "text-[clamp(1.4rem,3vw,2.4rem)] tracking-[-0.01em]"}`}>{x.problem}</p>
          <ol className="mt-6 grid gap-3">
            {x.steps.slice(0, n).map((step, i) => (
              <li key={i} className="pop flex gap-4 text-[clamp(1.1rem,2.1vw,1.6rem)] leading-[1.35]">
                <span className="tabular w-7 shrink-0 font-mono text-muted">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          {n > x.steps.length && (
            <p className="pop mt-6 inline-flex rounded-card bg-mint px-5 py-3 text-[clamp(1.2rem,2.4vw,1.8rem)] font-semibold">
              {l.answer}: <span className="tabular ml-2 font-mono">{x.answer}</span>
            </p>
          )}
        </div>
        {x.visual && n > x.steps.length && (
          <div className="pop min-w-0">
            <Visual visual={x.visual} labels={dict.visual} size="slide" />
          </div>
        )}
      </div>
    ),
  });

  const slides: Slide[] = [
    {
      kicker: `${grade} · ${l.explain.hook}`,
      frames: 0,
      render: () => (
        <>
          <p className="display text-[clamp(2.2rem,5.5vw,4.4rem)]">{topic}</p>
          <p className="mt-8 max-w-[38ch] text-[clamp(1.3rem,2.6vw,2rem)] leading-[1.4] text-ink/85">{e.hook}</p>
        </>
      ),
    },
    ...(e.intuition
      ? [{
          kicker: l.explain.intuition,
          frames: 0,
          render: () => <p className="max-w-[40ch] text-[clamp(1.4rem,3vw,2.4rem)] leading-[1.35]">{e.intuition}</p>,
        } satisfies Slide]
      : []),
    ...(e.terms.length
      ? [{
          kicker: l.explain.terms,
          frames: 0,
          render: () => (
            <dl className="grid max-w-[52ch] gap-5">
              {e.terms.map((x) => (
                <div key={x.term} className="grid gap-1">
                  <dt className="text-[clamp(1.4rem,2.8vw,2.2rem)] font-semibold tracking-[-0.01em]">{x.term}</dt>
                  <dd className="text-[clamp(1.15rem,2.2vw,1.7rem)] leading-[1.35] text-ink/85">{x.meaning}</dd>
                </div>
              ))}
            </dl>
          ),
        } satisfies Slide]
      : []),
    {
      kicker: l.explain.keyIdea,
      frames: 0,
      render: () => <p className="max-w-[30ch] text-[clamp(1.7rem,4vw,3.2rem)] leading-[1.25] font-semibold tracking-[-0.02em]">{e.keyIdea}</p>,
    },
    ...e.visuals.map((v): Slide => ({ kicker: l.explain.visual, frames: 0, render: () => <Visual visual={v} labels={dict.visual} size="slide" /> })),
    { kicker: l.explain.steps, frames: 0, render: () => <NumberedList items={e.steps} /> },
    ...[e.example, ...e.examples].map((x, i) => exampleSlide(x, exampleKicker(x, i + 1))),
    ...(e.practice.length
      ? [{
          kicker: l.explain.practice,
          frames: e.practice.length,
          render: (n: number) => (
            <ol className="grid max-w-[52ch] gap-5">
              {e.practice.map((p, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-5 gap-y-2 text-[clamp(1.25rem,2.5vw,1.9rem)] leading-[1.35]">
                  <span className="tabular grid size-[1.6em] shrink-0 place-items-center self-start rounded-full bg-mint text-[0.75em] font-semibold">{i + 1}</span>
                  <span className="min-w-0 flex-1">{p.task}</span>
                  {i < n && <span className="pop tabular rounded-btn bg-surface px-3 py-1 font-mono font-semibold">{p.answer}</span>}
                </li>
              ))}
            </ol>
          ),
        } satisfies Slide]
      : []),
    { kicker: l.explain.mistakes, frames: 0, render: () => <NumberedList items={e.mistakes} /> },
    ...(e.summary.length ? [{ kicker: l.explain.summary, frames: 0, render: () => <NumberedList items={e.summary} /> } satisfies Slide] : []),
    { kicker: l.explain.checkQuestions, frames: 0, render: () => <NumberedList items={e.checkQuestions} /> },
  ];

  const last = slides.length - 1;

  function open() {
    setPos({ slide: 0, shown: 0 });
    dialog.current?.showModal();
    // «Дальше» в фокусе: учитель листает клавишей Enter или пробелом с первого слайда.
    nextButton.current?.focus();
  }

  function next() {
    setPos((p) => {
      if (p.shown < slides[p.slide].frames) return { ...p, shown: p.shown + 1 };
      return p.slide < last ? { slide: p.slide + 1, shown: 0 } : p;
    });
  }

  function prev() {
    setPos((p) => {
      if (p.shown > 0) return { ...p, shown: p.shown - 1 };
      if (p.slide === 0) return p;
      // Назад на пример: показываем его целиком, а не с нуля.
      return { slide: p.slide - 1, shown: slides[p.slide - 1].frames };
    });
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowRight" || event.key === "PageDown") {
      event.preventDefault();
      next();
    } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
      event.preventDefault();
      prev();
    }
  }

  const current = slides[Math.min(slide, last)];

  return (
    <>
      <button type="button" onClick={open} className="btn btn-primary">
        <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
        {l.present}
      </button>

      <dialog
        ref={dialog}
        aria-label={t(labels.label, { topic })}
        onKeyDown={onKeyDown}
        onClose={() => setPos({ slide: 0, shown: 0 })}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-bg p-0 text-ink backdrop:bg-ink/70"
      >
        <div className="mx-auto flex h-full max-w-6xl flex-col px-4 py-4 sm:px-10 sm:py-8">
          <div className="flex items-center justify-between gap-4">
            <p className="min-w-0 truncate text-[0.9rem] font-semibold text-muted">
              {grade} · {topic}
            </p>
            <div className="flex shrink-0 items-center gap-4">
              <span className="tabular font-mono text-[0.9rem] text-muted" aria-live="polite">
                {labels.counter.replace("{n}", String(slide + 1)).replace("{m}", String(slides.length))}
              </span>
              <button type="button" onClick={() => dialog.current?.close()} className="btn btn-secondary" aria-label={labels.close}>
                <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
                <span className="hidden sm:inline">{labels.close}</span>
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto py-8">
            <p className="mb-6 text-[clamp(0.95rem,1.6vw,1.2rem)] font-semibold tracking-[0.02em] text-muted uppercase">{current.kicker}</p>
            <div key={slide}>{current.render(shown)}</div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
            <p className="hidden text-[0.85rem] text-muted md:block">{labels.keys}</p>
            <div className="ml-auto flex gap-3">
              <button type="button" onClick={prev} disabled={slide === 0} className="btn btn-secondary">
                <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m10 4-4 4 4 4" />
                </svg>
                {labels.prev}
              </button>
              {/* На последнем слайде главная кнопка закрывает показ: фокус не теряется на неактивной кнопке. */}
              <button
                ref={nextButton}
                type="button"
                onClick={slide === last ? () => dialog.current?.close() : next}
                className="btn btn-primary"
              >
                {slide === last ? labels.close : labels.next}
                {slide !== last && (
                  <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m6 4 4 4-4 4" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}

function NumberedList({ items }: { items: string[] }) {
  return (
    <ol className="grid max-w-[46ch] gap-5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-5 text-[clamp(1.25rem,2.5vw,1.9rem)] leading-[1.35]">
          <span className="tabular grid size-[1.6em] shrink-0 place-items-center rounded-full bg-mint text-[0.75em] font-semibold">{i + 1}</span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}
