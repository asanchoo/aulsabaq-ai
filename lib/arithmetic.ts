/**
 * Пересчёт числовых равенств в тексте урока: «6 + 8 = 14», «252 × 3 = 756», «7 : 3 = 2».
 * Облегчённая модель иногда пишет «8 + 14 = 14», и учитель повторил бы это у доски.
 * Проверяем только то, что можно проверить однозначно, остальное пропускаем:
 * - равенство «выражение = выражение» (пропорция 2 : 3 = 4 : 6, 3 : 450 = 5 : x) не трогаем,
 *   как и выражение, которое продолжается буквой с другой стороны (x : 5 = 18 : 10);
 * - буква рядом с числом (2x + 5 = 11, 5 см) значит, что это не чистая арифметика;
 * - «7 : 3 = 2» верно как деление с остатком (дальше в тексте обычно «остаток 1»).
 */

const NUM = String.raw`\d{1,3}(?:[  ]\d{3})+(?![\d])|\d+(?:[.,]\d+)?`;
// Знак операции. Двоеточие — деление, только если перед ним пробел («36 : 4») или оно между цифрами («36:4»);
// «карточки 3: 216 × 4» — это знак препинания.
const OP = String.raw`(?:\s*[+\-−–×·*÷]\s*|\s+:\s*|:(?=\d))`;
// Начало: не продолжение слова, числа или другого выражения (двоеточие после слова, «Единицы: 8 + 6»,
// это знак препинания, а не деление). Конец: дальше нет ещё одной операции.
// Хвост большего выражения не пересчитываем: перед ним операнд, которого мы не видим целиком
// (цифра, степень x² или 2³, закрывающая скобка), или минус («y = −5 + 10 = 5»: это отрицательное число).
const OPERAND_END = String.raw`[\d²³⁰¹⁴-⁹)\]]`;
const EQUATION = new RegExp(
  String.raw`(?<![\p{L}\d.,)^/(²³⁰¹⁴-⁹])(?<!${OPERAND_END}\s*[=+\-−–×·*:÷/^]\s*)(?<!\p{L}\s*[=+\-−–×·*÷/^]\s*)(?<!\p{L}\s+:\s*)(?<!\d[  ])(?<![-−–]\s*)` +
    String.raw`(${NUM})((?:${OP}(?:${NUM}))+)\s*=\s*(${NUM})` +
    String.raw`(?![\d.,]?\d)(?!${OP}[\d\p{L}])(?![\p{L}(^/²³⁰¹⁴-⁹])`,
  "gu",
);

function toNumber(raw: string): number {
  return Number(raw.replace(/[  ]/g, "").replace(",", "."));
}

/** Вычисляет цепочку с обычным порядком действий: сначала × и :, потом + и −. */
function evaluate(first: string, rest: string): { value: number; onlyDivision: boolean } | null {
  const pairs = [...rest.matchAll(new RegExp(String.raw`(${OP})(${NUM})`, "gu"))];
  const terms: number[] = [toNumber(first)];
  const signs: number[] = [1];
  for (const [, rawOp, raw] of pairs) {
    const op = rawOp.trim();
    const n = toNumber(raw);
    if (op === "×" || op === "·" || op === "*") terms[terms.length - 1] *= n;
    else if (op === ":" || op === "÷") {
      if (n === 0) return null;
      terms[terms.length - 1] /= n;
    } else {
      terms.push(n);
      signs.push(op === "+" ? 1 : -1);
    }
  }
  const value = terms.reduce((sum, term, i) => sum + signs[i] * term, 0);
  const onlyDivision = pairs.length === 1 && [":", "÷"].includes(pairs[0][1].trim());
  return { value, onlyDivision };
}

/** Первое неверное равенство в тексте или null, если всё сходится. */
export function findWrongEquation(text: string): string | null {
  for (const match of text.matchAll(EQUATION)) {
    const [whole, first, rest, result] = match;
    const computed = evaluate(first, rest);
    if (!computed) continue;
    const expected = toNumber(result);
    if (Math.abs(computed.value - expected) < 1e-9) continue;
    if (computed.onlyDivision && Math.floor(computed.value) === expected) continue; // деление с остатком
    return whole.trim();
  }
  return null;
}

/**
 * Слово, в котором смешаны алфавиты: «дегенimiz» (кириллица и латиница), «Бүگүн» (арабская буква).
 * Так выглядят опечатки облегчённой модели; в нормальном тексте одно слово пишется одним алфавитом
 * (формулы вроде «3x» или «D = b²» сюда не попадают: там латинские слова отдельно; «xтің» с одной
 * латинской буквой тоже не ошибка).
 */
export function findMixedScriptWord(text: string): string | null {
  for (const word of text.split(/[^\p{L}]+/u)) {
    const cyrillic = /\p{Script=Cyrillic}/u.test(word);
    const latin = word.match(/\p{Script=Latin}/gu)?.length ?? 0;
    const arabic = /\p{Script=Arabic}/u.test(word);
    // Одна латинская буква рядом с кириллицей — переменная с окончанием («xтің»), так пишут в учебниках.
    if ((cyrillic && latin >= 2) || (arabic && (cyrillic || latin > 0))) return word;
  }
  return null;
}

const SUPERSCRIPT: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };

/**
 * Школьная запись формул: модель пишет как программист («3*x^2»), а в тетради и на доске «3·x²».
 * Применяется ко всему тексту урока при приёме ответа модели (lib/validate.ts, lib/generation-schema.ts).
 * Формулу графика это не ломает: lib/expression.ts понимает и «x²», и «·».
 */
export function prettyMath(text: string): string {
  return text
    .replace(/(?<=[\p{L}\d)])\^(\d{1,3})(?!\d)/gu, (_, d: string) => d.split("").map((c) => SUPERSCRIPT[c]).join(""))
    .replace(/(?<=[\p{L}\d)²³¹⁰⁴-⁹])\s*\*\s*(?=[\p{L}\d(√])/gu, "·");
}

/** Применяет prettyMath ко всем строкам в ответе модели (объекты и массивы любой вложенности). */
export function prettyMathDeep<T>(value: T): T {
  if (typeof value === "string") return prettyMath(value) as T;
  if (Array.isArray(value)) return value.map(prettyMathDeep) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, prettyMathDeep(v)])) as T;
  }
  return value;
}
