import { describe, expect, it } from "vitest";
import { acceptMismatch, checkAnswer, checkCardAnswer, expectsNumber, inputHintReveals } from "@/lib/check-answer";
import { cardFromModel } from "@/lib/generation-schema";

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

  it("степени: ученик набирает x^2, в эталоне x²", () => {
    expect(checkAnswer("x^2 + 1", "x² + 1")).toBe(true);
    expect(checkAnswer("3*x^2", "3·x²")).toBe(true);
    expect(checkAnswer("x^3", "x²")).toBe(false);
  });

  it("варианты и перечисления", () => {
    expect(checkAnswer("тетрадь", "тетрадь / тетради")).toBe(true);
    expect(checkAnswer("собака, кот", "кот, собака")).toBe(true);
    expect(checkAnswer("кітап", "кітап немесе кітаптар")).toBe(true);
  });

  it("корни уравнения: нужны все, в любом порядке (аудит 19 ноября: «4» на x² = 16 засчитывалось)", () => {
    expect(checkAnswer("4", "x = −4 или x = 4.")).toBe(false);
    expect(checkAnswer("-4 и 4", "x = −4 или x = 4.")).toBe(true);
    expect(checkAnswer("4; -4", "x = −4 или x = 4.")).toBe(true);
    expect(checkAnswer("x1 = 2, x2 = 3", "x₁ = 2; x₂ = 3")).toBe(true);
    expect(checkAnswer("2", "x₁ = 2; x₂ = 3")).toBe(false);
    // Разные буквы слева — это не корни: «y = 5; точка (1; 5)» по-прежнему вариантами.
    expect(checkAnswer("5", "y = 5; точка (1; 5).")).toBe(true);
    // «2x = 8; x = 4»: левая часть «2x» — не корень.
    expect(checkAnswer("4", "2x = 8; x = 4")).toBe(true);
  });
});

describe("карточка с короткими ответами accept", () => {
  const card = (answer: string, accept?: string[]) => ({ answer, accept });

  it("ответ-пояснение проверяется по accept (аудит: «о море» на «м_рской» отклонялось)", () => {
    expect(checkAnswer("о море", "Морской — море.")).toBe(false);
    const c = card("Морской — море.", ["о", "о, море"]);
    expect(checkCardAnswer("о море", c)).toBe(true);
    expect(checkCardAnswer("О", c)).toBe(true);
    expect(checkCardAnswer("а", c)).toBe(false);
    const table = card("При x = 0: y = 4; при x = 1: y = 2; при x = 2: y = 0.", ["4, 2, 0"]);
    expect(checkCardAnswer("4, 2, 0", table)).toBe(true);
    expect(checkCardAnswer("4 2 1", table)).toBe(false);
  });

  it("без accept проверка идёт по эталону, как у старых уроков", () => {
    expect(checkCardAnswer("216", card("216 кг"))).toBe(true);
    expect(checkCardAnswer("217", card("216 кг"))).toBe(false);
  });

  it("accept, который противоречит эталону, выбрасывается", () => {
    expect(acceptMismatch(card("x = −4 или x = 4", ["-4; 4", "4"]))).toEqual(["4"]);
    expect(acceptMismatch(card("144 бауырсақ", ["144", "145"]))).toEqual(["145"]);
    const fromModel = cardFromModel({
      type: "closed", prompt: "Реши уравнение x² = 16", answer: "x = −4 или x = 4", accept: ["-4; 4", "4", " "],
      inputHint: "Оба корня через точку с запятой", successCriteria: "Оба корня", hint: "Какое число в квадрате даёт 16?", difficulty: 2, minutes: 1,
    });
    expect(fromModel.accept).toEqual(["-4; 4"]);
    expect(fromModel.inputHint).toBe("Оба корня через точку с запятой");
  });

  it("inputHint не называет ответ, у открытой карточки его нет", () => {
    expect(inputHintReveals({ prompt: "Сколько всего яблок: 3 по 4?", inputHint: "Впиши 12", answer: "12" })).toBe(true);
    expect(inputHintReveals({ prompt: "Сколько всего яблок: 3 по 4?", inputHint: "Только число", answer: "12" })).toBe(false);
    const open = cardFromModel({ type: "open", prompt: "Подчеркни подлежащее", answer: null, accept: ["мама"], inputHint: "Впиши слово", successCriteria: "Подчёркнуто", hint: "Кто?", difficulty: 1, minutes: 1 });
    expect(open).not.toHaveProperty("accept");
    expect(open).not.toHaveProperty("inputHint");
  });

  it("цифровая клавиатура только для ответа из одного неотрицательного числа", () => {
    expect(expectsNumber(card("12 яблок", ["12"]))).toBe(true);
    expect(expectsNumber(card("144"))).toBe(true);
    expect(expectsNumber(card("x = −4 или x = 4", ["-4; 4"]))).toBe(false);
    expect(expectsNumber(card("Морской — море.", ["о"]))).toBe(false);
  });
});
