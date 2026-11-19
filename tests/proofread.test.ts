import { describe, expect, it } from "vitest";
import { demoLesson } from "@/lib/demo";
import { applyCorrections, collectTexts, levenshtein, safeCorrections } from "@/lib/proofread";
import { checkReviewCards } from "@/lib/validate";

describe("корректура: только безопасные исправления опечаток", () => {
  const texts = ["Дптер сөзін көпше түрге айналдыр.", "Өсімдіктері аз қурғақ аймақ", "Реши пример 36 + 48"];

  it("принимает исправление в 1–2 буквы слова, которое есть в уроке", () => {
    expect(levenshtein("Дптер", "Дәптер")).toBe(1);
    expect(safeCorrections([{ wrong: "Дптер", right: "Дәптер" }, { wrong: "қурғақ", right: "құрғақ" }], texts)).toEqual([
      { wrong: "Дптер", right: "Дәптер" },
      { wrong: "қурғақ", right: "құрғақ" },
    ]);
  });

  it("отбрасывает переписанные слова, фразы, числа и слова, которых нет в уроке", () => {
    expect(safeCorrections([
      { wrong: "пример", right: "задание" }, // другое слово
      { wrong: "Реши пример", right: "Реши задачу" }, // фраза
      { wrong: "36", right: "37" }, // число
      { wrong: "жаңбыр", right: "жаңбыр" }, // без изменений
      { wrong: "айналдыр", right: "айландыр" }, // ок по длине, но проверим: слово есть
      { wrong: "балапан", right: "балапандар" }, // нет в уроке
    ], texts)).toEqual([{ wrong: "айналдыр", right: "айландыр" }]);
  });

  it("меняет только целые слова и не трогает служебные поля", () => {
    const plan = { prompt: "Дптерге жаз. Дптер", kind: "Дптер", expression: "Дптер" };
    expect(applyCorrections(plan, [{ wrong: "Дптер", right: "Дәптер" }])).toEqual({ prompt: "Дптерге жаз. Дәптер", kind: "Дптер", expression: "Дптер" });
  });

  it("собирает тексты урока без id и режимов", () => {
    const texts = collectTexts(demoLesson);
    expect(texts).toContain(demoLesson.groups[0].cards[0].prompt);
    expect(texts).not.toContain("g1-c1");
    expect(texts).not.toContain("with_teacher");
  });
});

describe("карточки повторения из запроса объяснения", () => {
  const explanation = demoLesson.groups[1].explanation;
  const card = (prompt: string, minutes = 3) => ({ type: "closed" as const, prompt, answer: "12", successCriteria: "Верно", hint: "Вспомни таблицу", difficulty: 1 as const, minutes, accept: [], inputHint: null });

  it("повторение по новой теме — мягкая ошибка REVIEW, одно знакомое слово — нет", () => {
    const plain = ["Вычисли 6 × 2", "Вычисли 24 : 2", "Вычисли 3 × 4", "Вычисли 2 × 6", "Вычисли 60 : 5", "Вычисли 4 × 3", "Вычисли 36 : 3"].map((p) => card(p, 1.5));
    const one = checkReviewCards([card("Найди частное: 96 : 8", 1.5), ...plain], explanation, 4, 12);
    expect(one).toEqual({ hard: [], soft: [] });
    const newTopic = ["Найди неполное делимое: 96 : 8", "Найди неполное делимое: 84 : 7", "Найди неполное делимое: 72 : 6", "Найди неполное делимое: 60 : 5", "Найди неполное делимое: 48 : 4"].map((p) => card(p, 1.5));
    const many = checkReviewCards([...newTopic, ...plain.slice(0, 3)], explanation, 4, 12);
    expect(many.soft).toEqual([expect.stringMatching(/^REVIEW: карточки повторения 1 \(«/)]);
  });

  it("нехватка карточек — мягкая, пустой список при времени на повторение — жёсткая", () => {
    expect(checkReviewCards([card("Вычисли 6 × 2")], explanation, 4, 12).soft.map((e) => e.split(":")[0])).toEqual(["TIME", "TIME"]);
    expect(checkReviewCards([], explanation, 4, 12).hard).toHaveLength(1);
    expect(checkReviewCards([], explanation, 2, 0)).toEqual({ hard: [], soft: [] });
  });

  it("подсказка с ответом в карточке повторения — жёсткая ошибка", () => {
    const bad = { ...card("Вычисли 6 × 2"), hint: "Получится 12" };
    expect(checkReviewCards([bad, card("Вычисли 24 : 2"), card("Вычисли 3 × 4"), card("Вычисли 2 × 6")], explanation, 4, 12).hard[0]).toMatch(/^INV-8/);
  });
});
