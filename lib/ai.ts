import { z } from "zod";
import { GeneratedPlanSchema, normalizeGeneratedPlan, type LessonRequest } from "./generation-schema";
import { lessonInstructions } from "./prompts";
import { ProviderError, resolveProvider } from "./providers";
import { parseLessonPlan } from "./validate";
import type { LessonPlan } from "./schema";

/**
 * Генерация урока: не зависит от того, какая модель отвечает.
 * Провайдер (OpenAI или Gemini) выбирается в lib/providers.ts по env.
 * Ответ модели всегда проходит Zod, инварианты урока и сверку с запросом учителя.
 */

export class GenerationError extends Error {
  constructor(public code: "not_configured" | "provider" | "invalid_plan") { super(code); }
}

export function requestMismatch(plan: LessonPlan, input: LessonRequest): string[] {
  const errors: string[] = [];
  if (plan.language !== input.language || plan.subject !== input.subject || plan.durationMin !== input.durationMin)
    errors.push("REQUEST: preserve subject, language and durationMin exactly");
  if (plan.groups.length !== input.groups.length || input.groups.some((g, i) =>
    plan.groups[i]?.grade !== g.grade || plan.groups[i]?.topic !== g.topic))
    errors.push("REQUEST: preserve groups, their order, grades and topics exactly");
  return errors;
}

export async function generateLesson(input: LessonRequest): Promise<LessonPlan> {
  const provider = resolveProvider();
  if (!provider) throw new GenerationError("not_configured");
  const schema = z.toJSONSchema(GeneratedPlanSchema, { target: "draft-7" }) as Record<string, unknown>;
  let feedback: string[] = [];
  // Одна повторная попытка, в том числе при обрыве или неполном ответе.
  for (let attempt = 0; attempt < 2; attempt++) {
    let text: string | null;
    try {
      text = await provider.call({
        instructions: lessonInstructions(input.language),
        input: JSON.stringify({ request: input, validationErrors: feedback }),
        schemaName: "lesson_plan",
        schema,
      });
    } catch (error) {
      if (error instanceof ProviderError) throw new GenerationError("provider");
      throw error;
    }
    try {
      if (text === null) throw new Error("incomplete");
      const parsed = parseLessonPlan(normalizeGeneratedPlan(JSON.parse(text)));
      if (!parsed.ok) { feedback = parsed.errors; continue; }
      feedback = requestMismatch(parsed.plan, input);
      if (!feedback.length) return parsed.plan;
    } catch { feedback = ["Return a complete JSON object matching the required schema."]; }
  }
  throw new GenerationError("invalid_plan");
}
