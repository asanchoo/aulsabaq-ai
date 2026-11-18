import { z } from "zod";
import { contentToLesson, GeneratedContentSchema, GeneratedExplanationSchema, requestForModel, type GeneratedCard, type LessonRequest } from "./generation-schema";
import { cardInstructions, explanationInstructions, hintInstructions, lessonInstructions, proofreadInstructions } from "./prompts";
import { applyCorrections, collectTexts, safeCorrections } from "./proofread";
import { ProviderError, resolveProvider, type Provider, type ProviderImage } from "./providers";
import { planSchedule } from "./schedule";
import { checkReviewCards, checkSingleCard, hintRevealsAnswer, maxCardMinutes, minCards, parseExplained, validateLessonPlan } from "./validate";
import { findMixedScriptWord, prettyMathDeep } from "./arithmetic";
import { TaskCardSchema, type Explanation, type LessonCore, type LessonPlan, type TaskCard } from "./schema";

/**
 * Генерация урока: не зависит от того, какая модель отвечает.
 * Провайдер (OpenAI или Gemini) выбирается в lib/providers.ts по env.
 *
 * Кто что делает:
 * - расписание по минутам считает код (lib/schedule.ts): учитель никогда не окажется с двумя классами;
 * - объяснение новой темы модель пишет отдельным запросом на каждый класс, эти запросы идут параллельно;
 * - потом модель пишет содержание для всех классов: цели, карточки, тексты этапов, домашнее задание,
 *   уже зная разобранные примеры (этап учителя идёт по ним, карточки их не повторяют).
 * Каждый ответ проверяется своими правилами и при ошибке повторяется.
 * Когда модель составляла и таймлайн, и всё содержание одним ответом, она путалась в минутах.
 */

export class GenerationError extends Error {
  constructor(public code: "not_configured" | "provider" | "invalid_plan") { super(code); }
}

export function requestMismatch(plan: LessonCore, input: LessonRequest): string[] {
  const errors: string[] = [];
  if (plan.language !== input.language || plan.subject !== input.subject || plan.durationMin !== input.durationMin)
    errors.push("REQUEST: preserve subject, language and durationMin exactly");
  if (plan.groups.length !== input.groups.length || input.groups.some((g, i) =>
    plan.groups[i]?.grade !== g.grade || plan.groups[i]?.topic !== g.topic))
    errors.push("REQUEST: preserve groups, their order, grades and topics exactly");
  return errors;
}

/**
 * fallback: урок, у которого остались только «мягкие» замечания (не хватает карточек по времени).
 * Модель всё равно получит повтор с замечаниями, но если повторы кончатся, лучше выдать учителю такой урок,
 * чем ошибку: всё остальное в нём проверено и верно.
 */
type Checked<T> = { ok: true; plan: T } | { ok: false; errors: string[]; fallback?: T };

/** Нехватка карточек по времени — мягкая ошибка; всё остальное (расписание, ответы, арифметика) жёсткое. */
export const isSoftError = (error: string) => /^(TIME|CARDS|REVIEW):/.test(error);

type Job<T> = {
  /** Короткое имя для логов: plan, explain-g1… */
  name: string;
  instructions: string;
  request: Record<string, unknown>;
  schemaName: string;
  schema: Record<string, unknown>;
  check: (value: unknown) => Checked<T>;
  attempts: number;
  /** Фото страниц учебника для модели. */
  images?: ProviderImage[];
  /** После стольких миллисекунд от начала урока повторную попытку не начинаем. */
  noRetryAfterMs?: number;
};

/**
 * После этого времени новую попытку не начинаем: роут живёт не дольше 300 секунд (maxDuration),
 * а одна попытка может занять до 90 (таймаут в providers.ts). Объяснения идут первыми, поэтому
 * их повторы обрываем раньше: после них ещё должно уложиться содержание урока.
 */
const NO_NEW_ATTEMPT_AFTER_MS = 170_000;
const EXPLANATION_NO_RETRY_AFTER_MS = 100_000;

/** Запрос к модели с проверкой ответа; при ошибке отправляем модели список нарушений и просим исправить. */
async function generateChecked<T>(provider: Provider, job: Job<T>, startedAt: number): Promise<T> {
  let feedback: string[] = [];
  let fallback: { plan: T; errors: number } | null = null;
  for (let attempt = 0; attempt < job.attempts; attempt++) {
    if (attempt > 0 && Date.now() - startedAt > (job.noRetryAfterMs ?? NO_NEW_ATTEMPT_AFTER_MS)) break;
    let text: string | null;
    try {
      text = await provider.call({
        instructions: job.instructions,
        input: JSON.stringify({ ...job.request, validationErrors: feedback }),
        schemaName: job.schemaName,
        schema: job.schema,
        images: job.images,
      });
    } catch (error) {
      if (error instanceof ProviderError) {
        if (fallback) break; // модель перегружена, но почти готовый урок уже есть
        throw new GenerationError("provider");
      }
      throw error;
    }
    try {
      if (text === null) throw new Error("incomplete");
      const result = job.check(JSON.parse(text));
      if (result.ok) return result.plan;
      feedback = result.errors;
      if (result.fallback && (!fallback || result.errors.length < fallback.errors)) fallback = { plan: result.fallback, errors: result.errors.length };
    } catch { feedback = ["Return a complete JSON object matching the required schema."]; }
    // Коды проверок (INV-1, TXT…) без текста урока. Целиком: ошибки времени и карточек (номера и минуты),
    // и неверные равенства (EXP, INV-9) — только сама формула, чтобы находить ложные срабатывания проверки.
    const logged = feedback.map((e) => {
      if (/^(TIME|CARDS|SCHEMA):/.test(e)) return e.slice(0, 200);
      const formula = /^(EXP|INV-9):/.test(e) ? e.match(/«([^»]{1,80})»|: (\S[^;]{0,80});/) : null;
      return formula ? `${e.split(":")[0]} ${formula[1] ?? formula[2]}` : e.split(":")[0];
    });
    console.warn(`[ai] ${provider.name} ${job.name}: attempt ${attempt + 1} rejected: ${logged.join(" | ")}`);
  }
  if (fallback) {
    console.warn(`[ai] ${provider.name} ${job.name}: accepted with ${fallback.errors} soft issue(s)`);
    return fallback.plan;
  }
  throw new GenerationError("invalid_plan");
}

const contentSchema = () => z.toJSONSchema(GeneratedContentSchema, { target: "draft-7" }) as Record<string, unknown>;
const explanationSchema = () => z.toJSONSchema(GeneratedExplanationSchema, { target: "draft-7" }) as Record<string, unknown>;

/** Фото страниц учебника с подписями, чтобы модель знала, к какому классу какое фото. */
function photosOf(input: LessonRequest, only?: number): ProviderImage[] {
  return input.groups.flatMap((g, i) => (only !== undefined && only !== i ? [] : (g.photos ?? []).map((p, k) => ({
    label: `Фото учебника: группа ${i + 1} (${g.grade} класс), фото ${k + 1}${g.pages ? `, страницы ${g.pages}` : ""}`,
    mimeType: p.mimeType,
    data: p.data,
  }))));
}

type Explained = { explanation: Explanation; reviewCards: GeneratedCard[] };

/**
 * Что запрос содержания знает об объяснении: на этом держится целостность урока. Карточки практики идут по той же
 * лестнице, что и примеры; последняя карточка и домашнее задание продолжают ситуацию из hook; проверка учителя
 * ищет ошибки из mistakes; общий итог урока собирается из summary классов.
 */
function explanationBrief(e: Explanation, reviewCards: GeneratedCard[], group: number) {
  return {
    group,
    hook: e.hook,
    keyIdea: e.keyIdea,
    steps: e.steps,
    examples: [e.example, ...e.examples].map((x) => ({ level: x.level, problem: x.problem, answer: x.answer })),
    practiceOnSlides: e.practice.map((p) => p.task),
    mistakes: e.mistakes,
    summary: e.summary,
    terms: e.terms.map((t) => t.term),
    prerequisites: e.prerequisites,
    reviewCards: reviewCards.map((c) => c.prompt),
  };
}

function planJob(input: LessonRequest, explained: Explained[]): Job<LessonCore> {
  const schedule = planSchedule(input.groups.length, input.durationMin);
  const reviewCards = explained.map((x, i) => (schedule.cards[i].reviewMinutes > 0 ? x.reviewCards : []));
  return {
    name: "plan",
    instructions: lessonInstructions(input.language),
    request: {
      request: requestForModel(input),
      // Сколько минут каждый класс работает сам: карточек должно хватить на это время, с запасом.
      cardPlan: schedule.cards.map((c, i) => {
        const grade = input.groups[i].grade;
        const need = minCards(grade, c.reviewMinutes, c.practiceMinutes);
        return {
          group: i + 1, grade, practiceMinutes: c.practiceMinutes, minPracticeCards: need.practice,
          maxMinutesPerCard: maxCardMinutes(grade),
        };
      }),
      explanations: explained.map((x, i) => explanationBrief(x.explanation, reviewCards[i], i + 1)),
    },
    images: photosOf(input),
    schemaName: "lesson_content",
    schema: contentSchema(),
    check: (value) => {
      const content = GeneratedContentSchema.safeParse(prettyMathDeep(value));
      if (!content.success) return { ok: false, errors: content.error.issues.map((i) => `SCHEMA: ${i.path.join(".")}: ${i.message}`) };
      const built = contentToLesson(content.data, schedule, reviewCards);
      if (!built.ok) return built;
      // Таймлайн верен по построению, но правила всё равно проверяем: подсказки, ответы, арифметика, время.
      const valid = validateLessonPlan(built.plan);
      const errors = [...built.warnings, ...(valid.ok ? [] : valid.errors), ...requestMismatch(built.plan, input)];
      if (errors.length === 0) return { ok: true, plan: built.plan };
      return { ok: false, errors, ...(errors.every(isSoftError) ? { fallback: built.plan } : {}) };
    },
    attempts: 3,
  };
}

function explanationJob(input: LessonRequest, index: number): Job<Explained> {
  const group = input.groups[index];
  const { explainMinutes, reviewMinutes } = planSchedule(input.groups.length, input.durationMin).cards[index];
  const minReviewCards = minCards(group.grade, reviewMinutes, 0).review;
  return {
    name: `explain-g${index + 1}`,
    instructions: explanationInstructions(input.language),
    request: {
      subject: input.subject, language: input.language, grade: group.grade, topic: group.topic,
      notes: group.notes ?? null, pages: group.pages ?? null, textbookPhotos: group.photos?.length ?? 0,
      explainMinutes,
      // Сколько минут класс сам повторяет до объяснения и сколько карточек повторения нужно (0 — не нужно).
      reviewMinutes, minReviewCards, maxMinutesPerCard: maxCardMinutes(group.grade),
    },
    schemaName: "topic_explanation",
    schema: explanationSchema(),
    check: (value) => {
      const parsed = parseExplained(value);
      if (!parsed.ok) return parsed;
      const plan = { explanation: parsed.plan.explanation, reviewCards: reviewMinutes > 0 ? parsed.plan.reviewCards : [] };
      const { hard, soft } = checkReviewCards(plan.reviewCards, plan.explanation, group.grade, reviewMinutes);
      if (!hard.length && !soft.length) return { ok: true, plan };
      return { ok: false, errors: [...hard, ...soft], ...(hard.length ? {} : { fallback: plan }) };
    },
    attempts: 3,
    images: photosOf(input, index),
    noRetryAfterMs: EXPLANATION_NO_RETRY_AFTER_MS,
  };
}

export async function generateLesson(input: LessonRequest): Promise<LessonPlan> {
  const provider = resolveProvider();
  if (!provider) throw new GenerationError("not_configured");
  const startedAt = Date.now();
  // Сначала объяснения всех классов (параллельно), потом содержание урока, которое на них опирается.
  const explained = await Promise.all(input.groups.map((_, i) => generateChecked(provider, explanationJob(input, i), startedAt)));
  const explanations = explained.map((x) => x.explanation);
  const core = await generateChecked(provider, planJob(input, explained), startedAt);
  const lesson: LessonPlan = {
    ...core,
    groups: core.groups.map((g, i) => {
      const asked = input.groups[i];
      const source = asked.pages || asked.photos?.length ? { pages: asked.pages || null, photos: asked.photos?.length ?? 0 } : null;
      return {
        id: g.id, grade: g.grade, topic: g.topic, learningGoal: g.learningGoal,
        explanation: explanations[i], cards: g.cards, homework: g.homework, source,
      };
    }),
  };
  return proofreadLesson(provider, lesson, startedAt);
}

// ---------------------------------------------------------------------------
// Корректура: опечатки облегчённой модели («Дптер», «қурғақ»)

const ProofSchema = z.object({ corrections: z.array(z.object({ wrong: z.string(), right: z.string() })) });
const PROOF_TIMEOUT_MS = 25_000;
/** Если урок собирался долго, корректуру пропускаем: роут живёт не дольше 300 секунд. */
const PROOF_BUDGET_MS = 230_000;

/**
 * Модель ищет опечатки, код применяет только безопасные исправления (lib/proofread.ts) и откатывает их,
 * если после замен урок перестал проходить проверки. Любой сбой корректора — урок без корректуры, а не ошибка.
 */
async function proofreadLesson(provider: Provider, plan: LessonPlan, startedAt: number): Promise<LessonPlan> {
  if (Date.now() - startedAt > PROOF_BUDGET_MS) return plan;
  const texts = collectTexts(plan);
  try {
    const text = await withTimeout(provider.call({
      instructions: proofreadInstructions(plan.language),
      input: JSON.stringify({ texts }),
      schemaName: "proofreading",
      schema: z.toJSONSchema(ProofSchema, { target: "draft-7" }) as Record<string, unknown>,
    }), PROOF_TIMEOUT_MS);
    const parsed = text ? ProofSchema.safeParse(JSON.parse(text)) : null;
    if (!parsed?.success) return plan;
    const corrections = safeCorrections(parsed.data.corrections, texts);
    if (corrections.length === 0) return plan;
    const fixed = applyCorrections(plan, corrections);
    const errorsOf = (p: LessonPlan) => { const r = validateLessonPlan(p); return r.ok ? [] : r.errors; };
    const before = new Set(errorsOf(plan));
    if (errorsOf(fixed).some((e) => !before.has(e))) {
      console.warn(`[ai] ${provider.name} proofread: rolled back, corrections broke a check`);
      return plan;
    }
    console.warn(`[ai] ${provider.name} proofread: ${corrections.length} correction(s)`);
    return fixed;
  } catch {
    return plan;
  }
}

// ---------------------------------------------------------------------------
// Подсказка ученику во время урока

const HintSchema = z.object({ hint: z.string().min(1).max(400) });
/** Ученик ждёт подсказку с телефона: дольше 20 секунд не ждём, отдаём запасную. */
const HINT_TIMEOUT_MS = 20_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new ProviderError(true)), ms))]);
}

export type HintRequest = {
  language: LessonPlan["language"];
  subject: string;
  grade: number;
  topic: string;
  card: TaskCard;
  studentAnswer?: string;
  previousHints: string[];
};

/**
 * Подсказка от модели или null, если модель недоступна или дважды написала подсказку с ответом.
 * Guard: hintRevealsAnswer отбрасывает подсказку, где есть ответ или число из ответа, которого нет в условии.
 */
export async function generateHint(req: HintRequest): Promise<string | null> {
  const provider = resolveProvider();
  if (!provider) return null;
  const schema = z.toJSONSchema(HintSchema, { target: "draft-7" }) as Record<string, unknown>;
  let rejected: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await withTimeout(provider.call({
        instructions: hintInstructions(req.language),
        input: JSON.stringify({
          subject: req.subject, grade: req.grade, topic: req.topic,
          task: req.card.prompt, successCriteria: req.card.successCriteria, correctAnswer: req.card.answer ?? null,
          studentAnswer: req.studentAnswer ?? null, previousHints: req.previousHints, hintNumber: req.previousHints.length + 1,
          rejectedBecauseTheyRevealTheAnswer: rejected,
        }),
        schemaName: "student_hint",
        schema,
      }), HINT_TIMEOUT_MS);
      const parsed = text ? HintSchema.safeParse(JSON.parse(text)) : null;
      if (!parsed?.success) continue;
      const hint = parsed.data.hint.trim();
      if (hintRevealsAnswer(hint, req.card.answer ?? "", req.card.prompt) || findMixedScriptWord(hint)) {
        console.warn(`[ai] ${provider.name} hint: attempt ${attempt + 1} rejected by guard`);
        rejected = [...rejected, hint];
        continue;
      }
      return hint;
    } catch (error) {
      if (error instanceof ProviderError) return null;
      if (!(error instanceof SyntaxError)) throw error;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Замена одной карточки по просьбе учителя

const NewCardSchema = TaskCardSchema.omit({ id: true }).extend({ answer: z.string().nullable(), minutes: z.number().min(0.5).max(20) });

export async function regenerateCard(plan: LessonPlan, groupId: string, cardId: string, wish: string | undefined): Promise<TaskCard> {
  const provider = resolveProvider();
  if (!provider) throw new GenerationError("not_configured");
  const group = plan.groups.find((g) => g.id === groupId);
  const old = group?.cards.find((c) => c.id === cardId);
  if (!group || !old) throw new GenerationError("invalid_plan");
  const job: Job<TaskCard> = {
    name: `card-${cardId}`,
    instructions: cardInstructions(plan.language),
    request: {
      subject: plan.subject, language: plan.language, grade: group.grade, topic: group.topic,
      purpose: old.purpose, type: old.type, difficulty: old.difficulty, minutes: old.minutes ?? null,
      currentCard: { prompt: old.prompt, answer: old.answer ?? null },
      otherCards: group.cards.filter((c) => c.id !== cardId).map((c) => c.prompt),
      example: group.explanation.example.problem,
      wish: wish ?? null,
    },
    schemaName: "task_card",
    schema: z.toJSONSchema(NewCardSchema, { target: "draft-7" }) as Record<string, unknown>,
    check: (value) => {
      const parsed = NewCardSchema.safeParse(prettyMathDeep(value));
      if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `SCHEMA: ${i.path.join(".")}: ${i.message}`) };
      const card: TaskCard = { ...parsed.data, id: cardId, answer: parsed.data.answer ?? undefined };
      const errors = checkSingleCard(card);
      if (card.type !== old.type || card.purpose !== old.purpose) errors.push(`REQUEST: keep type "${old.type}" and purpose "${old.purpose}"`);
      if (card.prompt.trim() === old.prompt.trim()) errors.push("REQUEST: write a different task, not the current one");
      return errors.length ? { ok: false, errors } : { ok: true, plan: card };
    },
    attempts: 3,
  };
  return generateChecked(provider, job, Date.now());
}
