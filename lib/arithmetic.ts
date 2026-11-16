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
const EQUATION = new RegExp(
  String.raw`(?<![\p{L}\d.,)^/])(?<!\d\s*[=+\-−–×·*:÷]\s*)(?<!\p{L}\s*[=+\-−–×·*÷]\s*)(?<!\p{L}\s+:\s*)(?<!\d[  ])` +
    String.raw`(${NUM})((?:${OP}(?:${NUM}))+)\s*=\s*(${NUM})` +
    String.raw`(?![\d.,]?\d)(?!${OP}[\d\p{L}])(?![\p{L}(^])`,
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
