/**
 * Живой прогон уроков по разным предметам и классам (не математика 1–4).
 * Только по явному запуску, не входит в npm test, в базу школы ничего не пишет:
 *   node --env-file=.env.local node_modules/vitest/vitest.mjs run --config benchmarks/vitest.config.mts benchmarks/subjects.bench.ts
 * Результаты: BENCHMARK_OUTPUT (по умолчанию /private/tmp/aulsabaq-subjects).
 */
import { it, expect } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { generateLesson } from "@/lib/ai";
import { LessonRequestSchema, type LessonRequest } from "@/lib/generation-schema";
import { validateLessonPlan } from "@/lib/validate";
import { curriculumGoals } from "@/lib/curriculum";

const out = process.env.BENCHMARK_OUTPUT ?? "/private/tmp/aulsabaq-subjects";

const cases: LessonRequest[] = [
  { subject: "Русский язык", language: "ru", durationMin: 45, groups: [
    { grade: 2, topic: "Безударные гласные в корне, проверяемые ударением" },
    { grade: 4, topic: "Падежные окончания имён прилагательных" }] },
  { subject: "Қазақ тілі", language: "kk", durationMin: 45, groups: [
    { grade: 2, topic: "Зат есім" },
    { grade: 4, topic: "Етістіктің шақтары" }] },
  { subject: "Познание мира", language: "ru", durationMin: 45, groups: [
    { grade: 1, topic: "Комнатные растения и уход за ними" },
    { grade: 3, topic: "Круговорот воды в природе" }] },
  { subject: "Жаратылыстану", language: "kk", durationMin: 45, groups: [
    { grade: 3, topic: "Су және оның қасиеттері" },
    { grade: 4, topic: "Күн жүйесі" }] },
  { subject: "Литературное чтение", language: "ru", durationMin: 45, groups: [
    { grade: 2, topic: "Сказка: герои и главная мысль" },
    { grade: 4, topic: "Басни И. А. Крылова" }] },
  { subject: "Математика", language: "ru", durationMin: 45, groups: [
    { grade: 5, topic: "Сложение обыкновенных дробей с одинаковыми знаменателями" },
    { grade: 6, topic: "Сложение отрицательных чисел" }] },
  { subject: "Математика", language: "kk", durationMin: 45, groups: [
    { grade: 1, topic: "10 көлеміндегі сандарды қосу" },
    { grade: 3, topic: "Қалдықпен бөлу" }] },
  { subject: "Алгебра", language: "ru", durationMin: 45, groups: [
    { grade: 7, topic: "Линейная функция и её график" },
    { grade: 9, topic: "Квадратичная функция" }] },
];

// BENCH_CASES="2,4" запускает только эти уроки (номера с 1)
const only = new Set((process.env.BENCH_CASES ?? "").split(",").filter(Boolean).map(Number));

for (const [n, raw] of cases.entries()) {
  if (only.size && !only.has(n + 1)) continue;
  it(`урок ${n + 1}: ${raw.subject}, ${raw.groups.map((g) => g.grade).join(" и ")} класс`, async () => {
    const input = LessonRequestSchema.parse(raw);
    const goals = input.groups.map((g) => curriculumGoals({ subject: input.subject, grade: g.grade, language: g.language ?? input.language, topic: g.topic, quarter: g.quarter }));
    const started = Date.now();
    const record: Record<string, unknown> = { n: n + 1, input, goalsFound: goals, models: { main: process.env.OPENAI_MODEL ?? null, fast: process.env.OPENAI_FAST_MODEL ?? null } };
    try {
      const plan = await generateLesson(input);
      record.ms = Date.now() - started;
      record.issues = validateLessonPlan(plan);
      record.plan = plan;
    } catch (error) {
      record.ms = Date.now() - started;
      record.error = error instanceof Error ? error.message : String(error);
    }
    await mkdir(out, { recursive: true });
    await writeFile(`${out}/${n + 1}.json`, JSON.stringify(record, null, 2));
    expect(record).toBeTruthy();
  });
}
