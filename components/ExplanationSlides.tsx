"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
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
          {/* Все шаги, ответ и схема стоят на своих местах с самого начала, скрытые невидимы: слайд не прыгает
              при каждом нажатии, и размер подбирается один раз (FitBox). */}
          <ol className="mt-6 grid gap-3">
            {x.steps.map((step, i) => (
              <li key={i} aria-hidden={i >= n} className={`flex gap-4 text-[clamp(1.1rem,2.1vw,1.6rem)] leading-[1.35] ${i < n ? "pop" : "invisible"}`}>
                <span className="tabular w-7 shrink-0 font-mono text-muted">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p aria-hidden={n <= x.steps.length} className={`mt-6 rounded-card bg-mint px-5 py-3 text-[clamp(1.2rem,2.4vw,1.8rem)] font-semibold ${n > x.steps.length ? "pop" : "invisible"}`}>
            {l.answer}: <span className="tabular">{x.answer}</span>
          </p>
        </div>
        {x.visual && (
          <div aria-hidden={n <= x.steps.length} className={`min-w-0 ${n > x.steps.length ? "pop" : "invisible"}`}>
            <Visual visual={x.visual} labels={dict.visual} size="slide" />
          </div>
        )}
      </div>
    ),
  });

  // Схемы: первая идёт к правилу, вторая к шагам (если её нет, шаги показываются рядом с первой),
  // остальные отдельными слайдами. Так схема всегда стоит рядом с тем, что она объясняет.
  // Презентация на 10–13 слайдов, примерно минута на слайд: на экран идут 3 примера, 2 ошибки и до 6 заданий.
  // Остальное (все примеры, все задания, третья схема) остаётся на странице урока и в памятке ученика.
  const [ruleVisual, stepsVisual] = e.visuals;
  // Рядом с шагами только схема, которая их показывает (уголок, столбик, луч, таблица). Схема-«алгоритм» (flow)
  // повторяет те же шаги в рамках: рядом с шагами это одно и то же дважды, и слайд не помещался.
  const stepsSide = [stepsVisual, ruleVisual].find((v) => v && v.kind !== "flow") ?? null;
  const practiceChunks = chunk(e.practice.slice(0, 6), 3);
  const mistakes = e.mistakes.slice(0, 2).map(splitMistake);
  const shownExamples = pickExamples([e.example, ...e.examples]);

  const slides: Slide[] = [
    // 1. Обложка: тема и вопрос классу из ситуации.
    {
      kicker: grade,
      frames: 0,
      render: () => (
        // Тема и вопрос классу рядом: длинная тема и вопрос из нескольких предложений не помещались столбиком.
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-12">
          <p className="display text-[clamp(2.2rem,4.6vw,4rem)]">{topic}</p>
          <div className="rounded-frame bg-mint-soft p-6 sm:p-8">
            <p className="text-[clamp(0.95rem,1.6vw,1.2rem)] font-semibold tracking-[0.02em] text-ink/70 uppercase">{labels.question}</p>
            <p className="mt-2 text-[clamp(1.2rem,2.2vw,1.75rem)] leading-[1.4]">{e.hook}</p>
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
                  {/* На слайд до трёх новых слов, иначе пояснения становятся мелкими; все слова есть на странице урока. */}
                  {e.terms.slice(0, 3).map((x) => (
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
        <div className={`grid gap-10 ${stepsSide ? "lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start" : ""}`}>
          <ol className="grid max-w-[60ch] gap-4">
            {e.steps.map((step, i) => (
              <li key={i} className={`flex gap-4 text-[clamp(1.2rem,2.3vw,1.8rem)] leading-[1.35] transition-opacity ${i < n ? "pop opacity-100" : "opacity-15"}`}>
                <span className="tabular grid size-[1.6em] shrink-0 place-items-center rounded-full bg-mint text-[0.75em] font-semibold">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          {stepsSide && (
            <div className="min-w-0">
              <Visual visual={stepsSide} labels={dict.visual} size="slide" />
            </div>
          )}
        </div>
      ),
    },
    // 6. Примеры: шаг за шагом, ответ и схема в конце.
    ...shownExamples.map((x, i) => exampleSlide(x, exampleKicker(x, i + 1))),
    // 7. Найди ошибку: сначала только ошибки, по нажатию объяснение каждой по очереди.
    ...(mistakes.length
      ? [{
          kicker: labels.findMistake,
          frames: mistakes.filter((m) => m.rest).length,
          render: (n: number) => {
            let opened = 0;
            return (
              <div className="grid gap-5">
                <p className="text-[clamp(0.95rem,1.6vw,1.2rem)] text-muted">{labels.findMistakeLead}</p>
                <div className={`grid gap-6 ${mistakes.length > 1 ? "lg:grid-cols-2" : "max-w-[48ch]"}`}>
                  {mistakes.map((m, i) => {
                    const show = m.rest && opened++ < n;
                    return (
                      <div key={i} className="grid content-start gap-4">
                        <p className="rounded-frame border-2 border-dashed border-help/50 bg-help-soft p-5 text-[clamp(1.25rem,2.6vw,2rem)] leading-[1.3] font-medium">{m.lead}</p>
                        {m.rest && <p aria-hidden={!show} className={`text-[clamp(1.05rem,1.9vw,1.45rem)] leading-[1.4] ${show ? "pop" : "invisible"}`}>{m.rest}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          },
        } satisfies Slide]
      : []),
    // 8. Твоя очередь: по три задания, ответы по одному.
    ...practiceChunks.map((tasks, k): Slide => ({
      kicker: practiceChunks.length > 1 ? `${labels.yourTurn} · ${k + 1}/${practiceChunks.length}` : labels.yourTurn,
      frames: tasks.length,
      render: (n) => (
        <div className="grid gap-6">
          <p className="text-[clamp(0.95rem,1.6vw,1.2rem)] text-muted">{labels.yourTurnLead}</p>
          {/* Задания рядом в колонки: так они используют всю ширину экрана, а не узкую полосу слева, и слайд
              не приходится сильно уменьшать. */}
          <ol className={`grid items-start gap-x-10 gap-y-7 ${tasks.length > 1 ? "lg:grid-cols-[repeat(auto-fit,minmax(0,1fr))]" : "max-w-[56ch]"}`}>
            {tasks.map((p, i) => (
              <li key={i} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-2 text-[clamp(1.4rem,2.9vw,2.2rem)] leading-[1.3]">
                <span className="tabular grid size-[1.5em] place-items-center rounded-full bg-mint text-[0.7em] font-semibold">{k * 3 + i + 1}</span>
                <span className="min-w-0">{p.task}</span>
                {/* Ответ отдельной строкой под заданием: в одну строку он сжимал задание до слова на строку. */}
                <span
                  aria-hidden={i >= n}
                  className={`col-start-2 justify-self-start rounded-btn bg-surface px-3 py-1 text-[0.8em] font-semibold ${i < n ? "pop" : "invisible"}`}
                >
                  {l.answer}: <span className="tabular">{p.answer}</span>
                </span>
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
        <div className="grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
          <div>
            <p className="mb-4 text-[clamp(1rem,1.8vw,1.3rem)] font-semibold">{labels.summary}</p>
            <NumberedList items={e.summary.length ? e.summary : [e.keyIdea]} />
          </div>
          {e.checkQuestions.length > 0 && (
            <div className="rounded-frame bg-surface p-6">
              <p className="mb-4 text-[clamp(1rem,1.8vw,1.3rem)] font-semibold">{labels.questions}</p>
              <ul className="grid gap-4 text-[clamp(1.2rem,2.2vw,1.7rem)] leading-[1.35]">
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

          <FitBox key={slide}>
            <p className="mb-6 text-[clamp(0.95rem,1.6vw,1.2rem)] font-semibold tracking-[0.02em] text-muted uppercase">{current.kicker}</p>
            {current.render(shown)}
          </FitBox>

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
    <ol className="grid max-w-[60ch] gap-5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-5 text-[clamp(1.25rem,2.5vw,1.9rem)] leading-[1.35]">
          <span className="tabular grid size-[1.6em] shrink-0 place-items-center rounded-full bg-mint text-[0.75em] font-semibold">{i + 1}</span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Три примера для экрана: простой, как в учебнике и с подвохом (или из жизни), в порядке лестницы.
 * Если уровней нет (старые уроки), первые три.
 */
function pickExamples(all: WorkedExample[]): WorkedExample[] {
  if (all.length <= 3) return all;
  const order = ["simple", "typical", "tricky", "life", "counter"] as const;
  const picked: WorkedExample[] = [];
  for (const level of order) {
    const found = all.find((x) => x.level === level && !picked.includes(x));
    if (found && picked.length < 3) picked.push(found);
  }
  for (const x of all) if (picked.length < 3 && !picked.includes(x)) picked.push(x);
  return all.filter((x) => picked.includes(x));
}

/** Меньше этого слайд не уменьшаем: дальше текст с задних парт не прочитать, лучше прокрутка. */
const MIN_ZOOM = 0.55;

/**
 * Слайд всегда помещается в экран проектора. Если содержимое выше или шире области слайда (длинные шаги, большая
 * схема), уменьшаем его целиком через CSS zoom шагами по 5%, но не меньше MIN_ZOOM; что не поместилось и тогда,
 * можно прокрутить. Размер считаем один раз на слайд (скрытые шаги уже занимают своё место) и заново при изменении
 * окна: ResizeObserver срабатывает и когда показ открылся, и когда учитель развернул окно на весь экран.
 */
function FitBox({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const box = outer.current;
    const content = inner.current;
    if (!box || !content) return;
    const fit = () => {
      if (box.clientHeight === 0) return; // показ закрыт: размеров ещё нет
      const style = getComputedStyle(box);
      const height = box.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const width = box.clientWidth;
      let zoom = 1;
      content.style.zoom = "1";
      const fits = () => {
        const r = content.getBoundingClientRect();
        return r.height <= height + 1 && r.width <= width + 1;
      };
      while (zoom > MIN_ZOOM && !fits()) {
        zoom = Math.round((zoom - 0.05) * 100) / 100;
        content.style.zoom = String(zoom);
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={outer} className="flex min-h-0 flex-1 flex-col justify-center-safe overflow-y-auto py-8">
      <div ref={inner} className="min-w-0">{children}</div>
    </div>
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
  const first = match ? match[1] : text;
  const after = match ? match[2] : "";
  // «Ученик записал 313: он приписал 13 единиц…» — объяснение после двоеточия в той же фразе. Делим по двоеточию,
  // если до него уже есть неверный ответ (цифры), а после идёт пояснение с маленькой буквы. «Ученик решил: 36 + 48 = 74»
  // не делим: там после двоеточия само неверное решение, его класс и должен увидеть.
  const colon = first.match(/^([^:]*\d[^:]*):\s+(\p{Ll}[\s\S]*)$/u);
  if (colon) return { lead: `${colon[1]}.`, rest: [capitalize(colon[2]), after].filter(Boolean).join(" ") };
  return { lead: first, rest: after };
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
