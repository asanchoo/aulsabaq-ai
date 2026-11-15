"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { Explanation } from "@/lib/schema";

type Labels = {
  open: string;
  label: string;
  prev: string;
  next: string;
  close: string;
  counter: string;
  keys: string;
  answer: string;
  explain: Record<"hook" | "keyIdea" | "steps" | "example" | "mistakes" | "checkQuestions", string>;
};

type Props = { explanation: Explanation; grade: string; topic: string; labels: Labels };

/**
 * Объяснение темы как слайды для показа классу (проектор, телевизор, ноутбук).
 * Слайды не хранятся отдельно: их собирает этот компонент из полей explanation,
 * поэтому модель отвечает только за содержание, а вид у всех уроков одинаковый.
 * Разобранный пример открывается по шагу на каждое нажатие «Дальше»: ученики
 * сначала думают сами, потом видят следующий шаг.
 * Нативный <dialog> сам держит фокус внутри, закрывается по Esc и возвращает фокус на кнопку.
 */
/** Четвёртый слайд — разбор примера, он открывается по шагам. */
const EXAMPLE_SLIDE = 3;

export function ExplanationSlides({ explanation: e, grade, topic, labels }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  // Номер слайда и сколько шагов примера уже открыто. Одно состояние и обновление через функцию:
  // так быстрые нажатия стрелок не теряются, каждое считается от предыдущего.
  const [{ slide, shown }, setPos] = useState({ slide: 0, shown: 0 });
  const frames = e.example.steps.length + 1; // шаги примера и ответ
  const slides: { kicker: string; body: ReactNode }[] = [
    {
      kicker: `${grade} · ${labels.explain.hook}`,
      body: (
        <>
          <p className="display text-[clamp(2.2rem,5.5vw,4.4rem)]">{topic}</p>
          <p className="mt-8 max-w-[38ch] text-[clamp(1.3rem,2.6vw,2rem)] leading-[1.4] text-ink/85">{e.hook}</p>
        </>
      ),
    },
    {
      kicker: labels.explain.keyIdea,
      body: <p className="max-w-[30ch] text-[clamp(1.7rem,4vw,3.2rem)] leading-[1.25] font-semibold tracking-[-0.02em]">{e.keyIdea}</p>,
    },
    {
      kicker: labels.explain.steps,
      body: <NumberedList items={e.steps} />,
    },
    {
      kicker: labels.explain.example,
      body: (
        <>
          <p className="tabular font-mono text-[clamp(2rem,5vw,4rem)] font-medium">{e.example.problem}</p>
          <ol className="mt-8 grid gap-4">
            {e.example.steps.slice(0, shown).map((step, i) => (
              <li key={i} className="flex gap-4 text-[clamp(1.2rem,2.3vw,1.8rem)] leading-[1.35] pop">
                <span className="tabular w-8 shrink-0 font-mono text-muted">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          {shown > e.example.steps.length && (
            <p className="mt-8 inline-flex rounded-card bg-mint px-5 py-3 text-[clamp(1.3rem,2.6vw,2rem)] font-semibold pop">
              {labels.answer}: <span className="tabular ml-2 font-mono">{e.example.answer}</span>
            </p>
          )}
        </>
      ),
    },
    {
      kicker: labels.explain.mistakes,
      body: <NumberedList items={e.mistakes} />,
    },
    {
      kicker: labels.explain.checkQuestions,
      body: <NumberedList items={e.checkQuestions} />,
    },
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
      if (p.slide === EXAMPLE_SLIDE && p.shown < frames) return { ...p, shown: p.shown + 1 };
      return p.slide < last ? { slide: p.slide + 1, shown: 0 } : p;
    });
  }

  function prev() {
    setPos((p) => {
      if (p.slide === EXAMPLE_SLIDE && p.shown > 0) return { ...p, shown: p.shown - 1 };
      if (p.slide === 0) return p;
      // Назад на пример: показываем его целиком, а не с нуля.
      return { slide: p.slide - 1, shown: p.slide - 1 === EXAMPLE_SLIDE ? frames : 0 };
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

  const current = slides[slide];

  return (
    <>
      <button type="button" onClick={open} className="btn btn-primary">
        <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
        {labels.open}
      </button>

      <dialog
        ref={dialog}
        aria-label={labels.label}
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
            <div key={slide}>{current.body}</div>
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
