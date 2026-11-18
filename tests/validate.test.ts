import { describe, expect, it } from "vitest";
import demoFixture from "@/fixtures/demo-lesson.ru.json";
import { LessonPlanSchema, type LessonPlan, type Segment } from "@/lib/schema";
import { parseLessonPlan, validateLessonPlan } from "@/lib/validate";

/** Свежая копия демо-урока: каждый тест ломает свою копию и не мешает другим. */
function full(): LessonPlan {
  return LessonPlanSchema.parse(structuredClone(demoFixture));
}

/**
 * Демо-урок без минут на карточках: так проверка времени (инвариант 10) молчит и тесты других
 * инвариантов видят только свои ошибки. Инвариант 10 проверяется отдельно на полном демо-уроке.
 */
function demo(): LessonPlan {
  const plan = full();
  for (const card of plan.groups.flatMap((g) => g.cards)) delete card.minutes;
  return plan;
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

    expect(errorsOf(plan)).toEqual([
      "INV-2: на 5–15 мин учитель одновременно с группами g1, g2",
      // Карточки повторения этого отрезка теперь никто не решает.
      "INV-4: карточка g2-c1 группы g2 не стоит ни в одном отрезке самостоятельной работы",
      "INV-4: карточка g2-c2 группы g2 не стоит ни в одном отрезке самостоятельной работы",
      "INV-4: карточка g2-c3 группы g2 не стоит ни в одном отрезке самостоятельной работы",
      "INV-4: карточка g2-c4 группы g2 не стоит ни в одном отрезке самостоятельной работы",
    ]);
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

    expect(errorsOf(plan).map((e) => e.split(":")[0]).sort()).toEqual(["INV-1", "INV-2", "INV-4", "INV-4", "INV-4", "INV-4", "INV-5"]);
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

describe("инвариант 7: новая тема не раньше объяснения учителя", () => {
  it("ловит карточку по новой теме, которую класс делает до работы с учителем", () => {
    const plan = demo();
    // 4 класс работает сам на 5–15 мин, а учитель придёт к нему только в 15. Даём ему деление столбиком.
    // Меняем местами карточку повторения и карточку по новой теме, каждая по-прежнему в одном отрезке.
    segment(plan, "g2", 5).cardIds = ["g2-c1", "g2-c2", "g2-c3", "g2-c5"];
    segment(plan, "g2", 25).cardIds = ["g2-c4", "g2-c6", "g2-c7"];

    expect(errorsOf(plan)).toEqual([
      "INV-7: у группы g2 на 5–15 мин карточки по новой теме (g2-c5) до объяснения учителя (15 мин); до него можно только повторение (purpose: review)",
    ]);
  });

  it("разрешает повторение и после объяснения учителя", () => {
    const plan = demo();
    segment(plan, "g2", 5).cardIds = ["g2-c1", "g2-c2", "g2-c3"];
    segment(plan, "g2", 25).cardIds = ["g2-c4", "g2-c5", "g2-c6", "g2-c7"];

    expect(errorsOf(plan)).toEqual([]);
  });

  it("ловит класс без единой карточки по новой теме", () => {
    const plan = demo();
    for (const card of plan.groups[0].cards) card.purpose = "review";

    expect(errorsOf(plan)).toEqual(["INV-7: у группы g1 нет ни одной карточки по новой теме (purpose: practice)"]);
  });

  // --- Инвариант 8: подсказка не выдаёт ответ ---

  it("ловит подсказку, в которой назван ответ", () => {
    const plan = demo();
    plan.groups[1].cards[4].hint = "Подсказка: получится 216.";

    expect(errorsOf(plan)).toEqual([
      "INV-8: подсказка карточки g2-c5 содержит ответ; подсказка должна вести к решению, не называя ответ",
    ]);
  });

  it("не путает ответ с частью другого числа", () => {
    const plan = demo();
    // Ответ 72, а в подсказке 720 и 172: это не ответ.
    plan.groups[0].cards[0].hint = "Сравни с 720 и 172.";

    expect(errorsOf(plan)).toEqual([]);
  });

  it("требует объяснение темы у каждого класса", () => {
    const broken = structuredClone(demoFixture) as Record<string, unknown> & { groups: Record<string, unknown>[] };
    delete broken.groups[0].explanation;
    const result = parseLessonPlan(broken);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors[0]).toMatch(/^SCHEMA: groups\.0\.explanation/);
  });

  // --- Каждая карточка в плане ровно один раз (инвариант 4) ---

  it("ловит карточку, которую класс так и не решает", () => {
    const plan = demo();
    segment(plan, "g2", 25).cardIds = ["g2-c5", "g2-c6"];

    expect(errorsOf(plan)).toEqual(["INV-4: карточка g2-c7 группы g2 не стоит ни в одном отрезке самостоятельной работы"]);
  });

  // --- Инвариант 10: заданий хватает на всё время самостоятельной работы ---

  it("демо-урок: карточек хватает и на повторение, и на практику", () => {
    expect(errorsOf(full())).toEqual([]);
  });

  it("ловит класс, которому не хватит заданий до прихода учителя", () => {
    const plan = full();
    for (const card of plan.groups[1].cards.filter((c) => c.purpose === "review")) card.minutes = 1;
    expect(errorsOf(plan)).toEqual(["TIME: у группы g2 повторение длится 10 мин, а карточек review на 4 мин; добавь карточки review"]);
  });

  it("не даёт закрыть время завышенными минутами: карточек должно быть не меньше, чем по темпу", () => {
    const plan = full();
    // 4 карточки по 5 минут дают 20 минут на 18 минут практики, но «сложить два числа за 5 минут» — завышено.
    plan.groups[0].cards = plan.groups[0].cards.slice(0, 4).map((c) => ({ ...c, minutes: 5 }));
    for (const seg of plan.timeline.filter((s) => s.groupId === "g1" && s.mode === "independent")) {
      seg.cardIds = seg.startMin === 15 ? ["g1-c1", "g1-c2"] : ["g1-c3", "g1-c4"];
    }
    expect(errorsOf(plan)).toEqual([
      "TIME: у группы g1 на 18 мин практики нужно не меньше 6 карточек practice (с запасом), а их 4; добавь 2",
    ]);
  });

  it("ловит нехватку практики и «долгую» карточку, которой модель закрывает время", () => {
    const plan = full();
    for (const card of plan.groups[0].cards) card.minutes = 2;
    plan.groups[0].cards[6].minutes = 25;
    const errors = errorsOf(plan).map((e) => e.split(";")[0]);
    expect(errors).toContain("TIME: карточка g1-c7 оценена в 25 мин, для 2 класса это слишком долго");
    plan.groups[0].cards[6].minutes = 2;
    expect(errorsOf(plan)[0]).toMatch(/^TIME: у группы g1 самостоятельная практика длится 18 мин, а карточек practice на 14 мин/);
  });

  // --- Арифметика (инвариант 9 и EXP) ---

  it("ловит неверный ответ карточки-выражения и неверное равенство в подсказке", () => {
    const plan = demo();
    plan.groups[0].cards[0].answer = "62"; // 47 + 25 = 72
    plan.groups[0].cards[1].hint = "Сначала 8 + 6 = 13.";

    expect(errorsOf(plan)).toEqual([
      "INV-9: неверное равенство «8 + 6 = 13»; пересчитай",
      "INV-9: у карточки g1-c1 неверный ответ: 47 + 25 = 62; пересчитай",
    ]);
  });

  it("ловит ошибку в счёте в разобранном примере, но не в разделе ошибок", () => {
    const plan = LessonPlanSchema.parse(structuredClone(demoFixture));
    plan.groups[0].explanation.example.steps[0] = "Складываем единицы: 8 + 14 = 14.";

    expect(errorsOf(plan)).toEqual(["EXP: в объяснении у группы g1 неверное равенство «8 + 14 = 14»; пересчитай пример"]);
  });

  it("ловит опечатку из букв разных алфавитов", () => {
    const plan = demo();
    plan.groups[0].homework = "Реши примеры дома и провеrьte их.";

    expect(errorsOf(plan)).toEqual(["TXT: опечатка «провеrьte»: в слове смешаны алфавиты"]);
  });
});
