import { z } from "zod";
import { contentToLesson, GeneratedContentSchema, type LessonRequest } from "./generation-schema";
import { explanationInstructions, lessonInstructions } from "./prompts";
import { ProviderError, resolveProvider, type Provider } from "./providers";
import { planSchedule } from "./schedule";
import { parseExplanation, validateLessonPlan } from "./validate";
import { ExplanationSchema, type Explanation, type LessonCore, type LessonPlan } from "./schema";

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

type Checked<T> = { ok: true; plan: T } | { ok: false; errors: string[] };

type Job<T> = {
  /** Короткое имя для логов: plan, explain-g1… */
  name: string;
  instructions: string;
  request: Record<string, unknown>;
  schemaName: string;
  schema: Record<string, unknown>;
  check: (value: unknown) => Checked<T>;
  attempts: number;
};

/**
 * После этого времени новую попытку не начинаем: роут живёт не дольше 300 секунд (maxDuration),
 * а одна попытка может занять до 100 (таймаут в providers.ts).
 */
const NO_NEW_ATTEMPT_AFTER_MS = 170_000;

/** Запрос к модели с проверкой ответа; при ошибке отправляем модели список нарушений и просим исправить. */
async function generateChecked<T>(provider: Provider, job: Job<T>, startedAt: number): Promise<T> {
  let feedback: string[] = [];
  for (let attempt = 0; attempt < job.attempts; attempt++) {
    if (attempt > 0 && Date.now() - startedAt > NO_NEW_ATTEMPT_AFTER_MS) break;
    let text: string | null;
    try {
      text = await provider.call({
        instructions: job.instructions,
        input: JSON.stringify({ ...job.request, validationErrors: feedback }),
        schemaName: job.schemaName,
        schema: job.schema,
      });
    } catch (error) {
      if (error instanceof ProviderError) throw new GenerationError("provider");
      throw error;
    }
    try {
      if (text === null) throw new Error("incomplete");
      const result = job.check(JSON.parse(text));
      if (result.ok) return result.plan;
      feedback = result.errors;
    } catch { feedback = ["Return a complete JSON object matching the required schema."]; }
    // Только коды проверок (INV-1, EXP, REQUEST…), без текста урока.
    console.warn(`[ai] ${provider.name} ${job.name}: attempt ${attempt + 1} rejected: ${feedback.map((e) => e.split(":")[0]).join(", ")}`);
  }
  throw new GenerationError("invalid_plan");
}

const contentSchema = () => z.toJSONSchema(GeneratedContentSchema, { target: "draft-7" }) as Record<string, unknown>;
const explanationSchema = () => z.toJSONSchema(ExplanationSchema, { target: "draft-7" }) as Record<string, unknown>;

function planJob(input: LessonRequest, explanations: Explanation[]): Job<LessonCore> {
  const schedule = planSchedule(input.groups.length, input.durationMin);
  return {
    name: "plan",
    instructions: lessonInstructions(input.language),
    request: {
      request: input,
      cardPlan: schedule.cards.map((c, i) => ({ group: i + 1, grade: input.groups[i].grade, review: c.review, practice: c.practice })),
      // Чтобы этап «с учителем» шёл по готовому объяснению, а карточки не повторяли разобранный пример.
      explanations: explanations.map((e, i) => ({ group: i + 1, keyIdea: e.keyIdea, example: e.example.problem, exampleAnswer: e.example.answer })),
    },
    schemaName: "lesson_content",
    schema: contentSchema(),
    check: (value) => {
      const content = GeneratedContentSchema.safeParse(value);
      if (!content.success) return { ok: false, errors: content.error.issues.map((i) => `SCHEMA: ${i.path.join(".")}: ${i.message}`) };
      const built = contentToLesson(content.data, schedule);
      if (!built.ok) return built;
      // Таймлайн верен по построению, но правила всё равно проверяем: подсказки, ответы, арифметика.
      const valid = validateLessonPlan(built.plan);
      if (!valid.ok) return valid;
      const mismatch = requestMismatch(built.plan, input);
      return mismatch.length ? { ok: false, errors: mismatch } : built;
    },
    attempts: 3,
  };
}

function explanationJob(input: LessonRequest, index: number): Job<Explanation> {
  const group = input.groups[index];
  return {
    name: `explain-g${index + 1}`,
    instructions: explanationInstructions(input.language),
    request: { subject: input.subject, language: input.language, grade: group.grade, topic: group.topic },
    schemaName: "topic_explanation",
    schema: explanationSchema(),
    check: parseExplanation,
    attempts: 3,
  };
}

export async function generateLesson(input: LessonRequest): Promise<LessonPlan> {
  const provider = resolveProvider();
  if (!provider) throw new GenerationError("not_configured");
  const startedAt = Date.now();
  // Сначала объяснения всех классов (параллельно), потом содержание урока, которое на них опирается.
  const explanations = await Promise.all(input.groups.map((_, i) => generateChecked(provider, explanationJob(input, i), startedAt)));
  const core = await generateChecked(provider, planJob(input, explanations), startedAt);
  return {
    ...core,
    groups: core.groups.map((g, i) => ({
      id: g.id, grade: g.grade, topic: g.topic, learningGoal: g.learningGoal,
      explanation: explanations[i], cards: g.cards, homework: g.homework,
    })),
  };
}
