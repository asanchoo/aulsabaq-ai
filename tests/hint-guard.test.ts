import { describe, expect, it } from "vitest";
import { hintContainsAnswer, hintRevealsAnswer } from "@/lib/validate";

/** SPEC §8: guard отбрасывает подсказку ИИ, которая выдаёт ответ. */
describe("hintRevealsAnswer (guard подсказок ИИ ученику)", () => {
  const prompt = "Раздели столбиком: 864 : 4";

  it("отбрасывает подсказку, где назван ответ", () => {
    expect(hintRevealsAnswer("Правильный ответ 216, проверь умножением.", "216", prompt)).toBe(true);
    expect(hintRevealsAnswer("Получится 216 кг", "216 кг", prompt)).toBe(true);
  });

  it("отбрасывает подсказку с числом из ответа, которого нет в условии", () => {
    expect(hintRevealsAnswer("Попробуй число 216.", "216", prompt)).toBe(true);
    expect(hintRevealsAnswer("Частное 7, а остаток 1.", "7, остаток 1", "Раздели 22 на 3")).toBe(true);
  });

  it("пропускает подсказку с числами из самого задания", () => {
    expect(hintRevealsAnswer("Сколько раз 4 помещается в 8? А в 6?", "216", prompt)).toBe(false);
    expect(hintRevealsAnswer("Начни с сотен: раздели 8 на 4.", "216", prompt)).toBe(false);
  });

  it("ловит однобуквенный ответ, если его нет в условии", () => {
    expect(hintRevealsAnswer("Ответ: 5", "5", "Вычисли 9 − 4")).toBe(true);
    expect(hintRevealsAnswer("Сколько будет 9 без 4?", "5", "Вычисли 9 − 4")).toBe(false);
  });

  it("ловит словесный ответ целым словом", () => {
    expect(hintRevealsAnswer("Это существительное, ведь отвечает на вопрос что?", "существительное", "Определи часть речи слова «дом»")).toBe(true);
    expect(hintRevealsAnswer("На какой вопрос отвечает слово?", "существительное", "Определи часть речи слова «дом»")).toBe(false);
  });

  it("для открытых карточек без ответа ничего не отбрасывает", () => {
    expect(hintRevealsAnswer("Вспомни, как пишется план рассказа.", "", "Составь рассказ")).toBe(false);
  });
});

describe("hintContainsAnswer (инвариант 8 при создании урока)", () => {
  it("не трогает однобуквенные ответы", () => {
    expect(hintContainsAnswer("Возьми 5 палочек", "5")).toBe(false);
  });
  it("находит ответ без учёта регистра и знаков", () => {
    expect(hintContainsAnswer("Подумай: КОРОВА или корова?", "корова.")).toBe(true);
  });
});
