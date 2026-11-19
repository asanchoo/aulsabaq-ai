import { describe, expect, it } from "vitest";
import { compileExpression } from "@/lib/expression";
import { parseExplanation } from "@/lib/validate";
import { columnBorrows, columnCarries, longDivision, partialProducts, toDraft, toVisual, visualMismatch, type Visual, type VisualDraft } from "@/lib/visuals";
import { demoLesson } from "@/lib/demo";

const draft = (patch: Partial<VisualDraft>): VisualDraft => ({
  kind: "column", caption: "Подпись", a: null, b: null, op: null, expression: null, from: null, to: null, areaFrom: null,
  areaTo: null, points: null, headers: null, rows: null, tokens: null, items: null, cycle: null, labels: null, values: null, ...patch,
});

describe("деление уголком считает код", () => {
  it("756 : 3 по шагам, как в тетради", () => {
    const { steps, quotient, remainder } = longDivision(756, 3);
    expect(quotient).toBe(252);
    expect(remainder).toBe(0);
    expect(steps.map((s) => [s.current, s.product, s.remainder])).toEqual([[7, 6, 1], [15, 15, 0], [6, 6, 0]]);
  });
  it("первое неполное делимое из двух цифр и ноль в частном", () => {
    expect(longDivision(416, 8).steps[0]).toMatchObject({ current: 41, end: 1 });
    const zero = longDivision(618, 6);
    expect(zero.quotient).toBe(103);
    expect(zero.steps.map((s) => s.current)).toEqual([6, 1, 18]);
  });
  it("деление с остатком", () => {
    expect(longDivision(22, 3)).toMatchObject({ quotient: 7, remainder: 1 });
  });
});

describe("столбик: перенос и заём", () => {
  it("36 + 48: перенос в десятки", () => {
    expect(columnCarries(36, 48)).toEqual([0, 1, 0]);
  });
  it("72 − 39: заём у десятков", () => {
    expect(columnBorrows(72, 39)).toEqual([false, true]);
  });
  it("частичные произведения 123 × 45", () => {
    expect(partialProducts(123, 45)).toEqual([615, 492]);
  });
});

describe("формула графика разбирается без eval", () => {
  it.each([
    ["x^2 - 4x + 3", 1, 0],
    ["2x + 1", 3, 7],
    ["y = 3(x+1)", 1, 6],
    ["-x^2", 2, -4],
    ["sqrt(x)", 9, 3],
    ["√x", 16, 4],
    ["x²", 5, 25],
    ["2^3^2", 0, 512],
    ["sin(pi/2)", 0, 1],
  ])("%s при x = %d", (expr, x, y) => {
    expect(compileExpression(expr)?.(x)).toBeCloseTo(y);
  });
  it.each(["alert(1)", "x +", "(x", "constructor", "x; process.exit()"])("отказывается от «%s»", (expr) => {
    expect(compileExpression(expr)).toBeNull();
  });
});

describe("toVisual: черновик модели → блок урока", () => {
  it("принимает верный столбик и деление", () => {
    expect(toVisual(draft({ kind: "column", a: 36, b: 48, op: "+" }))).toMatchObject({ ok: true, visual: { kind: "column", a: 36, b: 48 } });
    expect(toVisual(draft({ kind: "long_division", a: 756, b: 3 }))).toMatchObject({ ok: true, visual: { dividend: 756, divisor: 3 } });
  });
  it("отказывает в невозможных данных с причиной для модели", () => {
    expect(toVisual(draft({ kind: "column", a: 3, b: 8, op: "-" }))).toMatchObject({ ok: false, error: expect.stringContaining("VIS: column") });
    expect(toVisual(draft({ kind: "long_division", a: 5, b: 7 })).ok).toBe(false);
    expect(toVisual(draft({ kind: "plot", expression: "x**", from: 0, to: 5 })).ok).toBe(false);
    expect(toVisual(draft({ kind: "table", headers: ["a", "b"], rows: [["1"]] })).ok).toBe(false);
    expect(toVisual(draft({ kind: "sentence", tokens: [{ text: "Мама", tag: "subj" }, { text: "мыла", tag: "predicate" }] })).ok).toBe(false);
    expect(toVisual(draft({ kind: "word", tokens: [{ text: "при", tag: "prefix" }] })).ok).toBe(false);
  });
  it("график с площадью под кривой (интеграл)", () => {
    expect(toVisual(draft({ kind: "plot", expression: "x^2", from: -1, to: 3, areaFrom: 0, areaTo: 2 }))).toMatchObject({ ok: true, visual: { areaFrom: 0, areaTo: 2 } });
    expect(toVisual(draft({ kind: "plot", expression: "x^2", from: 0, to: 3, areaFrom: 2, areaTo: 5 })).ok).toBe(false);
  });
  it("разбор предложения и состав слова", () => {
    expect(toVisual(draft({ kind: "sentence", tokens: [{ text: "Аул", tag: "subject" }, { text: "проснулся", tag: "predicate" }] })).ok).toBe(true);
    expect(toVisual(draft({ kind: "word", tokens: [{ text: "под", tag: "prefix" }, { text: "снеж", tag: "root" }, { text: "ник", tag: "suffix" }] })).ok).toBe(true);
  });
  it("каждый блок демо-урока проходит туда и обратно", () => {
    for (const g of demoLesson.groups) {
      for (const v of [...g.explanation.visuals, ...[g.explanation.example, ...g.explanation.examples].flatMap((x) => (x.visual ? [x.visual] : []))]) {
        expect(toVisual(toDraft(v))).toEqual({ ok: true, visual: v });
      }
    }
  });
});

describe("блок «группы» не противоречит подписи", () => {
  const groups = (a: number, b: number, op: "+" | "-" | "×" | null, caption: string) => {
    const r = toVisual(draft({ kind: "groups", a, b, op, caption }));
    if (!r.ok) throw new Error(r.error);
    return r.visual;
  };

  it("сложение и вычитание рисуются своим знаком, умножение без op как раньше", () => {
    expect(groups(4, 3, "+", "4 и ещё 3")).toMatchObject({ groups: 4, perGroup: 3, op: "+" });
    expect(groups(7, 3, "-", "7 убрали 3")).toMatchObject({ op: "-" });
    expect(groups(4, 3, null, "4 тарелки по 3")).toMatchObject({ op: "×" });
    expect(toVisual(draft({ kind: "groups", a: 3, b: 5, op: "-" })).ok).toBe(false);
    expect(toVisual(draft({ kind: "groups", a: 20, b: 15, op: "+" })).ok).toBe(false);
  });

  it("урок 1 класса 19 ноября: под «4 и ещё 3, всего 7» было нарисовано 4 × 3 = 12", () => {
    expect(visualMismatch(groups(4, 3, "×", "4 и ещё 3, всего 7"), ["4 и ещё 3, всего 7"])).toContain("4 × 3 = 12");
    expect(visualMismatch(groups(4, 3, "+", "4 и ещё 3, всего 7"), ["4 и ещё 3, всего 7"])).toBeNull();
    // 3 класс: подпись про 23 · 4, а нарисовано 4 × 12 = 48.
    expect(visualMismatch(groups(4, 12, "×", "23 · 4 = 92: 4 раза по 23"), ["23 · 4 = 92: 4 раза по 23"])).not.toBeNull();
  });

  it("подпись без чисел, с множителями или с результатом блок не выбрасывает", () => {
    const v = groups(3, 4, "×", "Три тарелки");
    for (const text of ["Три тарелки, на каждой яблоки", "3 тарелки по 4 яблока", "Всего 12 яблок", "3 · 4 = 4 · 3"]) {
      expect(visualMismatch(v, [text]), text).toBeNull();
    }
    // «1 000» читается как одно число, а не как 1 и 0.
    expect(visualMismatch(v, ["3 по 4, а не 1 000"])).toContain("1000");
  });

  it("неверный блок примера выбрасывается, а не ломает объяснение", () => {
    const e = structuredClone(demoLesson.groups[1].explanation);
    const ex = (x: typeof e.example) => ({ ...x, visual: x.visual ? toDraft(x.visual) : null });
    const wrong: Visual = { kind: "groups", caption: "4 и ещё 3, всего 7", groups: 4, perGroup: 3, op: "×" };
    const g = { ...e, visuals: [...e.visuals.map(toDraft), toDraft(wrong)], example: ex(e.example), examples: e.examples.map(ex), reviewCards: [] };
    const result = parseExplanation(g);
    expect(result.ok && result.plan.visuals.some((v) => v.kind === "groups")).toBe(false);
  });
});

describe("parseExplanation: объяснение от модели", () => {
  const generated = () => {
    const e = structuredClone(demoLesson.groups[1].explanation);
    const ex = (x: typeof e.example) => ({ ...x, visual: x.visual ? toDraft(x.visual) : null });
    return { ...e, visuals: e.visuals.map(toDraft), example: ex(e.example), examples: e.examples.map(ex), reviewCards: [] };
  };

  it("ответ примера должен совпасть с тем, что посчитал код", () => {
    const g = generated();
    g.example.answer = "251";
    const result = parseExplanation(g);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.join(" ")).toContain("132");
  });

  it("примеры-клоны той же ступени не принимаются, а пример с подвохом может отличаться только числами", () => {
    const g = generated();
    // 618 : 6 (с подвохом) и 756 : 3 (как в учебнике) одной формы, но разных ступеней: это нормально.
    expect(parseExplanation(g).ok).toBe(true);
    g.examples[1] = { ...g.examples[1], level: "typical" };
    const result = parseExplanation(g);
    expect(!result.ok && result.errors.join(" ")).toContain("отличаются только числами");
  });

  it("неверный ответ в «Попробуй сам» отправляется модели на исправление", () => {
    const g = generated();
    g.practice[0].answer = "341";
    expect(parseExplanation(g).ok).toBe(false);
  });

  it("неразборчивый блок выбрасывается, но без единого блока объяснение не принимается", () => {
    const g = generated();
    g.visuals[0] = { ...g.visuals[0], kind: "plot", expression: "???", from: 0, to: 1 };
    expect(parseExplanation(g)).toMatchObject({ ok: true, plan: { visuals: [{ kind: "table" }] } });
    const none = { ...generated(), visuals: [], example: { ...generated().example, visual: null }, examples: generated().examples.map((x) => ({ ...x, visual: null })) };
    expect(parseExplanation(none)).toMatchObject({ ok: false, errors: [expect.stringContaining("VIS")] });
  });
});

describe("числовой луч с концами в обратном порядке", () => {
  it("разворачивается, а не выбрасывается", () => {
    expect(toVisual(draft({ kind: "number_line", from: 10, to: -10, points: [-3, 4] }))).toMatchObject({ ok: true, visual: { from: -10, to: 10 } });
  });
});
