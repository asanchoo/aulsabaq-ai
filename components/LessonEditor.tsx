"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toEdit, type EditIssue, type LessonEdit } from "@/lib/edit";
import { t, type Dict } from "@/lib/i18n";
import type { LessonPlan } from "@/lib/schema";

type ListField = "steps" | "mistakes" | "checkQuestions" | "summary";
const LIST_LIMITS: Record<ListField | "exampleSteps", [number, number]> = { steps: [2, 8], mistakes: [1, 4], checkQuestions: [2, 4], summary: [0, 6], exampleSteps: [2, 8] };

const lines = (value: string) => value.split("\n");
const filled = (items: string[]) => items.map((s) => s.trim()).filter(Boolean);

/**
 * Редактор текстов урока. Учитель правит задания, ответы, подсказки и объяснение,
 * может попросить ИИ заменить одну карточку. Расписание не меняется (см. lib/edit.ts).
 */
export function LessonEditor({ lessonId, token, plan, dict, onClose }: {
  lessonId: string; token: string; plan: LessonPlan; dict: Dict;
  /** saved: сохранили (с предупреждениями, если есть); null: учитель отменил правку. */
  onClose: (saved: { warnings: string[] } | null) => void;
}) {
  const d = dict.edit;
  const router = useRouter();
  const [edit, setEdit] = useState<LessonEdit>(() => toEdit(plan));
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [regen, setRegen] = useState<{ cardId: string; wish: string } | null>(null);
  const [regenBusy, setRegenBusy] = useState<string | null>(null);
  const [regenNote, setRegenNote] = useState<{ cardId: string; text: string } | null>(null);

  const cardLabel = (cardId?: string) => {
    for (const g of plan.groups) {
      const i = g.cards.findIndex((c) => c.id === cardId);
      if (i >= 0) return { n: i + 1, grade: t(dict.common.grade, { n: g.grade }) };
    }
    return { n: "?", grade: "" };
  };
  const issueText = (issue: EditIssue) => t(d.issues[issue.code], { ...cardLabel(issue.cardId), detail: issue.detail ?? "" });

  const setGroup = (gi: number, patch: Partial<LessonEdit["groups"][number]>) =>
    setEdit((e) => ({ ...e, groups: e.groups.map((g, i) => (i === gi ? { ...g, ...patch } : g)) }));
  const setExplanation = (gi: number, patch: Partial<LessonEdit["groups"][number]["explanation"]>) =>
    setEdit((e) => ({ ...e, groups: e.groups.map((g, i) => (i === gi ? { ...g, explanation: { ...g.explanation, ...patch } } : g)) }));
  const setCard = (gi: number, ci: number, patch: Partial<LessonEdit["groups"][number]["cards"][number]>) =>
    setEdit((e) => ({
      ...e,
      groups: e.groups.map((g, i) => (i === gi ? { ...g, cards: g.cards.map((c, k) => (k === ci ? { ...c, ...patch } : c)) } : g)),
    }));

  /** Списки в textarea: строка = пункт. Перед отправкой убираем пустые строки и проверяем количество. */
  function cleaned(): { value: LessonEdit; errors: string[] } {
    const errors: string[] = [];
    const groups = edit.groups.map((g) => {
      const e = g.explanation;
      const lists = { steps: filled(e.steps), mistakes: filled(e.mistakes), checkQuestions: filled(e.checkQuestions), summary: filled(e.summary), exampleSteps: filled(e.example.steps) };
      for (const [field, items] of Object.entries(lists) as [keyof typeof LIST_LIMITS, string[]][]) {
        const [min, max] = LIST_LIMITS[field];
        if (items.length < min || items.length > max) {
          const label = field === "exampleSteps" ? d.exampleSteps : field === "checkQuestions" ? d.questions : field === "summary" ? d.summary : d[field];
          errors.push(`${label}: ${t(d.lines, { min, max, n: items.length })}`);
        }
      }
      return {
        ...g,
        explanation: { ...e, steps: lists.steps, mistakes: lists.mistakes, checkQuestions: lists.checkQuestions, summary: lists.summary, example: { ...e.example, steps: lists.exampleSteps } },
      };
    });
    return { value: { ...edit, groups }, errors };
  }

  async function save() {
    const { value, errors } = cleaned();
    if (errors.length) return setProblems(errors);
    setBusy(true);
    setProblems([]);
    try {
      const response = await fetch(`/api/lessons/${lessonId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-teacher-token": token },
        body: JSON.stringify(value),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 422 && Array.isArray(data.issues)) return setProblems(data.issues.map(issueText));
      if (!response.ok) return setProblems([d.errors[data.error as keyof typeof d.errors] ?? d.errors.storage]);
      const warnings: string[] = (data.warnings ?? []).map(issueText);
      router.refresh();
      onClose({ warnings });
    } catch {
      setProblems([d.errors.storage]);
    } finally {
      setBusy(false);
    }
  }

  async function regenerate(gi: number, ci: number) {
    if (!regen) return;
    const cardId = regen.cardId;
    setRegenBusy(cardId);
    setRegenNote(null);
    try {
      const response = await fetch(`/api/lessons/${lessonId}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-teacher-token": token },
        body: JSON.stringify({ cardId, wish: regen.wish.trim() || undefined }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setRegenNote({ cardId, text: d.errors[data.error as keyof typeof d.errors] ?? d.errors.provider });
        return;
      }
      setCard(gi, ci, { prompt: data.card.prompt, answer: data.card.answer ?? "", hint: data.card.hint, successCriteria: data.card.successCriteria });
      setRegen(null);
      setRegenNote({ cardId, text: d.regenerated });
      router.refresh();
    } catch {
      setRegenNote({ cardId, text: d.errors.storage });
    } finally {
      setRegenBusy(null);
    }
  }

  return (
    <section aria-labelledby="edit-title" className="mt-6 rounded-frame border-2 border-ink bg-white p-5 sm:p-8 print:hidden">
      <h2 id="edit-title" className="text-[1.6rem] font-semibold tracking-[-0.02em]">{d.title}</h2>
      <p className="mt-1 max-w-2xl text-[0.92rem] text-muted">{d.lead}</p>

      <div className="mt-8 grid gap-12">
        {edit.groups.map((g, gi) => {
          const group = plan.groups[gi];
          const e = g.explanation;
          return (
            <fieldset key={g.id} disabled={busy} className="grid gap-6">
              <legend className="mb-4 text-[1.25rem] font-semibold">{t(dict.common.grade, { n: group.grade })}: {group.topic}</legend>
              <Field id={`${g.id}-goal`} label={d.goal} value={g.learningGoal} onChange={(v) => setGroup(gi, { learningGoal: v })} />

              <div className="grid gap-4 rounded-card bg-surface p-4 sm:p-5">
                <h3 className="font-semibold">{dict.lesson.explainTitle}</h3>
                <Field id={`${g.id}-hook`} label={d.hook} value={e.hook} onChange={(v) => setExplanation(gi, { hook: v })} rows={2} />
                <Field id={`${g.id}-intuition`} label={d.intuition} value={e.intuition} onChange={(v) => setExplanation(gi, { intuition: v })} rows={3} />
                <Field id={`${g.id}-key`} label={d.keyIdea} value={e.keyIdea} onChange={(v) => setExplanation(gi, { keyIdea: v })} rows={2} />
                <Field id={`${g.id}-steps`} label={d.steps} value={e.steps.join("\n")} onChange={(v) => setExplanation(gi, { steps: lines(v) })} rows={4} />
                <Field id={`${g.id}-ex`} label={d.exampleProblem} value={e.example.problem} onChange={(v) => setExplanation(gi, { example: { ...e.example, problem: v } })} rows={2} />
                <Field id={`${g.id}-exs`} label={d.exampleSteps} value={e.example.steps.join("\n")} onChange={(v) => setExplanation(gi, { example: { ...e.example, steps: lines(v) } })} rows={4} />
                <Field id={`${g.id}-exa`} label={d.exampleAnswer} value={e.example.answer} onChange={(v) => setExplanation(gi, { example: { ...e.example, answer: v } })} />
                <Field id={`${g.id}-mis`} label={d.mistakes} value={e.mistakes.join("\n")} onChange={(v) => setExplanation(gi, { mistakes: lines(v) })} rows={3} />
                <Field id={`${g.id}-sum`} label={d.summary} value={e.summary.join("\n")} onChange={(v) => setExplanation(gi, { summary: lines(v) })} rows={4} />
                <Field id={`${g.id}-q`} label={d.questions} value={e.checkQuestions.join("\n")} onChange={(v) => setExplanation(gi, { checkQuestions: lines(v) })} rows={3} />
              </div>

              {g.cards.map((c, ci) => {
                const card = group.cards[ci];
                const open = regen?.cardId === c.id;
                return (
                  <div key={c.id} className="grid gap-4 rounded-card border border-line p-4 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold">
                        {t(dict.common.card, { n: ci + 1 })} · {dict.lesson.purpose[card.purpose]}
                        {card.type === "open" && ` · ${dict.lesson.openTask}`}
                      </h3>
                      <button type="button" className="link min-h-10 text-[0.9rem] font-semibold" aria-expanded={open} onClick={() => setRegen(open ? null : { cardId: c.id, wish: "" })}>
                        {d.regenerate}
                      </button>
                    </div>
                    {open && (
                      <div className="grid gap-3 rounded-btn bg-surface p-3 sm:grid-cols-[1fr_auto] sm:items-end">
                        <div>
                          <label htmlFor={`${c.id}-wish`} className="field-label">{d.wish}</label>
                          <input id={`${c.id}-wish`} className="field" maxLength={200} placeholder={d.wishPlaceholder} value={regen.wish} onChange={(ev) => setRegen({ cardId: c.id, wish: ev.target.value })} />
                        </div>
                        <button type="button" className="btn btn-primary" disabled={regenBusy !== null} aria-busy={regenBusy === c.id} onClick={() => regenerate(gi, ci)}>
                          {regenBusy === c.id ? d.regenerating : d.regenerate}
                        </button>
                      </div>
                    )}
                    {regenNote?.cardId === c.id && <p role="status" className="text-[0.9rem] font-medium">{regenNote.text}</p>}
                    <Field id={`${c.id}-prompt`} label={d.prompt} value={c.prompt} onChange={(v) => setCard(gi, ci, { prompt: v })} rows={3} />
                    <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
                      {card.type === "closed" && <Field id={`${c.id}-answer`} label={d.answer} value={c.answer ?? ""} onChange={(v) => setCard(gi, ci, { answer: v })} />}
                      <Field id={`${c.id}-hint`} label={d.hint} value={c.hint} onChange={(v) => setCard(gi, ci, { hint: v })} rows={2} />
                    </div>
                    <Field id={`${c.id}-crit`} label={d.criteria} value={c.successCriteria} onChange={(v) => setCard(gi, ci, { successCriteria: v })} rows={2} />
                  </div>
                );
              })}

              <Field id={`${g.id}-hw`} label={d.homework} value={g.homework} onChange={(v) => setGroup(gi, { homework: v })} rows={3} />
            </fieldset>
          );
        })}

        <Field id="notes" label={d.notes} value={edit.teacherNotes} onChange={(v) => setEdit((e) => ({ ...e, teacherNotes: v }))} rows={4} />
      </div>

      {problems.length > 0 && (
        <div role="alert" className="mt-8 rounded-card border border-danger/30 bg-danger-soft p-4">
          <ul className="grid gap-1.5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}

      <div className="sticky bottom-0 -mx-5 mt-8 flex flex-col gap-3 border-t border-line bg-white px-5 py-4 sm:-mx-8 sm:flex-row sm:px-8">
        <button type="button" className="btn btn-primary" disabled={busy} aria-busy={busy} onClick={save}>{busy ? d.saving : d.save}</button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => onClose(null)}>{d.cancel}</button>
      </div>
    </section>
  );
}

function Field({ id, label, value, onChange, rows = 1 }: { id: string; label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <div>
      <label htmlFor={id} className="field-label">{label}</label>
      {rows > 1 ? (
        <textarea id={id} className="field min-h-0 py-2.5 leading-snug" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} className="field" value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}
