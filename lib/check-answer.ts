/**
 * Проверка ответа ученика на закрытую карточку.
 *
 * Эталон пишет модель или учитель в свободной форме («216 кг», «x = 5», «7, остаток 1»),
 * а ученик набирает на телефоне как получится («216», «x=5», «7 ост 1»). Поэтому сравниваем
 * не строки, а смысл, который можно проверить однозначно:
 * - если в эталоне есть числа, совпасть должны числа и их порядок, слова вокруг не важны;
 * - корни уравнения («x = −4 или x = 4») — все сразу, в любом порядке: одно «4» не засчитывается;
 * - если чисел нет, совпасть должны слова (без регистра, знаков препинания, ё/е);
 *   варианты через «/», «или», «;» засчитываются любой, перечисление через запятую в любом порядке.
 * У новых карточек есть accept: короткие ответы так, как их наберёт ученик («о», «-4; 4»). Они нужны,
 * когда эталон написан пояснением («Морской — море.»), из которого проверку не вывести.
 * Чего нельзя проверить так (дроби в другой записи, другое окончание слова), ученик сверит
 * с эталоном сам после двух попыток, и учитель увидит, что ответ сверен вручную.
 */

const NUMBER = /(?<![\p{L}\d])-?\d+(?:[.,]\d+)?/gu;

function clean(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    // Ученик на телефоне набирает «x^2», в эталоне «x²»: приводим к одной записи.
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (sup) => `^${[...sup].map((c) => "⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(c)).join("")}`)
    .replace(/[·×*]/g, "*")
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

const sameNumbers = (a: number[], b: number[]) => a.length === b.length && a.every((n, i) => Math.abs(n - b[i]) < 1e-9);
const sorted = (a: number[]) => [...a].sort((x, y) => x - y);

/**
 * Корни одного уравнения: «x = −4 или x = 4», «x₁ = 2; x₂ = 3». Одна и та же буква слева больше одного раза.
 * «При x = 0: y = 4; при x = 1: y = 2» — не корни: слева разные буквы.
 */
function roots(expected: string): number[] | null {
  const found = [...clean(expected).matchAll(/(?<![\p{L}\d])(\p{L})\s*[₀-₉\d]?\s*=\s*(-?\d+(?:[.,]\d+)?)/gu)];
  if (found.length < 2 || new Set(found.map((m) => m[1])).size !== 1) return null;
  return found.map((m) => Number(m[2].replace(",", ".")));
}

export function checkAnswer(given: string, expected: string): boolean {
  if (!given.trim() || !expected.trim()) return false;
  const rootList = roots(expected);
  if (rootList) return sameNumbers(sorted(numbers(given)), sorted(rootList));
  const variants = expected.split(/\s\/\s|\s(?:или|немесе)\s|;/u).map((v) => v.trim()).filter(Boolean);
  for (const variant of variants.length > 1 ? [expected, ...variants] : [expected]) {
    const want = numbers(variant);
    if (want.length > 0) {
      if (sameNumbers(numbers(given), want)) return true;
      continue;
    }
    if (sameWords(given, variant)) return true;
  }
  return false;
}

/**
 * Короткие ответы, которые противоречат эталону: число, которого нет в answer, или один корень из двух.
 * Такой accept засчитал бы неверный ответ, поэтому карточку с ним модель переписывает.
 */
export function acceptMismatch(card: { answer?: string; accept?: string[] }): string[] {
  const answer = card.answer;
  if (!answer || !card.accept?.length) return [];
  const rootList = roots(answer);
  const allowed = numbers(answer);
  return card.accept.filter((a) =>
    rootList ? !checkAnswer(a, answer) : numbers(a).some((n) => !allowed.some((m) => Math.abs(m - n) < 1e-9)),
  );
}

/** inputHint («Впиши число») не должен называть ответ: ни слово из ответа, ни число, которого нет в задании. */
export function inputHintReveals(card: { prompt: string; inputHint?: string; answer?: string; accept?: string[] }): boolean {
  const hint = card.inputHint;
  if (!hint) return false;
  const inHintWords = ` ${words(hint)} `;
  const inHintNumbers = numbers(hint);
  const inPrompt = numbers(card.prompt);
  return [card.answer ?? "", ...(card.accept ?? [])].some((a) => {
    const w = words(a);
    if (w.length >= 2 && inHintWords.includes(` ${w} `)) return true;
    const secret = numbers(a).filter((n) => !inPrompt.includes(n));
    return secret.length > 0 && secret.every((n) => inHintNumbers.includes(n));
  });
}

/** Ответ на карточку: любой из коротких ответов accept или эталон answer. */
export function checkCardAnswer(given: string, card: { answer?: string; accept?: string[] }): boolean {
  if (card.accept?.some((a) => checkAnswer(given, a))) return true;
  return !!card.answer && checkAnswer(given, card.answer);
}

/** Ответ из одного неотрицательного числа: ученику можно открыть цифровую клавиатуру. */
export function expectsNumber(card: { answer?: string; accept?: string[] }): boolean {
  const forms = card.accept?.length ? card.accept : card.answer ? [card.answer] : [];
  return forms.length > 0 && forms.every((f) => /^\d+(?:[.,]\d+)?$/.test(clean(f)));
}
