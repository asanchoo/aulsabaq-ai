import { z } from "zod";
import { GeneratedPlanSchema, normalizeGeneratedPlan, type LessonRequest } from "./generation-schema";
import { explanationInstructions, lessonInstructions } from "./prompts";
import { ProviderError, resolveProvider, type Provider } from "./providers";
import { parseExplanation, parseLessonCore } from "./validate";
import { ExplanationSchema, type Explanation, type LessonCore, type LessonPlan } from "./schema";

/**
 * Генерация урока: не зависит от того, какая модель отвечает.
 * Провайдер (OpenAI или Gemini) выбирается в lib/providers.ts по env.
 *
 * Урок собирается из нескольких запросов, которые идут параллельно:
 * 1) расписание, карточки и домашнее задание для всех классов;
 * 2) объяснение новой темы — отдельный запрос на каждый класс.
 * Когда всё было одним большим ответом, облегчённая модель путалась в таймлайне трёх классов.
 * Короткие ответы надёжнее, и каждый проверяется своими правилами и повторяется отдельно.
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

const planSchema = () => z.toJSONSchema(GeneratedPlanSchema, { target: "draft-7" }) as Record<string, unknown>;
const explanationSchema = () => z.toJSONSchema(ExplanationSchema, { target: "draft-7" }) as Record<string, unknown>;

function planJob(input: LessonRequest): Job<LessonCore> {
  return {
    name: "plan",
    instructions: lessonInstructions(input.language),
    request: { request: input },
    schemaName: "lesson_plan",
    schema: planSchema(),
    check: (value) => {
      const parsed = parseLessonCore(normalizeGeneratedPlan(value));
      if (!parsed.ok) return parsed;
      const mismatch = requestMismatch(parsed.plan, input);
      return mismatch.length ? { ok: false, errors: mismatch } : parsed;
    },
    // Расписание сложнее всего: две повторные попытки.
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
  const [core, explanations] = await Promise.all([
    generateChecked(provider, planJob(input), startedAt),
    Promise.all(input.groups.map((_, i) => generateChecked(provider, explanationJob(input, i), startedAt))),
  ]);
  return {
    ...core,
    groups: core.groups.map((g, i) => ({
      id: g.id, grade: g.grade, topic: g.topic, learningGoal: g.learningGoal,
      explanation: explanations[i], cards: g.cards, homework: g.homework,
    })),
  };
}
