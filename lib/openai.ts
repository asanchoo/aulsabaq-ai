import { z } from "zod";
import { GeneratedPlanSchema, normalizeGeneratedPlan, type LessonRequest } from "./generation-schema";
import { lessonInstructions } from "./prompts";
import { parseLessonPlan } from "./validate";
import type { LessonPlan } from "./schema";

export class GenerationError extends Error {
  constructor(public code: "not_configured" | "provider" | "invalid_plan") { super(code); }
}

const ResponseSchema = z.object({
  status: z.string(),
  output: z.array(z.object({
    type: z.string(),
    content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
  })),
});

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
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  if (!apiKey || !model) throw new GenerationError("not_configured");
  let feedback: string[] = [];
  // One repair attempt only, including malformed/incomplete output.
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(50_000),
        body: JSON.stringify({ model, store: false, max_output_tokens: 10000,
          instructions: lessonInstructions(input.language),
          input: JSON.stringify({ request: input, validationErrors: feedback }),
          text: { format: { type: "json_schema", name: "lesson_plan", strict: true,
            schema: z.toJSONSchema(GeneratedPlanSchema, { target: "draft-7" }) } },
        }),
      });
    } catch { throw new GenerationError("provider"); }
    if (!response.ok) throw new GenerationError("provider");
    try {
      const result = ResponseSchema.parse(await response.json());
      if (result.status !== "completed") throw new Error("incomplete");
      const text = result.output.flatMap((o) => o.type === "message" ? o.content ?? [] : [])
        .filter((c) => c.type === "output_text").map((c) => c.text ?? "").join("");
      const parsed = parseLessonPlan(normalizeGeneratedPlan(JSON.parse(text)));
      if (!parsed.ok) { feedback = parsed.errors; continue; }
      feedback = requestMismatch(parsed.plan, input);
      if (!feedback.length) return parsed.plan;
    } catch { feedback = ["Return a complete JSON object matching the required schema."]; }
  }
  throw new GenerationError("invalid_plan");
}
