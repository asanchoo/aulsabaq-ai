import { curriculumGoals, resolveCurriculumGoal } from "./curriculum";
import { z } from "zod";
import {
  cardFromModel, contentToLesson, GeneratedCardSchema, GeneratedContentSchema, GeneratedExplanationSchema, requestForModel,
  requestLanguage, requestLanguages, type GeneratedCard, type LessonRequest,
} from "./generation-schema";
import { cardInstructions, explanationInstructions, extraInstructions, hintInstructions, lessonInstructions, proofreadInstructions, rulesInstructions, verifyInstructions } from "./prompts";
import { checkCardAnswer } from "./check-answer";
import { TrainerSkillSchema, type TrainerSkill } from "./trainer";
import { initialProgress, type LessonProgress } from "./progress";
import { applyRulesReview, introducesSuspects, isLanguageSubject, rulesRequest, RulesReviewSchema, type RulesReview } from "./rules";
import { applyCorrections, collectTexts, safeCorrections } from "./proofread";
import { ProviderError, resolveFastProvider, resolveProvider, type Provider, type ProviderImage } from "./providers";
import { planSchedule } from "./schedule";
import { sanitizeCurriculumGoals, checkExplanation, checkReviewCards, checkSingleCard, hintRevealsAnswer, maxCardMinutes, minCards, parseExplained, validateLessonPlan } from "./validate";
import { findMixedScriptWord, prettyMathDeep } from "./arithmetic";
import { groupLanguage, TaskCardSchema, type Explanation, type LessonCore, type LessonPlan, type TaskCard } from "./schema";

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
  /** Проверка отклонила ответ, модель пишет заново: для хода сборки на экране учителя. */
  onRejected?: () => void;
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
      job.onRejected?.();
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

/** Both content requests share the same trusted objectives, selected before the model writes anything. */
function goalsFor(input: LessonRequest, index: number) {
  return curriculumGoals({ subject: input.subject, ...input.groups[index], language: requestLanguage(input, index) });
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
    instructions: lessonInstructions(input.language, requestLanguages(input)),
    request: {
      request: { ...requestForModel(input), groups: requestForModel(input).groups.map((g, i) => ({ ...g, curriculumGoals: goalsFor(input, i) })) },
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
    instructions: explanationInstructions(requestLanguage(input, index)),
    request: {
      subject: input.subject, language: requestLanguage(input, index), grade: group.grade, topic: group.topic,
      curriculumGoals: goalsFor(input, index),
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

// ---------------------------------------------------------------------------
// Запас заданий для быстрых (отдельный запрос на класс, параллельно с содержанием урока)

const ExtraSchema = z.object({ cards: z.array(GeneratedCardSchema).max(25), trainer: TrainerSkillSchema.nullable() });
export const EXTRA_COUNT = 15;
const EXTRA_TIMEOUT_MS = 90_000;
type Bank = { cards: TaskCard[]; trainer?: TrainerSkill };

/** Нормализованный текст задания: так ловим запас, который повторяет основную карточку. */
const sameTask = (a: string) => a.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * Запас не обязателен: если модель не ответила или ответила плохо, урок выдаётся без запаса, а не с ошибкой.
 * Каждое задание проходит те же проверки, что и карточка (ответ, подсказка без ответа, счёт); неверное выбрасываем.
 */
async function extraBank(provider: Provider, input: LessonRequest, index: number, explanation: Explanation): Promise<Bank> {
  const group = input.groups[index];
  try {
    const text = await withTimeout(provider.call({
      instructions: extraInstructions(requestLanguage(input, index)),
      input: JSON.stringify({
        subject: input.subject, language: requestLanguage(input, index), grade: group.grade, topic: group.topic, count: EXTRA_COUNT,
        curriculumGoals: goalsFor(input, index),
        keyIdea: explanation.keyIdea,
        examples: [explanation.example, ...explanation.examples].map((x) => x.problem),
        practiceOnSlides: explanation.practice.map((p) => p.task),
      }),
      schemaName: "extra_cards",
      schema: z.toJSONSchema(ExtraSchema, { target: "draft-7" }) as Record<string, unknown>,
    }), EXTRA_TIMEOUT_MS);
    const parsed = text ? ExtraSchema.safeParse(prettyMathDeep(JSON.parse(text))) : null;
    if (!parsed?.success) return { cards: [] };
    const cards = parsed.data.cards
      .map((c, k): TaskCard => ({ ...cardFromModel(c), id: `g${index + 1}-x${k + 1}`, purpose: "practice" }))
      .filter((c) => checkSingleCard(c).length === 0);
    return { cards, ...(parsed.data.trainer ? { trainer: parsed.data.trainer } : {}) };
  } catch {
    return { cards: [] };
  }
}

/**
 * onProgress: что уже готово (lib/progress.ts). Сервер пишет это в базу, и учитель видит настоящий ход сборки:
 * какие объяснения готовы, сколько карточек, какая проверка идёт, сколько раз ИИ переписывал найденную ошибку.
 */
export async function generateLesson(input: LessonRequest, onProgress?: (progress: LessonProgress) => void): Promise<LessonPlan> {
  const provider = resolveProvider();
  if (!provider) throw new GenerationError("not_configured");
  const startedAt = Date.now();
  const progress = initialProgress(input.groups.length);
  const emit = (change: Partial<LessonProgress> = {}) => {
    Object.assign(progress, change);
    onProgress?.({ ...progress });
  };
  const onRejected = () => emit({ repairs: progress.repairs + 1 });
  // Сначала объяснения всех классов (параллельно), потом содержание урока, которое на них опирается.
  const explained = await Promise.all(input.groups.map((_, i) =>
    generateChecked(provider, { ...explanationJob(input, i), onRejected }, startedAt).then((x) => {
      emit({ explained: progress.explained + 1 });
      return x;
    })));
  const explanations = explained.map((x) => x.explanation);
  emit({ stage: "content" });
  // Содержание урока и запас для каждого класса идут одновременно: запас не удлиняет ожидание.
  const [core, banks] = await Promise.all([
    generateChecked(provider, { ...planJob(input, explained), onRejected }, startedAt).then((x) => {
      emit({ cards: x.groups.reduce((n, g) => n + g.cards.length, 0) });
      return x;
    }),
    Promise.all(input.groups.map((_, i) => extraBank(provider, input, i, explanations[i]))).then((x) => {
      emit({ extra: x.reduce((n, b) => n + b.cards.length, 0) });
      return x;
    }),
  ]);
  // Язык у класса храним, только когда языки в уроке разные: у обычного урока он совпадает с языком урока.
  const mixed = requestLanguages(input).length > 1;
  const lesson: LessonPlan = {
    ...core,
    groups: core.groups.map((g, i) => {
      const asked = input.groups[i];
      const source = asked.pages || asked.photos?.length ? { pages: asked.pages || null, photos: asked.photos?.length ?? 0 } : null;
      return {
        id: g.id, grade: g.grade, topic: g.topic, learningGoal: g.learningGoal,
        quarter: asked.quarter, curriculumGoals: goalsFor(input, i),
        explanation: explanations[i], cards: g.cards, homework: g.homework, source,
        ...(mixed ? { language: requestLanguage(input, i) } : {}),
        ...bankFor(banks[i], g.cards),
      };
    }),
  };
  // Проверки делает быстрая модель (OPENAI_FAST_MODEL), если она задана: так они успевают и после медленной основной.
  const checker = resolveFastProvider() ?? provider;
  const language = isLanguageSubject(input.subject);
  emit({ stage: "check", check: language ? "rules" : "verify" });
  const reviewed = language ? await reviewRules(checker, lesson, startedAt) : await verifyAnswers(checker, lesson, startedAt);
  emit({ stage: "proof", extra: reviewed.groups.reduce((n, g) => n + (g.extraCards?.length ?? 0), 0) });
  return sanitizeCurriculumGoals(await proofreadLesson(checker, reviewed, startedAt), resolveCurriculumGoal);
}

// ---------------------------------------------------------------------------
// Проверка решением: модель сама решает трудные задания, не видя ответа (не для языков, там рецензент правил)

const SolvedSchema = z.object({ answers: z.array(z.object({ id: z.string(), answer: z.string().nullable() })) });
const VERIFY_TIMEOUT_MS = 70_000;
const VERIFY_BUDGET_MS = 210_000;

/** Что решаем заново: трудные закрытые основные карточки и задания запаса средней и высокой сложности. */
export function cardsToVerify(group: LessonPlan["groups"][number]): TaskCard[] {
  return [
    ...group.cards.filter((c) => c.type === "closed" && c.difficulty === 3),
    ...(group.extraCards ?? []).filter((c) => c.type === "closed" && c.difficulty >= 2),
  ].filter((c) => c.answer);
}

/**
 * Код пересчитывает равенства, но не задачи вроде «найди все p, при которых уравнение имеет два корня»: в серии
 * 19 ноября модель дала там неверный ответ. Отдельный запрос решает такие задания сам, ответа не видя. Если его
 * ответ не совпал с эталоном (или задача без единственного ответа), задание запаса выбрасываем, а основную
 * карточку делаем открытой: ученик отмечает «Готово», сайт не скажет «неверно» на верный ответ.
 */
export async function verifyAnswers(provider: Provider, plan: LessonPlan, startedAt: number): Promise<LessonPlan> {
  if (Date.now() - startedAt > VERIFY_BUDGET_MS) return plan;
  const schema = z.toJSONSchema(SolvedSchema, { target: "draft-7" }) as Record<string, unknown>;
  const groups = await Promise.all(plan.groups.map(async (g) => {
    const todo = cardsToVerify(g);
    if (!todo.length) return g;
    let solved: Map<string, string | null>;
    try {
      const text = await withTimeout(provider.call({
        instructions: verifyInstructions(groupLanguage(plan, g)),
        input: JSON.stringify({ subject: plan.subject, grade: g.grade, topic: g.topic, tasks: todo.map((c) => ({ id: c.id, task: c.prompt, format: c.inputHint ?? null })) }),
        schemaName: "solved_tasks",
        schema,
        reasoning: "medium",
      }), VERIFY_TIMEOUT_MS);
      const parsed = text ? SolvedSchema.safeParse(JSON.parse(text)) : null;
      if (!parsed?.success) return g;
      solved = new Map(parsed.data.answers.map((a) => [a.id, a.answer]));
    } catch {
      return g;
    }
    // Нет ответа для задания в ответе проверяющего — не наказываем задание.
    const disagrees = (c: TaskCard) => solved.has(c.id) && !(solved.get(c.id) && checkCardAnswer(solved.get(c.id)!, c));
    const cards = g.cards.map((c): TaskCard => (todo.includes(c) && disagrees(c) ? { ...c, type: "open", accept: undefined, inputHint: undefined } : c));
    const extraCards = g.extraCards?.filter((c) => !(todo.includes(c) && disagrees(c)));
    const opened = cards.filter((c, i) => c !== g.cards[i]).length;
    const dropped = (g.extraCards?.length ?? 0) - (extraCards?.length ?? 0);
    console.warn(`[ai] ${provider.name} verify-${g.id}: checked ${todo.length}, opened ${opened}, dropped ${dropped}`);
    return { ...g, cards, ...(extraCards ? { extraCards } : {}) };
  }));
  return { ...plan, groups };
}

/** Запас без повторов основных карточек; пустой запас и тренажёр не храним. */
function bankFor(bank: Bank, main: TaskCard[]): Pick<LessonPlan["groups"][number], "extraCards" | "trainer"> {
  const taken = new Set(main.map((c) => sameTask(c.prompt)));
  const extraCards = bank.cards.filter((c) => !taken.has(sameTask(c.prompt)));
  return { ...(extraCards.length ? { extraCards } : {}), ...(bank.trainer ? { trainer: bank.trainer } : {}) };
}

// ---------------------------------------------------------------------------
// Правила языка: второй взгляд на урок по русскому или казахскому (lib/rules.ts)

const RULES_TIMEOUT_MS = 75_000;
/** Если урок собирался долго, проверку правил пропускаем: после неё ещё корректура, а роут живёт 300 секунд. */
const RULES_BUDGET_MS = 205_000;

/** Карточка от рецензента → карточка урока, или null, если она не проходит прежние проверки. */
function reviewedCard(fix: RulesReview["cards"][number], old: TaskCard): TaskCard | null {
  const card: TaskCard = {
    ...cardFromModel({
      type: old.type, prompt: fix.prompt, answer: fix.answer, accept: fix.accept, inputHint: fix.inputHint, hint: fix.hint,
      successCriteria: old.successCriteria, difficulty: old.difficulty, minutes: old.minutes ?? 1,
    }),
    id: old.id, purpose: old.purpose, minutes: old.minutes,
  };
  if (old.type === "closed" && !card.answer) return null;
  const text = (c: TaskCard) => [c.prompt, c.answer ?? "", c.hint].join("\n");
  if (introducesSuspects(text(old), text(card))) return null;
  return checkSingleCard(card).length ? null : card;
}

/**
 * Каждый класс проверяет отдельный запрос (параллельно), с размышлением medium. Исправление класса применяем,
 * только если после него не появилось ни одной новой ошибки проверок; иначе этот класс остаётся как был.
 * Любой сбой рецензента — урок без этой проверки, а не ошибка учителю.
 */
export async function reviewRules(provider: Provider, plan: LessonPlan, startedAt: number): Promise<LessonPlan> {
  if (Date.now() - startedAt > RULES_BUDGET_MS) {
    console.warn(`[ai] ${provider.name} rules: skipped, lesson took too long`);
    return plan;
  }
  const schema = z.toJSONSchema(RulesReviewSchema, { target: "draft-7" }) as Record<string, unknown>;
  const reviews = await Promise.all(plan.groups.map(async (_, i) => {
    try {
      const text = await withTimeout(provider.call({
        instructions: rulesInstructions(groupLanguage(plan, plan.groups[i])),
        input: JSON.stringify(rulesRequest(plan, i)),
        schemaName: "rules_review",
        schema,
        reasoning: "medium",
      }), RULES_TIMEOUT_MS);
      const parsed = text ? RulesReviewSchema.safeParse(prettyMathDeep(JSON.parse(text))) : null;
      return parsed?.success ? parsed.data : null;
    } catch {
      return null;
    }
  }));
  const errorsOf = (p: LessonPlan) => { const r = validateLessonPlan(p); return r.ok ? [] : r.errors; };
  let next = plan;
  reviews.forEach((review, i) => {
    if (!review) return console.warn(`[ai] ${provider.name} rules-g${i + 1}: no answer`);
    const before = next.groups[i];
    const { group, fixed } = applyRulesReview(before, review, reviewedCard);
    // Пример или «Попробуй сам» с новой ошибкой счёта или опечаткой: объяснение оставляем прежним, карточки берём.
    const oldExp = new Set(checkExplanation(before.explanation));
    const expBroken = checkExplanation(group.explanation).some((e) => !oldExp.has(e));
    const candidate = { ...next, groups: next.groups.map((g, k) => (k === i ? { ...group, explanation: expBroken ? before.explanation : group.explanation } : g)) };
    const oldPlan = new Set(errorsOf(next));
    if (errorsOf(candidate).some((e) => !oldPlan.has(e))) return console.warn(`[ai] ${provider.name} rules-g${i + 1}: rolled back, fixes broke a check`);
    next = candidate;
    const exp = expBroken ? "explanation rolled back" : `examples ${fixed.examples}, practice ${fixed.practice}, mistakes ${fixed.mistakes}${fixed.keyIdea ? ", keyIdea" : ""}`;
    console.warn(`[ai] ${provider.name} rules-g${i + 1}: found ${review.cards.length + review.examples.length + review.practice.length + review.mistakes.length}, fixed cards ${fixed.cards}, ${exp}`);
  });
  return next;
}

// ---------------------------------------------------------------------------
// Корректура: опечатки облегчённой модели («Дптер», «қурғақ»)

const ProofSchema = z.object({ corrections: z.array(z.object({ wrong: z.string(), right: z.string() })) });
const PROOF_TIMEOUT_MS = 25_000;
/** Если урок собирался долго, корректуру пропускаем: роут живёт не дольше 300 секунд. */
const PROOF_BUDGET_MS = 250_000;

/**
 * Модель ищет опечатки, код применяет только безопасные исправления (lib/proofread.ts) и откатывает их,
 * если после замен урок перестал проходить проверки. Любой сбой корректора — урок без корректуры, а не ошибка.
 */
async function proofreadLesson(provider: Provider, plan: LessonPlan, startedAt: number): Promise<LessonPlan> {
  if (Date.now() - startedAt > PROOF_BUDGET_MS) return plan;
  const texts = collectTexts(plan);
  try {
    const text = await withTimeout(provider.call({
      instructions: proofreadInstructions([...new Set(plan.groups.map((g) => groupLanguage(plan, g)))]),
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
  // Ученик ждёт подсказку с телефона: её пишет быстрая модель, если она задана.
  const provider = resolveFastProvider();
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
          acceptedAnswers: req.card.accept ?? [],
          studentAnswer: req.studentAnswer ?? null, previousHints: req.previousHints, hintNumber: req.previousHints.length + 1,
          rejectedBecauseTheyRevealTheAnswer: rejected,
        }),
        schemaName: "student_hint",
        schema,
      }), HINT_TIMEOUT_MS);
      const parsed = text ? HintSchema.safeParse(JSON.parse(text)) : null;
      if (!parsed?.success) continue;
      const hint = parsed.data.hint.trim();
      const secrets = [req.card.answer ?? "", ...(req.card.accept ?? [])];
      if (secrets.some((a) => hintRevealsAnswer(hint, a, req.card.prompt)) || findMixedScriptWord(hint)) {
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

const NewCardSchema = GeneratedCardSchema.extend({ purpose: TaskCardSchema.shape.purpose });

export async function regenerateCard(plan: LessonPlan, groupId: string, cardId: string, wish: string | undefined): Promise<TaskCard> {
  const provider = resolveProvider();
  if (!provider) throw new GenerationError("not_configured");
  const group = plan.groups.find((g) => g.id === groupId);
  const old = group?.cards.find((c) => c.id === cardId);
  if (!group || !old) throw new GenerationError("invalid_plan");
  const job: Job<TaskCard> = {
    name: `card-${cardId}`,
    instructions: cardInstructions(groupLanguage(plan, group)),
    request: {
      subject: plan.subject, language: groupLanguage(plan, group), grade: group.grade, topic: group.topic,
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
      const card: TaskCard = { ...cardFromModel(parsed.data), purpose: parsed.data.purpose, id: cardId };
      const errors = checkSingleCard(card);
      if (card.type !== old.type || card.purpose !== old.purpose) errors.push(`REQUEST: keep type "${old.type}" and purpose "${old.purpose}"`);
      if (card.prompt.trim() === old.prompt.trim()) errors.push("REQUEST: write a different task, not the current one");
      return errors.length ? { ok: false, errors } : { ok: true, plan: card };
    },
    attempts: 3,
  };
  return generateChecked(provider, job, Date.now());
}
