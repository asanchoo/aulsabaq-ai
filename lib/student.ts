import { z } from "zod";
import { checkAnswer, checkCardAnswer, expectsNumber } from "./check-answer";
import { TRAINER_KEY, TRAINER_TRIES, type TrainerState, type TrainerTask } from "./trainer";
import type { Group, LessonPlan, TaskCard } from "./schema";

/**
 * Режим ученика: прогресс по карточкам и правила, что ученику можно сделать.
 * Чистые функции без сети: роут сначала читает сессию, потом спрашивает здесь,
 * что изменится, и сохраняет результат. Так правила проверяются тестами.
 */

export const MAX_HINTS = 3;
/** После стольких неверных попыток ученик может сверить ответ с эталоном сам. */
export const REVEAL_AFTER = 2;
export const NAME_MAX = 40;

export const CardStateSchema = z.object({
  /**
   * todo — ещё решает; correct — ответ совпал; done — открытое задание выполнено;
   * self_correct / self_wrong — сверил с эталоном сам и сказал, совпало или нет.
   */
  status: z.enum(["todo", "correct", "done", "self_correct", "self_wrong"]).catch("todo"),
  attempts: z.number().int().min(0).catch(0),
  hints: z.number().int().min(0).max(MAX_HINTS).catch(0),
  hintTexts: z.array(z.string()).catch([]),
  lastAnswer: z.string().max(200).optional().catch(undefined),
  revealed: z.boolean().catch(false),
});
export type CardState = z.infer<typeof CardStateSchema>;
export type CardStatus = CardState["status"];

export const emptyState = (): CardState => ({ status: "todo", attempts: 0, hints: 0, hintTexts: [], revealed: false });

/** Прогресс из базы: битые или незнакомые поля превращаются в «ещё не начинал», а не в ошибку. */
export function readProgress(raw: unknown): Record<string, CardState> {
  const out: Record<string, CardState> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, value] of Object.entries(raw)) {
    if (id === TRAINER_KEY) continue; // тренажёр хранит свой счёт, это не карточка
    const parsed = CardStateSchema.safeParse(value ?? {});
    out[id] = parsed.success ? parsed.data : emptyState();
  }
  return out;
}

export const isFinished = (state: CardState | undefined) => !!state && state.status !== "todo";

/** Карточка для ученика: без эталона и без подсказки (её выдают по одной, по кнопке). */
export type StudentCard = {
  locked?: boolean;
  id: string;
  number: number;
  type: TaskCard["type"];
  prompt: string;
  successCriteria: string;
  difficulty: TaskCard["difficulty"];
  purpose: TaskCard["purpose"];
  state: CardState;
  /** Как записать ответ («Впиши пропущенную букву»). */
  inputHint?: string;
  /** Ответ из одного числа: открыть цифровую клавиатуру. */
  numeric?: boolean;
  /** Эталон виден только после «Сверить с ответом». */
  answer?: string;
};

export function studentCards(group: Group, progress: Record<string, CardState>, list: TaskCard[] = group.cards): StudentCard[] {
  return list.map((card, i) => {
    const state = progress[card.id] ?? emptyState();
    return {
      id: card.id,
      number: i + 1,
      type: card.type,
      prompt: card.prompt,
      successCriteria: card.successCriteria,
      difficulty: card.difficulty,
      purpose: card.purpose,
      state,
      ...(card.inputHint ? { inputHint: card.inputHint } : {}),
      ...(card.type === "closed" && expectsNumber(card) ? { numeric: true } : {}),
      ...(state.revealed && card.answer ? { answer: card.answer } : {}),
    };
  });
}

export function findCard(plan: LessonPlan, groupId: string, cardId: string): { group: Group; card: TaskCard } | null {
  const group = plan.groups.find((g) => g.id === groupId);
  // Карточка из основных или из запаса: правила ответа, подсказок и сверки у них одни.
  const card = group?.cards.find((c) => c.id === cardId) ?? group?.extraCards?.find((c) => c.id === cardId);
  return group && card ? { group, card } : null;
}

/** Действия с тренажёром: у них нет карточки, задание составляет код (lib/trainer.ts). */
export const TrainerActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("trainer"), answer: z.string().trim().min(1).max(100) }),
  z.object({ action: z.literal("trainer_skip") }),
]);
export type TrainerAction = z.infer<typeof TrainerActionSchema>;

/**
 * Ответ на задание тренажёра. Верно — следующее задание. Неверно — ещё одна попытка, после второй
 * показываем ответ и даём следующее: застревать на одном примере в тренажёре незачем.
 */
export function applyTrainer(state: TrainerState, task: TrainerTask, action: TrainerAction): { state: TrainerState; correct: boolean; shown?: string } {
  const next = { ...state, index: state.index + 1, attempts: 0 };
  if (action.action === "trainer_skip") return { state: next, correct: false, shown: task.answer };
  if (checkAnswer(action.answer, task.answer)) return { state: { ...next, solved: state.solved + 1 }, correct: true };
  if (state.attempts + 1 >= TRAINER_TRIES) return { state: { ...next, wrong: state.wrong + 1 }, correct: false, shown: task.answer };
  return { state: { ...state, attempts: state.attempts + 1 }, correct: false };
}

export const StudentActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("answer"), cardId: z.string().max(20), answer: z.string().trim().min(1).max(200) }),
  z.object({ action: z.literal("done"), cardId: z.string().max(20) }),
  z.object({ action: z.literal("reveal"), cardId: z.string().max(20) }),
  z.object({ action: z.literal("self"), cardId: z.string().max(20), correct: z.boolean() }),
  z.object({ action: z.literal("open"), cardId: z.string().max(20) }),
  z.object({ action: z.literal("help"), cardId: z.string().max(20), needsHelp: z.boolean() }),
]);
export type StudentAction = z.infer<typeof StudentActionSchema>;

export type ActionResult =
  | { ok: true; state: CardState; correct?: boolean }
  | { ok: false; error: "finished" | "not_closed" | "not_open" | "too_early" | "not_revealed" };

/** Что станет с карточкой после действия ученика. Ничего не сохраняет. */
export function applyAction(card: TaskCard, current: CardState | undefined, action: Exclude<StudentAction, { action: "open" | "help" }>): ActionResult {
  const state = { ...(current ?? emptyState()) };
  switch (action.action) {
    case "answer": {
      if (card.type !== "closed" || !card.answer) return { ok: false, error: "not_closed" };
      if (state.status !== "todo" || state.revealed) return { ok: false, error: "finished" };
      const correct = checkCardAnswer(action.answer, card);
      return {
        ok: true,
        correct,
        state: { ...state, attempts: state.attempts + 1, lastAnswer: action.answer.slice(0, 200), status: correct ? "correct" : "todo" },
      };
    }
    case "done":
      if (card.type !== "open") return { ok: false, error: "not_open" };
      if (state.status !== "todo") return { ok: false, error: "finished" };
      return { ok: true, state: { ...state, status: "done" } };
    case "reveal":
      if (card.type !== "closed" || !card.answer) return { ok: false, error: "not_closed" };
      if (state.status !== "todo") return { ok: false, error: "finished" };
      if (state.attempts < REVEAL_AFTER) return { ok: false, error: "too_early" };
      return { ok: true, state: { ...state, revealed: true } };
    case "self":
      if (state.status !== "todo") return { ok: false, error: "finished" };
      if (!state.revealed) return { ok: false, error: "not_revealed" };
      return { ok: true, state: { ...state, status: action.correct ? "self_correct" : "self_wrong" } };
  }
}

/** Имя ученика: только буквы, цифры, пробел, дефис и точка; без почты и телефонов. */
export function cleanName(raw: string): string | null {
  const name = raw.replace(/[^\p{L}\p{N} .\-]/gu, "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
  return name.length >= 1 ? name : null;
}

/** Сводка для учителя по одной сессии: сколько решено и где ученик застрял. */
export function sessionSummary(group: Group, progress: Record<string, CardState>) {
  const states = group.cards.map((c) => progress[c.id]);
  return {
    finished: states.filter(isFinished).length,
    total: group.cards.length,
    struggled: group.cards.filter((c) => isStruggling(progress[c.id])).map((c) => c.id),
  };
}

/** Ученику было трудно: две неверные попытки, две подсказки или сам признал ошибку. */
export function isStruggling(state: CardState | undefined): boolean {
  if (!state) return false;
  const wrongAttempts = state.status === "correct" ? state.attempts - 1 : state.attempts;
  return state.status === "self_wrong" || wrongAttempts >= REVEAL_AFTER || state.hints >= 2;
}
