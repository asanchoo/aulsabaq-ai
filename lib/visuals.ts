import { z } from "zod";
import { compileExpression } from "./expression";
import { findMixedScriptWord } from "./arithmetic";

/**
 * Наглядные блоки для объяснения темы: деление уголком, сложение столбиком, числовой луч,
 * группы предметов, доли, график функции, формула, таблица, разбор предложения, состав слова, схема, диаграмма.
 *
 * Модель не рисует картинку и не пишет SVG: она выбирает вид блока и даёт данные
 * («деление уголком: 756 и 3»). Рисует код (components/Visual.tsx), а всё, что можно посчитать,
 * считает тоже код: шаги деления, перенос в столбике, частное, площадь под графиком.
 * Поэтому в наглядности не может быть ошибки в счёте, даже если модель ошиблась бы.
 */

export const SENTENCE_ROLES = ["subject", "predicate", "object", "attribute", "adverbial", "none"] as const;
export const WORD_PARTS = ["prefix", "root", "suffix", "ending", "postfix"] as const;
export const VISUAL_KINDS = [
  "long_division", "column", "number_line", "groups", "fraction", "grid",
  "plot", "formula", "table", "sentence", "word", "flow", "bars",
] as const;

const caption = z.string().trim().min(1).max(160);
const int = z.number().int();
const cell = z.string().trim().min(1).max(80);

/** Как блок хранится в уроке: у каждого вида только свои поля. */
export const VisualSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("long_division"), caption, dividend: int, divisor: int }),
  z.object({ kind: z.literal("column"), caption, a: int, b: int, op: z.enum(["+", "-", "×"]) }),
  z.object({ kind: z.literal("number_line"), caption, from: z.number(), to: z.number(), points: z.array(z.number()).min(1).max(6) }),
  z.object({ kind: z.literal("groups"), caption, groups: int, perGroup: int }),
  z.object({ kind: z.literal("fraction"), caption, numerator: int, denominator: int }),
  z.object({ kind: z.literal("grid"), caption, columns: int, rows: int }),
  z.object({ kind: z.literal("plot"), caption, expression: z.string().min(1), from: z.number(), to: z.number(), areaFrom: z.number().nullable(), areaTo: z.number().nullable() }),
  z.object({ kind: z.literal("formula"), caption, formula: z.string().min(1), legend: z.array(z.tuple([cell, cell])), steps: z.array(cell) }),
  z.object({ kind: z.literal("table"), caption, headers: z.array(cell).min(1).max(6), rows: z.array(z.array(cell)).min(1).max(10) }),
  z.object({ kind: z.literal("sentence"), caption, tokens: z.array(z.object({ text: cell, role: z.enum(SENTENCE_ROLES) })).min(2).max(20) }),
  z.object({ kind: z.literal("word"), caption, parts: z.array(z.object({ text: cell, part: z.enum(WORD_PARTS) })).min(1).max(8) }),
  z.object({ kind: z.literal("flow"), caption, items: z.array(cell).min(2).max(8), cycle: z.boolean() }),
  z.object({ kind: z.literal("bars"), caption, labels: z.array(cell).min(2).max(8), values: z.array(z.number().min(0)).min(2).max(8) }),
]);
export type Visual = z.infer<typeof VisualSchema>;

/**
 * Что пишет модель. Structured Outputs (и у OpenAI, и у Gemini) надёжнее с одной плоской схемой,
 * чем с объединением разных объектов: все поля есть всегда, ненужные равны null.
 * toVisual() проверяет поля выбранного вида и собирает из них VisualSchema.
 */
export const VisualDraftSchema = z.object({
  kind: z.enum(VISUAL_KINDS),
  caption: z.string(),
  a: z.number().nullable(),
  b: z.number().nullable(),
  op: z.enum(["+", "-", "×"]).nullable(),
  expression: z.string().nullable(),
  from: z.number().nullable(),
  to: z.number().nullable(),
  areaFrom: z.number().nullable(),
  areaTo: z.number().nullable(),
  points: z.array(z.number()).nullable(),
  headers: z.array(z.string()).nullable(),
  rows: z.array(z.array(z.string())).nullable(),
  tokens: z.array(z.object({ text: z.string(), tag: z.string() })).nullable(),
  items: z.array(z.string()).nullable(),
  cycle: z.boolean().nullable(),
  labels: z.array(z.string()).nullable(),
  values: z.array(z.number()).nullable(),
});
export type VisualDraft = z.infer<typeof VisualDraftSchema>;

const isInt = (v: number | null): v is number => v !== null && Number.isInteger(v);

/** Черновик модели → блок урока, или понятная модели причина отказа. */
export function toVisual(d: VisualDraft): { ok: true; visual: Visual } | { ok: false; error: string } {
  const fail = (why: string) => ({ ok: false as const, error: `VIS: ${d.kind}: ${why}` });
  const base = { caption: d.caption.trim() };
  if (!base.caption) return fail("caption is empty");
  let candidate: unknown;
  switch (d.kind) {
    case "long_division": {
      if (!isInt(d.a) || !isInt(d.b)) return fail("a (dividend) and b (divisor) must be integers");
      if (d.b < 2 || d.b > 99 || d.a < d.b || d.a > 9_999_999) return fail("need 2 <= b <= 99 and b <= a <= 9999999");
      candidate = { kind: d.kind, ...base, dividend: d.a, divisor: d.b };
      break;
    }
    case "column": {
      if (!isInt(d.a) || !isInt(d.b) || !d.op) return fail("a, b must be integers and op one of + - ×");
      if (d.a < 0 || d.b < 0 || d.a > 9_999_999 || d.b > 9_999_999) return fail("numbers must be from 0 to 9999999");
      if (d.op === "-" && d.a < d.b) return fail("for subtraction a must be >= b");
      if (d.op === "×" && (d.b > 999 || d.a > 99_999)) return fail("for multiplication b <= 999 and a <= 99999");
      candidate = { kind: d.kind, ...base, a: d.a, b: d.b, op: d.op };
      break;
    }
    case "number_line": {
      if (d.from === null || d.to === null || !d.points?.length) return fail("from, to and points are required");
      if (d.to <= d.from || d.to - d.from > 10_000) return fail("need from < to and a range up to 10000");
      if (d.points.length > 6 || d.points.some((p) => p < d.from! || p > d.to!)) return fail("1 to 6 points inside [from, to]");
      candidate = { kind: d.kind, ...base, from: d.from, to: d.to, points: d.points };
      break;
    }
    case "groups": {
      if (!isInt(d.a) || !isInt(d.b) || d.a < 1 || d.a > 10 || d.b < 1 || d.b > 12) return fail("a groups 1..10, b items per group 1..12");
      candidate = { kind: d.kind, ...base, groups: d.a, perGroup: d.b };
      break;
    }
    case "fraction": {
      if (!isInt(d.a) || !isInt(d.b) || d.b < 2 || d.b > 24 || d.a < 0 || d.a > 3 * d.b) return fail("a numerator 0..3b, b denominator 2..24");
      candidate = { kind: d.kind, ...base, numerator: d.a, denominator: d.b };
      break;
    }
    case "grid": {
      if (!isInt(d.a) || !isInt(d.b) || d.a < 1 || d.a > 20 || d.b < 1 || d.b > 20) return fail("a columns and b rows 1..20");
      candidate = { kind: d.kind, ...base, columns: d.a, rows: d.b };
      break;
    }
    case "plot": {
      if (!d.expression || d.from === null || d.to === null || d.to <= d.from) return fail("expression in x, from < to are required");
      const fn = compileExpression(d.expression);
      if (!fn) return fail(`cannot parse expression "${d.expression}"; use x, + - * / ^, parentheses, sin cos sqrt abs ln exp`);
      const samples = Array.from({ length: 41 }, (_, i) => fn(d.from! + ((d.to! - d.from!) * i) / 40));
      if (samples.filter(Number.isFinite).length < 20) return fail("the function is undefined on most of [from, to]");
      const hasArea = d.areaFrom !== null && d.areaTo !== null;
      if (hasArea && !(d.from <= d.areaFrom! && d.areaFrom! < d.areaTo! && d.areaTo! <= d.to)) return fail("need from <= areaFrom < areaTo <= to");
      candidate = { kind: d.kind, ...base, expression: d.expression, from: d.from, to: d.to, areaFrom: hasArea ? d.areaFrom : null, areaTo: hasArea ? d.areaTo : null };
      break;
    }
    case "formula": {
      if (!d.expression?.trim()) return fail("expression (the formula) is required");
      const legend = (d.rows ?? []).filter((r) => r.length >= 2).map((r) => [r[0], r.slice(1).join(" ")] as [string, string]);
      candidate = { kind: d.kind, ...base, formula: d.expression.trim(), legend, steps: d.items ?? [] };
      break;
    }
    case "table": {
      const headers = d.headers ?? [];
      const rows = d.rows ?? [];
      if (!headers.length || !rows.length) return fail("headers and rows are required");
      if (rows.some((r) => r.length !== headers.length)) return fail("every row must have as many cells as headers");
      candidate = { kind: d.kind, ...base, headers, rows };
      break;
    }
    case "sentence": {
      const tokens = (d.tokens ?? []).map((t) => ({ text: t.text, role: t.tag }));
      if (tokens.some((t) => !(SENTENCE_ROLES as readonly string[]).includes(t.role))) return fail(`tag must be one of ${SENTENCE_ROLES.join(", ")}`);
      if (!tokens.some((t) => t.role === "subject" || t.role === "predicate")) return fail("mark at least the subject or the predicate");
      candidate = { kind: d.kind, ...base, tokens };
      break;
    }
    case "word": {
      const parts = (d.tokens ?? []).map((t) => ({ text: t.text, part: t.tag }));
      if (parts.some((p) => !(WORD_PARTS as readonly string[]).includes(p.part))) return fail(`tag must be one of ${WORD_PARTS.join(", ")}`);
      if (!parts.some((p) => p.part === "root")) return fail("a word needs a root");
      candidate = { kind: d.kind, ...base, parts };
      break;
    }
    case "flow":
      candidate = { kind: d.kind, ...base, items: d.items ?? [], cycle: d.cycle ?? false };
      break;
    case "bars": {
      if ((d.labels ?? []).length !== (d.values ?? []).length) return fail("labels and values must have the same length");
      candidate = { kind: d.kind, ...base, labels: d.labels ?? [], values: d.values ?? [] };
      break;
    }
  }
  const parsed = VisualSchema.safeParse(candidate);
  if (!parsed.success) return fail(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const typo = visualTexts(parsed.data).map(findMixedScriptWord).find(Boolean);
  if (typo) return fail(`typo "${typo}": letters from different alphabets in one word`);
  return { ok: true, visual: parsed.data };
}

/** Обратно в черновик: для тестов и чтобы показать модели уже готовый блок. */
export function toDraft(v: Visual): VisualDraft {
  const empty: VisualDraft = {
    kind: v.kind, caption: v.caption, a: null, b: null, op: null, expression: null, from: null, to: null,
    areaFrom: null, areaTo: null, points: null, headers: null, rows: null, tokens: null, items: null, cycle: null, labels: null, values: null,
  };
  switch (v.kind) {
    case "long_division": return { ...empty, a: v.dividend, b: v.divisor };
    case "column": return { ...empty, a: v.a, b: v.b, op: v.op };
    case "number_line": return { ...empty, from: v.from, to: v.to, points: v.points };
    case "groups": return { ...empty, a: v.groups, b: v.perGroup };
    case "fraction": return { ...empty, a: v.numerator, b: v.denominator };
    case "grid": return { ...empty, a: v.columns, b: v.rows };
    case "plot": return { ...empty, expression: v.expression, from: v.from, to: v.to, areaFrom: v.areaFrom, areaTo: v.areaTo };
    case "formula": return { ...empty, expression: v.formula, rows: v.legend.map((r) => [...r]), items: v.steps };
    case "table": return { ...empty, headers: v.headers, rows: v.rows };
    case "sentence": return { ...empty, tokens: v.tokens.map((t) => ({ text: t.text, tag: t.role })) };
    case "word": return { ...empty, tokens: v.parts.map((p) => ({ text: p.text, tag: p.part })) };
    case "flow": return { ...empty, items: v.items, cycle: v.cycle };
    case "bars": return { ...empty, labels: v.labels, values: v.values };
  }
}

/** Все тексты блока: для проверки опечаток и арифметики. */
export function visualTexts(v: Visual): string[] {
  switch (v.kind) {
    case "formula": return [v.caption, v.formula, ...v.legend.flat(), ...v.steps];
    case "table": return [v.caption, ...v.headers, ...v.rows.flat()];
    case "sentence": return [v.caption, ...v.tokens.map((t) => t.text)];
    case "word": return [v.caption, v.parts.map((p) => p.text).join("")];
    case "flow": return [v.caption, ...v.items];
    case "bars": return [v.caption, ...v.labels];
    default: return [v.caption];
  }
}

// ---------------------------------------------------------------------------
// Вычисления для отрисовки. Чистые функции: их проверяют тесты.

export type DivisionStep = {
  /** Неполное делимое на этом шаге и колонка (индекс цифры делимого), где оно заканчивается. */
  current: number;
  end: number;
  /** Что вычитаем (цифра частного × делитель) и остаток. */
  product: number;
  remainder: number;
};

/** Деление уголком по шагам, как в школьной тетради. */
export function longDivision(dividend: number, divisor: number): { steps: DivisionStep[]; quotient: number; remainder: number } {
  const digits = String(dividend).split("").map(Number);
  let end = 0;
  let current = digits[0];
  while (current < divisor && end < digits.length - 1) current = current * 10 + digits[++end];
  const steps: DivisionStep[] = [];
  for (;;) {
    const q = Math.floor(current / divisor);
    const product = q * divisor;
    steps.push({ current, end, product, remainder: current - product });
    if (end >= digits.length - 1) break;
    current = (current - product) * 10 + digits[++end];
  }
  return { steps, quotient: Math.floor(dividend / divisor), remainder: dividend % divisor };
}

/** Перенос при сложении столбиком: для каждой колонки справа налево, был ли перенос в неё. */
export function columnCarries(a: number, b: number): number[] {
  const da = String(a).split("").reverse().map(Number);
  const db = String(b).split("").reverse().map(Number);
  const carries: number[] = [];
  let carry = 0;
  for (let i = 0; i < Math.max(da.length, db.length); i++) {
    carries.push(carry);
    carry = Math.floor(((da[i] ?? 0) + (db[i] ?? 0) + carry) / 10);
  }
  carries.push(carry);
  return carries;
}

/** Заём при вычитании: в каких колонках (справа налево) пришлось занять десяток у соседа слева. */
export function columnBorrows(a: number, b: number): boolean[] {
  const da = String(a).split("").reverse().map(Number);
  const db = String(b).split("").reverse().map(Number);
  const borrowedFrom: boolean[] = [];
  let borrow = 0;
  for (let i = 0; i < da.length; i++) {
    const diff = da[i] - borrow - (db[i] ?? 0);
    borrow = diff < 0 ? 1 : 0;
    borrowedFrom.push(false);
    if (borrow) borrowedFrom[i + 1] = true;
  }
  return borrowedFrom.slice(0, da.length);
}

export function columnResult(a: number, b: number, op: "+" | "-" | "×"): number {
  return op === "+" ? a + b : op === "-" ? a - b : a * b;
}

/** Частичные произведения при умножении столбиком на многозначное число (справа налево по цифрам b). */
export function partialProducts(a: number, b: number): number[] {
  return String(b).split("").reverse().map((d) => a * Number(d));
}
