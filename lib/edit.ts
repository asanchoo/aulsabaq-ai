import { z } from "zod";
import { findMixedScriptWord, findWrongEquation } from "./arithmetic";
import { ExplanationSchema, type LessonPlan, type TaskCard } from "./schema";
import { hintContainsAnswer } from "./validate";

/**
 * Правка урока учителем. Учитель — последнее слово: ИИ может ошибиться в правиле или формулировке,
 * и учитель должен исправить это сам, а не создавать урок заново.
 *
 * Править можно только тексты: задания, ответы, подсказки, объяснение, цели, домашнее задание, советы.
 * Расписание, классы и количество карточек не меняются: на них держатся правила таймлайна
 * и прогресс учеников, которые уже вошли по коду. Поэтому сервер принимает не весь урок, а только
 * эти поля, и накладывает их на сохранённый урок по id.
 */

const text = (max: number) => z.string().trim().min(1).max(max);

export const CardEditSchema = z.object({
  id: z.string().max(20),
  prompt: text(1000),
  answer: z.string().trim().max(300).optional(),
  hint: text(500),
  successCriteria: text(500),
});

export const LessonEditSchema = z.object({
  teacherNotes: z.string().trim().max(2000),
  groups: z.array(z.object({
    id: z.string().max(10),
    learningGoal: text(500),
    homework: text(1000),
    explanation: ExplanationSchema,
    cards: z.array(CardEditSchema).max(30),
  })).min(1).max(4),
});

export type LessonEdit = z.infer<typeof LessonEditSchema>;
export type CardEdit = z.infer<typeof CardEditSchema>;

/**
 * Ошибки (урок не сохраняем): структура не совпала, у закрытой карточки нет ответа, подсказка называет ответ.
 * Предупреждения (сохраняем и показываем): неверное равенство, смешанные алфавиты. Учитель мог
 * написать пример с ошибкой намеренно, например «найди ошибку: 7 + 5 = 13».
 */
export type EditIssue = { code: "structure" | "closed_answer" | "hint_answer" | "arithmetic" | "typo"; cardId?: string; detail?: string };

export type EditResult = { ok: true; plan: LessonPlan; warnings: EditIssue[] } | { ok: false; issues: EditIssue[] };

/** Текущие тексты урока в форме правки: с них редактор начинает. */
export function toEdit(plan: LessonPlan): LessonEdit {
  return {
    teacherNotes: plan.teacherNotes,
    groups: plan.groups.map((g) => ({
      id: g.id,
      learningGoal: g.learningGoal,
      homework: g.homework,
      explanation: g.explanation,
      cards: g.cards.map((c) => ({ id: c.id, prompt: c.prompt, answer: c.answer ?? "", hint: c.hint, successCriteria: c.successCriteria })),
    })),
  };
}

export function applyEdit(plan: LessonPlan, edit: LessonEdit): EditResult {
  const sameShape = edit.groups.length === plan.groups.length && plan.groups.every((g, i) => {
    const e = edit.groups[i];
    return e.id === g.id && e.cards.length === g.cards.length && g.cards.every((c, k) => e.cards[k].id === c.id);
  });
  if (!sameShape) return { ok: false, issues: [{ code: "structure" }] };

  const issues: EditIssue[] = [];
  const groups = plan.groups.map((g, i) => {
    const e = edit.groups[i];
    const cards = g.cards.map((c, k): TaskCard => {
      const ce = e.cards[k];
      const answer = ce.answer?.trim() || undefined;
      if (c.type === "closed" && !answer) issues.push({ code: "closed_answer", cardId: c.id });
      if (answer && hintContainsAnswer(ce.hint, answer)) issues.push({ code: "hint_answer", cardId: c.id });
      const next: TaskCard = { ...c, prompt: ce.prompt, answer: c.type === "closed" ? answer : answer ?? c.answer, hint: ce.hint, successCriteria: ce.successCriteria };
      // Учитель поменял задание или эталон: короткие ответы модели и «что вписать» могли устареть, проверяем по эталону.
      if (next.prompt !== c.prompt || next.answer !== c.answer) {
        delete next.accept;
        delete next.inputHint;
      }
      return next;
    });
    return { ...g, learningGoal: e.learningGoal, homework: e.homework, explanation: e.explanation, cards };
  });
  if (issues.length) return { ok: false, issues };

  const next: LessonPlan = { ...plan, teacherNotes: edit.teacherNotes, groups };
  return { ok: true, plan: next, warnings: textWarnings(next) };
}

/** Равенства и опечатки во всех текстах, которые мог изменить учитель (раздел ошибок не проверяем). */
export function textWarnings(plan: LessonPlan): EditIssue[] {
  const warnings: EditIssue[] = [];
  for (const g of plan.groups) {
    const e = g.explanation;
    const checked: [string, string | undefined][] = [
      ...[e.hook, e.keyIdea, ...e.steps, e.example.problem, ...e.example.steps, e.example.answer, ...e.checkQuestions].map((t): [string, undefined] => [t, undefined]),
      ...g.cards.flatMap((c): [string, string][] => [[c.prompt, c.id], [c.hint, c.id], [c.successCriteria, c.id]]),
    ];
    for (const [t, cardId] of checked) {
      const wrong = findWrongEquation(t);
      if (wrong) warnings.push({ code: "arithmetic", cardId, detail: wrong });
    }
    for (const t of [g.learningGoal, g.homework, ...e.mistakes, ...checked.map(([t]) => t), ...g.cards.map((c) => c.answer ?? "")]) {
      const word = findMixedScriptWord(t);
      if (word) warnings.push({ code: "typo", detail: word });
    }
  }
  return warnings;
}
