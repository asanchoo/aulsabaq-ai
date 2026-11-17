import { describe, expect, it } from "vitest";
import { checkAnswer } from "@/lib/check-answer";

describe("checkAnswer", () => {
  it("числа: слова вокруг не важны", () => {
    expect(checkAnswer("216", "216 кг")).toBe(true);
    expect(checkAnswer("216 кг", "216")).toBe(true);
    expect(checkAnswer("x=5", "x = 5")).toBe(true);
    expect(checkAnswer("5", "x = 5")).toBe(true);
    expect(checkAnswer("1200", "1 200")).toBe(true);
    expect(checkAnswer("0.5", "0,5")).toBe(true);
    expect(checkAnswer("7 ост 1", "7, остаток 1")).toBe(true);
  });

  it("числа: другое число, лишнее число или другой порядок не засчитываются", () => {
    expect(checkAnswer("214", "216")).toBe(false);
    expect(checkAnswer("216 + 1", "216")).toBe(false);
    expect(checkAnswer("1 7", "7, остаток 1")).toBe(false);
    expect(checkAnswer("", "216")).toBe(false);
  });

  it("отрицательные числа и выражения со знаком минус", () => {
    expect(checkAnswer("-3", "x = −3")).toBe(true);
    expect(checkAnswer("3", "x = −3")).toBe(false);
  });

  it("слова: без регистра, знаков препинания и ё/е", () => {
    expect(checkAnswer("Ёжик", "ежик")).toBe(true);
    expect(checkAnswer("существительное.", "Существительное")).toBe(true);
    expect(checkAnswer("Ответ: корова", "корова")).toBe(true);
    expect(checkAnswer("кошка", "корова")).toBe(false);
  });

  it("варианты и перечисления", () => {
    expect(checkAnswer("тетрадь", "тетрадь / тетради")).toBe(true);
    expect(checkAnswer("собака, кот", "кот, собака")).toBe(true);
    expect(checkAnswer("кітап", "кітап немесе кітаптар")).toBe(true);
  });
});
