import { describe, expect, it } from "vitest";
import demoFixture from "@/fixtures/demo-lesson.ru.json";
import { LessonPlanSchema, type LessonPlan, type Segment } from "@/lib/schema";
import { parseLessonPlan, validateLessonPlan } from "@/lib/validate";

/** Свежая копия демо-урока: каждый тест ломает свою копию и не мешает другим. */
function demo(): LessonPlan {
  return LessonPlanSchema.parse(structuredClone(demoFixture));
}

function segment(plan: LessonPlan, groupId: string, startMin: number): Segment {
  const seg = plan.timeline.find((s) => s.groupId === groupId && s.startMin === startMin);
  if (!seg) throw new Error(`нет отрезка ${groupId}@${startMin}`);
  return seg;
}

function errorsOf(plan: LessonPlan): string[] {
  const result = validateLessonPlan(plan);
  return result.ok ? [] : result.errors;
}

describe("validateLessonPlan", () => {
  // --- Обязательные тесты MVP (SPEC §8) ---

  it("демо-урок из fixtures проходит проверку", () => {
    const result = parseLessonPlan(demoFixture);
    expect(result).toEqual({ ok: true, plan: expect.any(Object) });
  });

  it("ловит учителя, который в одну минуту работает с двумя группами (инвариант 2)", () => {
    const plan = demo();
    // 5–15 мин: учитель с 2 классом, а 4 класс должен работать сам. Ломаем: 4 класс тоже «с учителем».
    segment(plan, "g2", 5).mode = "with_teacher";

    expect(errorsOf(plan)).toEqual(["INV-2: на 5–15 мин учитель одновременно с группами g1, g2"]);
  });

  it("ловит дыру в таймлайне группы (инвариант 1)", () => {
    const plan = demo();
    // Отрезок 2 класса 15–25 начинается на 2 минуты позже: 15–17 класс ничем не занят.
    segment(plan, "g1", 15).startMin = 17;

    expect(errorsOf(plan)).toEqual(["INV-1: у группы g1 дыра в таймлайне на 15–17 мин"]);
  });

  // --- Остальные инварианты ---

  it("ловит наложение отрезков одной группы (инвариант 1)", () => {
    const plan = demo();
    segment(plan, "g1", 5).endMin = 18;

    expect(errorsOf(plan)).toContain("INV-1: у группы g1 отрезки накладываются на 15–18 мин");
  });

  it("ловит таймлайн, который не доходит до конца урока (инвариант 1)", () => {
    const plan = demo();
    plan.durationMin = 50;

    expect(errorsOf(plan)).toContain("INV-1: у группы g1 дыра в таймлайне на 45–50 мин");
  });

  it("ловит общий этап, который есть не у всех групп (инвариант 2)", () => {
    const plan = demo();
    // 40–45: у 4 класса вместо общей рефлексии — с учителем, а 2 класс в joint.
    segment(plan, "g2", 40).mode = "with_teacher";

    expect(errorsOf(plan)).toContain("INV-2: на 40–45 мин общий этап (joint) у g1, но не у g2");
  });

  it("требует у каждой группы и время с учителем, и самостоятельную работу (инвариант 3)", () => {
    const plan = demo();
    for (const seg of plan.timeline) {
      if (seg.groupId === "g1" && seg.mode === "independent") seg.mode = "joint";
    }

    expect(errorsOf(plan)).toContain("INV-3: у группы g1 нет самостоятельной работы (independent)");
  });

  it("ловит самостоятельную работу без карточек и ссылку на чужую карточку (инвариант 4)", () => {
    const plan = demo();
    segment(plan, "g1", 15).cardIds = [];
    segment(plan, "g2", 5).cardIds = ["g2-c1", "g1-c1"];

    const errors = errorsOf(plan);
    expect(errors).toContain("INV-4: у группы g1 самостоятельная работа 15–25 мин без карточек");
    expect(errors).toContain("INV-4: отрезок 5–15 мин группы g2 ссылается на несуществующую карточку «g1-c1»");
  });

  it("требует ответ у закрытой карточки (инвариант 5)", () => {
    const plan = demo();
    plan.groups[0].cards[0].answer = "  ";

    expect(errorsOf(plan)).toEqual(["INV-5: у закрытой карточки g1-c1 нет ответа для самопроверки"]);
  });

  it("проверяет границы: групп 2–3, карточек 3–5 (инвариант 6)", () => {
    const plan = demo();
    plan.groups[1].cards = plan.groups[1].cards.slice(0, 2);
    plan.groups = plan.groups.slice(0, 1);
    plan.timeline = plan.timeline.filter((s) => s.groupId === "g1");

    expect(errorsOf(plan)).toContain("INV-6: групп 1, нужно от 2 до 3");
  });

  it("возвращает все ошибки сразу, чтобы повторный запрос к модели исправил всё за раз", () => {
    const plan = demo();
    segment(plan, "g2", 5).mode = "with_teacher";
    segment(plan, "g1", 15).startMin = 17;
    plan.groups[0].cards[0].answer = undefined;

    expect(errorsOf(plan).map((e) => e.split(":")[0]).sort()).toEqual(["INV-1", "INV-2", "INV-5"]);
  });
});

describe("parseLessonPlan", () => {
  it("отклоняет данные неправильной формы ещё до проверки смысла", () => {
    const broken = structuredClone(demoFixture) as Record<string, unknown>;
    (broken.groups as { grade: number }[])[0].grade = 12;
    delete broken.subject;

    const result = parseLessonPlan(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.every((e) => e.startsWith("SCHEMA:"))).toBe(true);
      expect(result.errors.some((e) => e.includes("groups.0.grade"))).toBe(true);
      expect(result.errors.some((e) => e.includes("subject"))).toBe(true);
    }
  });
});
