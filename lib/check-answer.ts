/**
 * Проверка ответа ученика на закрытую карточку.
 *
 * Эталон пишет модель или учитель в свободной форме («216 кг», «x = 5», «7, остаток 1»),
 * а ученик набирает на телефоне как получится («216», «x=5», «7 ост 1»). Поэтому сравниваем
 * не строки, а смысл, который можно проверить однозначно:
 * - если в эталоне есть числа, совпасть должны числа и их порядок, слова вокруг не важны;
 * - если чисел нет, совпасть должны слова (без регистра, знаков препинания, ё/е);
 *   варианты через «/», «или», «;» засчитываются любой, перечисление через запятую в любом порядке.
 * Чего нельзя проверить так (дроби в другой записи, другое окончание слова), ученик сверит
 * с эталоном сам после двух попыток, и учитель увидит, что ответ сверен вручную.
 */

const NUMBER = /(?<![\p{L}\d])-?\d+(?:[.,]\d+)?/gu;

function clean(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[−–—]/g, "-")
    // «1 200» и «1 200» — одно число
    .replace(/(\d)[\s  ](?=\d{3}(?!\d))/g, "$1")
    .trim();
}

function numbers(text: string): number[] {
  return [...clean(text).matchAll(NUMBER)].map((m) => Number(m[0].replace(",", ".")));
}

function words(text: string): string {
  return clean(text)
    .replace(/^(ответ|жауабы|жауап)\s*[:\-]?\s*/u, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function sameWords(given: string, expected: string): boolean {
  const g = words(given);
  if (!g) return false;
  if (g === words(expected)) return true;
  // Перечисление: «кот, собака, конь» в любом порядке.
  if (expected.includes(",")) {
    const set = (text: string) => text.split(/[,;]/).map(words).filter(Boolean).sort().join("|");
    if (set(given) === set(expected)) return true;
  }
  return false;
}

export function checkAnswer(given: string, expected: string): boolean {
  if (!given.trim() || !expected.trim()) return false;
  const variants = expected.split(/\s\/\s|\s(?:или|немесе)\s|;/u).map((v) => v.trim()).filter(Boolean);
  for (const variant of variants.length > 1 ? [expected, ...variants] : [expected]) {
    const want = numbers(variant);
    if (want.length > 0) {
      const got = numbers(given);
      if (got.length === want.length && got.every((n, i) => Math.abs(n - want[i]) < 1e-9)) return true;
      continue;
    }
    if (sameWords(given, variant)) return true;
  }
  return false;
}
