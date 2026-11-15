import { describe, expect, it } from "vitest";
import { findWrongEquation } from "@/lib/arithmetic";

describe("findWrongEquation", () => {
  it("находит неверное равенство и пропускает верные", () => {
    expect(findWrongEquation("Складываем единицы: 8 + 14 = 14. Пишем 4")).toBe("8 + 14 = 14");
    expect(findWrongEquation("63 − 28 = 45. Спросите")).toBe("63 − 28 = 45");
    expect(findWrongEquation("2 + 3 × 4 = 20")).toBe("2 + 3 × 4 = 20");
    expect(findWrongEquation("1 000 + 200 = 1 300")).toBe("1 000 + 200 = 1 300");
    for (const ok of ["Единицы: 6 + 8 = 14.", "Проверка: 252 × 3 = 756.", "2 + 3 + 4 = 9", "2 + 3 × 4 = 14",
      "84 − 48 = 36, значит", "2,5 + 1 = 3,5", "1 000 + 200 = 1 200", "D = 25 - 4 · 6 = 1"]) {
      expect(findWrongEquation(ok)).toBeNull();
    }
  });

  it("не трогает то, что не является чистой арифметикой", () => {
    for (const text of [
      "7 : 3 = 2, остаток 1", // деление с остатком
      "Пропорция 2 : 3 = 4 : 6 верна", // равенство двух выражений
      "2x + 5 = 11", "x² + 2 = 6", "5 см + 3 см = 8 см", // буквы и единицы
      "Ответ карточки 3: 216 × 4 = 864", // двоеточие после слова, а не деление
      "Повтори: 36 : 4, 45 : 5", "9, 9, 7",
    ]) {
      expect(findWrongEquation(text)).toBeNull();
    }
  });
});
