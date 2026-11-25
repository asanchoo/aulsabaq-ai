import { compileExpression as compileExpressionForTest } from "../lib/expression";
import { describe, expect, it } from "vitest";
import { demoFor } from "../lib/demo";
import { gradeProfile, withinProfile } from "../lib/grade-profile";
import {
  personalCard,
  personalPlan,
  validateVariant,
} from "../lib/card-variants";
import { evaluateVariantExpression as evaluate } from "../lib/expression";
import { sanitizeVariants } from "../lib/validate";
import { checkCardAnswer } from "../lib/check-answer";
import { studentView } from "../lib/student-view";
import type { StoredSession } from "../lib/store";

describe("профиль класса и безопасные выражения", () => {
  it("держит консервативные пределы и четверти программы", () => {
    expect([1, 2, 3, 4].map((g) => gradeProfile(g).max)).toEqual([
      20, 100, 1000, 1000000,
    ]);
    expect(gradeProfile(1, 2).max).toBe(10);
    expect(gradeProfile(2, 2).multiplication).toBe(false);
    expect(gradeProfile(2, 3).tableMax).toBe(5);
    expect(gradeProfile(2).remainder).toBe(false);
    expect(gradeProfile(3).remainder).toBe(true);
    expect(withinProfile(-1, gradeProfile(6))).toBe(false);
    expect(
      withinProfile(-1, gradeProfile(6, undefined, "Отрицательные числа")),
    ).toBe(true);
    expect(
      withinProfile(0.5, gradeProfile(5, undefined, "Обыкновенные дроби")),
    ).toBe(true);
  });
  it("не исполняет код и проверяет промежуточные значения", () => {
    expect(evaluate("a % 10 + b % 10 >= 10 && a > b", { a: 47, b: 25 })).toBe(
      1,
    );
    for (const text of [
      "process.exit()",
      "a.constructor",
      "1/0",
      "2^999",
      "a=3",
      "(()=>1)()",
    ])
      expect(evaluate(text, { a: 2 })).toBeNull();
    expect(evaluate("(a-b)+b", { a: 1, b: 9 }, (n) => n >= 0)).toBeNull();
  });
});

describe("варианты из демо", () => {
  for (const lang of ["ru", "kk"] as const)
    for (const group of demoFor(lang).groups) {
      for (const card of [...group.cards, ...(group.extraCards ?? [])].filter(
        (c) => c.variant,
      )) {
        it(`${lang} ${card.id}: 1000 зёрен, решение, профиль, воспроизводимость и разные соседи`, () => {
          expect(validateVariant(card, group, lang)).toBeNull();
          const prompts = new Set<string>();
          let different = 0;
          let previous = "";
          for (let i = 0; i < 1000; i++) {
            const rendered = personalCard(card, group, `pupil-${i}`, lang);
            expect(rendered).not.toBe(card);
            expect(rendered).toEqual(
              personalCard(card, group, `pupil-${i}`, lang),
            );
            expect(rendered.id).toBe(card.id);
            expect(rendered.variant).toBeUndefined();
            const numbers = (rendered.prompt.match(/\d+/g) ?? []).map(Number);
            expect(
              numbers.every((n) => withinProfile(n, gradeProfile(group.grade))),
            ).toBe(true);
            const [a, b] = numbers;
            const expected =
              card.variant!.answerExpression === "q"
                ? a / b
                : card.variant!.answerExpression === "a-b"
                  ? a - b
                  : card.variant!.answerExpression === "a*b"
                    ? a * b
                    : a + b;
            expect(Number(rendered.answer)).toBe(expected);
            expect(Number.isInteger(expected) && expected >= 0).toBe(true);
            expect(checkCardAnswer(String(expected), rendered)).toBe(true);
            expect(checkCardAnswer(String(expected + 1), rendered)).toBe(false);
            expect(rendered.hint).not.toMatch(new RegExp(`\\b${expected}\\b`));
            if (
              card.variant!.answerExpression === "a+b" &&
              /переход|ондықтан аттап/i.test(group.topic)
            )
              expect((a % 10) + (b % 10)).toBeGreaterThanOrEqual(10);
            if (previous && previous !== rendered.prompt) different++;
            previous = rendered.prompt;
            prompts.add(rendered.prompt);
          }
          expect(prompts.size).toBeGreaterThan(20);
          expect(different).toBeGreaterThan(800);
        });
      }
    }
  it("невыполнимые условия возвращают оригинал и мягко удаляются", () => {
    const plan = structuredClone(demoFor("ru"));
    const group = plan.groups[0];
    const card = group.cards.find((c) => c.variant)!;
    card.variant!.conditions = ["answer < 0"];
    expect(personalCard(card, group, "seed", "ru")).toBe(card);
    const safe = sanitizeVariants(plan, false);
    expect(safe.warnings.some((w) => w.includes(card.id))).toBe(true);
    expect(
      safe.plan.groups[0].cards.find((c) => c.id === card.id)?.variant,
    ).toBeUndefined();
  });
  it("сервер и экран ученика используют одно зерно, скрывают эталоны и учитывают выключатель", () => {
    const plan = demoFor("ru");
    const session: StoredSession = {
      plan,
      lessonId: "local",
      name: "A",
      groupId: plan.groups[0].id,
      progress: {},
      currentCard: null,
      needsHelp: false,
      helpCard: null,
    };
    const a = studentView(session, "a")!;
    const b = studentView(session, "b")!;
    expect(a.cards[0].prompt).not.toBe(b.cards[0].prompt);
    expect(a.cards[0].answer).toBeUndefined();
    expect(a.cards[0].prompt).toBe(
      personalPlan(plan, "a").groups[0].cards[0].prompt,
    );
    const off = { ...plan, numberVariants: false };
    expect(personalPlan(off, "a")).toBe(off);
    expect(personalPlan({ ...plan, subject: "Русский язык" }, "a").groups).toBe(
      plan.groups,
    );
  });
});

it("1000 линейных и квадратных уравнений строятся от решения", () => {
  const original = demoFor("ru").groups[0];
  for (const quadratic of [false, true]) {
    const group = {
      ...original,
      grade: 8,
      topic: quadratic
        ? "Квадратные уравнения, отрицательные числа"
        : "Линейные уравнения",
    };
    const variant = quadratic
      ? {
          prompt: "Реши: x^2 + ({b})x + {c} = 0",
          hint: "Разложи многочлен на множители.",
          ranges: [
            { name: "r1", min: 1, max: 9 },
            { name: "r2", min: 10, max: 19 },
          ],
          derived: [
            { name: "b", expression: "0-r1-r2" },
            { name: "c", expression: "r1*r2" },
          ],
          answerExpression: "r1;r2",
          conditions: [],
          original: [
            { name: "r1", value: 2 },
            { name: "r2", value: 10 },
          ],
        }
      : {
          prompt: "Реши: {a}x + {b} = {c}",
          hint: "Перенеси слагаемое и раздели на коэффициент.",
          ranges: [
            { name: "a", min: 2, max: 9 },
            { name: "b", min: 1, max: 9 },
            { name: "x", min: 10, max: 99 },
          ],
          derived: [{ name: "c", expression: "a*x+b" }],
          answerExpression: "x",
          conditions: [],
          original: [
            { name: "a", value: 2 },
            { name: "b", value: 3 },
            { name: "x", value: 10 },
          ],
        };
    const card = {
      ...original.cards[0],
      prompt: quadratic ? "Реши: x^2 + (-12)x + 20 = 0" : "Реши: 2x + 3 = 23",
      answer: quadratic ? "2; 10" : "10",
      accept: [],
      variant,
    };
    expect(validateVariant(card, group, "ru")).toBeNull();
    for (let seed = 0; seed < 1000; seed++) {
      const rendered = personalCard(card, group, `equation-${seed}`, "ru");
      expect(rendered).not.toBe(card);
      const [left, right] = rendered.prompt.replace("Реши:", "").split("=");
      for (const root of rendered.answer!.split(";").map(Number))
        expect(compileExpressionForTest(left)?.(root)).toBeCloseTo(
          Number(right),
          8,
        );
    }
  }
});
