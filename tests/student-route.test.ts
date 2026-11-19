import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RuleCard, similarExample, WorkedExample } from "@/components/StudentGuide";
import { demoLesson } from "@/lib/demo";
import { compileExpression } from "@/lib/expression";
import { getDict } from "@/lib/i18n";
import type { StoredSession } from "@/lib/store";
import { applyTrainer, readProgress } from "@/lib/student";
import { studentGuide, studentView } from "@/lib/student-view";
import { readTrainer, seededTask, TRAINER_SKILLS, type TrainerState } from "@/lib/trainer";

const value = (expr: string, x = 0) =>
  compileExpression(expr.replace(/·/g, "*").replace(/:/g, "/").replace(/−/g, "-").replace(/(\d),(\d)/g, "$1.$2"))?.(x);

describe("тренажёр: задания составляет код, ответ всегда верный", () => {
  it.each(TRAINER_SKILLS)("%s: 60 заданий, каждое пересчитывается", (skill) => {
    for (let i = 0; i < 60; i++) {
      const task = seededTask(skill, "session-1", i, "ru");
      const answer = Number(task.answer.replace(",", ".").replace("−", "-").split(" ")[0]);
      const compute = task.prompt.match(/^Вычисли: (.+)$/);
      const equation = task.prompt.match(/^Реши уравнение: (.+) = (-?\d+)$/);
      if (compute) expect(value(compute[1]), task.prompt).toBeCloseTo(answer);
      else if (equation) expect(value(equation[1], answer), task.prompt).toBeCloseTo(Number(equation[2]));
      else if (skill === "div_remainder") {
        const [, a, b] = task.prompt.match(/(\d+) : (\d+)/)!.map(Number);
        const [q, r] = task.answer.split(" ").map(Number);
        expect([q, r]).toEqual([Math.floor(a / b), a % b]);
        expect(r).toBeGreaterThan(0);
      } else if (skill === "fraction_of") {
        const [, num, den, n] = task.prompt.match(/(\d+)\/(\d+) от числа (\d+)/)!.map(Number);
        expect(answer).toBe((n / den) * num);
      } else if (skill === "percent_of") {
        const [, p, n] = task.prompt.match(/(\d+)% от числа (\d+)/)!.map(Number);
        expect(answer).toBe((n * p) / 100);
      } else if (skill.startsWith("round")) {
        const n = Number(task.prompt.match(/(\d+)$/)![1]);
        const step = skill === "round_tens" ? 10 : 100;
        expect(answer).toBe(Math.round(n / step) * step);
      } else throw new Error(`не проверено: ${task.prompt}`);
      expect(Number.isFinite(answer)).toBe(true);
    }
  });

  it("одно зерно и номер дают одно задание; у разных учеников задания разные; есть казахский", () => {
    expect(seededTask("add_2d_1d_carry", "a", 3, "ru")).toEqual(seededTask("add_2d_1d_carry", "a", 3, "ru"));
    const mine = Array.from({ length: 5 }, (_, i) => seededTask("mul_table", "a", i, "ru").prompt).join();
    const theirs = Array.from({ length: 5 }, (_, i) => seededTask("mul_table", "b", i, "ru").prompt).join();
    expect(mine).not.toBe(theirs);
    expect(seededTask("equation_add", "a", 0, "kk").prompt).toMatch(/^Теңдеуді шеш: /);
  });

  it("верно — следующее; две ошибки — ответ и следующее; пропуск показывает ответ", () => {
    const task = seededTask("mul_table", "s", 0, "ru");
    const start: TrainerState = { index: 0, solved: 0, wrong: 0, attempts: 0 };
    expect(applyTrainer(start, task, { action: "trainer", answer: task.answer })).toMatchObject({ correct: true, state: { index: 1, solved: 1 } });
    const once = applyTrainer(start, task, { action: "trainer", answer: "999" });
    expect(once).toMatchObject({ correct: false, state: { index: 0, attempts: 1 } });
    expect(once.shown).toBeUndefined();
    expect(applyTrainer(once.state, task, { action: "trainer", answer: "999" })).toMatchObject({ shown: task.answer, state: { index: 1, wrong: 1, attempts: 0 } });
    expect(applyTrainer(start, task, { action: "trainer_skip" })).toMatchObject({ shown: task.answer, state: { index: 1 } });
  });

  it("счёт тренажёра хранится рядом с карточками, но карточкой не считается", () => {
    const progress = { "g1-c1": { status: "correct", attempts: 1, hints: 0, hintTexts: [], revealed: false }, trainer: { index: 4, solved: 3, wrong: 1, attempts: 0 } };
    expect(Object.keys(readProgress(progress))).toEqual(["g1-c1"]);
    expect(readTrainer(progress)).toEqual({ index: 4, solved: 3, wrong: 1, attempts: 0 });
    expect(readTrainer(null)).toEqual({ index: 0, solved: 0, wrong: 0, attempts: 0 });
  });
});

describe("маршрут ученика: памятка, запас, тренажёр", () => {
  const group = demoLesson.groups[1];
  const extra = { ...group.cards[group.cards.length - 1], id: "g2-x1" };
  const plan = { ...demoLesson, groups: demoLesson.groups.map((g) => (g.id === group.id ? { ...g, extraCards: [extra], trainer: "div_3d_1d" as const } : g)) };
  const session: StoredSession = { lessonId: "l", plan, groupId: group.id, name: "Даша", progress: {}, currentCard: null, needsHelp: false, helpCard: null };

  it("ученик видит правило и разобранные примеры, но не ответы карточек и «Попробуй сам»", () => {
    const view = studentView(session, "s-1")!;
    expect(view.guide.keyIdea).toBe(group.explanation.keyIdea);
    expect(view.guide.examples).toHaveLength(1 + group.explanation.examples.length);
    expect(Object.keys(view.guide)).toEqual(["keyIdea", "steps", "visual", "examples"]);
    expect(view.cards.every((c) => c.answer === undefined)).toBe(true);
  });

  it("запас отдельно от основных карточек, тренажёр без ответа", () => {
    const view = studentView(session, "s-1")!;
    expect(view.extraCards.map((c) => [c.id, c.number])).toEqual([["g2-x1", 1]]);
    expect(view.cards.some((c) => c.id === "g2-x1")).toBe(false);
    expect(view.trainer?.task.prompt).toMatch(/^Вычисли: \d+ : \d$/);
    expect(JSON.stringify(view.trainer)).not.toContain('"answer"');
  });

  it("похожий пример подбирается по сложности карточки, контрпример не берём", () => {
    const guide = studentGuide(group);
    expect(similarExample(guide, 1)?.level).toBe("simple");
    expect(similarExample(guide, 3)?.level).toBe("tricky");
  });

  it("памятка и разбор рисуются; ответ примера скрыт, пока ученик не дошёл до него", () => {
    const dict = getDict("ru");
    const guide = studentGuide(group);
    expect(renderToStaticMarkup(createElement(RuleCard, { guide, dict }))).toContain(guide.keyIdea);
    const example = renderToStaticMarkup(createElement(WorkedExample, { example: guide.examples[0], dict }));
    expect(example).toContain("Показать первый шаг");
    expect(example).not.toContain(guide.examples[0].steps[0]);
  });
});

describe("презентация", () => {
  it("«Найди ошибку»: сначала только сама ошибка, объяснение по нажатию", async () => {
    const { splitMistake } = await import("@/components/ExplanationSlides");
    expect(splitMistake("Ученик сложил 36 + 48 и получил 74. Он забыл перенести десяток. Заметно по ответу меньше 80.")).toEqual({
      lead: "Ученик сложил 36 + 48 и получил 74.",
      rest: "Он забыл перенести десяток. Заметно по ответу меньше 80.",
    });
    expect(splitMistake("Путают 2,5 и 25")).toEqual({ lead: "Путают 2,5 и 25", rest: "" });
  });
});

describe("презентация из урока", () => {
  it("рисуется, начинается с обложки и вопроса, слайдов меньше, чем раньше (было 15–19)", async () => {
    const { ExplanationSlides } = await import("@/components/ExplanationSlides");
    const g = demoLesson.groups[1];
    const html = renderToStaticMarkup(createElement(ExplanationSlides, { explanation: g.explanation, grade: "4 класс", topic: g.topic, lang: "ru", joinCode: "123456" }));
    expect(html).toContain("Вопрос классу");
    expect(html).toContain(g.explanation.hook);
    const total = Number(html.match(/1 из (\d+)/)?.[1]);
    expect(total).toBeGreaterThan(6);
    expect(total).toBeLessThanOrEqual(16);
  });
});

describe("демо-урок показывает новый маршрут", () => {
  it("у обоих классов есть запас (каждое задание проходит проверки карточки) и тренажёр", async () => {
    const { checkSingleCard } = await import("@/lib/validate");
    for (const g of demoLesson.groups) {
      expect(g.extraCards?.length).toBe(8);
      expect(g.trainer).toBeDefined();
      for (const c of g.extraCards ?? []) expect(checkSingleCard(c), c.prompt).toEqual([]);
    }
  });
});
