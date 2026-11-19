"use client";

import { useState, type FormEvent } from "react";
import { t, type Dict } from "@/lib/i18n";
import type { StudentView } from "@/lib/student-view";
import { AutoTextarea } from "./AutoTextarea";

type Trainer = NonNullable<StudentView["trainer"]>;
export type TrainerResult = { correct: boolean; shown: string | null; prompt: string };

/**
 * Тренажёр без конца: одно задание за раз, счёт решённых. Задание и проверку даёт сервер
 * (lib/trainer.ts составляет его заново по номеру), поэтому здесь нет ответа, пока его не показали.
 */
export function TrainerScreen({ trainer, dict, busy, onAnswer, onSkip }: {
  trainer: Trainer;
  dict: Dict;
  busy: boolean;
  onAnswer: (answer: string) => Promise<TrainerResult | null>;
  onSkip: () => Promise<TrainerResult | null>;
}) {
  const d = dict.student.trainer;
  const [answer, setAnswer] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [last, setLast] = useState<TrainerResult | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!answer.trim() || busy) return;
    const result = await onAnswer(answer);
    if (!result) return;
    setLast(result);
    if (result.correct || result.shown) {
      setAnswer("");
      setShowHint(false);
    }
  }

  async function skip() {
    const result = await onSkip();
    if (!result) return;
    setLast(result);
    setAnswer("");
    setShowHint(false);
  }

  const task = trainer.task;
  return (
    <article aria-labelledby="trainer-title" className="grid gap-4 rounded-frame border border-line bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 id="trainer-title" className="text-[1.35rem] font-semibold tracking-[-0.01em]">{d.title}</h1>
        <span className="tabular rounded-full bg-mint px-3 py-1 text-[0.85rem] font-semibold">{t(d.solved, { n: trainer.solved })}</span>
      </div>
      <p className="text-[0.92rem] leading-snug text-muted">{d.lead}</p>

      {last && (
        <p role="status" className={`rounded-card p-3 leading-snug ${last.correct ? "bg-mint" : last.shown ? "bg-surface" : "bg-help-soft"}`}>
          {last.correct ? d.right : last.shown ? t(d.shown, { a: last.shown }) : d.again}
        </p>
      )}

      <p key={task.index} className="pop tabular text-[1.6rem] leading-snug font-medium">{task.prompt}</p>
      <form onSubmit={submit} className="grid gap-3" noValidate>
        <div>
          <label htmlFor="trainer-answer" className="field-label">{dict.student.answer}</label>
          <p id="trainer-input-hint" className="mb-2 text-[0.92rem] text-muted">{task.inputHint}</p>
          <AutoTextarea
            id="trainer-answer"
            singleLine
            className="field text-[1.1rem] leading-snug"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            inputMode={task.numeric ? "decimal" : "text"}
            maxLength={100}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            aria-describedby="trainer-input-hint"
          />
        </div>
        <button type="submit" className="btn btn-primary w-full" disabled={!answer.trim() || busy} aria-busy={busy}>
          {busy ? dict.student.checking : d.check}
        </button>
      </form>
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        <button type="button" className="link min-h-10 text-[0.92rem] font-semibold" onClick={() => setShowHint((v) => !v)} aria-expanded={showHint}>
          {d.hint}
        </button>
        <button type="button" className="link min-h-10 text-[0.92rem] text-muted" disabled={busy} onClick={skip}>
          {d.skip}
        </button>
      </div>
      {showHint && <p className="rounded-card rounded-bl-md bg-mint-soft px-4 py-3 leading-snug">{task.hint}</p>}
    </article>
  );
}
