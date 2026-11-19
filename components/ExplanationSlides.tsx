"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { getDict, t, type Locale } from "@/lib/i18n";
import type { Explanation, WorkedExample } from "@/lib/schema";
import { Visual } from "./Visual";
import { isMathOnly } from "@/lib/lesson";
import QRCode from "qrcode";

type Props = { explanation: Explanation; grade: string; topic: string; lang: Locale; joinCode?: string };

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

export function ExplanationSlides({ explanation: e, grade, topic, lang, joinCode }: Props) {
  const dict = getDict(lang);
  const l = dict.lesson;
  const labels = l.slides;
  const dialog = useRef<HTMLDialogElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  // Номер слайда и сколько шагов на нём уже открыто. Одно состояние и обновление через функцию:
  // так быстрые нажатия стрелок не теряются, каждое считается от предыдущего.
  const [{ slide, shown }, setPos] = useState({ slide: 0, shown: 0 });
  // QR-код ссылки для учеников на последнем слайде: класс наводит телефон на экран и сразу попадает в урок.
  const [qr, setQr] = useState<string | null>(null);
  const [site, setSite] = useState("");

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

  // Схемы: первая идёт к правилу, вторая к шагам (если её нет, шаги показываются рядом с первой),
  // остальные отдельными слайдами. Так схема всегда стоит рядом с тем, что она объясняет.
  const [ruleVisual, stepsVisual, ...moreVisuals] = e.visuals;
  const practiceChunks = chunk(e.practice, 3);
  const mistakes = e.mistakes.map(splitMistake);

  const slides: Slide[] = [
    // 1. Обложка: тема и вопрос классу из ситуации.
    {
      kicker: grade,
      frames: 0,
      render: () => (
        <div className="grid gap-8">
          <p className="display max-w-[18ch] text-[clamp(2.4rem,6vw,4.8rem)]">{topic}</p>
          <div className="max-w-[44ch] rounded-frame bg-mint-soft p-6 sm:p-8">
            <p className="text-[clamp(0.95rem,1.6vw,1.2rem)] font-semibold tracking-[0.02em] text-ink/70 uppercase">{labels.question}</p>
            <p className="mt-2 text-[clamp(1.3rem,2.6vw,2rem)] leading-[1.35]">{e.hook}</p>
          </div>
        </div>
      ),
    },
    // 2. Что вспомнить.
    ...(e.prerequisites.length
      ? [{ kicker: l.explain.prerequisites, frames: 0, render: () => <NumberedList items={e.prerequisites} /> } satisfies Slide]
      : []),
    // 3. Простыми словами и новые слова на одном слайде.
    ...(e.intuition || e.terms.length
      ? [{
          kicker: l.explain.intuition,
          frames: 0,
          render: () => (
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start">
              {e.intuition && <p className="max-w-[34ch] text-[clamp(1.4rem,3vw,2.3rem)] leading-[1.35]">{e.intuition}</p>}
              {e.terms.length > 0 && (
                <dl className="grid gap-3">
                  {e.terms.map((x) => (
                    <div key={x.term} className="rounded-card border border-line p-4">
                      <dt className="text-[clamp(1.2rem,2.2vw,1.7rem)] font-semibold tracking-[-0.01em]">{x.term}</dt>
                      <dd className="mt-1 text-[clamp(1rem,1.7vw,1.3rem)] leading-[1.35] text-ink/80">{x.meaning}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          ),
        } satisfies Slide]
      : []),
    // 4. Правило и схема рядом: главный слайд урока, его же ученик видит в памятке.
    {
      kicker: labels.rule,
      frames: 0,
      render: () => (
        <div className={`grid gap-10 ${ruleVisual ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center" : ""}`}>
          <p className="max-w-[26ch] rounded-frame bg-mint p-6 text-[clamp(1.6rem,3.6vw,3rem)] leading-[1.25] font-semibold tracking-[-0.02em] sm:p-8">{e.keyIdea}</p>
          {ruleVisual && (
            <div className="min-w-0">
              <Visual visual={ruleVisual} labels={dict.visual} size="slide" />
            </div>
          )}
        </div>
      ),
    },
    // 5. Шаги открываются по одному рядом со схемой.
    {
      kicker: labels.show,
      frames: e.steps.length,
      render: (n) => (
        <div className={`grid gap-10 ${stepsVisual ?? ruleVisual ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start" : ""}`}>
          <ol className="grid max-w-[40ch] gap-4">
            {e.steps.map((step, i) => (
              <li key={i} className={`flex gap-4 text-[clamp(1.2rem,2.3vw,1.8rem)] leading-[1.35] transition-opacity ${i < n ? "pop opacity-100" : "opacity-15"}`}>
                <span className="tabular grid size-[1.6em] shrink-0 place-items-center rounded-full bg-mint text-[0.75em] font-semibold">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          {(stepsVisual ?? ruleVisual) && (
            <div className="min-w-0">
              <Visual visual={(stepsVisual ?? ruleVisual)!} labels={dict.visual} size="slide" />
            </div>
          )}
        </div>
      ),
    },
    ...moreVisuals.map((v): Slide => ({ kicker: l.explain.visual, frames: 0, render: () => <Visual visual={v} labels={dict.visual} size="slide" /> })),
    // 6. Примеры: шаг за шагом, ответ и схема в конце.
    ...[e.example, ...e.examples].map((x, i) => exampleSlide(x, exampleKicker(x, i + 1))),
    // 7. Найди ошибку: сначала ошибка, по нажатию — почему и как заметить.
    ...mistakes.map((m): Slide => ({
      kicker: labels.findMistake,
      frames: m.rest ? 1 : 0,
      render: (n) => (
        <div className="grid max-w-[48ch] gap-6">
          <p className="text-[clamp(0.95rem,1.6vw,1.2rem)] text-muted">{labels.findMistakeLead}</p>
          <p className="rounded-frame border-2 border-dashed border-help/50 bg-help-soft p-6 text-[clamp(1.4rem,3vw,2.3rem)] leading-[1.3] font-medium">{m.lead}</p>
          {n > 0 && m.rest && <p className="pop text-[clamp(1.2rem,2.2vw,1.7rem)] leading-[1.4]">{m.rest}</p>}
        </div>
      ),
    })),
    // 8. Твоя очередь: по три задания, ответы по одному.
    ...practiceChunks.map((tasks, k): Slide => ({
      kicker: practiceChunks.length > 1 ? `${labels.yourTurn} · ${k + 1}/${practiceChunks.length}` : labels.yourTurn,
      frames: tasks.length,
      render: (n) => (
        <div className="grid gap-6">
          <p className="text-[clamp(0.95rem,1.6vw,1.2rem)] text-muted">{labels.yourTurnLead}</p>
          <ol className="grid max-w-[52ch] gap-6">
            {tasks.map((p, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-5 gap-y-2 text-[clamp(1.4rem,2.9vw,2.2rem)] leading-[1.3]">
                <span className="tabular grid size-[1.5em] shrink-0 place-items-center self-start rounded-full bg-mint text-[0.7em] font-semibold">{k * 3 + i + 1}</span>
                <span className={`min-w-0 flex-1 ${isMathOnly(p.task) ? "tabular font-mono" : ""}`}>{p.task}</span>
                {i < n && <span className="pop tabular rounded-btn bg-surface px-3 py-1 font-mono font-semibold">{p.answer}</span>}
              </li>
            ))}
          </ol>
        </div>
      ),
    })),
    // 9. Итог и вопросы на одном слайде.
    {
      kicker: l.explain.summary,
      frames: 0,
      render: () => (
        <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
          <div>
            <p className="mb-4 text-[clamp(1rem,1.8vw,1.3rem)] font-semibold">{labels.summary}</p>
            <NumberedList items={e.summary.length ? e.summary : [e.keyIdea]} />
          </div>
          {e.checkQuestions.length > 0 && (
            <div className="rounded-frame bg-surface p-6">
              <p className="mb-4 text-[clamp(1rem,1.8vw,1.3rem)] font-semibold">{labels.questions}</p>
              <ul className="grid gap-4 text-[clamp(1.15rem,2.1vw,1.6rem)] leading-[1.35]">
                {e.checkQuestions.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
            </div>
          )}
        </div>
      ),
    },
    // 10. Теперь сами: что делать без учителя и как войти с телефона.
    {
      kicker: labels.alone,
      frames: 0,
      render: () => (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-center">
          <div className="grid gap-6">
            <p className="max-w-[30ch] text-[clamp(1.4rem,3vw,2.3rem)] leading-[1.3] font-semibold">{labels.aloneText}</p>
            <ol className="grid gap-3">
              {labels.aloneSteps.map((step, i) => (
                <li key={i} className="flex gap-4 text-[clamp(1.1rem,2vw,1.5rem)] leading-[1.35]">
                  <span className="tabular grid size-[1.6em] shrink-0 place-items-center rounded-full bg-mint text-[0.75em] font-semibold">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
          {joinCode ? (
            <div className="grid justify-items-start gap-4 rounded-frame border border-line p-6">
              {qr && <span aria-hidden className="block size-[clamp(9rem,18vw,13rem)] [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: qr }} />}
              <p className="text-[clamp(1rem,1.6vw,1.2rem)] text-muted">
                {labels.aloneSite}: <span className="font-semibold text-ink">{site}</span>
              </p>
              <p className="text-[clamp(1rem,1.6vw,1.2rem)] text-muted">{labels.aloneCode}</p>
              <p className="tabular -mt-3 font-mono text-[clamp(2.6rem,6vw,4.6rem)] leading-none font-semibold tracking-[0.06em]">{joinCode}</p>
            </div>
          ) : (
            <p className="max-w-[36ch] text-[clamp(1rem,1.7vw,1.3rem)] leading-[1.4] text-muted">{labels.aloneNoCode}</p>
          )}
        </div>
      ),
    },
  ];
  const last = slides.length - 1;

  function open() {
    setPos({ slide: 0, shown: 0 });
    if (joinCode && !qr) {
      const url = `${window.location.origin}/${lang}/join?code=${joinCode}`;
      setSite(`${window.location.host}/join`);
      const ink = getComputedStyle(document.documentElement).getPropertyValue("--color-ink").trim() || "black";
      void QRCode.toString(url, { type: "svg", margin: 1, color: { dark: ink, light: "#0000" } }).then(setQr).catch(() => setQr(null));
    }
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

/** Делит список на части по size: «Твоя очередь» по три задания на слайде, чтобы задания были крупными. */
function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));
}

/**
 * Типичная ошибка из урока: первое предложение — сама ошибка («Ученик складывает десятки без переноса: 36 + 48 = 74»),
 * остальное — почему неверно и как заметить. На слайде «Найди ошибку» класс сначала видит только ошибку.
 */
export function splitMistake(text: string): { lead: string; rest: string } {
  const match = text.match(/^([\s\S]+?[.!?])\s+([\s\S]+)$/);
  return match ? { lead: match[1], rest: match[2] } : { lead: text, rest: "" };
}
