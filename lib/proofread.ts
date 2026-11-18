/**
 * Корректура урока: облегчённая модель делает опечатки («Дптер» вместо «Дәптер», «қурғақ» вместо «құрғақ»).
 * После того как урок собран, модель отдельным коротким запросом ищет опечатки, а код применяет исправления
 * осторожно, чтобы корректор не испортил урок:
 * - только одно слово на одно слово, отличие в 1–2 буквы (это опечатка, а не переписанный текст);
 * - только слова, которые правда есть в уроке;
 * - числа, формулы, id, режимы и прочие служебные поля не трогаем;
 * - если после замен урок перестал проходить проверки, замены откатывает lib/ai.ts.
 */

export type Correction = { wrong: string; right: string };

/** Поля, где не текст для людей, а данные: их корректор не видит и не меняет. */
const SKIP_KEYS = new Set(["id", "groupId", "mode", "cardIds", "kind", "op", "tag", "role", "part", "level", "purpose", "type", "language", "expression", "subject"]);

const MAX_CORRECTIONS = 40;

/** Расстояние Левенштейна: сколько букв вставить, удалить или заменить, чтобы из a получить b. */
export function levenshtein(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const row = [i];
    for (let j = 1; j <= y.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[y.length];
}

/** Все тексты урока для корректора, без повторов и без служебных полей. */
export function collectTexts(value: unknown, out = new Set<string>()): string[] {
  if (typeof value === "string") {
    if (/\p{L}{3,}/u.test(value)) out.add(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectTexts(v, out);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) if (!SKIP_KEYS.has(k)) collectTexts(v, out);
  }
  return [...out];
}

const word = /^\p{L}[\p{L}\p{M}'’-]*$/u;
const wholeWord = (w: string) => new RegExp(`(?<![\\p{L}\\p{M}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{M}])`, "gu");

/** Оставляем только безопасные исправления: слово на слово, 1–2 буквы, слово правда есть в уроке. */
export function safeCorrections(corrections: Correction[], texts: string[]): Correction[] {
  const all = texts.join("\n");
  const seen = new Set<string>();
  const out: Correction[] = [];
  for (const { wrong, right } of corrections) {
    const w = wrong.trim();
    const r = right.trim();
    if (!word.test(w) || !word.test(r) || w === r || w.length < 3 || seen.has(w)) continue;
    const distance = levenshtein(w.toLowerCase(), r.toLowerCase());
    if (distance < 1 || distance > 2) continue;
    if (!wholeWord(w).test(all)) continue;
    seen.add(w);
    out.push({ wrong: w, right: r });
    if (out.length >= MAX_CORRECTIONS) break;
  }
  return out;
}

/** Применяет исправления ко всем текстам урока (кроме служебных полей), только целыми словами. */
export function applyCorrections<T>(value: T, corrections: Correction[], key = ""): T {
  if (corrections.length === 0 || SKIP_KEYS.has(key)) return value;
  if (typeof value === "string") {
    return corrections.reduce((text, c) => text.replace(wholeWord(c.wrong), c.right), value as string) as T;
  }
  if (Array.isArray(value)) return value.map((v) => applyCorrections(v, corrections)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, applyCorrections(v, corrections, k)])) as T;
  }
  return value;
}
