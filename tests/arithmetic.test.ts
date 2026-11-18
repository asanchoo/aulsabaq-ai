import { describe, expect, it } from "vitest";
import { findMixedScriptWord, findWrongEquation, prettyMath } from "@/lib/arithmetic";
import { compileExpression } from "@/lib/expression";

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
      "3 : 450 = 5 : x", "x : 5 = 18 : 10", "2 + x = 3 + 4", // с переменной
      "2x + 5 = 11", "x² + 2 = 6", "5 см + 3 см = 8 см", // буквы и единицы
      "Ответ карточки 3: 216 × 4 = 864", // двоеточие после слова, а не деление
      "Повтори: 36 : 4, 45 : 5", "9, 9, 7",
    ]) {
      expect(findWrongEquation(text)).toBeNull();
    }
  });
});

describe("findMixedScriptWord", () => {
  it("находит слово, где смешаны алфавиты, и пропускает формулы", () => {
    expect(findMixedScriptWord("Пропорция дегенimiz екі қатынастың теңдігі")).toBe("дегенimiz");
    expect(findMixedScriptWord("Бүگүн біз үйренеміз")).toBe("Бүگүн");
    for (const ok of ["3x = 2250, x = 750", "D = b² - 4ac", "ax^2 + bx + c = 0 теңдеуі", "x-ті табамыз", "xтің мәнін табамыз", "Wi-Fi нет"]) {
      expect(findMixedScriptWord(ok)).toBeNull();
    }
  });
});

describe("алгебра: хвосты выражений не пересчитываем", () => {
  it.each([
    "y(1) = −5 · 1 + 10 · 1 = 5",
    "y = −20 + 40 = 20",
    "y = −2·2² + 8 + 16 − 5 = 11",
    "y(2) = 2^2 − 4·2 + 3 = −1",
    "(−3)² − 0 = 9",
    "f(3) = 3² − 6 = 3",
    "x = (8 + 4) / 2 = 6",
  ])("«%s» не считается ошибкой", (text) => {
    expect(findWrongEquation(text)).toBeNull();
  });

  it("по-прежнему ловит ошибку в обычном равенстве", () => {
    expect(findWrongEquation("Единицы: 8 + 14 = 14")).toBe("8 + 14 = 14");
    expect(findWrongEquation("Вычисли: 45 − 17 = 27")).toBe("45 − 17 = 27");
    expect(findWrongEquation("Осталось 16 − 12 = 5 мест")).toBe("16 − 12 = 5");
  });
});

describe("prettyMath: школьная запись формул", () => {
  it("степени и умножение как в тетради", () => {
    expect(prettyMath("f(x) = 3*x^2 + 2")).toBe("f(x) = 3·x² + 2");
    expect(prettyMath("F(x) = x^3, F(3) - F(1) = 3^3 - 1^3")).toBe("F(x) = x³, F(3) - F(1) = 3³ - 1³");
    expect(prettyMath("(x + 1)^2")).toBe("(x + 1)²");
    expect(prettyMath("x^10")).toBe("x¹⁰");
  });
  it("не трогает обычный текст и звёздочку без чисел", () => {
    expect(prettyMath("Вычисли: 7 × 8")).toBe("Вычисли: 7 × 8");
    expect(prettyMath("* Задание со звёздочкой")).toBe("* Задание со звёздочкой");
  });
  it("после замены график по-прежнему строится, а равенство проверяется", () => {
    expect(compileExpression(prettyMath("3*x^2"))?.(2)).toBe(12);
    expect(findWrongEquation(prettyMath("Осталось 3^2 = 9"))).toBeNull();
  });
});
