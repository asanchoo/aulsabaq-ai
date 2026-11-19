import { describe, expect, it } from "vitest";
import demoFixture from "@/fixtures/demo-lesson.ru.json";
import { LessonPlanSchema, type LessonPlan, type Segment } from "@/lib/schema";
import { parseLessonPlan, validateLessonPlan } from "@/lib/validate";
import { groupTitle } from "@/lib/lesson";
import { getDict } from "@/lib/i18n";

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

/** id карточек класса по назначению: тесты не зависят от того, сколько карточек в демо-уроке. */
function idsOf(plan: LessonPlan, groupIndex: number, purpose: "review" | "practice"): string[] {
  return plan.groups[groupIndex].cards.filter((c) => c.purpose === purpose).map((c) => c.id);
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
      ...idsOf(plan, 1, "review").map((id) => `INV-4: карточка ${id} группы g2 не стоит ни в одном отрезке самостоятельной работы`),
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

  it("проверяет границы: групп 1–4 (инвариант 6)", () => {
    const plan = demo();
    plan.groups = [];
    plan.timeline = [];

    expect(errorsOf(plan)).toContain("INV-6: групп 0, нужно от 1 до 4");
  });

  it("возвращает все ошибки сразу, чтобы повторный запрос к модели исправил всё за раз", () => {
    const plan = demo();
    segment(plan, "g2", 5).mode = "with_teacher";
    segment(plan, "g1", 15).startMin = 17;
    plan.groups[0].cards[0].answer = undefined;

    const lostReview = idsOf(plan, 1, "review").map(() => "INV-4");
    expect(errorsOf(plan).map((e) => e.split(":")[0]).sort()).toEqual(["INV-1", "INV-2", ...lostReview, "INV-5"]);
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
    const [review, practice] = [idsOf(plan, 1, "review"), idsOf(plan, 1, "practice")];
    segment(plan, "g2", 5).cardIds = [...review.slice(0, -1), practice[0]];
    segment(plan, "g2", 25).cardIds = [review[review.length - 1], ...practice.slice(1)];

    expect(errorsOf(plan)).toEqual([
      `INV-7: у группы g2 на 5–15 мин карточки по новой теме (${practice[0]}) до объяснения учителя (15 мин); до него можно только повторение (purpose: review)`,
    ]);
  });

  it("разрешает повторение и после объяснения учителя", () => {
    const plan = demo();
    const [review, practice] = [idsOf(plan, 1, "review"), idsOf(plan, 1, "practice")];
    segment(plan, "g2", 5).cardIds = review.slice(0, -1);
    segment(plan, "g2", 25).cardIds = [review[review.length - 1], ...practice];

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
    const card = plan.groups[1].cards.find((c) => c.answer === "216")!; // «Раздели столбиком: 864 : 4»
    card.hint = "Подсказка: получится 216.";

    expect(errorsOf(plan)).toEqual([
      `INV-8: подсказка карточки ${card.id} содержит ответ; подсказка должна вести к решению, не называя ответ`,
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
    const practice = idsOf(plan, 1, "practice");
    segment(plan, "g2", 25).cardIds = practice.slice(0, -1);

    expect(errorsOf(plan)).toEqual([`INV-4: карточка ${practice[practice.length - 1]} группы g2 не стоит ни в одном отрезке самостоятельной работы`]);
  });

  // --- Инвариант 10: заданий хватает на всё время самостоятельной работы ---

  it("демо-урок: карточек хватает и на повторение, и на практику", () => {
    expect(errorsOf(full())).toEqual([]);
  });

  it("ловит класс, которому не хватит заданий до прихода учителя", () => {
    const plan = full();
    for (const card of plan.groups[1].cards.filter((c) => c.purpose === "review")) card.minutes = 1;
    const count = idsOf(plan, 1, "review").length;
    expect(errorsOf(plan)).toEqual([`TIME: у группы g2 повторение длится 10 мин, а карточек review на ${count} мин; добавь карточки review`]);
  });

  it("не даёт закрыть время завышенными минутами: карточек должно быть не меньше, чем по темпу", () => {
    const plan = full();
    // 4 карточки по 5 минут дают 20 минут на 18 минут практики, но «сложить два числа за 5 минут» — завышено.
    // По темпу 1,5 минуты на карточку во 2 классе нужно 18 / 1,5 = 12 и одна в запас.
    plan.groups[0].cards = plan.groups[0].cards.slice(0, 4).map((c) => ({ ...c, minutes: 5 }));
    for (const seg of plan.timeline.filter((s) => s.groupId === "g1" && s.mode === "independent")) {
      seg.cardIds = seg.startMin === 15 ? ["g1-c1", "g1-c2"] : ["g1-c3", "g1-c4"];
    }
    expect(errorsOf(plan)).toEqual([
      "TIME: у группы g1 на 18 мин практики нужно не меньше 13 карточек practice (с запасом), а их 4; добавь 9",
    ]);
  });

  it("ловит нехватку практики и «долгую» карточку, которой модель закрывает время", () => {
    const plan = full();
    for (const card of plan.groups[0].cards) card.minutes = 1;
    plan.groups[0].cards[6].minutes = 25;
    const errors = errorsOf(plan).map((e) => e.split(";")[0]);
    expect(errors).toContain("TIME: карточка g1-c7 оценена в 25 мин, для 2 класса это слишком долго");
    plan.groups[0].cards[6].minutes = 1;
    expect(errorsOf(plan)[0]).toMatch(/^TIME: у группы g1 самостоятельная практика длится 18 мин, а карточек practice на 13 мин/);
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

describe("названия классов в уроке", () => {
  it("две группы одного класса различаются номером группы", () => {
    const groups = [{ id: "g1", grade: 5 }, { id: "g2", grade: 3 }, { id: "g3", grade: 5 }];
    expect(groups.map((g) => groupTitle(groups, g, getDict("ru").common))).toEqual(["5 класс, группа 1", "3 класс", "5 класс, группа 2"]);
    expect(groupTitle(groups, groups[2], getDict("kk").common)).toBe("5-сынып, 2-топ");
  });
});

describe("ответ «Попробуй сам» с отрицательными числами", () => {
  it("«−9 + 9», ответ 0, и «(−5 + 25) : 4», ответ 5, не считаются ошибкой; «9 + 9», ответ 0, считается", async () => {
    const { checkExplanation } = await import("@/lib/validate");
    const e = structuredClone(demoFixture.groups[1].explanation) as unknown as Parameters<typeof checkExplanation>[0];
    e.practice = [{ task: "Вычисли: −9 + 9", answer: "0" }, { task: "Вычисли: (−5 + 25) : 4", answer: "5" }];
    expect(checkExplanation(e).filter((x) => x.includes("неверный ответ"))).toEqual([]);
    e.practice = [{ task: "Вычисли: 9 + 9", answer: "0" }];
    expect(checkExplanation(e).some((x) => x.includes("неверный ответ"))).toBe(true);
  });
});
