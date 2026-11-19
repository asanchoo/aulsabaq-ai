"use client";

import { useRef, useState, type FormEvent } from "react";
import { checkAnswer } from "@/lib/check-answer";
import type { Dict } from "@/lib/i18n";
import type { StudentGuide as Guide } from "@/lib/student-view";
import { Visual } from "./Visual";
import { AutoTextarea } from "./AutoTextarea";

type Example = Guide["examples"][number];

/**
 * Памятка ученика: то, что учитель показывал на экране, но на телефоне и в любой момент.
 * RuleCard — правило, схема и шаги. WorkedExample — разобранный пример, шаги открываются по нажатию,
 * а ответ ученик сначала пишет сам («реши со мной»): так пример не читают, а решают вместе.
 * Ответ примера проверяется прямо в браузере: это образец, а не задание на оценку.
 */
export function RuleCard({ guide, dict }: { guide: Guide; dict: Dict }) {
  const g = dict.student.guide;
  return (
    <div className="grid gap-4">
      <div className="rounded-card bg-mint-soft p-4">
        <p className="text-[0.8rem] font-semibold tracking-[0.02em] text-ink/70 uppercase">{g.rule}</p>
        <p className="mt-1 text-[1.15rem] leading-snug font-semibold">{guide.keyIdea}</p>
      </div>
      {guide.visual && <Visual visual={guide.visual} labels={dict.visual} />}
      {guide.steps.length > 0 && (
        <div>
          <p className="text-[0.8rem] font-semibold tracking-[0.02em] text-muted uppercase">{g.howTo}</p>
          <ol className="mt-2 grid gap-2">
            {guide.steps.map((step, i) => (
              <li key={i} className="flex gap-3 leading-snug">
                <span className="tabular grid size-6 shrink-0 place-items-center rounded-full bg-surface text-[0.8rem] font-semibold">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export function WorkedExample({ example, dict, tryIt = true }: { example: Example; dict: Dict; tryIt?: boolean }) {
  const g = dict.student.guide;
  // Сколько шагов открыто. Все шаги открыты — время написать ответ (или сразу показать его).
  const [shown, setShown] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<"right" | "wrong" | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const allSteps = shown >= example.steps.length;
  const finished = result !== null || (!tryIt && allSteps);

  function check(event: FormEvent) {
    event.preventDefault();
    if (!answer.trim()) return;
    setResult(checkAnswer(answer, example.answer) || looseMatch(answer, example.answer) ? "right" : "wrong");
  }

  return (
    <div className="grid gap-4">
      <p className="text-[1.2rem] leading-snug font-medium whitespace-pre-line">{example.problem}</p>
      {shown > 0 && (
        <ol className="grid gap-2" aria-live="polite">
          {example.steps.slice(0, shown).map((step, i) => (
            <li key={i} className="pop flex gap-3 leading-snug">
              <span className="tabular w-5 shrink-0 font-mono text-muted">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      )}

      {!allSteps && (
        <button ref={nextRef} type="button" className="btn btn-secondary justify-self-start" onClick={() => setShown((n) => n + 1)}>
          {shown === 0 ? g.firstStep : g.nextStep}
        </button>
      )}

      {allSteps && tryIt && result === null && (
        <form onSubmit={check} className="grid gap-2" noValidate>
          <label htmlFor="guide-answer" className="field-label">{g.yourTurn}</label>
          <AutoTextarea
            id="guide-answer"
            singleLine
            className="field leading-snug"
            autoComplete="off"
            spellCheck={false}
            maxLength={120}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary" disabled={!answer.trim()}>{g.check}</button>
            <button type="button" className="btn btn-secondary" onClick={() => setResult("wrong")}>{g.showAnswer}</button>
          </div>
        </form>
      )}

      {finished && (
        <div className="pop grid gap-3">
          <p role="status" className={`rounded-card p-3 leading-snug ${result === "right" ? "bg-mint" : "bg-surface"}`}>
            {result === "right" ? g.right : null}
            {result !== "right" && (
              <>
                <span className="font-semibold">{dict.lesson.answer}:</span> {example.answer}
              </>
            )}
          </p>
          {example.visual && <Visual visual={example.visual} labels={dict.visual} />}
        </div>
      )}
    </div>
  );
}

/** Пример, похожий на карточку: по сложности карточки, «бұлай болмайды» (контрпример) не берём. */
export function similarExample(guide: Guide, difficulty: 1 | 2 | 3): Example | null {
  const prefer = difficulty === 1 ? ["simple", "typical"] : difficulty === 2 ? ["typical", "life"] : ["tricky", "life", "typical"];
  const usable = guide.examples.filter((x) => x.level !== "counter");
  for (const level of prefer) {
    const found = usable.find((x) => x.level === level);
    if (found) return found;
  }
  return usable[0] ?? null;
}

/** Без регистра, ё/е и знаков ударения («тра́вы» и «травы» одно слово). */
const plain = (text: string) => text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N},.\-]+/gu, " ").trim();

/**
 * Мягкая проверка для разбора «реши со мной»: это образец, а не задание на оценку. Ответ образца часто длинный
 * («Трава. Проверочное слово — тра́вы.» или «36 + 48 = 84»), поэтому засчитываем, если ученик написал итоговое число
 * или слова из ответа образца.
 */
export function looseMatch(given: string, expected: string): boolean {
  const g = plain(given);
  const e = plain(expected);
  if (!g) return false;
  const numbers = (s: string) => s.match(/-?\d+(?:[.,]\d+)?/g) ?? [];
  const gNums = numbers(g);
  const eNums = numbers(e);
  if (gNums.length > 0) return gNums.length === 1 && eNums.length > 0 && gNums[0].replace(",", ".") === eNums[eNums.length - 1].replace(",", ".");
  const gWords = g.split(/[\s,.\-]+/).filter((w) => w.length >= 2);
  const eWords = new Set(e.split(/[\s,.\-]+/));
  return gWords.length > 0 && gWords.every((w) => eWords.has(w));
}