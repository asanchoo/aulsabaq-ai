import { z } from "zod";
import type { Lang } from "./schema";

/**
 * Тренажёр без конца: задания для тех, кто решил всё остальное.
 *
 * Задания составляет код, а не модель: модель только выбирает навык из списка (TRAINER_SKILLS),
 * подходящий к теме. Поэтому заданий сколько угодно, они бесплатные и ответ в них всегда верный.
 * Задание номер k у ученика получается из его сессии и k (seededTask): сервер может заново
 * составить то же задание и проверить ответ, а ответ в браузер не уходит.
 */

export const TRAINER_SKILLS = [
  "add_within_10", "sub_within_10", "add_within_20", "sub_within_20",
  "add_2d_1d_carry", "add_2d_2d_carry", "sub_2d_borrow", "add_3d", "sub_3d",
  "mul_table", "div_table", "mul_2d_1d", "div_2d_1d", "div_3d_1d", "div_remainder", "mul_10_100",
  "equation_add", "equation_sub", "equation_mul", "fraction_of", "round_tens", "round_hundreds",
  "percent_of", "integers_add", "integers_mul", "linear_equation", "decimal_add",
] as const;
export type TrainerSkill = (typeof TRAINER_SKILLS)[number];
export const TrainerSkillSchema = z.enum(TRAINER_SKILLS);

export type TrainerTask = { prompt: string; answer: string; inputHint: string; numeric: boolean; hint: string };

/** Детерминированный генератор случайных чисел (mulberry32): одно зерно — одна последовательность. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const T = {
  ru: {
    compute: "Вычисли: {e}", solve: "Реши уравнение: {e}", fraction: "Найди {f} от числа {n}", roundTens: "Округли до десятков: {n}",
    roundHundreds: "Округли до сотен: {n}", remainder: "Раздели с остатком: {e}", percent: "Найди {p}% от числа {n}",
    onlyNumber: "Только число", quotientRemainder: "Частное и остаток через пробел", x: "Только значение x",
    hints: {
      carry: "Сначала сложи единицы. Если получилось 10 или больше, один десяток перенеси к десяткам.",
      borrow: "Если единиц не хватает, займи один десяток: это ещё 10 единиц.",
      table: "Вспомни таблицу умножения. Деление проверяй умножением.",
      column: "Раздели по разрядам: сначала десятки (или сотни), потом единицы.",
      remainder: "Найди самое большое число, которое делится нацело и не больше делимого. Остаток меньше делителя.",
      equation: "Неизвестное находим обратным действием. Проверь: подставь число вместо x.",
      fraction: "Чтобы найти часть числа, раздели число на знаменатель и умножь на числитель.",
      round: "Посмотри на цифру справа от нужного разряда: 5 и больше округляем вверх.",
      percent: "1% это одна сотая часть числа. 10% это одна десятая, 50% это половина.",
      integers: "Числа с разными знаками: из большего модуля вычти меньший и поставь знак большего.",
      decimal: "Складывай десятые с десятыми, целые с целыми. Запятая под запятой.",
      basic: "Посчитай на пальцах или нарисуй палочки.",
    },
  },
  kk: {
    compute: "Есепте: {e}", solve: "Теңдеуді шеш: {e}", fraction: "{n} санының {f} бөлігін тап", roundTens: "Ондыққа дейін дөңгелекте: {n}",
    roundHundreds: "Жүздікке дейін дөңгелекте: {n}", remainder: "Қалдықпен бөл: {e}", percent: "{n} санының {p}%-ын тап",
    onlyNumber: "Тек сан", quotientRemainder: "Бөлінді мен қалдықты бос орын арқылы", x: "Тек x мәні",
    hints: {
      carry: "Алдымен бірліктерді қос. 10 немесе одан көп шықса, бір ондықты ондықтарға қос.",
      borrow: "Бірлік жетпесе, бір ондықты ал: ол тағы 10 бірлік.",
      table: "Көбейту кестесін еске түсір. Бөлуді көбейту арқылы тексер.",
      column: "Разрядтар бойынша бөл: алдымен ондықтарды (немесе жүздіктерді), сосын бірліктерді.",
      remainder: "Бөлінгіштен аспайтын, қалдықсыз бөлінетін ең үлкен санды тап. Қалдық бөлгіштен кіші.",
      equation: "Белгісізді кері амалмен табамыз. Тексер: x орнына санды қой.",
      fraction: "Санның бөлігін табу үшін санды бөлімге бөліп, алымға көбейт.",
      round: "Керекті разрядтың оң жағындағы цифрға қара: 5 және одан көп болса, жоғары дөңгелектейміз.",
      percent: "1% санның жүзден бір бөлігі. 10% оннан бір бөлігі, 50% жартысы.",
      integers: "Таңбалары әртүрлі сандар: үлкен модульден кішісін азайтып, үлкеннің таңбасын қой.",
      decimal: "Ондықтарды ондықтармен, бүтіндерді бүтіндермен қос. Үтір үтірдің астында.",
      basic: "Саусақпен сана немесе таяқшалар сыз.",
    },
  },
} as const;

const fill = (template: string, vars: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k]));
const minus = (n: number) => (n < 0 ? `(−${-n})` : String(n));
const signed = (n: number) => (n < 0 ? `−${-n}` : String(n));

/** Задание номер index для ученика с этим зерном: одно и то же на сервере и при повторном вызове. */
export function seededTask(skill: TrainerSkill, seed: string, index: number, lang: Lang): TrainerTask {
  const r = rng(hash(`${seed}:${skill}:${index}`));
  const int = (min: number, max: number) => min + Math.floor(r() * (max - min + 1));
  const t = T[lang];
  const compute = (e: string, answer: number | string, hint: string): TrainerTask => ({
    prompt: fill(t.compute, { e }), answer: String(answer), inputHint: t.onlyNumber, numeric: typeof answer === "number" && answer >= 0, hint,
  });
  const equation = (e: string, x: number): TrainerTask => ({
    prompt: fill(t.solve, { e }), answer: String(x), inputHint: t.x, numeric: x >= 0, hint: t.hints.equation,
  });

  switch (skill) {
    case "add_within_10": { const a = int(0, 9); const b = int(0, 10 - a); return compute(`${a} + ${b}`, a + b, t.hints.basic); }
    case "sub_within_10": { const a = int(1, 10); const b = int(0, a); return compute(`${a} − ${b}`, a - b, t.hints.basic); }
    case "add_within_20": { const a = int(3, 9); const b = int(11 - a, 9); return compute(`${a} + ${b}`, a + b, t.hints.carry); }
    case "sub_within_20": { const a = int(11, 18); const b = int(a - 9, 9); return compute(`${a} − ${b}`, a - b, t.hints.borrow); }
    case "add_2d_1d_carry": { const u = int(2, 9); const a = int(1, 8) * 10 + u; const b = int(10 - u, 9); return compute(`${a} + ${b}`, a + b, t.hints.carry); }
    case "add_2d_2d_carry": {
      const ua = int(2, 9); const ub = int(10 - ua, 9); const ta = int(1, 7); const tb = int(1, 8 - ta);
      return compute(`${ta * 10 + ua} + ${tb * 10 + ub}`, ta * 10 + ua + tb * 10 + ub, t.hints.carry);
    }
    case "sub_2d_borrow": {
      const ua = int(0, 8); const ub = int(ua + 1, 9); const ta = int(3, 9); const tb = int(1, ta - 1);
      return compute(`${ta * 10 + ua} − ${tb * 10 + ub}`, ta * 10 + ua - (tb * 10 + ub), t.hints.borrow);
    }
    case "add_3d": { const a = int(120, 780); const b = int(100, 999 - a); return compute(`${a} + ${b}`, a + b, t.hints.carry); }
    case "sub_3d": { const a = int(300, 999); const b = int(100, a - 50); return compute(`${a} − ${b}`, a - b, t.hints.borrow); }
    case "mul_table": { const a = int(2, 9); const b = int(2, 9); return compute(`${a} · ${b}`, a * b, t.hints.table); }
    case "div_table": { const a = int(2, 9); const b = int(2, 9); return compute(`${a * b} : ${b}`, a, t.hints.table); }
    case "mul_2d_1d": { const a = int(12, 49); const b = int(2, 9); return compute(`${a} · ${b}`, a * b, t.hints.column); }
    case "div_2d_1d": { const b = int(2, 6); const q = int(Math.ceil(12 / b), Math.floor(99 / b)); return compute(`${q * b} : ${b}`, q, t.hints.column); }
    case "div_3d_1d": { const b = int(2, 9); const q = int(Math.ceil(100 / b), Math.floor(999 / b)); return compute(`${q * b} : ${b}`, q, t.hints.column); }
    case "div_remainder": {
      const b = int(3, 9); const q = int(2, 9); const rem = int(1, b - 1); const a = q * b + rem;
      return { prompt: fill(t.remainder, { e: `${a} : ${b}` }), answer: `${q} ${rem}`, inputHint: t.quotientRemainder, numeric: false, hint: t.hints.remainder };
    }
    case "mul_10_100": { const a = int(3, 99); const k = r() < 0.5 ? 10 : 100; return compute(`${a} · ${k}`, a * k, t.hints.table); }
    case "equation_add": { const x = int(5, 60); const a = int(3, 40); return equation(`x + ${a} = ${x + a}`, x); }
    case "equation_sub": { const x = int(20, 90); const a = int(3, x - 1); return equation(`x − ${a} = ${x - a}`, x); }
    case "equation_mul": { const x = int(2, 12); const a = int(2, 9); return equation(`${a} · x = ${a * x}`, x); }
    case "fraction_of": {
      const den = int(2, 8); const num = int(1, den - 1); const n = den * int(2, 12);
      return { prompt: fill(t.fraction, { f: `${num}/${den}`, n }), answer: String((n / den) * num), inputHint: t.onlyNumber, numeric: true, hint: t.hints.fraction };
    }
    case "round_tens": {
      const n = int(11, 989); return { prompt: fill(t.roundTens, { n }), answer: String(Math.round(n / 10) * 10), inputHint: t.onlyNumber, numeric: true, hint: t.hints.round };
    }
    case "round_hundreds": {
      const n = int(110, 9890); return { prompt: fill(t.roundHundreds, { n }), answer: String(Math.round(n / 100) * 100), inputHint: t.onlyNumber, numeric: true, hint: t.hints.round };
    }
    case "percent_of": {
      const p = [10, 20, 25, 50, 75][int(0, 4)]; const n = (100 / gcd(100, p)) * int(1, 20);
      return { prompt: fill(t.percent, { p, n }), answer: String((n * p) / 100), inputHint: t.onlyNumber, numeric: true, hint: t.hints.percent };
    }
    case "integers_add": { const a = int(-20, 20) || -7; const b = int(-20, 20) || 5; return compute(`${signed(a)} + ${minus(b)}`, a + b, t.hints.integers); }
    case "integers_mul": { const a = int(-9, 9) || -3; const b = int(-9, 9) || 4; return compute(`${signed(a)} · ${minus(b)}`, a * b, t.hints.integers); }
    case "linear_equation": { const x = int(-9, 12); const a = int(2, 9); const b = int(-20, 20) || 3; return equation(`${a}x ${b < 0 ? "−" : "+"} ${Math.abs(b)} = ${a * x + b}`, x); }
    case "decimal_add": {
      const a = int(11, 99) / 10; const b = int(11, 99) / 10; const comma = (n: number) => n.toFixed(1).replace(".", ",");
      return compute(`${comma(a)} + ${comma(b)}`, comma(Math.round((a + b) * 10) / 10), t.hints.decimal);
    }
  }
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Сколько задач тренажёра решил ученик и на какой он сейчас. Хранится в прогрессе сессии под ключом "trainer". */
export const TrainerStateSchema = z.object({
  index: z.number().int().min(0).catch(0),
  solved: z.number().int().min(0).catch(0),
  wrong: z.number().int().min(0).catch(0),
  /** Неверных попыток на текущем задании: после двух показываем ответ и даём следующее. */
  attempts: z.number().int().min(0).catch(0),
});
export type TrainerState = z.infer<typeof TrainerStateSchema>;
export const TRAINER_KEY = "trainer";
export const TRAINER_TRIES = 2;

export function readTrainer(progress: unknown): TrainerState {
  const raw = progress && typeof progress === "object" ? (progress as Record<string, unknown>)[TRAINER_KEY] : undefined;
  const parsed = TrainerStateSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { index: 0, solved: 0, wrong: 0, attempts: 0 };
}
