/** Explicit live benchmark only. Never part of npm test, never stores anything in the school database. */
import { it, expect } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";
import { resolveProvider } from "@/lib/providers";
import { generateLesson, requestMismatch } from "@/lib/ai";
import { LessonCoreSchema } from "@/lib/schema";
import {
  LessonRequestSchema,
  type LessonRequest,
} from "@/lib/generation-schema";
import { validateLessonPlan } from "@/lib/validate";

const out = process.env.BENCHMARK_OUTPUT ?? "/private/tmp/aulsabaq-t8-results";
const cases = [
  {
    subject: "Математика",
    language: "ru",
    groups: [
      {
        grade: 2,
        topic: "Сложение двузначных чисел с переходом через десяток",
      },
      { grade: 4, topic: "Деление трёхзначного числа на однозначное" },
    ],
  },
  {
    subject: "Математика",
    language: "ru",
    groups: [
      { grade: 1, topic: "Сложение в пределах 10" },
      { grade: 2, topic: "Вычитание в пределах 100" },
      { grade: 3, topic: "Таблица умножения на 7" },
    ],
  },
  {
    subject: "Русский язык",
    language: "ru",
    groups: [
      { grade: 2, topic: "Безударные гласные в корне" },
      { grade: 4, topic: "Однородные члены предложения" },
    ],
  },
  {
    subject: "Познание мира",
    language: "ru",
    groups: [
      { grade: 2, topic: "Времена года" },
      { grade: 3, topic: "Круговорот воды в природе" },
    ],
  },
  {
    subject: "Русский язык",
    language: "ru",
    groups: [
      { grade: 2, topic: "Имя существительное" },
      { grade: 3, topic: "Имя прилагательное" },
      { grade: 4, topic: "Глагол" },
    ],
  },
  {
    subject: "Математика",
    language: "kk",
    groups: [
      { grade: 2, topic: "Ондықтан аттап екі таңбалы сандарды қосу" },
      { grade: 4, topic: "Үш таңбалы санды бір таңбалы санға бөлу" },
    ],
  },
  {
    subject: "Математика",
    language: "kk",
    groups: [
      { grade: 1, topic: "10 көлеміндегі сандарды қосу" },
      { grade: 2, topic: "100 көлеміндегі сандарды азайту" },
      { grade: 3, topic: "7-ге көбейту кестесі" },
    ],
  },
  {
    subject: "Қазақ тілі",
    language: "kk",
    groups: [
      { grade: 2, topic: "Зат есім" },
      { grade: 4, topic: "Сөйлемнің бірыңғай мүшелері" },
    ],
  },
  {
    subject: "Дүниетану",
    language: "kk",
    groups: [
      { grade: 2, topic: "Жыл мезгілдері" },
      { grade: 3, topic: "Табиғаттағы су айналымы" },
    ],
  },
  {
    subject: "Қазақ тілі",
    language: "kk",
    groups: [
      { grade: 2, topic: "Сын есім" },
      { grade: 3, topic: "Етістік" },
      { grade: 4, topic: "Сөйлем мүшелері" },
    ],
  },
].map((c, i) => ({
  id: i + 1,
  input: LessonRequestSchema.parse({ ...c, durationMin: 45 }),
}));

// Give the baseline machine-readable formatting, but no schedule algorithm, repair or validator feedback.
function strict(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strict);
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const result = Object.fromEntries(
    Object.entries(source)
      .filter(([k]) => k !== "default" && k !== "$schema")
      .map(([k, v]) => [k, strict(v)]),
  );
  if (source.properties) {
    const properties = source.properties as Record<string, unknown>,
      required = new Set((source.required as string[]) ?? []);
    result.properties = Object.fromEntries(
      Object.entries(properties).map(([k, v]) => [
        k,
        required.has(k) ? strict(v) : { anyOf: [strict(v), { type: "null" }] },
      ]),
    );
    result.required = Object.keys(properties);
    result.additionalProperties = false;
  }
  return result;
}
function withoutNull(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutNull);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => v !== null)
      .map(([k, v]) => [k, withoutNull(v)]),
  );
}
function check(raw: unknown, input: LessonRequest) {
  const parsed = LessonCoreSchema.safeParse(raw);
  if (!parsed.success)
    return {
      valid: false,
      schema: false,
      errors: ["SCHEMA"],
      codes: ["SCHEMA"],
    };
  const result = validateLessonPlan(parsed.data);
  const errors = [
    ...(!result.ok ? result.errors : []),
    ...requestMismatch(parsed.data, input),
  ];
  return {
    valid: errors.length === 0,
    schema: true,
    errors,
    codes: [...new Set(errors.map((e) => e.split(":")[0]))],
  };
}

it.skipIf(process.env.RUN_LIVE_BENCHMARK !== "on")(
  "ten paired live requests",
  async () => {
    expect(process.env.RUN_LIVE_BENCHMARK).toBe("on");
    // Same configured primary model on both arms, without silent fallback to a different primary.
    if (process.env.OPENAI_MODEL)
      process.env.OPENAI_MODEL = process.env.OPENAI_MODEL.split(",")[0].trim();
    if (process.env.GEMINI_MODEL)
      process.env.GEMINI_MODEL = process.env.GEMINI_MODEL.split(",")[0].trim();
    const provider = resolveProvider();
    if (!provider) throw new Error("Model is not configured");
    await mkdir(out, { recursive: true });
    await writeFile(
      out + "/method.json",
      JSON.stringify(
        {
          date: new Date().toISOString(),
          provider: provider.name,
          primaryModel:
            provider.name === "openai"
              ? process.env.OPENAI_MODEL
              : process.env.GEMINI_MODEL,
          fastModel: process.env.OPENAI_FAST_MODEL ?? null,
          cases,
          scope:
            "Timeline and cards only; baseline gets JSON schema and one prompt, product runs its normal full pipeline. Neither arm is human-scored for pedagogy or grammar.",
        },
        null,
        2,
      ),
    );
    const schema = strict(
      z.toJSONSchema(LessonCoreSchema, { target: "draft-7" }),
    ) as Record<string, unknown>;
    for (const c of cases) {
      const row: Record<string, unknown> = { id: c.id, input: c.input };
      console.info("CASE", c.id, "baseline started");
      let at = Date.now();
      try {
        const text = await provider.call({
          instructions:
            "Ты учитель малокомплектной школы Казахстана. Составь один совмещённый урок на 45 минут для указанных классов: учитель один, остальные работают самостоятельно. Дай расписание, задания повторения и новой темы с оценкой времени, ответами и подсказками без ответа. Карточек должно хватить на работу без учителя. Содержание пиши на указанном языке. Объяснения и слайды не нужны, сейчас сравниваем только расписание и карточки. Верни JSON по схеме.",
          input: JSON.stringify(c.input),
          schemaName: "baseline_lesson",
          schema,
        });
        const raw = withoutNull(JSON.parse(text ?? "null"));
        row.baseline = { ...check(raw, c.input), ms: Date.now() - at };
        await writeFile(
          `${out}/${c.id}-baseline.json`,
          JSON.stringify(raw, null, 2),
        );
      } catch {
        row.baseline = {
          valid: false,
          error: "provider_or_incomplete",
          ms: Date.now() - at,
        };
      }
      console.info("CASE", c.id, "product started");
      at = Date.now();
      try {
        const plan = await generateLesson(c.input);
        row.product = { ...check(plan, c.input), ms: Date.now() - at };
        await writeFile(
          `${out}/${c.id}-product.json`,
          JSON.stringify(plan, null, 2),
        );
      } catch (e) {
        row.product = {
          valid: false,
          error: e instanceof Error ? e.message : "generation",
          ms: Date.now() - at,
        };
      }
      await writeFile(
        `${out}/${c.id}-result.json`,
        JSON.stringify(row, null, 2),
      );
      console.info(
        "CASE",
        c.id,
        JSON.stringify({ baseline: row.baseline, product: row.product }),
      );
    }
  },
  3_600_000,
);
